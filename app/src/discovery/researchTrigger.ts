import type { Library } from '../library'
import { buildProfile } from '../profile/profileEngine'
import { isResearchOptOut } from '../settings'
import { normalizeLabel } from '../trackKey'
import type { TasteApi } from '../taste/tasteApi'
import type { Track } from '../types'
import type { DiscoveryStore } from './discoveryStore'
import { buildSeed, isSeedUsable, seedCacheKey } from './seed'
import type { ResearchClient } from './researchClient'
import type { ResearchSeed, ResearchStatus } from './types'

type StatusListener = (status: ResearchStatus) => void

const DEBOUNCE_MS = 350

export class ResearchTrigger {
  private status: ResearchStatus = 'idle'
  private lastSeed: ResearchSeed | null = null
  private lastSeedKey = ''
  private runId = 0
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly statusListeners = new Set<StatusListener>()
  private readonly client: ResearchClient
  private readonly store: DiscoveryStore
  private readonly tasteApi: TasteApi
  private readonly library: Library

  constructor(
    client: ResearchClient,
    store: DiscoveryStore,
    tasteApi: TasteApi,
    library: Library,
  ) {
    this.client = client
    this.store = store
    this.tasteApi = tasteApi
    this.library = library
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  getStatus(): ResearchStatus {
    return this.status
  }

  onMeaningfulPlay(track: Track): void {
    this.scheduleResearch(track, false)
  }

  /** Re-run when ID3 tags arrive (artist/title often better than filename). */
  onTrackUpdated(track: Track): void {
    const prev = this.lastSeed
    const seed = buildSeed(track, buildProfile(this.tasteApi))
    const metadataChanged =
      prev != null &&
      (normalizeLabel(prev.artist) !== normalizeLabel(seed.artist) ||
        normalizeLabel(prev.title) !== normalizeLabel(seed.title))
    const wasWeak = prev != null && normalizeLabel(prev.artist) === 'unknown'
    const nowStrong = normalizeLabel(seed.artist) !== 'unknown'
    this.scheduleResearch(track, metadataChanged || (wasWeak && nowStrong))
  }

  forceRefreshCurrent(track?: Track): void {
    if (isResearchOptOut()) return
    if (track) {
      this.scheduleResearch(track, true, true)
      return
    }
    if (!this.lastSeed) return
    void this.runNow(this.lastSeed, true)
  }

  private scheduleResearch(track: Track, forceBypass: boolean, immediate = false): void {
    if (isResearchOptOut()) return
    const profile = buildProfile(this.tasteApi)
    const seed = buildSeed(track, profile)
    if (!isSeedUsable(seed)) return

    const key = seedCacheKey(seed)
    const bypass =
      forceBypass || (this.lastSeedKey !== '' && key !== this.lastSeedKey)
    this.lastSeedKey = key
    this.lastSeed = seed

    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (immediate) {
      void this.runNow(seed, bypass)
      return
    }

    this.setStatus('updating')
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.runNow(seed, bypass)
    }, DEBOUNCE_MS)
  }

  private setStatus(status: ResearchStatus): void {
    this.status = status
    for (const l of this.statusListeners) l(status)
  }

  private async runNow(seed: ResearchSeed, bypassCache: boolean): Promise<void> {
    const id = ++this.runId
    this.setStatus('updating')
    try {
      let items = await this.client.fetch(seed, bypassCache)

      // Always merge successful results — do not drop them when a newer run started.
      if (items.length > 0) {
        this.store.mergeRaw(items, this.library)
        this.store.notify()
      } else if (!bypassCache) {
        items = await this.client.fetch(seed, true)
        if (items.length > 0) {
          this.store.mergeRaw(items, this.library)
          this.store.notify()
        }
      }

      if (id === this.runId) {
        this.setStatus('idle')
      }
    } catch {
      if (id === this.runId) {
        this.setStatus('error')
      }
    }
  }
}

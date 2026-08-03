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

export class ResearchTrigger {
  private status: ResearchStatus = 'idle'
  private lastSeed: ResearchSeed | null = null
  private lastSeedKey = ''
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
    this.requestResearch(track, false)
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
    this.requestResearch(track, metadataChanged || (wasWeak && nowStrong))
  }

  forceRefreshCurrent(track?: Track): void {
    if (isResearchOptOut()) return
    if (track) {
      this.requestResearch(track, true)
      return
    }
    if (!this.lastSeed) return
    void this.run(this.lastSeed, true)
  }

  private requestResearch(track: Track, forceBypass: boolean): void {
    if (isResearchOptOut()) return
    const profile = buildProfile(this.tasteApi)
    const seed = buildSeed(track, profile)
    if (!isSeedUsable(seed)) return

    const key = seedCacheKey(seed)
    const bypass = forceBypass || (this.lastSeedKey !== '' && key !== this.lastSeedKey)
    this.lastSeedKey = key
    this.lastSeed = seed
    void this.run(seed, bypass)
  }

  private setStatus(status: ResearchStatus): void {
    this.status = status
    for (const l of this.statusListeners) l(status)
  }

  private async run(seed: ResearchSeed, bypassCache: boolean): Promise<void> {
    this.setStatus('updating')
    try {
      const items = await this.client.fetch(seed, bypassCache)
      this.store.mergeRaw(items, this.library)
      this.store.notify()
      this.setStatus('idle')
    } catch {
      this.setStatus('error')
    }
  }
}

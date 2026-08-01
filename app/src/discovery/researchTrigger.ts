import type { Library } from '../library'
import { buildProfile } from '../profile/profileEngine'
import { isResearchOptOut } from '../settings'
import type { TasteApi } from '../taste/tasteApi'
import type { Track } from '../types'
import type { DiscoveryStore } from './discoveryStore'
import { buildSeed, isSeedUsable } from './seed'
import type { ResearchClient } from './researchClient'
import type { ResearchSeed, ResearchStatus } from './types'

type StatusListener = (status: ResearchStatus) => void

export class ResearchTrigger {
  private status: ResearchStatus = 'idle'
  private lastSeed: ResearchSeed | null = null
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
    if (isResearchOptOut()) return
    const profile = buildProfile(this.tasteApi)
    const seed = buildSeed(track, profile)
    if (!isSeedUsable(seed)) return
    this.lastSeed = seed
    void this.run(seed, false)
  }

  forceRefreshCurrent(): void {
    if (isResearchOptOut() || !this.lastSeed) return
    void this.run(this.lastSeed, true)
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

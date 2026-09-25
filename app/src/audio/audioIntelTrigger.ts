import type { Library } from '../library'
import { buildProfile } from '../profile/profileEngine'
import type { DiscoveryStore } from '../discovery/discoveryStore'
import { buildSeed, isSeedUsable } from '../discovery/seed'
import { isResearchEnabled } from '../settings'
import { normalizeLabel, trackKeyFor } from '../trackKey'
import type { TasteApi } from '../taste/tasteApi'
import type { Track } from '../types'
import { analyzeTrack } from './audioAnalyzer'
import { AudioFeaturesStore } from './audioFeaturesStore'
import { fingerprintAndLookup } from './fingerprintEngine'

type Listener = () => void

function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 1500 })
    } else {
      setTimeout(resolve, 150)
    }
  })
}

export class AudioIntelTrigger {
  private readonly discoveryStore: DiscoveryStore
  private readonly tasteApi: TasteApi
  private readonly library: Library
  private readonly featuresStore: AudioFeaturesStore
  private readonly listeners = new Set<Listener>()
  private readonly inflightLocal = new Set<string>()
  private readonly inflightFp = new Set<string>()

  constructor(
    discoveryStore: DiscoveryStore,
    tasteApi: TasteApi,
    library: Library,
    featuresStore?: AudioFeaturesStore,
  ) {
    this.discoveryStore = discoveryStore
    this.tasteApi = tasteApi
    this.library = library
    this.featuresStore = featuresStore ?? new AudioFeaturesStore()
  }

  getFeaturesStore(): AudioFeaturesStore {
    return this.featuresStore
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onTrackActivity(track: Track): void {
    void this.runLocalAnalysis(track)
    if (this.shouldFingerprint(track)) {
      void this.runFingerprint(track)
    }
  }

  private shouldFingerprint(track: Track): boolean {
    if (!isResearchEnabled()) return false
    const profile = buildProfile(this.tasteApi)
    const seed = buildSeed(track, profile)
    if (!isSeedUsable(seed)) return true
    return normalizeLabel(track.artist) === 'unknown'
  }

  /**
   * Analisis seluruh koleksi satu per satu saat browser senggang, supaya
   * rekomendasi & warna tiap lagu sudah siap sebelum lagu itu diputar.
   */
  analyzeLibraryInBackground(): void {
    const pending = this.library.getAll().filter((t) => !t.error && !this.hasFullFeatures(t))
    this.bgQueue = pending
    this.bgTotal = pending.length
    this.bgDone = 0
    if (!this.bgRunning) void this.drainQueue()
  }

  /** Progres analisis latar belakang, untuk ditampilkan di UI. */
  getBackgroundProgress(): { done: number; total: number } {
    return { done: this.bgDone, total: this.bgTotal }
  }

  private bgQueue: Track[] = []
  private bgRunning = false
  private bgTotal = 0
  private bgDone = 0

  private hasFullFeatures(track: Track): boolean {
    return !!this.featuresStore.get(trackKeyFor(track))?.waveform
  }

  private async drainQueue(): Promise<void> {
    this.bgRunning = true
    try {
      while (this.bgQueue.length > 0) {
        const track = this.bgQueue.shift()!
        if (this.library.getById(track.id) && !this.hasFullFeatures(track)) {
          await waitForIdle()
          await this.runLocalAnalysis(track)
        }
        this.bgDone += 1
        this.notify()
      }
    } finally {
      this.bgRunning = false
    }
  }

  private async runLocalAnalysis(track: Track): Promise<void> {
    const key = trackKeyFor(track)
    // Data lama tanpa kontur energi dianalisis ulang agar seek bar gelombang tersedia.
    if (this.featuresStore.get(key)?.waveform || this.inflightLocal.has(key)) return
    this.inflightLocal.add(key)
    try {
      const features = await analyzeTrack(track)
      this.featuresStore.set(features)
      this.notify()
    } catch {
      /* soft-fail */
    } finally {
      this.inflightLocal.delete(key)
    }
  }

  private async runFingerprint(track: Track): Promise<void> {
    if (this.inflightFp.has(track.id)) return
    this.inflightFp.add(track.id)
    try {
      const items = await fingerprintAndLookup(track)
      if (items.length > 0) {
        this.discoveryStore.mergeRaw(
          items.map((i) => ({ ...i, source: 'acoustid' as const })),
          this.library,
        )
        this.discoveryStore.notify()
      }
    } catch {
      /* soft-fail */
    } finally {
      this.inflightFp.delete(track.id)
    }
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }
}

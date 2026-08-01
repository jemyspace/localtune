import type { ArtistStats, GenreStats, TasteMeta, TrackStats } from './types'
import { TasteStore } from './tasteStore'

type Listener = () => void

export class TasteApi {
  private readonly store: TasteStore
  private readonly listeners = new Set<Listener>()

  constructor(store?: TasteStore) {
    this.store = store ?? new TasteStore()
  }

  getMeta(): TasteMeta {
    return this.store.getMeta()
  }

  getMeaningfulPlayCount(): number {
    return this.store.getMeta().meaningfulPlayCount
  }

  getTrackStats(trackKey: string): TrackStats | null {
    return this.store.getTrackStats(trackKey)
  }

  getAllTrackStats(): TrackStats[] {
    return this.store.getAllTrackStats()
  }

  getTopArtists(limit: number): ArtistStats[] {
    return this.store.getTopArtists(limit)
  }

  getTopGenres(limit: number): GenreStats[] {
    return this.store.getTopGenres(limit)
  }

  getArtistStats(artistKey: string): ArtistStats | null {
    return this.store.getArtistStats(artistKey)
  }

  getGenreStats(genreKey: string): GenreStats | null {
    return this.store.getGenreStats(genreKey)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify(): void {
    for (const l of this.listeners) l()
  }

  /** @internal used by listenTracker */
  getStore(): TasteStore {
    return this.store
  }
}

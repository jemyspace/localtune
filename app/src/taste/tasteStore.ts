import type {
  ArtistStats,
  FinalizedAttempt,
  GenreStats,
  TasteBlob,
  TasteMeta,
  TrackStats,
} from './types'

const STORAGE_KEY = 'localtune:taste:v1'

function emptyBlob(): TasteBlob {
  return {
    meta: { schemaVersion: 1, meaningfulPlayCount: 0, updatedAt: Date.now() },
    tracks: {},
    artists: {},
    genres: {},
  }
}

export class TasteStore {
  private blob: TasteBlob
  private persistEnabled = true

  constructor() {
    this.blob = this.load()
  }

  getMeta(): TasteMeta {
    return { ...this.blob.meta }
  }

  getTrackStats(trackKey: string): TrackStats | null {
    const t = this.blob.tracks[trackKey]
    return t ? { ...t } : null
  }

  getAllTrackStats(): TrackStats[] {
    return Object.values(this.blob.tracks)
  }

  getTopArtists(limit: number): ArtistStats[] {
    return Object.values(this.blob.artists)
      .sort((a, b) => b.playCount - a.playCount || b.totalHeardSec - a.totalHeardSec)
      .slice(0, limit)
  }

  getTopGenres(limit: number): GenreStats[] {
    return Object.values(this.blob.genres)
      .sort((a, b) => b.playCount - a.playCount || b.totalHeardSec - a.totalHeardSec)
      .slice(0, limit)
  }

  getArtistStats(artistKey: string): ArtistStats | null {
    const row = this.blob.artists[artistKey]
    return row ? { ...row } : null
  }

  getGenreStats(genreKey: string): GenreStats | null {
    const row = this.blob.genres[genreKey]
    return row ? { ...row } : null
  }

  applyAttempt(attempt: FinalizedAttempt): void {
    const now = Date.now()
    const heard = Math.max(0, attempt.heardSec)

    let track = this.blob.tracks[attempt.trackKey]
    if (!track) {
      track = {
        trackKey: attempt.trackKey,
        title: attempt.title,
        artist: attempt.artist,
        genre: attempt.genre,
        playCount: 0,
        completionCount: 0,
        earlySkipCount: 0,
        totalHeardSec: 0,
        lastPlayedAt: now,
      }
      this.blob.tracks[attempt.trackKey] = track
    }

    track.title = attempt.title
    track.artist = attempt.artist
    track.genre = attempt.genre
    track.totalHeardSec += heard
    track.lastPlayedAt = now

    if (attempt.meaningfulPlay) {
      track.playCount += 1
      this.bumpArtist(attempt.artist, heard, attempt.completed, attempt.meaningfulPlay)
      this.bumpGenre(attempt.genre, heard, attempt.completed, attempt.meaningfulPlay)
      this.blob.meta.meaningfulPlayCount += 1
    }

    if (attempt.completed) track.completionCount += 1
    if (attempt.earlySkipped) track.earlySkipCount += 1

    this.blob.meta.updatedAt = now
    this.save()
  }

  private bumpArtist(
    artist: string,
    heard: number,
    completed: boolean,
    meaningfulPlay: boolean,
  ): void {
    const key = artist.trim() || 'Unknown'
    let row = this.blob.artists[key]
    if (!row) {
      row = {
        artistKey: key,
        playCount: 0,
        completionCount: 0,
        totalHeardSec: 0,
        lastPlayedAt: Date.now(),
      }
      this.blob.artists[key] = row
    }
    row.totalHeardSec += heard
    row.lastPlayedAt = Date.now()
    if (meaningfulPlay) row.playCount += 1
    if (completed) row.completionCount += 1
  }

  private bumpGenre(
    genre: string,
    heard: number,
    completed: boolean,
    meaningfulPlay: boolean,
  ): void {
    const key = genre.trim() || 'Unknown'
    let row = this.blob.genres[key]
    if (!row) {
      row = {
        genreKey: key,
        playCount: 0,
        completionCount: 0,
        totalHeardSec: 0,
        lastPlayedAt: Date.now(),
      }
      this.blob.genres[key] = row
    }
    row.totalHeardSec += heard
    row.lastPlayedAt = Date.now()
    if (meaningfulPlay) row.playCount += 1
    if (completed) row.completionCount += 1
  }

  private load(): TasteBlob {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return emptyBlob()
      const parsed = JSON.parse(raw) as TasteBlob
      if (parsed.meta?.schemaVersion !== 1) return emptyBlob()
      return {
        meta: parsed.meta,
        tracks: parsed.tracks ?? {},
        artists: parsed.artists ?? {},
        genres: parsed.genres ?? {},
      }
    } catch {
      return emptyBlob()
    }
  }

  private save(): void {
    if (!this.persistEnabled) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.blob))
    } catch {
      this.persistEnabled = false
    }
  }
}

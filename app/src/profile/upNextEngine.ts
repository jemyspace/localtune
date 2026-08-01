import type { Library } from '../library'
import type { TasteApi } from '../taste/tasteApi'
import { trackKeyFor } from '../trackKey'
import type { Track } from '../types'
import {
  artistScoreForName,
  buildProfile,
  genreScoreForName,
  trackScoreForKey,
} from './profileEngine'
import { COLD_START_N, RECENT_PLAY_MS, type TasteProfile, type UpNextItem } from './types'

interface PlayableEntry {
  track: Track
  index: number
}

function stableNoise(trackId: string): number {
  let h = 0
  for (let i = 0; i < trackId.length; i++) {
    h = (h * 31 + trackId.charCodeAt(i)) | 0
  }
  return (Math.abs(h) % 100) / 10000
}

function normalizeScores(values: number[]): number[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max <= min) return values.map(() => 0)
  return values.map((v) => (v - min) / (max - min))
}

function playableEntries(library: Library): PlayableEntry[] {
  return library
    .getAll()
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => !track.error)
}

function sequentialItems(playable: PlayableEntry[], currentTrackId: string | null): UpNextItem[] {
  const curPos = currentTrackId
    ? playable.findIndex((p) => p.track.id === currentTrackId)
    : -1
  const items: UpNextItem[] = []
  const n = playable.length
  if (n === 0) return items

  const start = curPos < 0 ? 0 : curPos
  for (let step = 1; step < n; step++) {
    const pos = (start + step) % n
    if (curPos >= 0 && pos === curPos) break
    const { track, index } = playable[pos]!
    items.push({
      trackId: track.id,
      index,
      title: track.title,
      artist: track.artist,
      score: 0,
    })
  }
  return items
}

function isRecentlyPlayed(
  tasteApi: TasteApi,
  track: Track,
  librarySize: number,
  now: number,
): boolean {
  if (librarySize <= 3) return false
  const stats = tasteApi.getTrackStats(trackKeyFor(track))
  if (!stats) return false
  return now - stats.lastPlayedAt < RECENT_PLAY_MS
}

function rankedItems(
  playable: PlayableEntry[],
  currentTrackId: string | null,
  tasteApi: TasteApi,
): UpNextItem[] {
  const now = Date.now()
  const candidates = playable.filter((p) => p.track.id !== currentTrackId)

  const rawArtist = candidates.map((p) => artistScoreForName(tasteApi, p.track.artist))
  const rawGenre = candidates.map((p) => genreScoreForName(tasteApi, p.track.genre ?? 'Unknown'))
  const rawTrack = candidates.map((p) => trackScoreForKey(tasteApi, trackKeyFor(p.track)))

  const normArtist = normalizeScores(rawArtist)
  const normGenre = normalizeScores(rawGenre)
  const normTrack = normalizeScores(rawTrack)

  const scored = candidates.map((p, i) => {
    const score =
      0.5 * (normArtist[i] ?? 0) +
      0.25 * (normGenre[i] ?? 0) +
      0.25 * (normTrack[i] ?? 0) +
      stableNoise(p.track.id)

    return {
      trackId: p.track.id,
      index: p.index,
      title: p.track.title,
      artist: p.track.artist,
      score,
      recent: isRecentlyPlayed(tasteApi, p.track, playable.length, now),
    }
  })

  const filtered = scored.filter((s) => !s.recent)
  const pool = filtered.length > 0 ? filtered : scored

  const allZero = pool.every((s) => s.score <= 0.0001)
  if (allZero) {
    return sequentialItems(playable, currentTrackId)
  }

  return pool
    .sort((a, b) => b.score - a.score)
    .map(({ trackId, index, title, artist, score }) => ({
      trackId,
      index,
      title,
      artist,
      score,
    }))
}

export class UpNextEngine {
  private items: UpNextItem[] = []
  private profile: TasteProfile = {
    coldStart: true,
    meaningfulPlayCount: 0,
    topArtists: [],
    topGenres: [],
    updatedAt: Date.now(),
  }

  refresh(library: Library, currentTrackId: string | null, tasteApi: TasteApi): void {
    this.profile = buildProfile(tasteApi)
    const playable = playableEntries(library)

    if (this.profile.coldStart || this.profile.meaningfulPlayCount < COLD_START_N) {
      this.items = sequentialItems(playable, currentTrackId)
    } else {
      this.items = rankedItems(playable, currentTrackId, tasteApi)
    }
  }

  getItems(): UpNextItem[] {
    return this.items
  }

  getProfile(): TasteProfile {
    return this.profile
  }

  getNextIndex(): number | undefined {
    return this.items[0]?.index
  }
}

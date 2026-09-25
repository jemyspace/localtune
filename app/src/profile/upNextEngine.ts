import type { AudioFeaturesStore } from '../audio/audioFeaturesStore'
import { MOOD_LABELS, type AudioFeatures } from '../audio/types'
import type { Library } from '../library'
import type { TasteApi } from '../taste/tasteApi'
import { normalizeLabel, trackKeyFor } from '../trackKey'
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

const MAX_REASONS = 2

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

function isKnown(label: string | undefined): label is string {
  const key = normalizeLabel(label ?? '')
  return !!key && key !== 'unknown'
}

/** Kemiripan nuansa 0–1 dari energi, tempo, dan mood hasil analisis lokal. */
function vibeSimilarity(a: AudioFeatures, b: AudioFeatures): number {
  let sim = 1
  sim -= Math.min(1, Math.abs(a.energy - b.energy) * 4) * 0.4
  if (a.tempoBpm != null && b.tempoBpm != null) {
    sim -= Math.min(1, Math.abs(a.tempoBpm - b.tempoBpm) / 40) * 0.35
  } else {
    sim -= 0.12
  }
  if (a.mood !== b.mood) sim -= 0.25
  return Math.max(0, sim)
}

function featureReasons(
  current: AudioFeatures | null | undefined,
  other: AudioFeatures | null,
): { reasons: string[]; match?: number } {
  if (!current || !other) return { reasons: [] }
  const reasons: string[] = []
  if (other.mood === current.mood) reasons.push(`Suasana ${MOOD_LABELS[other.mood]}`)
  if (
    other.tempoBpm != null &&
    current.tempoBpm != null &&
    Math.abs(other.tempoBpm - current.tempoBpm) <= 8
  ) {
    reasons.push(`Tempo mirip · ${other.tempoBpm} BPM`)
  }
  return { reasons, match: Math.round(vibeSimilarity(current, other) * 100) }
}

function sequentialItems(
  playable: PlayableEntry[],
  currentTrackId: string | null,
  tasteApi: TasteApi,
  featuresStore?: AudioFeaturesStore,
): UpNextItem[] {
  const curPos = currentTrackId
    ? playable.findIndex((p) => p.track.id === currentTrackId)
    : -1
  const items: UpNextItem[] = []
  const n = playable.length
  if (n === 0) return items

  const currentTrack = curPos >= 0 ? playable[curPos]!.track : undefined
  const currentFeatures = currentTrack ? featuresStore?.get(trackKeyFor(currentTrack)) : null

  const start = curPos < 0 ? 0 : curPos
  for (let step = 1; step < n; step++) {
    const pos = (start + step) % n
    if (curPos >= 0 && pos === curPos) break
    const { track, index } = playable[pos]!
    const key = trackKeyFor(track)
    const vibe = featureReasons(currentFeatures, featuresStore?.get(key) ?? null)
    const reasons = [...vibe.reasons]
    if (!tasteApi.getTrackStats(key)) reasons.push('Belum pernah diputar')
    if (reasons.length === 0) reasons.push('Urutan playlist')
    items.push({
      trackId: track.id,
      index,
      title: track.title,
      artist: track.artist,
      score: 0,
      reasons: reasons.slice(0, MAX_REASONS),
      match: vibe.match,
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

/**
 * Hindari artis yang sama berurutan bila ada kandidat lain yang skornya hampir sama —
 * membuat antrean terasa lebih hidup tanpa mengorbankan relevansi.
 */
function diversify<T extends { artist: string; score: number }>(sorted: T[]): T[] {
  const out = [...sorted]
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]!
    const cur = out[i]!
    if (normalizeLabel(prev.artist) !== normalizeLabel(cur.artist) || !isKnown(cur.artist)) continue
    const swapIdx = out.findIndex(
      (c, j) =>
        j > i &&
        normalizeLabel(c.artist) !== normalizeLabel(prev.artist) &&
        cur.score - c.score < 0.15,
    )
    if (swapIdx > i) {
      const [picked] = out.splice(swapIdx, 1)
      out.splice(i, 0, picked!)
    }
  }
  return out
}

function rankedItems(
  playable: PlayableEntry[],
  currentTrackId: string | null,
  tasteApi: TasteApi,
  featuresStore?: AudioFeaturesStore,
): UpNextItem[] {
  const now = Date.now()
  const candidates = playable.filter((p) => p.track.id !== currentTrackId)
  const currentTrack = playable.find((p) => p.track.id === currentTrackId)?.track
  const currentFeatures = currentTrack
    ? featuresStore?.get(trackKeyFor(currentTrack))
    : null

  const rawArtist = candidates.map((p) => artistScoreForName(tasteApi, p.track.artist))
  const rawGenre = candidates.map((p) => genreScoreForName(tasteApi, p.track.genre ?? 'Unknown'))
  const rawTrack = candidates.map((p) => trackScoreForKey(tasteApi, trackKeyFor(p.track)))

  const normArtist = normalizeScores(rawArtist)
  const normGenre = normalizeScores(rawGenre)
  const normTrack = normalizeScores(rawTrack)

  const scored = candidates.map((p, i) => {
    const key = trackKeyFor(p.track)
    const vibe = featureReasons(currentFeatures, featuresStore?.get(key) ?? null)
    const vibeBoost = vibe.match != null ? (vibe.match / 100) * 0.15 : 0
    const neverPlayed = !tasteApi.getTrackStats(key)
    const score =
      0.5 * (normArtist[i] ?? 0) +
      0.25 * (normGenre[i] ?? 0) +
      0.25 * (normTrack[i] ?? 0) +
      vibeBoost +
      (neverPlayed ? 0.05 : 0) +
      stableNoise(p.track.id)

    const reasons: string[] = [...vibe.reasons]
    if ((normArtist[i] ?? 0) >= 0.6 && isKnown(p.track.artist)) reasons.unshift('Artis favorit Anda')
    if ((normGenre[i] ?? 0) >= 0.6 && isKnown(p.track.genre)) reasons.push(`Genre favorit · ${p.track.genre}`)
    if ((normTrack[i] ?? 0) >= 0.6) reasons.push('Sering Anda dengar sampai habis')
    if (neverPlayed) reasons.push('Belum pernah diputar')
    if (reasons.length === 0) reasons.push('Dari library Anda')

    return {
      trackId: p.track.id,
      index: p.index,
      title: p.track.title,
      artist: p.track.artist,
      score,
      reasons: reasons.slice(0, MAX_REASONS),
      match: vibe.match,
      recent: isRecentlyPlayed(tasteApi, p.track, playable.length, now),
    }
  })

  const filtered = scored.filter((s) => !s.recent)
  const pool = filtered.length > 0 ? filtered : scored

  const allZero = pool.every((s) => s.score <= 0.0001)
  if (allZero) {
    return sequentialItems(playable, currentTrackId, tasteApi, featuresStore)
  }

  return diversify(pool.sort((a, b) => b.score - a.score)).map(
    ({ recent: _recent, ...item }) => item,
  )
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

  refresh(
    library: Library,
    currentTrackId: string | null,
    tasteApi: TasteApi,
    featuresStore?: AudioFeaturesStore,
  ): void {
    this.profile = buildProfile(tasteApi)
    const playable = playableEntries(library)

    if (this.profile.coldStart || this.profile.meaningfulPlayCount < COLD_START_N) {
      this.items = sequentialItems(playable, currentTrackId, tasteApi, featuresStore)
    } else {
      this.items = rankedItems(playable, currentTrackId, tasteApi, featuresStore)
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

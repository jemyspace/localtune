import { normalizeLabel } from '../trackKey'
import type { TasteApi } from '../taste/tasteApi'
import type { ArtistStats, GenreStats, TrackStats } from '../taste/types'
import { COLD_START_N, type TasteProfile } from './types'

function clampScore(n: number): number {
  return Math.max(0, n)
}

function unknownFactor(name: string): number {
  const key = normalizeLabel(name)
  return !key || key === 'unknown' ? 0.25 : 1
}

export function scoreTrack(stats: TrackStats): number {
  const raw =
    2.0 * stats.completionCount +
    1.0 * stats.playCount +
    0.01 * stats.totalHeardSec -
    1.5 * stats.earlySkipCount
  return clampScore(raw * unknownFactor(stats.artist))
}

export function scoreArtist(stats: ArtistStats): number {
  const raw =
    2.0 * stats.completionCount + 1.0 * stats.playCount + 0.01 * stats.totalHeardSec
  return clampScore(raw * unknownFactor(stats.artistKey))
}

export function scoreGenre(stats: GenreStats): number {
  const raw =
    2.0 * stats.completionCount + 1.0 * stats.playCount + 0.01 * stats.totalHeardSec
  return clampScore(raw * unknownFactor(stats.genreKey))
}

function buildReason(topArtists: { name: string; score: number }[]): string | undefined {
  const top = topArtists.find((a) => normalizeLabel(a.name) !== 'unknown' && a.score > 0)
  if (!top) return undefined
  return `Karena Anda sering menyelesaikan lagu artis ${top.name}`
}

export function buildProfile(tasteApi: TasteApi): TasteProfile {
  const meta = tasteApi.getMeta()
  const meaningfulPlayCount = meta.meaningfulPlayCount
  const coldStart = meaningfulPlayCount < COLD_START_N

  const artistScores = new Map<string, number>()
  for (const a of tasteApi.getTopArtists(200)) {
    artistScores.set(a.artistKey, scoreArtist(a))
  }

  const topArtistsList = [...artistScores.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const genreScores = new Map<string, number>()
  for (const g of tasteApi.getTopGenres(200)) {
    genreScores.set(g.genreKey, scoreGenre(g))
  }

  const topGenresList = [...genreScores.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const profile: TasteProfile = {
    coldStart,
    meaningfulPlayCount,
    topArtists: topArtistsList,
    topGenres: topGenresList,
    updatedAt: meta.updatedAt,
  }

  if (!coldStart) {
    profile.reason = buildReason(topArtistsList)
  }

  return profile
}

export function trackScoreForKey(tasteApi: TasteApi, trackKey: string): number {
  const stats = tasteApi.getTrackStats(trackKey)
  return stats ? scoreTrack(stats) : 0
}

export function artistScoreForName(tasteApi: TasteApi, artist: string): number {
  const key = artist.trim() || 'Unknown'
  const stats = tasteApi.getArtistStats(key)
  return stats ? scoreArtist(stats) : 0
}

export function genreScoreForName(tasteApi: TasteApi, genre: string): number {
  const key = genre.trim() || 'Unknown'
  const stats = tasteApi.getGenreStats(key)
  return stats ? scoreGenre(stats) : 0
}

import { normalizeLabel } from '../trackKey'
import type { TasteProfile } from '../profile/types'
import type { Track } from '../types'
import type { ResearchSeed } from './types'

const AUDIO_EXT = /\.(mp3|flac|wav|m4a|ogg|aac|wma|opus)$/i

export function looksLikeRawFilename(title: string): boolean {
  return AUDIO_EXT.test(title.trim())
}

export function isSeedUsable(seed: ResearchSeed): boolean {
  const artist = normalizeLabel(seed.artist)
  const title = normalizeLabel(seed.title)
  const hasArtist = artist.length > 0 && artist !== 'unknown'
  const hasTitle = title.length > 0 && !looksLikeRawFilename(seed.title)
  return hasArtist || hasTitle
}

export function buildSeed(track: Track, profile: TasteProfile): ResearchSeed {
  return {
    artist: track.artist,
    title: track.title,
    genre: track.genre,
    topArtists: profile.topArtists.slice(0, 3).map((a) => a.name),
    topGenres: profile.topGenres.slice(0, 3).map((g) => g.name),
  }
}

export function seedCacheKey(seed: ResearchSeed): string {
  const artist = normalizeLabel(seed.artist)
  const title = normalizeLabel(seed.title)
  if (!title || looksLikeRawFilename(seed.title) || title === artist) {
    return artist || title
  }
  return `${artist}|${title}`
}

import { normalizeLabel } from '../trackKey'
import type { TasteProfile } from '../profile/types'
import type { Track } from '../types'
import type { ResearchSeed } from './types'

const AUDIO_EXT = /\.(mp3|flac|wav|m4a|ogg|aac|wma|opus)$/i
const LEADING_TRACK_NO = /^\d{1,3}[\s._\-–—]+/
const ARTIST_TITLE_SPLIT = /\s+[-–—]\s+/

export function looksLikeRawFilename(title: string): boolean {
  return AUDIO_EXT.test(title.trim())
}

/** Strip extension / track-number prefixes so filename seeds are usable. */
export function cleanTitleForSeed(title: string): string {
  let t = title.trim()
  if (!t) return t
  if (looksLikeRawFilename(t)) {
    t = t.replace(/\.[^.]+$/, '').trim()
  }
  t = t.replace(LEADING_TRACK_NO, '').trim()
  return t || title.trim()
}

/**
 * When ID3 artist is missing, try "Artist - Title" from the filename/title.
 */
export function inferArtistTitle(
  artist: string,
  title: string,
): { artist: string; title: string } {
  const cleaned = cleanTitleForSeed(title)
  const hasArtist = normalizeLabel(artist) !== '' && normalizeLabel(artist) !== 'unknown'
  if (hasArtist) {
    return { artist: artist.trim(), title: cleaned }
  }

  const parts = cleaned.split(ARTIST_TITLE_SPLIT)
  if (parts.length >= 2) {
    const inferredArtist = parts[0]!.trim()
    const inferredTitle = parts.slice(1).join(' - ').trim()
    if (inferredArtist && inferredTitle) {
      return { artist: inferredArtist, title: inferredTitle }
    }
  }
  return { artist: artist.trim() || 'Unknown', title: cleaned }
}

export function isSeedUsable(seed: ResearchSeed): boolean {
  const artist = normalizeLabel(seed.artist)
  const title = normalizeLabel(seed.title)
  const hasArtist = artist.length > 0 && artist !== 'unknown'
  const hasTitle = title.length > 0 && !looksLikeRawFilename(seed.title)
  return hasArtist || hasTitle
}

export function buildSeed(track: Track, profile: TasteProfile): ResearchSeed {
  const inferred = inferArtistTitle(track.artist, track.title)
  return {
    artist: inferred.artist,
    title: inferred.title,
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

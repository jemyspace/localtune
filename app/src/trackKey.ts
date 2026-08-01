import type { Track } from './types'

export function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function trackKeyFor(track: Track): string {
  const artist = normalizeLabel(track.artist)
  const title = normalizeLabel(track.title)
  if (artist && artist !== 'unknown') {
    return `${artist}|${title}`
  }
  return `file|${track.fileName}|${track.file.size}|${track.file.lastModified}`
}

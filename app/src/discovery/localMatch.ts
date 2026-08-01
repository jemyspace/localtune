import { normalizeLabel } from '../trackKey'
import type { Library } from '../library'
import type { DiscoveryItem } from './types'

export function matchesLocalLibrary(
  library: Library,
  artist: string,
  title?: string,
): boolean {
  const na = normalizeLabel(artist)
  const nt = title ? normalizeLabel(title) : ''
  return library.getAll().some((t) => {
    if (t.error) return false
    const matchArtist = normalizeLabel(t.artist) === na
    if (!matchArtist) return false
    if (!nt) return true
    return normalizeLabel(t.title) === nt
  })
}

export function refreshLocalMatches(library: Library, items: DiscoveryItem[]): void {
  for (const item of items) {
    item.inLocalLibrary = matchesLocalLibrary(library, item.artist, item.title)
  }
}
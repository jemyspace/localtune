import type { DiscoveryStore } from '../discovery/discoveryStore'
import { normalizeLabel } from '../trackKey'
import type { Track } from '../types'
import { genreToThemeId } from './themeMap'
import type { ThemeId } from './types'

export function findResearchGenreHint(store: DiscoveryStore, track: Track): string | undefined {
  const na = normalizeLabel(track.artist)
  const nt = normalizeLabel(track.title)
  const items = store.getItems()

  const exact = items.find(
    (item) =>
      normalizeLabel(item.artist) === na &&
      item.title &&
      normalizeLabel(item.title) === nt &&
      item.genre,
  )
  if (exact?.genre) return exact.genre

  const byArtist = items.find(
    (item) => normalizeLabel(item.artist) === na && item.genre,
  )
  return byArtist?.genre
}

export function resolveThemeId(
  track: Track,
  researchGenreHint: string | undefined,
  researchEnabled: boolean,
): ThemeId {
  if (researchEnabled && researchGenreHint) {
    const fromResearch = genreToThemeId(researchGenreHint)
    if (fromResearch !== 'neutral') return fromResearch
  }

  return genreToThemeId(track.genre ?? 'Unknown')
}

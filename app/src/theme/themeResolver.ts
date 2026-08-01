import type { DiscoveryStore } from '../discovery/discoveryStore'
import type { AudioFeatures, AudioMood } from '../audio/types'
import { normalizeLabel } from '../trackKey'
import type { Track } from '../types'
import { genreToThemeId, inferGenreFromText } from './themeMap'
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

  const byArtist = items.find((item) => normalizeLabel(item.artist) === na && item.genre)
  if (byArtist?.genre) return byArtist.genre

  // Any recent discovery item with genre (e.g. MusicBrainz artist tags from same play)
  const recent = items.find((item) => item.genre)
  return recent?.genre
}

export function moodToThemeId(mood: AudioMood): ThemeId {
  switch (mood) {
    case 'energetic':
      return 'electronic'
    case 'calm':
      return 'classical'
    case 'bright':
      return 'pop'
    case 'warm':
      return 'soul'
    default:
      return 'neutral'
  }
}

export function resolveThemeId(
  track: Track,
  researchGenreHint: string | undefined,
  researchEnabled: boolean,
  audioFeatures?: AudioFeatures | null,
): ThemeId {
  if (researchEnabled && researchGenreHint) {
    const fromResearch = genreToThemeId(researchGenreHint)
    if (fromResearch !== 'neutral') return fromResearch
  }

  const fromTag = genreToThemeId(track.genre ?? 'Unknown')
  if (fromTag !== 'neutral') return fromTag

  const inferred = inferGenreFromText(track.title, track.artist, track.fileName, track.album)
  if (inferred) {
    const fromText = genreToThemeId(inferred)
    if (fromText !== 'neutral') return fromText
  }

  if (audioFeatures) {
    const fromMood = moodToThemeId(audioFeatures.mood)
    if (fromMood !== 'neutral') return fromMood
  }

  return 'neutral'
}

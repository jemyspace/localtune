import { normalizeLabel } from '../trackKey'
import type { ThemeId } from './types'

const SYNONYMS: Record<string, ThemeId> = {
  rock: 'rock',
  alternative: 'rock',
  indie: 'rock',
  grunge: 'rock',
  punk: 'metal',
  metal: 'metal',
  hardcore: 'metal',
  pop: 'pop',
  jazz: 'jazz',
  blues: 'jazz',
  electronic: 'electronic',
  edm: 'electronic',
  dance: 'electronic',
  techno: 'electronic',
  house: 'electronic',
  trance: 'electronic',
  classical: 'classical',
  opera: 'classical',
  orchestral: 'classical',
  'hip hop': 'hiphop',
  hiphop: 'hiphop',
  'hip-hop': 'hiphop',
  rap: 'hiphop',
  'r&b': 'hiphop',
  rb: 'hiphop',
  rnb: 'hiphop',
  folk: 'folk',
  country: 'folk',
  acoustic: 'folk',
  soul: 'soul',
  funk: 'soul',
}

export function genreToThemeId(raw: string): ThemeId {
  const g = normalizeLabel(raw)
  if (!g || g === 'unknown') return 'neutral'

  if (SYNONYMS[g]) return SYNONYMS[g]

  for (const [key, theme] of Object.entries(SYNONYMS)) {
    if (g.includes(key)) return theme
  }

  return 'neutral'
}

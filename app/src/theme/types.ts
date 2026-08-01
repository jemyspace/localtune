export type UiMode = 'default' | 'adaptive'

export type ThemeId =
  | 'neutral'
  | 'rock'
  | 'pop'
  | 'jazz'
  | 'electronic'
  | 'classical'
  | 'hiphop'
  | 'metal'
  | 'folk'
  | 'soul'

export const THEME_LABELS: Record<ThemeId, string> = {
  neutral: 'Netral',
  rock: 'Rock',
  pop: 'Pop',
  jazz: 'Jazz',
  electronic: 'Electronic',
  classical: 'Klasik',
  hiphop: 'Hip-hop',
  metal: 'Metal',
  folk: 'Folk',
  soul: 'Soul',
}

export interface ThemeTokens {
  bg: string
  bg2: string
  surface: string
  text: string
  muted: string
  accent: string
  accentContrast: string
  glowA: string
  glowB: string
}

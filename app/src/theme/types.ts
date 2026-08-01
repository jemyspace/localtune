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

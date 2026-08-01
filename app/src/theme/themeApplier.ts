import type { ThemeId } from './types'

export function applyTheme(themeId: ThemeId): void {
  document.documentElement.dataset.theme = themeId
}

export function clearAdaptiveTheme(): void {
  document.documentElement.dataset.theme = 'neutral'
}

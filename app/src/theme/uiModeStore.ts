import type { UiMode } from './types'

const UI_MODE_KEY = 'localtune:uiMode'

export function getUiMode(): UiMode {
  const value = sessionStorage.getItem(UI_MODE_KEY)
  return value === 'adaptive' ? 'adaptive' : 'default'
}

export function setUiMode(mode: UiMode): void {
  sessionStorage.setItem(UI_MODE_KEY, mode)
}

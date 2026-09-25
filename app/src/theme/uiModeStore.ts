import type { UiMode } from './types'

const UI_MODE_KEY = 'localtune:uiMode'

export function getUiMode(): UiMode {
  const value = sessionStorage.getItem(UI_MODE_KEY)
  return value === 'adaptive' ? 'adaptive' : 'default'
}

export function setUiMode(mode: UiMode): void {
  sessionStorage.setItem(UI_MODE_KEY, mode)
}

const SCENE_KEY = 'localtune:rhythmScene'

/** Latar bergerak mengikuti irama (mode Adaptif). Default aktif. */
export function isRhythmSceneEnabled(): boolean {
  return sessionStorage.getItem(SCENE_KEY) !== 'off'
}

export function setRhythmSceneEnabled(on: boolean): void {
  sessionStorage.setItem(SCENE_KEY, on ? 'on' : 'off')
}

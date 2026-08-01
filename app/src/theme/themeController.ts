import type { DiscoveryStore } from '../discovery/discoveryStore'
import type { Player } from '../player'
import { isResearchEnabled } from '../settings'
import type { Track } from '../types'
import { AmbienceController } from './ambience'
import { applyTheme, clearAdaptiveTheme } from './themeApplier'
import { findResearchGenreHint, resolveThemeId } from './themeResolver'
import { getUiMode, setUiMode } from './uiModeStore'
import type { UiMode } from './types'

export class ThemeController {
  private readonly ambience = new AmbienceController()
  private readonly player: Player
  private readonly discoveryStore: DiscoveryStore

  constructor(player: Player, discoveryStore: DiscoveryStore) {
    this.player = player
    this.discoveryStore = discoveryStore
    this.ambience.attach(player.getAudio())
    this.syncMode()
  }

  getMode(): UiMode {
    return getUiMode()
  }

  setMode(mode: UiMode): void {
    setUiMode(mode)
    this.syncMode()
  }

  onTrackChange(track?: Track): void {
    if (getUiMode() === 'default') return
    if (!track) {
      clearAdaptiveTheme()
      return
    }
    this.applyForTrack(track)
  }

  onDiscoveryUpdate(): void {
    if (getUiMode() !== 'adaptive') return
    this.onTrackChange(this.player.current())
  }

  onPlayStart(): void {
    this.ambience.resumeIfNeeded()
    if (getUiMode() === 'adaptive') {
      this.ambience.setEnabled(true)
    }
  }

  private syncMode(): void {
    const mode = getUiMode()
    if (mode === 'default') {
      clearAdaptiveTheme()
      this.ambience.setEnabled(false)
      return
    }
    this.ambience.setEnabled(true)
    this.onTrackChange(this.player.current())
  }

  private applyForTrack(track: Track): void {
    const hint = findResearchGenreHint(this.discoveryStore, track)
    const themeId = resolveThemeId(track, hint, isResearchEnabled())
    applyTheme(themeId)
  }
}

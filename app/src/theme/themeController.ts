import type { AudioFeaturesStore } from '../audio/audioFeaturesStore'
import type { DiscoveryStore } from '../discovery/discoveryStore'
import type { Player } from '../player'
import { isResearchEnabled } from '../settings'
import type { Track } from '../types'
import { trackKeyFor } from '../trackKey'
import { AmbienceController } from './ambience'
import { applyTheme, clearAdaptiveTheme } from './themeApplier'
import { findResearchGenreHint, resolveThemeId } from './themeResolver'
import { getUiMode, setUiMode } from './uiModeStore'
import type { ThemeId, UiMode } from './types'

type ThemeListener = (themeId: ThemeId, mode: UiMode) => void

export class ThemeController {
  private readonly ambience = new AmbienceController()
  private readonly player: Player
  private readonly discoveryStore: DiscoveryStore
  private readonly featuresStore: AudioFeaturesStore
  private currentThemeId: ThemeId = 'neutral'
  private readonly listeners = new Set<ThemeListener>()

  constructor(
    player: Player,
    discoveryStore: DiscoveryStore,
    featuresStore: AudioFeaturesStore,
  ) {
    this.player = player
    this.discoveryStore = discoveryStore
    this.featuresStore = featuresStore
    this.ambience.attach(player.getAudio())
    this.syncMode()
  }

  getMode(): UiMode {
    return getUiMode()
  }

  getActiveThemeId(): ThemeId {
    return this.currentThemeId
  }

  subscribe(listener: ThemeListener): () => void {
    this.listeners.add(listener)
    listener(this.currentThemeId, this.getMode())
    return () => this.listeners.delete(listener)
  }

  setMode(mode: UiMode): void {
    setUiMode(mode)
    this.syncMode()
  }

  onTrackChange(track?: Track): void {
    if (getUiMode() === 'default') return
    if (!track) {
      this.setTheme('neutral')
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
      this.currentThemeId = 'neutral'
      this.ambience.setEnabled(false)
      this.notify()
      return
    }
    this.ambience.setEnabled(true)
    this.onTrackChange(this.player.current())
  }

  private applyForTrack(track: Track): void {
    const hint = findResearchGenreHint(this.discoveryStore, track)
    const features = this.featuresStore.get(trackKeyFor(track))
    const themeId = resolveThemeId(track, hint, isResearchEnabled(), features)
    this.setTheme(themeId)
  }

  private setTheme(themeId: ThemeId): void {
    this.currentThemeId = themeId
    applyTheme(themeId)
    this.notify()
  }

  private notify(): void {
    const mode = getUiMode()
    for (const l of this.listeners) l(this.currentThemeId, mode)
  }
}

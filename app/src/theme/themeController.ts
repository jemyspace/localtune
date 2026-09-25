import type { AudioFeaturesStore } from '../audio/audioFeaturesStore'
import type { DiscoveryStore } from '../discovery/discoveryStore'
import type { Player } from '../player'
import { isResearchEnabled } from '../settings'
import type { Track } from '../types'
import { trackKeyFor } from '../trackKey'
import { AmbienceController, prefersReducedMotion } from './ambience'
import { RhythmScene, type SceneKind } from './rhythmScene'
import { paletteFromCover, paletteFromFeatures, type SongPalette } from './songPalette'
import { applyTheme, clearAdaptiveTheme } from './themeApplier'
import { findResearchGenreHint, resolveThemeId } from './themeResolver'
import { getUiMode, isRhythmSceneEnabled, setRhythmSceneEnabled, setUiMode } from './uiModeStore'
import type { ThemeId, UiMode } from './types'

type ThemeListener = (themeId: ThemeId, mode: UiMode) => void

export class ThemeController {
  private readonly ambience = new AmbienceController()
  private readonly scene: RhythmScene | null
  private readonly player: Player
  private readonly discoveryStore: DiscoveryStore
  private readonly featuresStore: AudioFeaturesStore
  private currentThemeId: ThemeId = 'neutral'
  private currentPalette: SongPalette | null = null
  private readonly coverPalettes = new Map<string, SongPalette | null>()
  private readonly listeners = new Set<ThemeListener>()

  constructor(
    player: Player,
    discoveryStore: DiscoveryStore,
    featuresStore: AudioFeaturesStore,
    sceneCanvas?: HTMLCanvasElement,
  ) {
    this.player = player
    this.discoveryStore = discoveryStore
    this.featuresStore = featuresStore
    this.scene = sceneCanvas ? new RhythmScene(sceneCanvas) : null
    this.ambience.attach(player.getAudio())
    this.ambience.onFrame((frame) => this.scene?.update(frame))
    const audio = player.getAudio()
    audio.addEventListener('play', () => this.syncScene())
    audio.addEventListener('pause', () => this.syncScene())
    audio.addEventListener('ended', () => this.syncScene())
    // Adaptive gain direset tiap lagu baru agar lagu pelan tetap "hidup".
    audio.addEventListener('loadstart', () => this.ambience.resetGain())
    this.syncMode()
  }

  getMode(): UiMode {
    return getUiMode()
  }

  getActiveThemeId(): ThemeId {
    return this.currentThemeId
  }

  getSceneKind(): SceneKind | null {
    return this.scene?.getKind() ?? null
  }

  /** Asal warna lagu saat ini: sampul album, suasana lagu, atau genre. */
  getPaletteSource(): SongPalette['source'] | 'genre' {
    return this.currentPalette?.source ?? 'genre'
  }

  isSceneEnabled(): boolean {
    return isRhythmSceneEnabled() && !prefersReducedMotion()
  }

  setSceneEnabled(on: boolean): void {
    setRhythmSceneEnabled(on)
    this.syncScene()
    this.notify()
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
      this.setPalette(null)
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
    this.syncScene()
  }

  private syncMode(): void {
    const mode = getUiMode()
    if (mode === 'default') {
      this.setPalette(null)
      clearAdaptiveTheme()
      this.currentThemeId = 'neutral'
      this.ambience.setEnabled(false)
      this.syncScene()
      this.notify()
      return
    }
    this.ambience.setEnabled(true)
    this.onTrackChange(this.player.current())
    this.syncScene()
  }

  private syncScene(): void {
    if (!this.scene) return
    const on = getUiMode() === 'adaptive' && this.isSceneEnabled() && this.player.isPlaying()
    this.scene.setActive(on)
  }

  private applyForTrack(track: Track): void {
    const hint = findResearchGenreHint(this.discoveryStore, track)
    const features = this.featuresStore.get(trackKeyFor(track))
    const themeId = resolveThemeId(track, hint, isResearchEnabled(), features)
    this.scene?.setTempo(features?.tempoBpm ?? null)

    // Warna per lagu: sampul album > suasana lagu > warna genre.
    const fromMood = features ? paletteFromFeatures(features, `${track.artist}|${track.title}`) : null
    if (track.coverUrl) {
      const cached = this.coverPalettes.get(track.coverUrl)
      if (cached !== undefined) {
        this.setPalette(cached ?? fromMood)
      } else {
        this.setPalette(fromMood)
        void this.loadCoverPalette(track)
      }
    } else {
      this.setPalette(fromMood)
    }
    this.setTheme(themeId)
  }

  private async loadCoverPalette(track: Track): Promise<void> {
    const url = track.coverUrl
    if (!url || this.coverPalettes.has(url)) return
    this.coverPalettes.set(url, null)
    const palette = await paletteFromCover(url)
    this.coverPalettes.set(url, palette)
    if (palette && this.player.current()?.id === track.id && getUiMode() === 'adaptive') {
      this.setPalette(palette)
      this.scene?.setTheme(this.currentThemeId)
      this.notify()
    }
  }

  private setPalette(palette: SongPalette | null): void {
    this.currentPalette = palette
    const root = document.documentElement.style
    if (palette) {
      root.setProperty('--accent-base', palette.accentBase)
      root.setProperty('--tint', palette.tint)
    } else {
      root.removeProperty('--accent-base')
      root.removeProperty('--tint')
    }
  }

  private setTheme(themeId: ThemeId): void {
    this.currentThemeId = themeId
    applyTheme(themeId)
    this.scene?.setTheme(themeId)
    this.notify()
  }

  private notify(): void {
    const mode = getUiMode()
    for (const l of this.listeners) l(this.currentThemeId, mode)
  }
}

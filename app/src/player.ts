import type { Library } from './library'
import type { PlayerListeners, Track } from './types'

export class Player {
  private readonly audio = new Audio()
  private readonly library: Library
  private index = -1
  private listeners: PlayerListeners = {}
  private nextResolver?: () => number | undefined

  constructor(library: Library) {
    this.library = library
    this.audio.preload = 'metadata'
    this.audio.addEventListener('ended', () => this.handleEnded())
    this.audio.addEventListener('error', () => this.handleError())
    this.audio.addEventListener('loadedmetadata', () => {
      const track = this.current()
      if (track && Number.isFinite(this.audio.duration)) {
        this.library.updateTrack(track.id, { durationSec: this.audio.duration })
        this.onTrackMeta?.(track)
      }
    })
  }

  onTrackMeta?: (track: Track) => void
  onChange?: () => void

  setListeners(listeners: PlayerListeners): void {
    this.listeners = listeners
  }

  setNextResolver(resolver: () => number | undefined): void {
    this.nextResolver = resolver
  }

  current(): Track | undefined {
    const all = this.library.getAll()
    if (this.index < 0 || this.index >= all.length) return undefined
    return all[this.index]
  }

  getIndex(): number {
    return this.index
  }

  getAudio(): HTMLAudioElement {
    return this.audio
  }

  isPlaying(): boolean {
    return !this.audio.paused
  }

  async playIndex(i: number, autoplay = true): Promise<void> {
    const all = this.library.getAll()
    if (all.length === 0) return
    const next = ((i % all.length) + all.length) % all.length
    const track = all[next]
    if (!track || track.error) {
      if (all.some((t) => !t.error)) {
        await this.playIndex(next + 1, autoplay)
      }
      return
    }

    const prev = this.current()
    if (prev && prev.id !== track.id) {
      this.listeners.onSkipToOther?.(prev.id, this.audio.currentTime, track.id)
    }

    this.index = next
    this.audio.src = track.objectUrl
    this.onChange?.()

    if (autoplay) {
      try {
        await this.audio.play()
        this.listeners.onPlayStart?.(track.id)
      } catch {
        /* autoplay blocked until gesture */
      }
    }
    this.onChange?.()
  }

  async togglePlay(): Promise<void> {
    const track = this.current()
    if (!track) {
      await this.playIndex(0, true)
      return
    }
    if (this.audio.paused) {
      try {
        await this.audio.play()
        this.listeners.onPlayStart?.(track.id)
      } catch {
        /* autoplay blocked */
      }
    } else {
      this.audio.pause()
      this.listeners.onPause?.(track.id, this.audio.currentTime)
    }
    this.onChange?.()
  }

  async next(): Promise<void> {
    if (this.library.getAll().length === 0) return
    const resolved = this.nextResolver?.()
    if (resolved != null && resolved >= 0) {
      await this.playIndex(resolved, true)
      return
    }
    await this.playIndex(this.index + 1, true)
  }

  async prev(): Promise<void> {
    if (this.library.getAll().length === 0) return
    if (this.audio.currentTime > 3) {
      this.seek(0)
      return
    }
    await this.playIndex(this.index - 1, true)
  }

  seek(sec: number): void {
    const track = this.current()
    if (!track) return
    const from = this.audio.currentTime
    this.audio.currentTime = Math.max(0, sec)
    this.listeners.onSeek?.(track.id, from, this.audio.currentTime)
  }

  setVolume(v: number): void {
    this.audio.volume = Math.min(1, Math.max(0, v))
  }

  private async handleEnded(): Promise<void> {
    const track = this.current()
    if (track) this.listeners.onEnded?.(track.id)
    await this.next()
  }

  private async handleError(): Promise<void> {
    const track = this.current()
    if (!track) return
    this.library.updateTrack(track.id, {
      error: 'Format tidak didukung atau gagal dimuat',
    })
    this.onChange?.()
    await this.next()
  }
}

import type { Library } from '../library'
import type { Player } from '../player'
import { trackKeyFor } from '../trackKey'
import type { Track } from '../types'
import type { TasteApi } from './tasteApi'
import type { FinalizedAttempt } from './types'

const MEANINGFUL_DEBOUNCE_MS = 2000

interface ActiveAttempt {
  trackId: string
  trackKey: string
  title: string
  artist: string
  genre: string
  meaningfulPlay: boolean
  heardSec: number
  lastTickMs: number
  durationSec?: number
}

export class ListenTracker {
  private attempt: ActiveAttempt | null = null
  private lastPauseAt = 0
  private lastMeaningfulTrackId: string | null = null
  private readonly player: Player
  private readonly library: Library
  private readonly tasteApi: TasteApi
  private onMeaningfulPlay?: (track: Track) => void

  constructor(player: Player, library: Library, tasteApi: TasteApi) {
    this.player = player
    this.library = library
    this.tasteApi = tasteApi
  }

  bindTimeupdate(): void {
    this.player.getAudio().addEventListener('timeupdate', () => {
      this.tickHeard()
    })
  }

  setMeaningfulPlayHandler(handler: (track: Track) => void): void {
    this.onMeaningfulPlay = handler
  }

  handlers(): {
    onPlayStart: (trackId: string) => void
    onPause: (trackId: string, positionSec: number) => void
    onEnded: (trackId: string) => void
    onSkipToOther: (trackId: string, positionSec: number, nextTrackId: string) => void
  } {
    return {
      onPlayStart: (trackId) => this.onPlayStart(trackId),
      onPause: (trackId, positionSec) => this.onPause(trackId, positionSec),
      onEnded: (trackId) => this.onEnded(trackId),
      onSkipToOther: (trackId, positionSec, nextTrackId) =>
        this.onSkipToOther(trackId, positionSec, nextTrackId),
    }
  }

  private trackById(id: string): Track | undefined {
    return this.library.getAll().find((t) => t.id === id)
  }

  private durationFor(track: Track): number | undefined {
    if (track.durationSec && Number.isFinite(track.durationSec)) return track.durationSec
    const audioDur = this.player.getAudio().duration
    if (Number.isFinite(audioDur) && audioDur > 0) return audioDur
    return undefined
  }

  private isMeaningfulPlay(trackId: string): boolean {
    const now = Date.now()
    if (this.lastMeaningfulTrackId !== trackId) return true
    return now - this.lastPauseAt >= MEANINGFUL_DEBOUNCE_MS
  }

  private markMeaningful(trackId: string): void {
    this.lastMeaningfulTrackId = trackId
  }

  private onPlayStart(trackId: string): void {
    const track = this.trackById(trackId)
    if (!track) return

    const meaningful = this.isMeaningfulPlay(trackId)
    if (meaningful) {
      this.markMeaningful(trackId)
      this.onMeaningfulPlay?.(track)
    }

    const durationSec = this.durationFor(track)
    this.attempt = {
      trackId,
      trackKey: trackKeyFor(track),
      title: track.title,
      artist: track.artist,
      genre: track.genre ?? 'Unknown',
      meaningfulPlay: meaningful,
      heardSec: 0,
      lastTickMs: Date.now(),
      durationSec,
    }
  }

  private tickHeard(): void {
    if (!this.attempt || this.player.getAudio().paused) return
    const now = Date.now()
    const delta = (now - this.attempt.lastTickMs) / 1000
    if (delta > 0 && delta < 5) {
      this.attempt.heardSec += delta
    }
    this.attempt.lastTickMs = now
    const track = this.trackById(this.attempt.trackId)
    if (track) {
      const d = this.durationFor(track)
      if (d) this.attempt.durationSec = d
    }
  }

  private onPause(trackId: string, positionSec: number): void {
    this.lastPauseAt = Date.now()
    this.finalizeAttempt(trackId, positionSec, 'pause')
  }

  private onEnded(trackId: string): void {
    const track = this.trackById(trackId)
    const dur = track ? this.durationFor(track) : undefined
    this.finalizeAttempt(trackId, dur ?? this.player.getAudio().currentTime, 'ended')
  }

  private onSkipToOther(trackId: string, positionSec: number, _nextTrackId: string): void {
    this.finalizeAttempt(trackId, positionSec, 'skip')
  }

  private finalizeAttempt(
    trackId: string,
    positionSec: number,
    reason: 'pause' | 'skip' | 'ended',
  ): void {
    if (!this.attempt || this.attempt.trackId !== trackId) return

    this.tickHeard()
    const attempt = this.attempt
    this.attempt = null

    const durationSec = attempt.durationSec ?? (reason === 'ended' ? positionSec : undefined)

    let completed = false
    let earlySkipped = false
    if (reason === 'ended') {
      completed = true
    } else if (reason === 'skip') {
      ;({ completed, earlySkipped } = classifyListen(positionSec, durationSec, false))
    } else {
      ;({ completed } = classifyListen(positionSec, durationSec, false))
    }

    const finalized: FinalizedAttempt = {
      trackKey: attempt.trackKey,
      title: attempt.title,
      artist: attempt.artist,
      genre: attempt.genre,
      heardSec: attempt.heardSec,
      durationSec,
      completed,
      earlySkipped,
      meaningfulPlay: attempt.meaningfulPlay,
    }

    this.tasteApi.getStore().applyAttempt(finalized)
    this.tasteApi.notify()
  }
}

export function classifyListen(
  positionSec: number,
  durationSec: number | undefined,
  ended: boolean,
): { completed: boolean; earlySkipped: boolean } {
  if (ended) return { completed: true, earlySkipped: false }

  if (!durationSec || durationSec <= 0) {
    const earlySkipped = positionSec < 20
    return { completed: false, earlySkipped }
  }

  const ratio = positionSec / durationSec
  const completed = ratio >= 0.8
  const earlySkipped = !completed && (ratio < 0.3 || positionSec < 20)
  return { completed, earlySkipped }
}

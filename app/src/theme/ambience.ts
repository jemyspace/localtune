export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Satu frame sinyal audio yang sudah dihaluskan, 0–1. */
export interface RhythmFrame {
  bass: number
  mid: number
  high: number
  level: number
  /** true tepat pada frame ketukan (onset bass) terdeteksi. */
  beat: boolean
  /** Meluruh 1 → 0 setelah tiap ketukan. */
  pulse: number
}

type FrameListener = (frame: RhythmFrame) => void

const MIN_BEAT_GAP_MS = 240
/** Peluruhan puncak per frame (~60 fps): puncak turun setengah dalam ±20 detik. */
const PEAK_DECAY = 0.99942
const MAX_GAIN = 6
const PULSE_DECAY = 0.9

function bandAverage(data: Uint8Array, from: number, to: number): number {
  let sum = 0
  const end = Math.min(to, data.length)
  for (let i = from; i < end; i++) sum += data[i] ?? 0
  return end > from ? sum / (end - from) / 255 : 0
}

export class AmbienceController {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private raf = 0
  private enabled = false
  private attached = false
  private readonly listeners = new Set<FrameListener>()

  private prevBass = 0
  private fluxAvg = 0
  private peakLevel = 0
  private lastBeatAt = 0
  private frame: RhythmFrame = { bass: 0, mid: 0, high: 0, level: 0, beat: false, pulse: 0 }

  attach(audio: HTMLAudioElement): void {
    if (this.attached) return
    this.attached = true
    try {
      this.ctx = new AudioContext()
      const source = this.ctx.createMediaElementSource(audio)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.35
      source.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    } catch {
      this.attached = false
    }
  }

  /** Dipanggil saat lagu berganti agar gain dihitung ulang dari lagu baru. */
  resetGain(): void {
    this.peakLevel = 0
    this.fluxAvg = 0
    this.prevBass = 0
  }

  resumeIfNeeded(): void {
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setEnabled(on: boolean): void {
    this.enabled = on && !prefersReducedMotion()
    if (this.enabled) this.start()
    else this.stop()
  }

  private start(): void {
    if (!this.analyser || this.raf) return
    const analyser = this.analyser
    const data = new Uint8Array(analyser.frequencyBinCount)
    // Lebar bin ≈ sampleRate / fftSize (~86 Hz pada 44.1 kHz).
    const binHz = (this.ctx?.sampleRate ?? 44100) / analyser.fftSize
    const bassEnd = Math.max(2, Math.round(250 / binHz))
    const midEnd = Math.round(2000 / binHz)
    const highEnd = Math.round(8000 / binHz)

    const tick = (now: number): void => {
      if (!this.enabled) return
      analyser.getByteFrequencyData(data)
      const rawBass = bandAverage(data, 0, bassEnd)
      const rawMid = bandAverage(data, bassEnd, midEnd)
      const rawHigh = bandAverage(data, midEnd, highEnd)
      const rawLevel = rawBass * 0.45 + rawMid * 0.4 + rawHigh * 0.15

      // Adaptive gain: skala terhadap puncak lagu ini (meluruh pelan), jadi lagu
      // yang direkam pelan tetap menggerakkan visual dan lagu keras tidak mentok.
      this.peakLevel = Math.max(rawLevel, this.peakLevel * PEAK_DECAY)
      const gain = Math.min(MAX_GAIN, 0.75 / Math.max(0.08, this.peakLevel))
      const bass = Math.min(1, rawBass * gain)
      const mid = Math.min(1, rawMid * gain)
      const high = Math.min(1, rawHigh * gain)
      const level = Math.min(1, rawLevel * gain)

      // Onset: lonjakan bass antar-frame (flux) jauh di atas rata-rata flux berjalan.
      // Tahan terhadap bass yang terus-menerus tinggi (pad, bassline panjang).
      const flux = Math.max(0, bass - this.prevBass)
      this.prevBass = bass
      const beat =
        bass > 0.2 &&
        flux > Math.max(0.05, this.fluxAvg * 2.4) &&
        now - this.lastBeatAt > MIN_BEAT_GAP_MS
      if (beat) this.lastBeatAt = now
      this.fluxAvg = this.fluxAvg * 0.93 + flux * 0.07

      const pulse = beat ? 1 : this.frame.pulse * PULSE_DECAY
      this.frame = { bass, mid, high, level, beat, pulse }

      const root = document.documentElement.style
      root.setProperty('--ambience', String(0.03 + level * 0.12))
      root.setProperty('--beat', pulse.toFixed(3))
      root.setProperty('--level', level.toFixed(3))
      for (const l of this.listeners) l(this.frame)

      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stop(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.frame = { bass: 0, mid: 0, high: 0, level: 0, beat: false, pulse: 0 }
    const root = document.documentElement.style
    root.setProperty('--ambience', '0')
    root.setProperty('--beat', '0')
    root.setProperty('--level', '0')
    for (const l of this.listeners) l(this.frame)
  }
}

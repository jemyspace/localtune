export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export class AmbienceController {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private raf = 0
  private enabled = false
  private attached = false

  attach(audio: HTMLAudioElement): void {
    if (this.attached) return
    this.attached = true
    try {
      this.ctx = new AudioContext()
      const source = this.ctx.createMediaElementSource(audio)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 64
      source.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    } catch {
      this.attached = false
    }
  }

  resumeIfNeeded(): void {
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on && !prefersReducedMotion()
    if (this.enabled) this.start()
    else this.stop()
  }

  private start(): void {
    if (!this.analyser || this.raf) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    const tick = (): void => {
      if (!this.enabled || !this.analyser) return
      this.analyser.getByteFrequencyData(data)
      let sum = 0
      for (const v of data) sum += v
      const avg = sum / data.length / 255
      document.documentElement.style.setProperty('--ambience', String(0.03 + avg * 0.1))
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stop(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    document.documentElement.style.setProperty('--ambience', '0')
  }
}

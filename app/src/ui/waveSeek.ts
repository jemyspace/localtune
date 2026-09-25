/**
 * Seek bar berbentuk gelombang energi lagu: bagian yang sudah diputar berwarna
 * aksen, sisanya redup, dan ada penanda di bagian puncak. <input type=range>
 * transparan tetap ada di atasnya untuk keyboard & pembaca layar.
 */
export class WaveSeek {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private waveform: number[] | null = null
  private peakFrac: number | null = null
  private played = '#b4552d'
  private rest = 'rgba(36,33,29,0.18)'
  private lastKey = ''

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.invalidate()).observe(canvas)
    }
  }

  setData(waveform: number[] | undefined, peakFrac: number | null): void {
    this.waveform = waveform && waveform.length > 0 ? waveform : null
    this.peakFrac = peakFrac
    this.invalidate()
  }

  /** Baca ulang warna tema (dipanggil saat warna lagu berganti). */
  refreshColors(): void {
    const css = getComputedStyle(this.canvas)
    this.played = css.color || this.played
    this.rest = css.outlineColor || this.rest
    this.invalidate()
  }

  invalidate(): void {
    this.lastKey = ''
  }

  draw(progress: number): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w === 0 || h === 0) return
    const p = Math.max(0, Math.min(1, progress))
    const key = `${w}x${h}:${Math.round(p * w)}`
    if (key === this.lastKey) return
    this.lastKey = key

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr)
      this.canvas.height = Math.round(h * dpr)
    }
    const { ctx } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const playedX = p * w

    if (!this.waveform) {
      // Belum dianalisis: garis sederhana.
      const y = h / 2 - 2
      ctx.fillStyle = this.rest
      roundRect(ctx, 0, y, w, 4, 2)
      ctx.fillStyle = this.played
      roundRect(ctx, 0, y, playedX, 4, 2)
      return
    }

    const n = this.waveform.length
    const step = w / n
    const barW = Math.max(1, step - 1)
    const markTop = 6
    const usable = h - markTop
    for (let i = 0; i < n; i++) {
      const v = this.waveform[i] ?? 0
      const bh = Math.max(3, (0.12 + v * 0.88) * usable)
      const x = i * step
      const y = markTop + (usable - bh) / 2
      ctx.fillStyle = x + barW / 2 <= playedX ? this.played : this.rest
      roundRect(ctx, x, y, barW, bh, Math.min(1.5, barW / 2))
    }

    if (this.peakFrac != null) {
      const x = this.peakFrac * w
      ctx.fillStyle = this.played
      ctx.beginPath()
      ctx.arc(x, 3, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (w <= 0 || h <= 0) return
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
  ctx.fill()
}

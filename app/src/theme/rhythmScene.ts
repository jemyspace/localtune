import type { RhythmFrame } from './ambience'
import type { ThemeId } from './types'

/**
 * Latar bergerak yang mengikuti irama (bass/ketukan) lagu yang sedang diputar.
 * Bukan visualizer spektrum: setiap tema punya "suasana" sendiri yang hanya
 * digerakkan oleh level energi + ketukan. Semua lokal, tanpa aset eksternal.
 */
export type SceneKind =
  | 'orbs'
  | 'grid'
  | 'sparks'
  | 'bubbles'
  | 'smoke'
  | 'ribbons'
  | 'fireflies'
  | 'rings'

const SCENE_FOR_THEME: Record<ThemeId, SceneKind> = {
  neutral: 'orbs',
  electronic: 'grid',
  rock: 'sparks',
  metal: 'sparks',
  pop: 'bubbles',
  jazz: 'smoke',
  soul: 'smoke',
  classical: 'ribbons',
  folk: 'fireflies',
  hiphop: 'rings',
}

export const SCENE_LABELS: Record<SceneKind, string> = {
  orbs: 'Cahaya lembut',
  grid: 'Garis perspektif',
  sparks: 'Percikan api',
  bubbles: 'Gelembung',
  smoke: 'Kabut lembut',
  ribbons: 'Alunan pita',
  fireflies: 'Kunang-kunang',
  rings: 'Gelombang speaker',
}

export function sceneForTheme(themeId: ThemeId): SceneKind {
  return SCENE_FOR_THEME[themeId]
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  maxLife: number
  color: number
  seed: number
  /** Kilau sesaat setelah ketukan (1 → 0), dipakai kunang-kunang. */
  flash?: number
}

type Rgb = [number, number, number]

const MAX_PARTICLES = 160

let probeEl: HTMLSpanElement | null = null
let probeCtx: CanvasRenderingContext2D | null = null

/**
 * Ubah token warna CSS (bisa berupa var() + color-mix()) menjadi RGB.
 * Browser menghitung warnanya lewat elemen probe, lalu canvas 1×1
 * menormalkan format apa pun (oklab, color(), rgb) ke byte RGB.
 */
function resolveCssColor(varName: string, fallback: Rgb): Rgb {
  try {
    if (!probeEl) {
      probeEl = document.createElement('span')
      probeEl.style.display = 'none'
      document.body.appendChild(probeEl)
    }
    if (!probeCtx) {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      probeCtx = c.getContext('2d', { willReadFrequently: true })
    }
    if (!probeCtx) return fallback
    probeEl.style.color = `var(${varName})`
    const computed = getComputedStyle(probeEl).color
    probeCtx.clearRect(0, 0, 1, 1)
    probeCtx.fillStyle = `rgb(${fallback.join(',')})`
    probeCtx.fillStyle = computed
    probeCtx.fillRect(0, 0, 1, 1)
    const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data
    return [r ?? fallback[0], g ?? fallback[1], b ?? fallback[2]]
  } catch {
    return fallback
  }
}

function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function rgba([r, g, b]: Rgb, a: number): string {
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`
}

export class RhythmScene {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private kind: SceneKind = 'orbs'
  private palette: Rgb[] = [
    [232, 160, 84],
    [74, 52, 32],
    [44, 61, 69],
  ]
  private frame: RhythmFrame = { bass: 0, mid: 0, high: 0, level: 0, beat: false, pulse: 0 }
  private particles: Particle[] = []
  private active = false
  private raf = 0
  private t = 0
  private lastTs = 0
  private speed = 1
  private w = 0
  private h = 0
  private dpr = 1
  private opacity = 0
  private lightBackground = true

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    // Kanvas mengikuti ukuran wadahnya (kartu "Sedang diputar"), bukan jendela.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.resize()).observe(canvas)
    } else {
      window.addEventListener('resize', () => this.resize())
    }
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => this.readPalette())
  }

  getKind(): SceneKind {
    return this.kind
  }

  setTheme(themeId: ThemeId): void {
    const next = sceneForTheme(themeId)
    if (next !== this.kind) {
      this.kind = next
      this.particles = []
    }
    this.readPalette()
  }

  /** Tempo mengatur kecepatan gerak dasar; null → netral 120 BPM. */
  setTempo(bpm: number | null): void {
    const tempo = bpm ?? 120
    this.speed = Math.max(0.55, Math.min(1.6, tempo / 120))
  }

  update(frame: RhythmFrame): void {
    this.frame = frame
  }

  setActive(on: boolean): void {
    if (on === this.active) return
    this.active = on
    if (on && !this.raf) {
      this.lastTs = performance.now()
      this.raf = requestAnimationFrame((ts) => this.loop(ts))
    }
  }

  private readPalette(): void {
    this.palette = [
      resolveCssColor('--accent', this.palette[0]!),
      resolveCssColor('--bg-glow-b', this.palette[1]!),
      resolveCssColor('--accent-soft', this.palette[2]!),
    ]
    // Latar terang: warna "menyerap" seperti tinta di kertas (multiply).
    // Latar gelap: warna "bercahaya" (lighter).
    this.lightBackground = luminance(resolveCssColor('--bg', [247, 243, 236])) > 0.5
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    this.w = this.canvas.clientWidth || window.innerWidth
    this.h = this.canvas.clientHeight || window.innerHeight
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  private loop(ts: number): void {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000)
    this.lastTs = ts
    this.t += dt * this.speed

    // Fade in/out halus saat mulai/berhenti.
    const target = this.active ? 1 : 0
    this.opacity += (target - this.opacity) * Math.min(1, dt * 3)

    const { ctx } = this
    ctx.clearRect(0, 0, this.w, this.h)
    if (this.opacity > 0.01) {
      ctx.save()
      ctx.globalAlpha = this.opacity * (this.lightBackground ? 0.7 : 0.85)
      ctx.globalCompositeOperation = this.lightBackground ? 'multiply' : 'lighter'
      this.draw(dt)
      ctx.restore()
    }

    if (!this.active && this.opacity <= 0.01) {
      this.raf = 0
      this.particles = []
      ctx.clearRect(0, 0, this.w, this.h)
      return
    }
    this.raf = requestAnimationFrame((next) => this.loop(next))
  }

  private draw(dt: number): void {
    switch (this.kind) {
      case 'grid':
        return this.drawGrid()
      case 'sparks':
        return this.drawSparks(dt)
      case 'bubbles':
        return this.drawBubbles(dt)
      case 'smoke':
        return this.drawSmoke()
      case 'ribbons':
        return this.drawRibbons()
      case 'fireflies':
        return this.drawFireflies(dt)
      case 'rings':
        return this.drawRings(dt)
      default:
        return this.drawOrbs()
    }
  }

  private color(i: number): Rgb {
    return this.palette[i % this.palette.length]!
  }

  private glow(x: number, y: number, r: number, color: Rgb, alpha: number): void {
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, rgba(color, alpha))
    g.addColorStop(1, rgba(color, 0))
    this.ctx.fillStyle = g
    this.ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  private spawn(p: Partial<Particle> & Pick<Particle, 'x' | 'y'>): void {
    if (this.particles.length >= MAX_PARTICLES) return
    const maxLife = p.maxLife ?? 2
    this.particles.push({
      vx: 0,
      vy: 0,
      r: 2,
      color: 0,
      seed: Math.random() * 1000,
      life: maxLife,
      ...p,
      maxLife,
    })
  }

  private stepParticles(dt: number, gravity = 0): void {
    for (const p of this.particles) {
      p.vy += gravity * dt
      p.x += p.vx * dt * this.speed
      p.y += p.vy * dt * this.speed
      p.life -= dt
    }
    this.particles = this.particles.filter(
      (p) => p.life > 0 && p.y > -80 && p.y < this.h + 80 && p.x > -80 && p.x < this.w + 80,
    )
  }

  private drawOrbs(): void {
    const { w, h, t, frame } = this
    for (let i = 0; i < 5; i++) {
      const x = w * (0.5 + 0.38 * Math.sin(t * 0.21 + i * 1.7))
      const y = h * (0.45 + 0.32 * Math.cos(t * 0.17 + i * 2.3))
      const r = Math.min(w, h) * (0.22 + i * 0.03) * (1 + frame.pulse * 0.12 + frame.level * 0.35)
      this.glow(x, y, r, this.color(i), 0.1 + frame.level * 0.22)
    }
  }

  private drawGrid(): void {
    const { ctx, w, h, t, frame } = this
    const horizon = h * 0.6
    const cx = w / 2

    this.glow(cx, horizon, Math.min(w, h) * (0.28 + frame.bass * 0.25), this.color(0), 0.18 + frame.pulse * 0.25)

    ctx.lineWidth = 1 + frame.pulse * 1.5
    ctx.strokeStyle = rgba(this.color(0), 0.16 + frame.pulse * 0.45 + frame.level * 0.2)
    ctx.beginPath()
    for (let i = -14; i <= 14; i++) {
      ctx.moveTo(cx + i * 18, horizon)
      ctx.lineTo(cx + i * w * 0.14, h)
    }
    const offset = (t * 0.9) % 1
    for (let i = 0; i < 14; i++) {
      const z = (i + offset) / 14
      const y = horizon + (h - horizon) * z * z
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
  }

  private drawSparks(dt: number): void {
    const { ctx, w, h, frame } = this
    const burst = frame.beat ? 18 + Math.round(frame.bass * 20) : 0
    const ambient = Math.random() < frame.level * 1.4 ? 1 : 0
    for (let i = 0; i < burst + ambient; i++) {
      this.spawn({
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 120,
        vy: -(260 + Math.random() * 420) * (0.7 + frame.bass),
        r: 1 + Math.random() * 2,
        maxLife: 1.2 + Math.random() * 1.2,
        color: Math.random() < 0.8 ? 0 : 1,
      })
    }
    this.stepParticles(dt, 260)

    this.glow(w / 2, h * 1.05, w * 0.6, this.color(0), 0.06 + frame.bass * 0.25 + frame.pulse * 0.1)
    ctx.lineCap = 'round'
    for (const p of this.particles) {
      const a = p.life / p.maxLife
      ctx.strokeStyle = rgba(this.color(p.color), a * 0.9)
      ctx.lineWidth = p.r
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
      ctx.stroke()
    }
  }

  private drawBubbles(dt: number): void {
    const { ctx, w, h, t, frame } = this
    const count = (frame.beat ? 8 : 0) + (Math.random() < 0.25 + frame.level ? 1 : 0)
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: Math.random() * w,
        y: h + 20,
        vy: -(40 + Math.random() * 90),
        r: 4 + Math.random() * 16,
        maxLife: 14,
        color: Math.floor(Math.random() * 3),
      })
    }
    for (const p of this.particles) p.vx = Math.sin(t * 1.3 + p.seed) * 30
    this.stepParticles(dt)

    ctx.lineWidth = 1.5
    for (const p of this.particles) {
      const r = p.r * (1 + frame.pulse * 0.35)
      const c = this.color(p.color)
      ctx.fillStyle = rgba(c, 0.08 + frame.level * 0.1)
      ctx.strokeStyle = rgba(c, 0.35 + frame.pulse * 0.4)
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  private drawSmoke(): void {
    const { w, h, t, frame } = this
    for (let i = 0; i < 7; i++) {
      const drift = (t * 0.035 * (1 + i * 0.15) + i / 7) % 1
      const x = w * (0.15 + 0.7 * ((Math.sin(i * 12.9) + 1) / 2)) + Math.sin(t * 0.3 + i) * w * 0.08
      const y = h * (1.15 - drift * 1.4)
      const r = Math.min(w, h) * (0.25 + 0.1 * Math.sin(i)) * (1 + frame.mid * 0.5 + frame.pulse * 0.08)
      this.glow(x, y, r, this.color(i % 3), 0.06 + frame.mid * 0.18)
    }
  }

  private drawRibbons(): void {
    const { ctx, w, h, t, frame } = this
    for (let k = 0; k < 3; k++) {
      const base = h * (0.35 + k * 0.18)
      const amp = h * 0.05 * (0.4 + frame.mid * 2.2)
      ctx.strokeStyle = rgba(this.color(k), 0.22 + frame.level * 0.35)
      ctx.lineWidth = 1.5 + frame.pulse * 2 + k * 0.5
      ctx.beginPath()
      for (let x = 0; x <= w; x += 12) {
        const y =
          base +
          Math.sin(x * 0.006 + t * (0.9 + k * 0.25) + k * 2) * amp +
          Math.sin(x * 0.013 - t * 0.6) * amp * 0.35
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  private drawFireflies(dt: number): void {
    const { w, h, t, frame } = this
    while (this.particles.length < 46) {
      this.spawn({
        x: Math.random() * w,
        y: h * (0.25 + Math.random() * 0.75),
        r: 1.5 + Math.random() * 2.5,
        maxLife: Infinity,
        color: Math.random() < 0.7 ? 0 : 2,
      })
    }
    for (const p of this.particles) {
      p.x = (p.x + Math.sin(t * 0.7 + p.seed) * 22 * dt + w) % w
      p.y = (p.y + Math.cos(t * 0.5 + p.seed * 1.3) * 16 * dt + h) % h
      if (frame.beat && Math.random() < 0.35) p.flash = 1
      p.flash = Math.max(0, (p.flash ?? 0) - dt * 1.5)
      const twinkle = 0.35 + 0.35 * Math.sin(t * 3 + p.seed) + p.flash * 0.6 + frame.high * 0.4
      this.glow(p.x, p.y, p.r * (5 + p.flash * 6), this.color(p.color), twinkle * 0.5)
    }
  }

  private drawRings(dt: number): void {
    const { ctx, w, h, frame } = this
    const cx = w / 2
    const cy = h * 0.92
    if (frame.beat) {
      this.spawn({ x: cx, y: cy, r: 20, vx: 0, vy: 0, maxLife: 2.2, color: 0 })
    }
    for (const p of this.particles) {
      p.r += dt * (220 + frame.bass * 380) * this.speed
      p.life -= dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)

    this.glow(cx, cy, Math.min(w, h) * (0.2 + frame.bass * 0.3), this.color(0), 0.12 + frame.pulse * 0.3)
    for (const p of this.particles) {
      const a = p.life / p.maxLife
      ctx.strokeStyle = rgba(this.color(p.color), a * 0.55)
      ctx.lineWidth = 2 + a * 4
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

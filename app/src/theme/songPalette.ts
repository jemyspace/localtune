import type { AudioFeatures, AudioMood } from '../audio/types'

/**
 * Warna identitas per lagu. Diambil dari sampul album (lokal, lewat canvas);
 * tanpa sampul, diturunkan dari suasana & energi hasil analisis audio.
 * Hasilnya dipasang sebagai --accent-base / --tint sehingga seluruh UI
 * (terang maupun gelap) ikut berubah per lagu, bukan per genre.
 */
export interface SongPalette {
  accentBase: string
  tint: string
  source: 'cover' | 'mood'
}

type Rgb = [number, number, number]

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** sRGB → OKLCH (L 0–1, C, h derajat). */
function rgbToOklch([r8, g8, b8]: Rgb): { l: number; c: number; h: number } {
  const r = srgbToLinear(r8)
  const g = srgbToLinear(g8)
  const b = srgbToLinear(b8)
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.sqrt(A * A + B * B)
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c, h }
}

/**
 * Accent dengan lightness tetap (0.52) agar teks putih di atasnya tetap
 * terbaca; chroma dibatasi supaya tidak "neon".
 */
function paletteFromHue(h: number, chroma: number, source: SongPalette['source']): SongPalette {
  const c = Math.max(0.02, Math.min(0.15, chroma))
  const hue = h.toFixed(1)
  return {
    accentBase: `oklch(0.52 ${c.toFixed(3)} ${hue})`,
    tint: `oklch(0.92 ${Math.min(0.045, c * 0.4).toFixed(3)} ${hue})`,
    source,
  }
}

function hashText(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('cover load failed'))
    img.src = url
  })
}

/**
 * Warna paling "berkarakter" di sampul: piksel dikelompokkan per rentang hue,
 * dibobot chroma (piksel abu-abu/hitam/putih hampir tak berbobot).
 */
export async function paletteFromCover(coverUrl: string): Promise<SongPalette | null> {
  try {
    const img = await loadImage(coverUrl)
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const px = ctx.getImageData(0, 0, size, size).data

    const BUCKETS = 18
    const weight = new Array<number>(BUCKETS).fill(0)
    const sumX = new Array<number>(BUCKETS).fill(0)
    const sumY = new Array<number>(BUCKETS).fill(0)
    const sumC = new Array<number>(BUCKETS).fill(0)
    let totalChroma = 0
    let count = 0

    for (let i = 0; i < px.length; i += 4) {
      if ((px[i + 3] ?? 0) < 128) continue
      const { l, c, h } = rgbToOklch([px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0])
      totalChroma += c
      count++
      if (l < 0.18 || l > 0.97) continue
      const w = c * c
      const b = Math.floor(h / (360 / BUCKETS)) % BUCKETS
      const rad = (h * Math.PI) / 180
      weight[b]! += w
      sumX[b]! += Math.cos(rad) * w
      sumY[b]! += Math.sin(rad) * w
      sumC[b]! += c * w
    }

    let best = -1
    let bestW = 0
    for (let b = 0; b < BUCKETS; b++) {
      if ((weight[b] ?? 0) > bestW) {
        bestW = weight[b] ?? 0
        best = b
      }
    }

    const avgChroma = count > 0 ? totalChroma / count : 0
    if (best < 0 || bestW <= 0) {
      // Sampul hitam-putih: aksen grafit netral.
      return paletteFromHue(60, 0.02, 'cover')
    }
    const hue = ((Math.atan2(sumY[best]!, sumX[best]!) * 180) / Math.PI + 360) % 360
    const chroma = (sumC[best]! / bestW) * 0.85 + avgChroma * 0.15
    return paletteFromHue(hue, chroma, 'cover')
  } catch {
    return null
  }
}

/** Rentang hue per suasana: hangat untuk energik, sejuk untuk tenang, dst. */
const MOOD_HUES: Record<AudioMood, [number, number]> = {
  energetic: [0, 55],
  calm: [190, 270],
  bright: [310, 390],
  warm: [35, 90],
  balanced: [120, 195],
}

export function paletteFromFeatures(features: AudioFeatures, seedText: string): SongPalette {
  const [from, to] = MOOD_HUES[features.mood]
  // Variasi kecil per judul: dua lagu dengan suasana sama tetap punya warna sendiri.
  const jitter = (hashText(seedText) % 1000) / 1000
  const hue = (from + (to - from) * jitter) % 360
  const chroma = 0.07 + Math.min(1, features.energy * 4) * 0.07
  return paletteFromHue(hue, chroma, 'mood')
}

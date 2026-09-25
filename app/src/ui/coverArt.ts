import { normalizeLabel } from '../trackKey'

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function initials(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase())
  return letters.join('') || '♪'
}

function escapeAttr(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

/**
 * Sampul lagu: gambar album dari tag ID3 bila ada, jika tidak gradasi unik
 * yang dibuat dari nama artis/judul (tanpa mengambil gambar dari internet).
 */
export function coverArtHtml(
  artist: string,
  title: string | undefined,
  coverUrl?: string,
  className = 'cover',
): string {
  if (coverUrl) {
    return `<span class="${className} has-img"><img src="${escapeAttr(coverUrl)}" alt="" loading="lazy" /></span>`
  }
  const known = normalizeLabel(artist) !== 'unknown' ? artist : ''
  const seed = known || title || '?'
  const h = hash(normalizeLabel(seed))
  const hue = h % 360
  const hue2 = (hue + 40 + ((h >> 9) % 80)) % 360
  const angle = (h >> 3) % 360
  const style = `--c1:hsl(${hue} 38% 52%);--c2:hsl(${hue2} 32% 34%);--ang:${angle}deg`
  return `<span class="${className} gen" style="${style}" aria-hidden="true">${initials(seed)}</span>`
}

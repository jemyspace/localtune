export const COLD_START_N = 5

export const RECENT_PLAY_MS = 10 * 60 * 1000

export interface TasteProfile {
  coldStart: boolean
  meaningfulPlayCount: number
  topArtists: { name: string; score: number }[]
  topGenres: { name: string; score: number }[]
  updatedAt: number
  reason?: string
}

export interface UpNextItem {
  trackId: string
  index: number
  title: string
  artist: string
  score: number
  /** Alasan singkat yang ditampilkan sebagai chip, mis. "Suasana Energik". */
  reasons: string[]
  /** Kecocokan nuansa dengan lagu sekarang (0–100), jika analisis audio tersedia. */
  match?: number
}

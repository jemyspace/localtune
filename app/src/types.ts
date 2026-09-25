export interface Track {
  id: string
  fileName: string
  objectUrl: string
  title: string
  artist: string
  album?: string
  genre?: string
  durationSec?: number
  /** Blob URL gambar album dari tag ID3 — tetap lokal, tidak diunggah. */
  coverUrl?: string
  error?: string
  file: File
}

export interface PlayerListeners {
  onTrackSelected?: (trackId: string) => void
  onPlayStart?: (trackId: string) => void
  onPause?: (trackId: string, positionSec: number) => void
  onSeek?: (trackId: string, fromSec: number, toSec: number) => void
  onEnded?: (trackId: string) => void
  onSkipToOther?: (trackId: string, positionSec: number, nextTrackId: string) => void
}

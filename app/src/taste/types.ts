export interface TrackStats {
  trackKey: string
  title: string
  artist: string
  genre: string
  playCount: number
  completionCount: number
  earlySkipCount: number
  totalHeardSec: number
  lastPlayedAt: number
}

export interface ArtistStats {
  artistKey: string
  playCount: number
  completionCount: number
  totalHeardSec: number
  lastPlayedAt: number
}

export interface GenreStats {
  genreKey: string
  playCount: number
  completionCount: number
  totalHeardSec: number
  lastPlayedAt: number
}

export interface TasteMeta {
  schemaVersion: 1
  meaningfulPlayCount: number
  updatedAt: number
}

export interface TasteBlob {
  meta: TasteMeta
  tracks: Record<string, TrackStats>
  artists: Record<string, ArtistStats>
  genres: Record<string, GenreStats>
}

export interface FinalizedAttempt {
  trackKey: string
  title: string
  artist: string
  genre: string
  heardSec: number
  durationSec?: number
  completed: boolean
  earlySkipped: boolean
  meaningfulPlay: boolean
}

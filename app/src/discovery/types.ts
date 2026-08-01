export type ResearchStatus = 'idle' | 'updating' | 'error'

export interface ResearchSeed {
  artist: string
  title: string
  genre?: string
  topArtists: string[]
  topGenres: string[]
}

export interface RawDiscovery {
  artist: string
  title?: string
  genre?: string
  sourceUrl?: string
  reason?: string
  source?: 'musicbrainz' | 'acoustid'
}

export interface DiscoveryItem {
  id: string
  artist: string
  title?: string
  genre?: string
  source: 'musicbrainz' | 'acoustid'
  sourceUrl?: string
  reason?: string
  updatedAt: number
  inLocalLibrary: boolean
}

export interface DiscoveryBlob {
  schemaVersion: 1
  items: DiscoveryItem[]
  updatedAt: number
}

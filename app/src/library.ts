import { makeTrackId } from './filePicker'
import { readTags, titleFromFileName } from './metadata'
import type { Track } from './types'

export class Library {
  private tracks: Track[] = []
  onTrackEnriched?: (track: Track) => void

  getAll(): Track[] {
    return this.tracks
  }

  getById(id: string): Track | undefined {
    return this.tracks.find((t) => t.id === id)
  }

  clear(): void {
    for (const t of this.tracks) {
      URL.revokeObjectURL(t.objectUrl)
      if (t.coverUrl) URL.revokeObjectURL(t.coverUrl)
    }
    this.tracks = []
  }

  async addFiles(files: File[]): Promise<Track[]> {
    const added: Track[] = []
    for (const file of files) {
      const id = makeTrackId(file)
      if (this.tracks.some((t) => t.id === id)) continue
      const track: Track = {
        id,
        fileName: file.name,
        objectUrl: URL.createObjectURL(file),
        title: titleFromFileName(file.name),
        artist: 'Unknown',
        genre: 'Unknown',
        file,
      }
      this.tracks.push(track)
      added.push(track)
      void this.enrich(track)
    }
    return added
  }

  updateTrack(id: string, patch: Partial<Track>): Track | undefined {
    const t = this.getById(id)
    if (!t) return undefined
    Object.assign(t, patch)
    return t
  }

  private async enrich(track: Track): Promise<void> {
    const tags = await readTags(track.file)
    this.updateTrack(track.id, {
      title: tags.title || track.title,
      artist: tags.artist || 'Unknown',
      album: tags.album,
      genre: tags.genre || 'Unknown',
      coverUrl: tags.coverUrl,
    })
    const updated = this.getById(track.id)
    if (updated) this.onTrackEnriched?.(updated)
  }
}

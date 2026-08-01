import { normalizeLabel } from '../trackKey'
import type { Library } from '../library'
import { matchesLocalLibrary, refreshLocalMatches } from './localMatch'
import type { DiscoveryBlob, DiscoveryItem, RawDiscovery } from './types'

const STORAGE_KEY = 'localtune:discovery:v1'
const MAX_ITEMS = 50

type Listener = () => void

function emptyBlob(): DiscoveryBlob {
  return { schemaVersion: 1, items: [], updatedAt: Date.now() }
}

function itemId(source: string, artist: string, title: string | undefined): string {
  return `${source}:${normalizeLabel(artist)}:${normalizeLabel(title ?? '')}`
}

export class DiscoveryStore {
  private blob: DiscoveryBlob
  private persistEnabled = true
  private readonly listeners = new Set<Listener>()

  constructor() {
    this.blob = this.load()
  }

  getItems(): DiscoveryItem[] {
    return this.blob.items.map((i) => ({ ...i }))
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify(): void {
    for (const l of this.listeners) l()
  }

  mergeRaw(raw: RawDiscovery[], library: Library): void {
    const now = Date.now()
    const byId = new Map(this.blob.items.map((i) => [i.id, i]))

    for (const r of raw) {
      const artist = r.artist.trim() || 'Unknown'
      const title = r.title?.trim()
      const source = r.source ?? 'musicbrainz'
      const id = itemId(source, artist, title)
      const existing = byId.get(id)
      const item: DiscoveryItem = {
        id,
        artist,
        title,
        genre: r.genre,
        source,
        sourceUrl: r.sourceUrl,
        reason: r.reason ?? 'Ditemukan via MusicBrainz',
        updatedAt: now,
        inLocalLibrary: matchesLocalLibrary(library, artist, title),
      }
      if (existing) {
        existing.updatedAt = now
        existing.genre = item.genre ?? existing.genre
        existing.sourceUrl = item.sourceUrl ?? existing.sourceUrl
        existing.reason = item.reason
        existing.inLocalLibrary = item.inLocalLibrary
      } else {
        byId.set(id, item)
      }
    }

    let items = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    if (items.length > MAX_ITEMS) {
      items = items.slice(0, MAX_ITEMS)
    }

    this.blob = { schemaVersion: 1, items, updatedAt: now }
    this.save()
  }

  refreshLocalMatches(library: Library): void {
    refreshLocalMatches(library, this.blob.items)
    this.blob.updatedAt = Date.now()
    this.save()
  }

  private load(): DiscoveryBlob {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return emptyBlob()
      const parsed = JSON.parse(raw) as DiscoveryBlob
      if (parsed.schemaVersion !== 1) return emptyBlob()
      return {
        schemaVersion: 1,
        items: parsed.items ?? [],
        updatedAt: parsed.updatedAt ?? Date.now(),
      }
    } catch {
      return emptyBlob()
    }
  }

  private save(): void {
    if (!this.persistEnabled) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.blob))
    } catch {
      this.persistEnabled = false
    }
  }
}

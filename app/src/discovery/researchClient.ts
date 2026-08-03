import { seedCacheKey } from './seed'
import type { RawDiscovery, ResearchSeed } from './types'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface CacheEntry {
  at: number
  data: RawDiscovery[]
}

export class ResearchClient {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<RawDiscovery[]>>()

  async fetch(seed: ResearchSeed, bypassCache = false): Promise<RawDiscovery[]> {
    const key = seedCacheKey(seed)

    if (!bypassCache) {
      const hit = this.cache.get(key)
      if (hit && hit.data.length > 0 && Date.now() - hit.at < CACHE_TTL_MS) {
        return hit.data
      }
    }

    const pending = this.inflight.get(key)
    if (pending && !bypassCache) return pending

    // If bypassing while a request is in flight, wait for it first — then refetch only if empty.
    if (pending && bypassCache) {
      const waited = await pending
      if (waited.length > 0) {
        this.cache.set(key, { at: Date.now(), data: waited })
        return waited
      }
    }

    const promise = this.doFetch(seed)
      .then((data) => {
        if (data.length > 0) {
          this.cache.set(key, { at: Date.now(), data })
        } else {
          this.cache.delete(key)
        }
        return data
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) {
          this.inflight.delete(key)
        }
      })

    this.inflight.set(key, promise)
    return promise
  }

  private async doFetch(seed: ResearchSeed): Promise<RawDiscovery[]> {
    const params = new URLSearchParams({
      artist: seed.artist,
      title: seed.title,
      topArtists: seed.topArtists.join(','),
      topGenres: seed.topGenres.join(','),
    })
    const url = new URL('/api/research', window.location.origin)
    url.search = params.toString()
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Research failed (${res.status})`)
    }
    const body = (await res.json()) as { items?: RawDiscovery[] }
    return Array.isArray(body.items) ? body.items : []
  }
}

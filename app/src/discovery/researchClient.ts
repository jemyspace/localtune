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
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return hit.data
      }
      const pending = this.inflight.get(key)
      if (pending) return pending
    }

    const promise = this.doFetch(seed)
      .then((data) => {
        this.cache.set(key, { at: Date.now(), data })
        return data
      })
      .finally(() => {
        this.inflight.delete(key)
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
    return body.items ?? []
  }
}

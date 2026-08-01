import { ChromaprintAlgorithm, processAudioFile } from '@unimusic/chromaprint'
import { lookupAcoustid } from './acoustidClient'
import type { RawDiscovery } from '../discovery/types'
import type { Track } from '../types'

const inflight = new Map<string, Promise<RawDiscovery[]>>()
const cache = new Map<string, RawDiscovery[]>()

export async function fingerprintAndLookup(track: Track): Promise<RawDiscovery[]> {
  const cacheKey = track.id
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const pending = inflight.get(cacheKey)
  if (pending) return pending

  const promise = run(track)
    .then((items) => {
      cache.set(cacheKey, items)
      return items
    })
    .finally(() => {
      inflight.delete(cacheKey)
    })

  inflight.set(cacheKey, promise)
  return promise
}

async function run(track: Track): Promise<RawDiscovery[]> {
  const arrayBuffer = await track.file.arrayBuffer()
  let fingerprint = ''
  for await (const fp of processAudioFile(arrayBuffer, {
    maxDuration: 120,
    chunkDuration: 0,
    algorithm: ChromaprintAlgorithm.Default,
    rawOutput: false,
    overlap: false,
  })) {
    fingerprint = fp
    break
  }
  if (!fingerprint) return []

  const duration = await readDuration(track)
  if (duration <= 0) return []

  return lookupAcoustid(fingerprint, duration)
}

async function readDuration(track: Track): Promise<number> {
  if (track.durationSec && Number.isFinite(track.durationSec)) return track.durationSec
  const ctx = new AudioContext()
  try {
    const buf = await ctx.decodeAudioData((await track.file.arrayBuffer()).slice(0))
    return buf.duration
  } catch {
    return 0
  } finally {
    await ctx.close()
  }
}

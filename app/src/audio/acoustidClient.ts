import type { RawDiscovery } from '../discovery/types'

export async function lookupAcoustid(
  fingerprint: string,
  duration: number,
): Promise<RawDiscovery[]> {
  const url = new URL('/api/acoustid', window.location.origin)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint, duration: Math.round(duration) }),
  })
  if (!res.ok) throw new Error(`AcoustID failed (${res.status})`)
  const body = (await res.json()) as { items?: RawDiscovery[] }
  return body.items ?? []
}

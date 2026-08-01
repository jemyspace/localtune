/**
 * @param {{ fingerprint: string, duration: number }} body
 */
export async function lookupAcoustid(body) {
  const key = process.env.ACOUSTID_API_KEY
  if (!key) {
    return { items: [], error: 'no_api_key' }
  }

  const form = new URLSearchParams({
    client: key,
    duration: String(body.duration),
    fingerprint: body.fingerprint,
    meta: 'recordings+releasegroups+compress',
    format: 'json',
  })

  const res = await fetch('https://api.acoustid.org/v2/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })

  if (!res.ok) {
    throw new Error(`AcoustID ${res.status}`)
  }

  const data = await res.json()
  const items = []
  const seen = new Set()

  for (const result of data.results ?? []) {
    for (const rec of result.recordings ?? []) {
      const title = rec.title
      const artist = rec.artists?.[0]?.name ?? 'Unknown'
      const id = `${artist}|${title}`.toLowerCase()
      if (!title || seen.has(id)) continue
      seen.add(id)
      items.push({
        artist,
        title,
        sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
        reason: 'Diidentifikasi dari sidik jari audio (AcoustID)',
      })
    }
  }

  return { items: items.slice(0, 12) }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleAcoustidRequest(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'method_not_allowed' }))
    return
  }

  let body = ''
  for await (const chunk of req) {
    body += chunk
  }
  const parsed = JSON.parse(body || '{}')
  const result = await lookupAcoustid(parsed)
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 200
  res.end(JSON.stringify(result))
}

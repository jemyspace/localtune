const USER_AGENT = 'LocalTune/0.1 (local-music-player; contact: local@example.com)'
const MB_BASE = 'https://musicbrainz.org/ws/2'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function escLucene(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * @param {string} path
 */
async function mbGet(path) {
  const res = await fetch(`${MB_BASE}/${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  })
  if (!res.ok) {
    throw new Error(`MusicBrainz ${res.status}`)
  }
  return res.json()
}

/**
 * @param {{ artist: string, title: string, topArtists?: string[], topGenres?: string[] }} seed
 * @returns {Promise<Array<{ artist: string, title?: string, genre?: string, sourceUrl?: string, reason?: string }>>}
 */
export async function fetchMusicBrainzDiscoveries(seed) {
  const artist = String(seed.artist ?? '').trim()
  const title = String(seed.title ?? '').trim()
  const items = []
  const seen = new Set()

  const add = (entry) => {
    const key = `${norm(entry.artist)}|${norm(entry.title ?? '')}`
    if (!entry.artist || seen.has(key)) return
    if (norm(entry.artist) === norm(artist) && norm(entry.title ?? '') === norm(title)) return
    seen.add(key)
    items.push(entry)
  }

  if (!artist || norm(artist) === 'unknown') {
    if (!title) return []
    const q = `recording:"${escLucene(title)}"`
    const data = await mbGet(`recording?query=${encodeURIComponent(q)}&limit=8&fmt=json`)
    for (const rec of data.recordings ?? []) {
      const recArtist =
        rec['artist-credit']?.[0]?.name ?? rec['artist-credit']?.[0]?.artist?.name ?? 'Unknown'
      add({
        artist: recArtist,
        title: rec.title,
        sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
        reason: 'Judul mirip di MusicBrainz',
      })
    }
    return items.slice(0, 12)
  }

  const recordingQuery = title
    ? `artist:"${escLucene(artist)}" AND recording:"${escLucene(title)}"`
    : `artist:"${escLucene(artist)}"`
  const recordingData = await mbGet(
    `recording?query=${encodeURIComponent(recordingQuery)}&limit=10&fmt=json`,
  )
  for (const rec of recordingData.recordings ?? []) {
    const recArtist =
      rec['artist-credit']?.[0]?.name ?? rec['artist-credit']?.[0]?.artist?.name ?? artist
    const tags = (rec.tags ?? []).slice(0, 2).map((t) => t.name).join(', ')
    add({
      artist: recArtist,
      title: rec.title,
      genre: tags || undefined,
      sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
      reason: 'Rekaman terkait di MusicBrainz',
    })
  }

  await sleep(1100)

  const artistData = await mbGet(
    `artist?query=${encodeURIComponent(`artist:"${escLucene(artist)}"`)}&limit=1&fmt=json`,
  )
  const mbArtist = artistData.artists?.[0]
  if (mbArtist?.id) {
    const genreHint = (mbArtist.tags ?? []).slice(0, 2).map((t) => t.name).join(', ')
    await sleep(1100)
    const byArtist = await mbGet(`recording?artist=${mbArtist.id}&limit=12&fmt=json`)
    for (const rec of byArtist.recordings ?? []) {
      add({
        artist: mbArtist.name ?? artist,
        title: rec.title,
        genre: genreHint || undefined,
        sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
        reason: `Lainnya dari artis ${mbArtist.name ?? artist}`,
      })
    }
  }

  for (const related of (seed.topArtists ?? []).slice(0, 2)) {
    if (!related || norm(related) === norm(artist) || norm(related) === 'unknown') continue
    await sleep(1100)
    try {
      const relData = await mbGet(
        `recording?query=${encodeURIComponent(`artist:"${escLucene(related)}"`)}&limit=5&fmt=json`,
      )
      for (const rec of relData.recordings ?? []) {
        const recArtist =
          rec['artist-credit']?.[0]?.name ?? rec['artist-credit']?.[0]?.artist?.name ?? related
        add({
          artist: recArtist,
          title: rec.title,
          sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
          reason: `Selera Anda: artis ${related}`,
        })
      }
    } catch {
      /* soft-fail per related artist */
    }
  }

  return items.slice(0, 15)
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleResearchRequest(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const artist = url.searchParams.get('artist') ?? ''
  const title = url.searchParams.get('title') ?? ''
  const topArtists = (url.searchParams.get('topArtists') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const topGenres = (url.searchParams.get('topGenres') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const items = await fetchMusicBrainzDiscoveries({ artist, title, topArtists, topGenres })
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.statusCode = 200
  res.end(JSON.stringify({ items }))
}

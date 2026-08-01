const USER_AGENT = 'LocalTune/0.1 (https://github.com/jemyspace/localtune; contact: jemyspace@users.noreply.github.com)'
const MB_BASE = 'https://musicbrainz.org/ws/2'
const RATE_LIMIT_MS = 1100

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

function recordingArtist(rec, fallback) {
  return rec['artist-credit']?.[0]?.name ?? rec['artist-credit']?.[0]?.artist?.name ?? fallback
}

/**
 * Fast path for serverless (Netlify ~26s limit): max 2 MusicBrainz calls.
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

  try {
    if (!artist || norm(artist) === 'unknown') {
      if (!title) return []
      const data = await mbGet(`recording?query=${encodeURIComponent(`recording:"${escLucene(title)}"`)}&limit=10&fmt=json`)
      for (const rec of data.recordings ?? []) {
        add({
          artist: recordingArtist(rec, 'Unknown'),
          title: rec.title,
          sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
          reason: 'Judul mirip di MusicBrainz',
        })
      }
      return items.slice(0, 12)
    }

    const artistData = await mbGet(
      `artist?query=${encodeURIComponent(`artist:"${escLucene(artist)}"`)}&limit=1&fmt=json`,
    )
    const mbArtist = artistData.artists?.[0]
    if (!mbArtist?.id) return []

    const genreHint = (mbArtist.tags ?? []).slice(0, 2).map((t) => t.name).join(', ')
    await sleep(RATE_LIMIT_MS)

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
  } catch (err) {
    console.error('MusicBrainz research error:', err)
    if (items.length === 0) throw err
  }

  return items.slice(0, 15)
}

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

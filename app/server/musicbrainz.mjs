const USER_AGENT = 'LocalTune/0.1 (https://github.com/jemyspace/localtune; contact: jemyspace@users.noreply.github.com)'
const MB_BASE = 'https://musicbrainz.org/ws/2'
const RATE_LIMIT_MS = 1100
const MAX_API_CALLS = 2

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
  const topArtists = (seed.topArtists ?? [])
    .map((s) => String(s).trim())
    .filter((s) => s && norm(s) !== 'unknown')
  const items = []
  const seen = new Set()
  let apiCalls = 0

  const add = (entry) => {
    const key = `${norm(entry.artist)}|${norm(entry.title ?? '')}`
    if (!entry.artist || seen.has(key)) return
    if (norm(entry.artist) === norm(artist) && norm(entry.title ?? '') === norm(title)) return
    seen.add(key)
    items.push(entry)
  }

  const addRecordings = (recordings, fallbackArtist, reason, genre) => {
    for (const rec of recordings) {
      add({
        artist: recordingArtist(rec, fallbackArtist),
        title: rec.title,
        genre,
        sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
        reason,
      })
    }
  }

  const nextCall = async (path) => {
    if (apiCalls >= MAX_API_CALLS) return null
    if (apiCalls > 0) await sleep(RATE_LIMIT_MS)
    apiCalls += 1
    return mbGet(path)
  }

  const searchRecordings = async (query, limit = 10) => {
    const data = await nextCall(`recording?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`)
    return data?.recordings ?? []
  }

  const browseArtist = async (mbid, label, genreHint, reason) => {
    const data = await nextCall(`recording?artist=${mbid}&limit=12&fmt=json`)
    addRecordings(data?.recordings ?? [], label, reason, genreHint || undefined)
  }

  const lookupArtist = async (name) => {
    const data = await nextCall(
      `artist?query=${encodeURIComponent(`artist:"${escLucene(name)}"`)}&limit=1&fmt=json`,
    )
    return data?.artists?.[0] ?? null
  }

  try {
    const hasArtist = Boolean(artist) && norm(artist) !== 'unknown'
    const hasTitle = Boolean(title)

    // 1) Most relevant: search by artist + title from the currently playing track.
    if (hasArtist && hasTitle) {
      const recs = await searchRecordings(
        `recording:"${escLucene(title)}" AND artist:"${escLucene(artist)}"`,
        8,
      )
      addRecordings(recs, artist, 'Terhubung dengan lagu yang sedang diputar')
      const mbid = recs[0]?.['artist-credit']?.[0]?.artist?.id
      if (mbid && items.length < 8) {
        await browseArtist(mbid, recordingArtist(recs[0], artist), undefined, `Lainnya dari artis ${artist}`)
      }
      if (items.length > 0) return items.slice(0, 15)
    }

    // 2) Artist lookup + browse other recordings by that artist.
    if (hasArtist) {
      const mbArtist = await lookupArtist(artist)
      if (mbArtist?.id) {
        const genreHint = (mbArtist.tags ?? []).slice(0, 2).map((t) => t.name).join(', ')
        await browseArtist(
          mbArtist.id,
          mbArtist.name ?? artist,
          genreHint,
          `Lainnya dari artis ${mbArtist.name ?? artist}`,
        )
        if (items.length > 0) return items.slice(0, 15)
      }
    }

    // 3) Title-only fallback when artist is unknown or not found in MusicBrainz.
    if (hasTitle) {
      const recs = await searchRecordings(`recording:"${escLucene(title)}"`, 10)
      addRecordings(recs, 'Unknown', 'Judul mirip di MusicBrainz')
      if (items.length > 0) return items.slice(0, 15)
    }

    // 4) Last resort: top artists from the session taste profile.
    for (const topArtist of topArtists) {
      if (norm(topArtist) === norm(artist)) continue
      if (apiCalls >= MAX_API_CALLS) break
      const mbArtist = await lookupArtist(topArtist)
      if (!mbArtist?.id) continue
      const genreHint = (mbArtist.tags ?? []).slice(0, 2).map((t) => t.name).join(', ')
      await browseArtist(
        mbArtist.id,
        mbArtist.name ?? topArtist,
        genreHint,
        `Berdasarkan selera Anda (${mbArtist.name ?? topArtist})`,
      )
      if (items.length > 0) break
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

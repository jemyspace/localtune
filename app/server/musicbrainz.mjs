const USER_AGENT =
  'LocalTune/0.1 (https://github.com/jemyspace/localtune; contact: jemyspace@users.noreply.github.com)'
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
  return (
    rec['artist-credit']?.[0]?.name ??
    rec['artist-credit']?.[0]?.artist?.name ??
    fallback
  )
}

/** Drop bootleg chatter / found-sound / empty noise that browse mode returns first. */
function isUsefulTitle(title) {
  const t = String(title ?? '').trim()
  if (!t || t.length < 2) return false
  if (t.length > 80) return false
  const n = norm(t)
  if (/^\(.*\)$/.test(t)) return false
  if (n.includes('found sound')) return false
  if (n.includes('chris chat')) return false
  if (n.includes('encore break')) return false
  if (n === 'intro' || n === 'outro' || n === 'interlude') return false
  return true
}

/**
 * Fast path for serverless (Netlify ~26s limit): max 2 MusicBrainz calls.
 * Prefer Lucene search (score-ranked) over browse (alphabetical junk).
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

  const isCurrentTrack = (entryArtist, entryTitle) =>
    norm(entryArtist) === norm(artist) && norm(entryTitle ?? '') === norm(title)

  const add = (entry) => {
    if (!isUsefulTitle(entry.title)) return
    const key = `${norm(entry.artist)}|${norm(entry.title ?? '')}`
    if (!entry.artist || seen.has(key)) return
    if (isCurrentTrack(entry.artist, entry.title)) return
    seen.add(key)
    items.push(entry)
  }

  const callMb = async (path) => {
    if (apiCalls >= MAX_API_CALLS) return null
    if (apiCalls > 0) await sleep(RATE_LIMIT_MS)
    apiCalls += 1
    return mbGet(path)
  }

  const addFromRecordings = (recordings, fallbackArtist, reason, genre) => {
    for (const rec of recordings ?? []) {
      add({
        artist: recordingArtist(rec, fallbackArtist),
        title: rec.title,
        genre: genre || undefined,
        sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
        reason,
      })
    }
  }

  const searchRecordings = async (query, limit = 15) => {
    const data = await callMb(
      `recording?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`,
    )
    return data?.recordings ?? []
  }

  try {
    const hasArtist = Boolean(artist) && norm(artist) !== 'unknown'
    const hasTitle = Boolean(title)

    // 1) Other tracks by the same artist (search is score-ranked, not A–Z browse).
    if (hasArtist) {
      let query = `artist:"${escLucene(artist)}"`
      if (hasTitle) {
        query += ` AND NOT recording:"${escLucene(title)}"`
      }
      const recs = await searchRecordings(query, 15)
      addFromRecordings(recs, artist, `Lainnya dari artis ${artist}`)

      // 2) Related: recordings sharing tags/genre via a second title-or-artist query.
      if (items.length < 6 && hasTitle && apiCalls < MAX_API_CALLS) {
        const similar = await searchRecordings(
          `recording:"${escLucene(title)}" AND NOT artist:"${escLucene(artist)}"`,
          10,
        )
        addFromRecordings(similar, 'Unknown', 'Artis lain dengan judul mirip')
      }

      if (items.length > 0) return items.slice(0, 15)
    }

    // 3) Title-only (unknown / unmatched artist).
    if (hasTitle && apiCalls < MAX_API_CALLS) {
      const recs = await searchRecordings(`recording:"${escLucene(title)}"`, 12)
      addFromRecordings(recs, 'Unknown', 'Judul mirip di MusicBrainz')

      const hitArtist = recs[0] ? recordingArtist(recs[0], '') : ''
      if (hitArtist && norm(hitArtist) !== 'unknown' && apiCalls < MAX_API_CALLS) {
        const more = await searchRecordings(
          `artist:"${escLucene(hitArtist)}" AND NOT recording:"${escLucene(title)}"`,
          12,
        )
        addFromRecordings(more, hitArtist, `Lainnya dari artis ${hitArtist}`)
      }

      if (items.length > 0) return items.slice(0, 15)
    }

    // 4) Taste-profile fallback.
    for (const topArtist of topArtists) {
      if (norm(topArtist) === norm(artist)) continue
      if (apiCalls >= MAX_API_CALLS) break
      const recs = await searchRecordings(`artist:"${escLucene(topArtist)}"`, 12)
      addFromRecordings(
        recs,
        topArtist,
        `Berdasarkan selera Anda (${topArtist})`,
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

  const items = await fetchMusicBrainzDiscoveries({
    artist,
    title,
    topArtists,
    topGenres,
  })
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.statusCode = 200
  res.end(JSON.stringify({ items }))
}

import { fetchMusicBrainzDiscoveries } from '../../app/server/musicbrainz.mjs'

function param(value) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

function csvList(value) {
  return param(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const params = event.queryStringParameters ?? {}
  const artist = param(params.artist)
  const title = param(params.title)
  const topArtists = csvList(params.topArtists)
  const topGenres = csvList(params.topGenres)

  try {
    const items = await fetchMusicBrainzDiscoveries({
      artist,
      title,
      topArtists,
      topGenres,
    })
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ items: items ?? [] }),
    }
  } catch (err) {
    console.error('research function error:', err)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'research_failed', items: [] }),
    }
  }
}

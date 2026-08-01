import { fetchMusicBrainzDiscoveries } from '../../app/server/musicbrainz.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const params = event.queryStringParameters ?? {}
  const artist = params.artist ?? ''
  const title = params.title ?? ''
  const topArtists = (params.topArtists ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const topGenres = (params.topGenres ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  try {
    const items = await fetchMusicBrainzDiscoveries({ artist, title, topArtists, topGenres })
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=300',
      },
      body: JSON.stringify({ items }),
    }
  } catch (err) {
    console.error('research function error:', err)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'research_failed', items: [] }),
    }
  }
}

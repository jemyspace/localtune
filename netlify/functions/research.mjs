import { handleResearchRequest } from '../../app/server/musicbrainz.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const params = event.queryStringParameters ?? {}
  const search = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v != null ? [[k, v]] : [])),
  ).toString()
  const req = {
    url: `/api/research${search ? `?${search}` : ''}`,
    method: 'GET',
  }

  let statusCode = 200
  let body = ''

  const res = {
    setHeader() {},
    statusCode: 200,
    end(payload) {
      body = payload
      statusCode = this.statusCode
    },
    get statusCode() {
      return statusCode
    },
    set statusCode(code) {
      statusCode = code
    },
  }

  try {
    await handleResearchRequest(req, res)
    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body,
    }
  } catch {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'research_failed', items: [] }),
    }
  }
}

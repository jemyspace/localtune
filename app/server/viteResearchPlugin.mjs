import { lookupAcoustid } from './acoustid.mjs'
import { handleResearchRequest } from './musicbrainz.mjs'

/**
 * @param {import('vite').Connect.Server} server
 */
function attachApiMiddleware(server) {
  server.middlewares.use('/api/research', (req, res, next) => {
    if (req.method !== 'GET') {
      next()
      return
    }
    handleResearchRequest(req, res).catch(() => {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'research_failed', items: [] }))
    })
  })

  server.middlewares.use('/api/acoustid', (req, res, next) => {
    if (req.method !== 'POST') {
      next()
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      lookupAcoustid(JSON.parse(body || '{}'))
        .then((result) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        })
        .catch(() => {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'acoustid_failed', items: [] }))
        })
    })
  })
}

/** @returns {import('vite').Plugin} */
export function researchApiPlugin() {
  return {
    name: 'localtune-research-api',
    configureServer(server) {
      attachApiMiddleware(server)
    },
    configurePreviewServer(server) {
      attachApiMiddleware(server)
    },
  }
}

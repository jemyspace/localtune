import { handleResearchRequest } from './musicbrainz.mjs'

/**
 * @param {import('vite').Connect.Server} server
 */
function attachResearchMiddleware(server) {
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
}

/** @returns {import('vite').Plugin} */
export function researchApiPlugin() {
  return {
    name: 'localtune-research-api',
    configureServer(server) {
      attachResearchMiddleware(server)
    },
    configurePreviewServer(server) {
      attachResearchMiddleware(server)
    },
  }
}

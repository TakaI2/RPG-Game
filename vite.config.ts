import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

function saveAssetPlugin() {
  return {
    name: 'save-asset',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use('/api/save-asset', (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }))
          return
        }

        let body = ''
        req.on('data', (chunk: any) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const { path: assetPath, content } = JSON.parse(body)

            if (!assetPath || !String(assetPath).startsWith('assets/')) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'path must start with assets/' }))
              return
            }

            const fullPath = path.join(process.cwd(), 'public', assetPath)
            const dir = path.dirname(fullPath)

            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(fullPath, content, 'utf-8')

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
        })
      })
    }
  }
}

export default defineConfig({
  base: '/Game_RPG/',
  server: { port: 5173 },
  build: { sourcemap: true },
  plugins: [saveAssetPlugin()]
})

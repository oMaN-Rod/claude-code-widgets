import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'

import { costs, lastWork } from './cost'
import { FACTORY, ROOT, allIds, flag, now, orderDir, readLog, readOrder } from './lib'

const PAGE = join(FACTORY, 'control-room', 'floor')
const FILES: Record<string, string> = {
  '/': 'index.html',
  '/floor.css': 'floor.css',
  '/floor.js': 'floor.js',
  '/markdown.js': 'markdown.js',
  '/world.js': 'world.js',
}
const TYPES: Record<string, string> = { html: 'text/html', css: 'text/css', js: 'text/javascript' }
const DEMO = join(ROOT, 'docs')
const DOCS = ['idea.md', 'spec.md', 'spec-notes.md', 'inspection.md', 'live.txt']
const isShift = (action: string, agent: string): boolean => action.startsWith('took the order') || agent === 'inventor'

const board = (): object => {
  const spent = costs()
  const worked = lastWork()

  return {
    at: now(),
    orders: allIds().map(id => {
      const log = readLog(id)
      const files = readdirSync(orderDir(id))

      return { ...readOrder(id), agents: log.filter(entry => isShift(entry.action, entry.agent)).length, log, docs: DOCS.filter(name => files.includes(name)), cost: spent.get(id) ?? null, workedAt: worked.get(id) ?? null }
    }),
  }
}

const port = Number(flag(process.argv.slice(2), 'port') ?? 4173)
const isShared = process.argv.includes('--lan')

Bun.serve({
  port,
  hostname: isShared ? '0.0.0.0' : '127.0.0.1',
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/api/board') return Response.json(board(), { headers: { 'cache-control': 'no-store' } })
    if (url.pathname === '/api/doc') {
      const id = url.searchParams.get('id') ?? ''
      const name = url.searchParams.get('name') ?? ''
      if (!allIds().includes(id) || !DOCS.includes(name)) return new Response('Not found', { status: 404 })
      const path = join(orderDir(id), name)

      return existsSync(path) ? new Response(readFileSync(path, 'utf8'), { headers: { 'content-type': 'text/plain; charset=utf-8' } }) : new Response('Not found', { status: 404 })
    }

    if (/^\/three\/(build|examples\/jsm)\/[\w./-]+\.js$/.test(url.pathname) && !url.pathname.includes('..')) {
      const path = join(FACTORY, 'node_modules', url.pathname)

      return existsSync(path) ? new Response(readFileSync(path, 'utf8'), { headers: { 'content-type': 'text/javascript; charset=utf-8' } }) : new Response('Not found', { status: 404 })
    }

    if (url.pathname === '/demo') return Response.redirect('/demo/', 302)
    if (url.pathname.startsWith('/demo/')) {
      const name = url.pathname.slice(6) || 'index.html'
      if (!readdirSync(DEMO).includes(name)) return new Response('Not found', { status: 404 })

      return new Response(readFileSync(join(DEMO, name), 'utf8'), { headers: { 'content-type': `${TYPES[name.split('.').pop() ?? 'html'] ?? 'text/plain'}; charset=utf-8`, 'cache-control': 'no-store' } })
    }

    const file = FILES[url.pathname]
    if (file === undefined) return new Response('Not found', { status: 404 })

    return new Response(readFileSync(join(PAGE, file), 'utf8'), {
      headers: { 'content-type': `${TYPES[file.split('.').pop() ?? 'html']}; charset=utf-8`, 'cache-control': 'no-store' },
    })
  },
})

console.log(`The factory floor is at http://localhost:${port} and the widget demo page at http://localhost:${port}/demo/`)
if (isShared) {
  const addresses = Object.values(networkInterfaces()).flat().filter(found => found?.family === 'IPv4' && !found.internal).map(found => found?.address)
  for (const address of addresses) console.log(`On your network: http://${address}:${port} and http://${address}:${port}/demo/`)
}

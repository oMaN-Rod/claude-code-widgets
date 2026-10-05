import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { BENCH, FLOOR, ROOT, benchOf, fail, orderDir, readOrder, sh } from './lib'

const USAGE = `Usage: bun factory/tools/ship.ts prepare <order id>
       bun factory/tools/ship.ts commit <order id>
       bun factory/tools/ship.ts release <order id>`
const SHARED = ['README.md', '.claude-plugin/marketplace.json', 'docs']
const LOCK = join(FLOOR, 'dock.lock')

type Card = { title: string; category: string; shows: string; commands: string[]; cost: string }

const must = (argv: string[], what: string): string => {
  const ran = sh(argv)
  if (ran.code !== 0) fail(`${what} failed:\n${ran.out}`)

  return ran.out
}

const cell = (text: string): string => text.replaceAll('|', '\\|')

const list = (name: string, card: Card): void => {
  const path = join(ROOT, 'README.md')
  const lines = readFileSync(path, 'utf8').split('\n')
  if (lines.some(line => line.startsWith(`| \`${name}\` |`))) return

  const head = lines.findIndex(line => line.trim() === `### ${card.category}`)
  if (head < 0) fail(`README.md has no "### ${card.category}" table.`)
  let at = lines.findIndex((line, index) => index > head && line.startsWith('| Plugin'))
  while (lines[at + 1]?.startsWith('|')) at += 1
  lines.splice(at + 1, 0, `| \`${name}\` | ${card.commands.map(command => `\`${cell(command)}\``).join(', ')} | ${cell(card.shows)} |`)

  const count = lines.filter(line => /^\| `[a-z0-9-]+-widget` \|/.test(line)).length
  writeFileSync(path, lines.join('\n').replace(/there are now \d+ widgets/, `there are now ${count} widgets`))
}

const offer = (name: string, card: Card): void => {
  const path = join(ROOT, '.claude-plugin', 'marketplace.json')
  const market = JSON.parse(readFileSync(path, 'utf8')) as { plugins: { name: string }[] }
  if (market.plugins.some(plugin => plugin.name === name)) return

  const manifest = JSON.parse(readFileSync(join(ROOT, 'plugins', name, '.claude-plugin', 'plugin.json'), 'utf8')) as Record<string, unknown>
  market.plugins.push({
    name,
    source: `./plugins/${name}`,
    description: card.shows,
    version: manifest.version,
    author: manifest.author,
    category: 'widgets',
    repository: manifest.repository,
    keywords: manifest.keywords,
    license: manifest.license,
  } as never)
  writeFileSync(path, `${JSON.stringify(market, null, 2)}\n`)
}

const [command, id] = process.argv.slice(2)
if ((command !== 'prepare' && command !== 'commit' && command !== 'release') || id === undefined) fail(USAGE)

const order = readOrder(id as string)
const name = order.widget ?? fail(`${order.id} has no widget.`)
const home = join(ROOT, 'plugins', name)
if (order.status !== 'open' || order.station !== 'shipping') fail(`${order.id} is at ${order.status === 'open' ? order.station : order.status}, not at shipping.`)

const holder = existsSync(LOCK) ? readFileSync(LOCK, 'utf8').trim() : ''
if (holder !== '' && holder !== order.id) fail(`The dock is taken by ${holder}. One order ships at a time: wait for it, or release it with ship.ts release ${holder}.`)

if (command === 'release') {
  must(['git', 'checkout', '--', ...SHARED], 'Putting the shared files back')
  if (existsSync(home) && sh(['git', 'ls-files', '--error-unmatch', `plugins/${name}/widget.json`]).code === 0 && sh(['git', 'diff', '--cached', '--quiet', '--', `plugins/${name}`]).code === 0) {
    must(['git', 'rm', '-r', '-q', '--cached', `plugins/${name}`], 'Unmarking the widget')
    cpSync(home, join(BENCH, name), { recursive: true })
    rmSync(home, { recursive: true, force: true })
  }
  rmSync(LOCK, { force: true })
  console.log(`${order.id} is off the dock; ${name} is back on the bench and the README, marketplace and demo page are as they were.`)
  process.exit(0)
}

if (command === 'prepare') {
  writeFileSync(LOCK, `${order.id}\n`)
  const bench = benchOf(order)
  if (existsSync(bench)) {
    const spec = join(orderDir(order.id), 'spec.md')
    must(['bun', 'factory/tools/check.ts', bench, ...(existsSync(spec) ? ['--spec', spec] : [])], 'The checker')
    rmSync(home, { recursive: true, force: true })
    cpSync(bench, home, { recursive: true })
    rmSync(bench, { recursive: true, force: true })
  }
  if (!existsSync(home)) fail(`Neither the bench nor plugins/ holds ${name}.`)

  const card = JSON.parse(readFileSync(join(home, 'widget.json'), 'utf8')) as Card
  list(name, card)
  offer(name, card)
  must(['git', 'add', '--intent-to-add', `plugins/${name}`], 'git add')
  console.log(must(['bun', 'site/build.ts'], 'The demo build').trim())
  const smoke = must(['bun', 'site/smoke.ts', name], 'The demo smoke test')
  console.log(smoke.trim())
  if (!/\n?0 problems/.test(smoke)) fail(`${name} does not run on the demo page yet. Fix docs/engine.js or the widget's demo data, then run prepare again.`)
  console.log(`\n${name} is on the dock. Review the playback above, then: bun factory/tools/ship.ts commit ${order.id}`)
} else {
  if (!existsSync(home)) fail(`Run prepare first: plugins/${name} does not exist.`)
  const smoke = must(['bun', 'site/smoke.ts', name], 'The demo smoke test')
  if (!/\n?0 problems/.test(smoke)) fail(`${name} does not run on the demo page:\n${smoke}`)
  must(['bun', 'factory/tools/order.ts', 'stamp', order.id, 'clerk', 'pass', '--reason', 'On the demo page, in the README and the marketplace; smoke test clean'], 'The shipping stamp')
  must(['git', 'add', `plugins/${name}`, `factory/orders/${order.id}`, 'README.md', '.claude-plugin/marketplace.json', 'docs'], 'git add')
  console.log(must(['git', 'commit', '-m', `Add ${name.replace(/-widget$/, '')} widget`, '--', `plugins/${name}`, `factory/orders/${order.id}`, ...SHARED], 'git commit').trim())
  rmSync(LOCK, { force: true })
}

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dir, '..', '..')
export const FACTORY = join(ROOT, 'factory')
export const FLOOR = join(FACTORY, 'floor')
export const OPEN = join(FLOOR, 'orders')
export const CLOSED = join(FACTORY, 'orders')
export const BENCH = join(FLOOR, 'plugins')
export const TEMPLATE = join(FACTORY, 'template')
export const STATIONS = ['ideation', 'design', 'build', 'inspection', 'shipping'] as const
export const CATEGORIES = ['Session', 'Project and git', 'Time and focus', 'Scenes', 'Visualizers', 'Games', 'Just for fun'] as const

export type Station = (typeof STATIONS)[number]

export type Stamp = {
  at: string
  station: Station
  by: string
  result: 'pass' | 'send-back' | 'reject' | 'scrap'
  reason: string
  to?: Station
  subject?: string
}

export type Order = {
  id: string
  kind: 'new' | 'rebuild'
  widget: string | null
  title: string | null
  brief: string
  status: 'open' | 'shipped' | 'scrapped'
  station: Station
  holder: string | null
  openedAt: string
  closedAt: string | null
  sendBacks: number
  stamps: Stamp[]
}

export type Entry = { at: string; agent: string; station: string; action: string }

export const now = (): string => new Date().toISOString()

export const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

export const flag = (args: string[], name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)

  return at < 0 ? undefined : args[at + 1]
}

export const typed = (line: string): string => line.replace(/^[A-Za-z]:[\\/]Program Files[\\/]Git[\\/]/, '/')

export const words = (args: string[]): string[] => {
  const kept: string[] = []
  for (let at = 0; at < args.length; at += 1) {
    if (args[at]?.startsWith('--')) at += 1
    else kept.push(args[at] ?? '')
  }

  return kept
}

const folders = (base: string): string[] =>
  existsSync(base) ? readdirSync(base, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name) : []

export const allIds = (): string[] => [...folders(OPEN), ...folders(CLOSED)].sort()

export const orderDir = (id: string): string => {
  const base = [OPEN, CLOSED].find(candidate => existsSync(join(candidate, id)))

  return base === undefined ? fail(`No work order ${id}.`) : join(base, id)
}

export const readOrder = (id: string): Order => JSON.parse(readFileSync(join(orderDir(id), 'order.json'), 'utf8')) as Order

export const save = (path: string, text: string): void => {
  writeFileSync(`${path}.tmp`, text)
  renameSync(`${path}.tmp`, path)
}

export const readLog = (id: string): Entry[] => {
  const path = join(orderDir(id), 'log.jsonl')
  if (!existsSync(path)) return []

  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Entry)
}

const isShift = (entry: Entry): boolean => entry.action.startsWith('took the order') || entry.agent === 'inventor'

export const board = (): { at: string; orders: (Order & { agents: number; log: Entry[] })[] } => ({
  at: now(),
  orders: allIds().map(id => {
    const log = readLog(id)

    return { ...readOrder(id), agents: log.filter(isShift).length, log: log.slice(-6) }
  }),
})

export const writeOrder = (order: Order): void => {
  save(join(orderDir(order.id), 'order.json'), `${JSON.stringify(order, null, 2)}\n`)
  mkdirSync(FLOOR, { recursive: true })
  save(join(FLOOR, 'board.json'), `${JSON.stringify(board())}\n`)
}

export const benchOf = (order: Order): string =>
  order.widget === null ? fail(`${order.id} has no widget name yet.`) : join(BENCH, order.widget)

export const CONFIG = resolve(process.env.FACTORY_CONFIG_DIR ?? join(homedir(), '.claude-factory'))

export const sh = (argv: string[], cwd = ROOT): { code: number; out: string } => {
  const env = argv[0] === 'claude' && existsSync(CONFIG) ? { ...process.env, CLAUDE_CONFIG_DIR: CONFIG } : process.env
  const ran = Bun.spawnSync(argv, { cwd, env, stdout: 'pipe', stderr: 'pipe' })

  return { code: ran.exitCode, out: `${ran.stdout.toString()}${ran.stderr.toString()}` }
}

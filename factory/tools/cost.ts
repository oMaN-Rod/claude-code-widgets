import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { CONFIG, OPEN, ROOT, allIds, orderDir, save } from './lib'

const USAGE = `Usage: bun factory/tools/cost.ts [order id]

Adds up what the crew's agents spent on each work order, from the transcripts Claude Code
keeps on this machine, and saves it as cost.json in the folder of every open order.
Dollars are API list prices. The director's own session and live runs are not counted,
and output tokens are partly estimated, so read the dollars as close, not exact.`

// Dollars per million tokens: input, output, cache read. A cache write costs 1.25 times input for five minutes, 2 times for an hour.
const PRICES: [string, number, number, number][] = [
  ['claude-opus-5-5', 4, 20, 0.2],
  ['claude-fable-5-1', 10, 50, 0.25],
  ['claude-mythos-5-1', 10, 50, 0.25],
  ['claude-fable-5', 10, 50, 1],
  ['claude-opus-5', 5, 25, 0.5],
  ['claude-opus-4-8', 5, 25, 0.5],
  ['claude-opus-4-7', 5, 25, 0.5],
  ['claude-opus-4-6', 5, 25, 0.5],
  ['claude-sonnet-5', 2, 10, 0.2],
  ['claude-sonnet-4-6', 3, 15, 0.3],
  ['claude-haiku-4-5', 1, 5, 0.1],
]
// Claude Code writes most replies to the transcript before their final output count arrives, so the count on file is a
// placeholder of a few tokens. Those replies are estimated from their length, at the rate measured on replies with a final count.
const TOKENS_PER_CHAR = 0.55
const RECOUNT_MS = 10_000

export type Spend = { label: string; input: number; output: number; cacheWrite: number; cacheRead: number; usd: number; unpriced: number; guessed: number }
export type Cost = Omit<Spend, 'label'> & { tokens: number; agents: number }

type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
}
type Block = { type?: string; text?: string; thinking?: string; name?: string; input?: unknown }
type Line = { type?: string; message?: { id?: string; model?: string; usage?: Usage; stop_reason?: string | null; content?: Block[] } }

const sizeOf = (block: Block): number =>
  block.type === 'tool_use' ? JSON.stringify(block.input ?? {}).length + (block.name ?? '').length : (block.text ?? block.thinking ?? '').length

const read = new Map<string, { stamp: string; spend: Omit<Spend, 'label'> }>()
let counted: { at: number; byOrder: Map<string, Record<string, Spend>> } | undefined

const metas = (folder: string): string[] =>
  !existsSync(folder) ? [] : readdirSync(folder, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? metas(join(folder, entry.name)) : entry.name.endsWith('.meta.json') ? [join(folder, entry.name)] : [],
  )

const spendOf = (path: string): Omit<Spend, 'label'> => {
  const { mtimeMs, size } = statSync(path)
  const stamp = `${mtimeMs}:${size}`
  const known = read.get(path)
  if (known?.stamp === stamp) return known.spend

  const calls = new Map<string, { model: string; usage: Usage; chars: number; isFinal: boolean }>()
  for (const text of readFileSync(path, 'utf8').split('\n')) {
    if (!text.includes('"usage"')) continue
    try {
      const { type, message } = JSON.parse(text) as Line
      if (type !== 'assistant' || message?.id === undefined || message.usage === undefined) continue
      const chars = (calls.get(message.id)?.chars ?? 0) + (message.content ?? []).reduce((sum, block) => sum + sizeOf(block), 0)
      calls.set(message.id, { model: message.model ?? '', usage: message.usage, chars, isFinal: typeof message.stop_reason === 'string' })
    } catch {}
  }
  const spend = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, usd: 0, unpriced: 0, guessed: 0 }
  for (const { model, usage, chars, isFinal } of calls.values()) {
    const hour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
    const brief = usage.cache_creation?.ephemeral_5m_input_tokens ?? (usage.cache_creation_input_tokens ?? 0) - hour
    const input = usage.input_tokens ?? 0
    const said = usage.output_tokens ?? 0
    const output = isFinal ? said : Math.max(said, Math.round(chars * TOKENS_PER_CHAR))
    const cacheRead = usage.cache_read_input_tokens ?? 0
    const price = PRICES.find(([name]) => model.startsWith(name))
    spend.input += input
    spend.output += output
    if (!isFinal) spend.guessed += output
    spend.cacheWrite += brief + hour
    spend.cacheRead += cacheRead
    if (price === undefined) spend.unpriced += input + output + brief + hour + cacheRead
    else spend.usd += (input * price[1] + brief * price[1] * 1.25 + hour * price[1] * 2 + output * price[2] + cacheRead * price[3]) / 1e6
  }
  read.set(path, { stamp, spend })

  return spend
}

const count = (): Map<string, Record<string, Spend>> => {
  const slug = ROOT.replace(/[^A-Za-z0-9]/g, '-')
  const homes = new Set([process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), CONFIG])
  const byOrder = new Map<string, Record<string, Spend>>()
  for (const home of homes) {
    for (const meta of metas(join(home, 'projects', slug))) {
      const transcript = meta.replace(/\.meta\.json$/, '.jsonl')
      if (!existsSync(transcript)) continue
      try {
        const label = String((JSON.parse(readFileSync(meta, 'utf8')) as { description?: string }).description ?? '')
        const ids = new Set(label.match(/\bWO-\d+\b/g))
        if (ids.size !== 1) continue
        const [id] = [...ids]
        const agent = transcript.replace(/^.*agent-|\.jsonl$/g, '')
        byOrder.set(id, { ...byOrder.get(id), [agent]: { label, ...spendOf(transcript) } })
      } catch {}
    }
  }

  return byOrder
}

const kept = (id: string): Record<string, Spend> => {
  const path = join(orderDir(id), 'cost.json')
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as { agents: Record<string, Spend> }).agents
  } catch {
    return {}
  }
}

export const costs = (): Map<string, Cost> => {
  if (counted === undefined || Date.now() - counted.at > RECOUNT_MS) counted = { at: Date.now(), byOrder: count() }
  const out = new Map<string, Cost>()
  for (const id of allIds()) {
    const before = kept(id)
    const agents = { ...before, ...counted.byOrder.get(id) }
    const list = Object.values(agents)
    if (list.length === 0) continue
    if (orderDir(id).startsWith(OPEN) && JSON.stringify(agents) !== JSON.stringify(before)) save(join(orderDir(id), 'cost.json'), `${JSON.stringify({ agents }, null, 2)}\n`)
    const sum = (key: 'input' | 'output' | 'cacheWrite' | 'cacheRead' | 'usd' | 'unpriced' | 'guessed'): number => list.reduce((total, spend) => total + spend[key], 0)
    const cost = { input: sum('input'), output: sum('output'), cacheWrite: sum('cacheWrite'), cacheRead: sum('cacheRead'), usd: sum('usd'), unpriced: sum('unpriced'), guessed: sum('guessed') }
    out.set(id, { ...cost, tokens: cost.input + cost.output + cost.cacheWrite + cost.cacheRead, agents: list.length })
  }

  return out
}

if (import.meta.main) {
  const [asked] = process.argv.slice(2)
  if (asked === '--help') {
    console.log(USAGE)
    process.exit(0)
  }
  const found = costs()
  const rows = allIds().filter(id => asked === undefined || id === asked)
  if (rows.length === 0) {
    console.error(`No work order ${asked}.`)
    process.exit(1)
  }
  for (const id of rows) {
    const cost = found.get(id)
    console.log(cost === undefined ? `${id}  not recorded` : `${id}  ${cost.guessed > 0 ? '≈ ' : ''}${cost.tokens.toLocaleString('en')} tokens  $${cost.usd.toFixed(2)}  ${cost.agents} agents  (in ${cost.input.toLocaleString('en')}, out ${cost.output.toLocaleString('en')}, cache write ${cost.cacheWrite.toLocaleString('en')}, cache read ${cost.cacheRead.toLocaleString('en')})${cost.guessed > 0 ? `  ${cost.guessed.toLocaleString('en')} output tokens estimated` : ''}${cost.unpriced > 0 ? `  ${cost.unpriced.toLocaleString('en')} tokens on a model with no known price` : ''}`)
  }
}

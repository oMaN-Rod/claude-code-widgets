import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { CLOSED, FACTORY, FLOOR, OPEN, STATIONS, allIds, board, fail, flag, now, orderDir, readLog, readOrder, words, writeOrder } from './lib'
import type { Order, Stamp, Station } from './lib'

const USAGE = `Usage: bun factory/tools/order.ts <command>
  open --kind new|rebuild [--widget <name>-widget --title <Title>] --brief "<what and why>"
  name <id> <name>-widget <Title>
  take <id> <agent>
  log <id> <agent> <what was done>
  stamp <id> <agent> pass|send-back|reject|scrap --reason "<why>" [--to <station>] [--subject "<idea>"]
  show <id>
  refill [--target 4]   open orders for new inventions until that many are on the floor
  bank                  list the idea bank in factory/backlog.json
  bank <name>-widget    open a rebuild order for one idea from the bank
  board`

type Backlog = { target: number; newBrief: string; rebuilds: { widget: string; title: string; brief: string }[] }

const isStation = (value: string | undefined): value is Station => STATIONS.includes(value as Station)

const record = (order: Order, agent: string, action: string): void => {
  appendFileSync(join(orderDir(order.id), 'log.jsonl'), `${JSON.stringify({ at: now(), agent, station: order.station, action })}\n`)
}

const close = (order: Order, status: 'shipped' | 'scrapped'): void => {
  const from = orderDir(order.id)
  order.status = status
  order.closedAt = now()
  order.holder = null
  writeOrder(order)
  mkdirSync(CLOSED, { recursive: true })
  renameSync(from, join(CLOSED, order.id))
  writeOrder(order)
}

const open = (args: string[]): void => {
  const kind = flag(args, 'kind')
  const brief = flag(args, 'brief') ?? ''
  const widget = flag(args, 'widget') ?? null
  if (kind !== 'new' && kind !== 'rebuild') fail(USAGE)
  if (brief === '') fail('A work order needs a --brief.')
  if (kind === 'rebuild' && widget === null) fail('A rebuild needs --widget.')
  if (widget !== null && !/^[a-z0-9]+(-[a-z0-9]+)*-widget$/.test(widget)) fail('A widget is named <name>-widget.')

  console.log(create(kind as 'new' | 'rebuild', brief, widget, flag(args, 'title') ?? null))
}

const create = (kind: 'new' | 'rebuild', brief: string, widget: string | null, title: string | null): string => {
  const last = allIds().map(id => Number(id.slice(3))).reduce((most, value) => Math.max(most, value), 0)
  const id = `WO-${String(last + 1).padStart(4, '0')}`
  const order: Order = {
    id,
    kind,
    widget,
    title,
    brief,
    status: 'open',
    station: kind === 'new' ? 'ideation' : 'design',
    holder: null,
    openedAt: now(),
    closedAt: null,
    sendBacks: 0,
    stamps: [],
  }
  mkdirSync(join(OPEN, id), { recursive: true })
  writeOrder(order)
  record(order, 'director', `opened the order: ${brief}`)

  return id
}

const refill = (args: string[]): void => {
  const backlog = JSON.parse(readFileSync(join(FACTORY, 'backlog.json'), 'utf8')) as Backlog
  const target = Number(flag(args, 'target') ?? backlog.target)
  const opened: { id: string; kind: string }[] = []
  for (let open = allIds().map(readOrder).filter(order => order.status === 'open').length; open < target; open += 1) {
    opened.push({ id: create('new', backlog.newBrief, null, null), kind: 'new' })
  }
  console.log(JSON.stringify(opened))
}

const bank = (name: string): void => {
  const backlog = JSON.parse(readFileSync(join(FACTORY, 'backlog.json'), 'utf8')) as Backlog
  const taken = new Set(allIds().map(id => readOrder(id).widget))
  const ideas = backlog.rebuilds.filter(entry => !taken.has(entry.widget))
  if (name === '') {
    for (const entry of ideas) console.log(`${entry.widget.padEnd(22)} ${/What it is: (.*?.) Known faults/.exec(entry.brief)?.[1] ?? entry.title}`)
    console.log(`
${ideas.length} ideas in the bank. None of them has to be built.`)

    return
  }
  const entry = ideas.find(idea => idea.widget === name)
  if (entry === undefined) fail(`${name} is not in the bank, or already has a work order.`)
  console.log(JSON.stringify([{ id: create('rebuild', entry.brief, entry.widget, entry.title), kind: 'rebuild' }]))
}

const stamp = (order: Order, agent: string, result: string, args: string[]): void => {
  const reason = flag(args, 'reason') ?? ''
  const to = flag(args, 'to')
  const subject = flag(args, 'subject')
  if (order.status !== 'open') fail(`${order.id} is closed.`)
  if (reason === '') fail('A stamp needs a --reason.')
  if (result !== 'pass' && result !== 'send-back' && result !== 'reject' && result !== 'scrap') fail(USAGE)

  const at = STATIONS.indexOf(order.station)
  const made: Stamp = { at: now(), station: order.station, by: agent, result: result as Stamp['result'], reason, ...(subject === undefined ? {} : { subject }) }
  if (result === 'pass' && order.station === 'inspection') {
    const builder = order.stamps.findLast(held => held.station === 'build' && held.result === 'pass')?.by
    if (builder === agent) fail('The agent that built a widget cannot pass its inspection.')
  }
  if (result === 'pass' && order.station !== 'ideation' && order.widget === null) fail('Name the widget before it leaves ideation.')
  if (result === 'send-back') {
    if (!isStation(to) || STATIONS.indexOf(to) >= at) fail('Send back --to an earlier station.')
    made.to = to as Station
  }

  order.stamps.push(made)
  record(order, agent, `stamped ${result}${made.to === undefined ? '' : ` to ${made.to}`}${subject === undefined ? '' : ` on "${subject}"`}: ${reason}`)
  order.holder = result === 'reject' ? order.holder : null
  if (result === 'scrap') return close(order, 'scrapped')
  if (result === 'send-back') {
    order.station = made.to as Station
    order.sendBacks += 1
    rmSync(join(orderDir(order.id), 'live.txt'), { force: true })
  }
  if (result === 'pass') {
    if (order.station === 'shipping') return close(order, 'shipped')
    order.station = STATIONS[at + 1] as Station
  }
  writeOrder(order)
}

const clip = (text: string, width: number): string => (text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width))

const print = (): void => {
  const { orders } = board()
  const line = orders.filter(order => order.status === 'open')
  const shipped = orders.filter(order => order.status === 'shipped')
  const scrapped = orders.filter(order => order.status === 'scrapped')
  const turned = orders.flatMap(order => order.stamps.filter(held => held.result !== 'pass').map(held => ({ order, held })))

  console.log(`WIDGET FACTORY   ${line.length} on the line · ${shipped.length} shipped · ${scrapped.length} scrapped · ${orders.reduce((sum, order) => sum + order.agents, 0)} agent shifts`)
  console.log('\nON THE LINE')
  for (const order of line) {
    console.log(`  ${order.id}  ${clip(order.widget ?? '(unnamed)', 22)} ${clip(order.kind, 8)} ${clip(order.station, 11)} ${clip(order.holder ?? 'waiting', 12)} ${clip(`${order.agents} agents`, 10)} ${order.sendBacks > 0 ? `sent back ${order.sendBacks}×` : ''}`)
  }
  if (line.length === 0) console.log('  The line is clear.')
  console.log('\nSHIPPING DOCK')
  for (const order of shipped) console.log(`  ${order.id}  ${clip(order.widget ?? '', 22)} shipped ${order.closedAt?.slice(0, 16).replace('T', ' ')}  ${order.agents} agents`)
  if (shipped.length === 0) console.log('  Nothing shipped yet.')
  console.log('\nTURNED BACK')
  for (const { order, held } of turned) {
    const what = held.result === 'send-back' ? `sent back to ${held.to}` : held.result === 'scrap' ? 'scrapped' : 'rejected'
    console.log(`  ${order.id}  ${held.station}: ${what} by ${held.by}${held.subject === undefined ? '' : ` ("${held.subject}")`}: ${held.reason}`)
  }
  if (turned.length === 0) console.log('  Nothing turned back.')
  console.log('\nLATEST')
  const latest = orders.flatMap(order => order.log.map(entry => ({ ...entry, id: order.id }))).sort((one, other) => one.at.localeCompare(other.at)).slice(-8)
  for (const entry of latest) console.log(`  ${entry.at.slice(11, 16)}  ${entry.id}  ${clip(entry.agent, 10)} ${entry.action}`)
}

const [command, ...args] = process.argv.slice(2)
const [id = '', agent = '', ...rest] = words(args)

if (command === 'open') open(args)
else if (command === 'refill') refill(args)
else if (command === 'bank') bank(id)
else if (command === 'board') print()
else if (command === 'show') {
  console.log(JSON.stringify(readOrder(id), null, 2))
  for (const entry of readLog(id)) console.log(`${entry.at}  ${entry.agent} @ ${entry.station}: ${entry.action}`)
} else if (command === 'name') {
  const order = readOrder(id)
  const title = rest.join(' ')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*-widget$/.test(agent) || title === '') fail(USAGE)
  order.widget = agent
  order.title = title
  writeOrder(order)
  record(order, 'examiner', `named the widget ${agent} ("${title}")`)
} else if (command === 'take') {
  const order = readOrder(id)
  if (agent === '') fail(USAGE)
  order.holder = agent
  writeOrder(order)
  record(order, agent, `took the order at ${order.station}`)
} else if (command === 'log') {
  if (agent === '' || rest.length === 0) fail(USAGE)
  const order = readOrder(id)
  record(order, agent, rest.join(' '))
  writeOrder(order)
} else if (command === 'stamp') {
  const [result = ''] = rest
  stamp(readOrder(id), agent, result, args)
} else {
  console.log(USAGE)
}

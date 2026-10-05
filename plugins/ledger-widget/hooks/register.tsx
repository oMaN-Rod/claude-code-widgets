import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, folder, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Entry = { usd: number | null; at: number; size: number; isOurs: boolean }
type Sessions = Record<string, Entry>
type View = { key: string; name: string; roots: string[]; id: string; sessions: Sessions; scannedAt: number; fault: boolean }
type Kept = { sessions: Sessions; scannedAt: number }
type Book = { projects: Record<string, unknown> }
type Saved = { id: string; path: string; size: number; mtimeMs: number; isExact: boolean }
type Tally = { isEmpty: boolean; total: number; counted: number; since: number | null; unpriced: number; long: number; mine: number }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LONG_COLUMNS = 36
const USAGE = 'Usage: /ledger-widget [on|off|scan|show|clear]'
const OFF = 'Ledger is off.'
const FILE = 'ledger.json'
const GIT_MS = 3000
const MAX_READ = 3_500_000
const MAX_SCAN = 40_000_000
const WORKTREE = 'worktree '
const COST = '"type":"cost-state"'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const EMPTY = ['Nothing counted yet.', "Each turn's cost is added here.", "/ledger-widget scan adds this project's saved sessions."] as const
const BLANK: View = { key: '', name: '', roots: [], id: '', sessions: {}, scannedAt: 0, fault: false }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'ledger-widget', key: 'isOn' } as const, false)
const view = atom({ plugin: 'ledger-widget', key: 'view' } as const, BLANK)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

const parsed = (line: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(line)

    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

const bookOf = (text: string): Book => {
  const projects = parsed(text)?.projects

  return { projects: isRecord(projects) ? projects : {} }
}

const keptOf = (book: Book, key: string): Kept => {
  const raw = book.projects[key]
  if (!isRecord(raw) || !isRecord(raw.sessions)) return { sessions: {}, scannedAt: 0 }

  const sessions: Sessions = {}
  for (const [id, entry] of Object.entries(raw.sessions)) {
    if (!isRecord(entry)) continue
    const { usd, at, size, isOurs } = entry
    if ((usd === null || isAmount(usd)) && isAmount(at) && isAmount(size) && typeof isOurs === 'boolean') sessions[id] = { usd, at, size, isOurs }
  }

  return { sessions, scannedAt: isAmount(raw.scannedAt) ? raw.scannedAt : 0 }
}

const enc = (path: string): string => path.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

const isWithin = (cwd: string, roots: readonly string[]): boolean =>
  roots.some(root => folder(cwd) === folder(root) || folder(cwd).startsWith(`${folder(root)}/`))

const money = (usd: number): string => {
  const cents = Math.round(usd * 100) / 100

  return cents < 100 ? `$${cents.toFixed(2)}` : `$${String(Math.round(usd)).replace(/\B(?=(\d{3})+$)/g, ',')}`
}

const dated = (at: number): string => {
  const day = new Date(at)

  return `${day.getDate()} ${MONTHS[day.getMonth()]} ${day.getFullYear()}`
}

const tallied = ({ sessions, id }: View): Tally => {
  const ours = Object.values(sessions).filter(entry => entry.isOurs)
  const counted = ours.flatMap(({ usd, at }) => (usd === null ? [] : [{ usd, at }]))
  const blank = ours.filter(entry => entry.usd === null)
  const long = blank.filter(entry => entry.size > MAX_READ).length

  return {
    isEmpty: ours.length === 0,
    total: counted.reduce((sum, entry) => sum + entry.usd, 0),
    counted: counted.length,
    since: counted.reduce<number | null>((least, entry) => (least === null || entry.at < least ? entry.at : least), null),
    unpriced: blank.length - long,
    long,
    mine: sessions[id]?.usd ?? 0,
  }
}

const summary = (held: View): string => {
  const { total, counted, since, unpriced, long } = tallied(held)
  const priced = since === null ? `Nothing counted yet for ${held.name}.` : `${money(total)} over ${plural(counted, 'session')} since ${dated(since)}.`

  return `${priced}${unpriced > 0 ? ` ${unpriced} without a cost record.` : ''}${long > 0 ? ` ${long} too long to read.` : ''}`
}

const savedOf = (text: string, fallback: number): { cwd: string | undefined; start: number; usd: number | undefined } => {
  const lines = text.split('\n')
  let first: Record<string, unknown> | undefined
  for (const line of lines) {
    const row = line.includes('"cwd"') ? parsed(line) : undefined
    if (typeof row?.cwd !== 'string') continue
    first = row
    break
  }
  let usd: number | undefined
  for (let at = lines.length - 1; at >= 0 && usd === undefined; at -= 1) {
    const cost = lines[at]?.includes(COST) === true ? parsed(lines[at] ?? '')?.totalCostUSD : undefined
    if (isAmount(cost)) usd = cost
  }
  const start = typeof first?.timestamp === 'string' ? Date.parse(first.timestamp) : Number.NaN

  return { cwd: typeof first?.cwd === 'string' ? first.cwd : undefined, start: isAmount(start) ? start : fallback, usd }
}

const load = async ($: EngineInterface): Promise<Book> => bookOf(await $.fs.read(`${$.plugin.root}/${FILE}`).catch(() => ''))

const save = async ($: EngineInterface, projects: Record<string, unknown>): Promise<void> => {
  await $.fs.write(`${$.plugin.root}/${FILE}`, JSON.stringify({ projects })).catch(() => undefined)
}

const refresh = async ($: EngineInterface): Promise<View> => {
  const book = await load($)

  return update($, view, held => ({ ...(held ?? BLANK), ...keptOf(book, (held ?? BLANK).key) }))
}

const open = async ($: EngineInterface): Promise<void> => {
  if ((await read($, view)).key === '') {
    const root = await $.session.root()
    const listed = await $.process
      .run(['git', '--no-optional-locks', 'worktree', 'list', '--porcelain'], { cwd: root, timeoutMs: GIT_MS })
      .catch(() => undefined)
    const found =
      listed === undefined || listed.exitCode !== 0 || listed.isStdoutTruncated
        ? []
        : listed.stdout
            .split('\n')
            .filter(line => line.startsWith(WORKTREE))
            .map(line => line.slice(WORKTREE.length).replace(/\r$/, ''))
            .filter(path => path !== '')
    const roots = found.length > 0 ? found : [root]
    const main = roots[0] ?? root
    const id = await $.session.id().catch(() => '')
    const name = main.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || main
    await update($, view, held => ({ ...(held ?? BLANK), key: folder(main) || main, name, roots, id }))
  }
  await refresh($)
}

const measure = async ($: EngineInterface): Promise<void> => {
  const { key, id } = await read($, view)
  if (key === '' || id === '') return

  const usd = (await $.session.usage().catch(() => undefined))?.cost?.usd
  if (!isAmount(usd)) return

  const now = await $.clock.now()
  const book = await load($)
  const { sessions, scannedAt } = keptOf(book, key)
  const kept = sessions[id]
  const entry: Entry = { usd: Math.max(kept?.usd ?? 0, usd), at: kept?.at ?? now, size: kept?.size ?? 0, isOurs: true }
  const next = { sessions: { ...sessions, [id]: entry }, scannedAt }
  await save($, { ...book.projects, [key]: next })
  await update($, view, held => ({ ...(held ?? BLANK), ...next }))
}

const failed = async ($: EngineInterface, text: string): Promise<string> => {
  await update($, view, held => ({ ...(held ?? BLANK), fault: true }))

  return text
}

const scan = async ($: EngineInterface): Promise<string> => {
  const { key, name, roots } = await read($, view)
  const config = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)
  const home = config || (await $.env.get('HOME').catch(() => undefined)) || (await $.env.get('USERPROFILE').catch(() => undefined))
  if (!home) return failed($, 'Could not find where sessions are saved.')

  const base = config ? `${config}/projects` : `${home}/.claude/projects`
  const folders = await $.fs.list(base).catch(() => undefined)
  if (folders === undefined) return failed($, `Could not read ${base}.`)

  const now = await $.clock.now()
  const book = await load($)
  const sessions = { ...keptOf(book, key).sessions }
  const names = roots.map(enc)
  const fresh: Saved[] = []
  for (const entry of folders) {
    const lower = entry.name.toLowerCase()
    const isExact = names.includes(lower)
    if (entry.kind === 'file' || !(isExact || names.some(start => lower.startsWith(`${start}-`)))) continue

    const files = await $.fs.list(`${base}/${entry.name}`).catch(() => [])
    for (const file of files) {
      if (file.kind !== 'file' || !file.name.endsWith('.jsonl')) continue
      const id = file.name.slice(0, -'.jsonl'.length)
      const kept = sessions[id]
      if (kept?.size === file.size) continue
      if (file.size <= MAX_READ) fresh.push({ id, path: `${base}/${entry.name}/${file.name}`, size: file.size, mtimeMs: file.mtimeMs, isExact })
      else if (isExact) sessions[id] = { usd: kept?.usd ?? null, at: kept?.at ?? file.mtimeMs, size: file.size, isOurs: true }
    }
  }

  fresh.sort((one, other) => other.mtimeMs - one.mtimeMs)
  let spent = 0
  let count = 0
  let reached = 0
  for (const { id, path, size, mtimeMs } of fresh) {
    if (reached > 0 && spent + size > MAX_SCAN) break
    reached += 1
    spent += size
    const text = await $.fs.read(path).catch(() => undefined)
    if (text === undefined) continue

    count += 1
    const kept = sessions[id]
    const { cwd, start, usd } = savedOf(text, mtimeMs)
    if (cwd !== undefined && isWithin(cwd, roots)) {
      sessions[id] = { usd: usd === undefined ? (kept?.usd ?? null) : Math.max(kept?.usd ?? 0, usd), at: Math.min(kept?.at ?? start, start), size, isOurs: true }
    } else {
      sessions[id] = kept?.isOurs === true ? { ...kept, size } : { usd: null, at: mtimeMs, size, isOurs: false }
    }
  }

  const next = { sessions, scannedAt: now }
  await save($, { ...book.projects, [key]: next })
  const held = await update($, view, old => ({ ...(old ?? BLANK), ...next, fault: false }))
  const waiting = fresh.length - reached

  return [`Read ${plural(count, 'saved session')} of ${name}.`, summary(held), ...(waiting > 0 ? [`${waiting} more to read: run scan again.`] : [])].join('\n')
}

const tell = async ($: EngineInterface): Promise<string> => {
  const held = await refresh($)

  return [
    `${held.name} (${held.roots[0] ?? ''})`,
    summary(held),
    `This session: ${money(tallied(held).mine)}`,
    ...(held.scannedAt === 0 ? ['Saved sessions not read yet: /ledger-widget scan'] : []),
  ].join('\n')
}

const wipe = async ($: EngineInterface): Promise<string> => {
  const { key, name } = await read($, view)
  const book = await load($)
  await save($, Object.fromEntries(Object.entries(book.projects).filter(([other]) => other !== key)))
  await update($, view, held => ({ ...(held ?? BLANK), sessions: {}, scannedAt: 0 }))

  return `Ledger cleared for ${name}.`
}

const wrapped = (sentence: string, inner: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const last = rows.at(-1)

    return last !== undefined && last.length + 1 + word.length <= inner ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
  }, [])

const paired =(left: string, rights: readonly string[], inner: number): { gap: string; right: string } => {
  const right = rights.find(wanted => left.length + 1 + wanted.length <= inner) ?? ''

  return { gap: ' '.repeat(Math.max(0, inner - left.length - right.length)), right }
}

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['ledger-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const isLong = inner >= LONG_COLUMNS
  const held = await read($, view)
  const { isEmpty, total, counted, since, unpriced, long, mine } = tallied(held)
  const count = plural(counted, 'session')
  const top = paired(money(total), [count], inner)
  const spent = `this session ${money(mine)}`
  const from = paired(spent, since === null ? [] : [`since ${dated(since)}`, dated(since)], inner)
  const fault = held.fault && (
    <Text color="yellow" wrap="truncate-end">
      {isLong ? 'Saved sessions could not be read' : 'scan failed'}
    </Text>
  )

  return $.widgets.card({
    beneath,
    width,
    title: 'Ledger',
    note: held.name,
    body: isEmpty ? (
      <Box flexDirection="column">
        {EMPTY.flatMap((sentence, at) => wrapped(sentence, inner).map(row => ({ row, isDim: at > 0 }))).map(({ row, isDim }, at) => (
          <Text key={`empty-${at + 1}`} dimColor={isDim} wrap="truncate-end">
            {row}
          </Text>
        ))}
        {fault}
      </Box>
    ) : (
      <Box flexDirection="column">
        {isLong ? (
          <Text wrap="truncate-end">
            <Text bold>{money(total)}</Text>
            {top.gap}
            <Text dimColor>{top.right}</Text>
          </Text>
        ) : (
          <Text bold wrap="truncate-end">
            {money(total)}
          </Text>
        )}
        {!isLong && (
          <Text wrap="truncate-end">
            {count}
          </Text>
        )}
        {isLong ? (
          <Text wrap="truncate-end">
            {spent}
            {from.gap}
            <Text dimColor>{from.right}</Text>
          </Text>
        ) : (
          <Text wrap="truncate-end">
            now {money(mine)}
          </Text>
        )}
        {unpriced > 0 && (
          <Text dimColor wrap="truncate-end">
            {isLong ? `${unpriced} without a cost record` : `${unpriced} no record`}
          </Text>
        )}
        {long > 0 && (
          <Text dimColor wrap="truncate-end">
            {isLong ? `${long} too long to read` : `${long} too long`}
          </Text>
        )}
        {fault ||
          (held.scannedAt === 0 && (
            <Text dimColor wrap="truncate-end">
              {isLong ? '/ledger-widget scan adds saved ones' : 'scan adds more'}
            </Text>
          ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ledger-widget',
      description: 'Toggle the Ledger card, or scan, show or clear what the project has cost',
      argumentHint: '[on|off|scan|show|clear]',
    })
    if ((await $.store.get('isOn')) === true) {
      await update($, isOn, () => true)
      await open($)
    }

    return next(e)
  })

  on('command.run', { command: 'ledger-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'scan' || arg === 'show' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }

      return { text: await (arg === 'scan' ? scan($) : arg === 'show' ? tell($) : wipe($)) }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await open($)

    return { text: isShown ? 'Ledger on; /widgets places it.' : 'Ledger off.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && (await read($, isOn))) await measure($)

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

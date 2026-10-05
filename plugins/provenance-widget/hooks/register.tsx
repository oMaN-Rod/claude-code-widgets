import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { ProvenanceCommit, ProvenanceMap, ProvenanceProject, ProvenanceSaid } from '../types'
import { fit, folder, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Repo = PluginState['provenance-widget']['repo']
type Run = PluginState['provenance-widget']['run']
type Finding = NonNullable<PluginState['provenance-widget']['finding']>
type Trail = Pick<Run, 'ask' | 'pending'>
type Step = { said: ProvenanceSaid } | { edited: string } | { ran: string; at: number }
type Match = { record: ProvenanceCommit; isMoved: boolean }
type Blamed = { hash: string; lines: number; at: number; summary: string; filename: string }
type Outcome = { deny?: string; isError?: boolean; text?: string }
type Line = { text: string; tone: 'plain' | 'dim' | 'quote' }
type Card = { note?: string; lines: Line[] }
type Block = {
  type?: unknown
  text?: unknown
  name?: unknown
  id?: unknown
  tool_use_id?: unknown
  is_error?: unknown
  content?: unknown
  input?: { file_path?: unknown; command?: unknown } | null
}
type Row = {
  type?: unknown
  isMeta?: unknown
  isSidechain?: unknown
  isCompactSummary?: unknown
  cwd?: unknown
  timestamp?: unknown
  origin?: { kind?: unknown } | null
  message?: { content?: unknown } | null
}

const PANE = 'widgets'
const CARD_COLUMNS = 40
const NOTE_COLUMNS = 30
const USAGE = 'Usage: /provenance-widget [on|off|scan|look [<path>:<line>]|copy|clear]'
const OFF = 'Provenance is off.'
const NO_REPO = 'Not a git repository.'
const NEEDS_GIT = 'Provenance needs git history.'
const NONE_YET = 'No conversations traced yet.'
const EMPTY = "scan reads this repository's saved sessions; commits made from now on are recorded."
const HINT = 'look <path:line>'
const SELECT = 'Select a path:line first, or /provenance-widget look <path>:<line>.'
const NO_RECORD = 'No conversation on record.'
const UNCOMMITTED = 'These lines are not committed yet.'
const UNREAD = 'git blame gave no answer here.'
const PROMPTLESS = 'A session wrote these lines, but its prompt for this file was not found.'
const MOVED = 'Matched by subject and time: the commit was rewritten.'
const NOTHING = 'Nothing to resume: look up a line first.'
const NO_BASE = 'Could not find where sessions are saved.'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const COMMIT_LINE = /^\[[^\]\n]* ([0-9a-f]{7,40})\] (.*)$/gm
const BLAME_HEADER = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?\r?$/
const LOG_ROW = /^([0-9a-f]{40})\t(\d+)\t(.*)$/
const WORKTREE = /^worktree (.+)$/gm
const SPOT = /^(.+):(\d+)(?:-(\d+))?$/
const ROOTED = /^(?:[a-z]:)?[\\/]/i
const HEAD = /^(?:[a-z]:)?\/*/i
const INTERRUPTED = '[Request interrupted by user'
const SESSION_FILE = /^[\w.-]+\.jsonl$/
const ASK_MAX = 240
const QUOTE_ROWS = 4
const SHORT = 7
const JOIN_MS = 120_000
const BLAME_MS = 2000
const GIT_MS = 5000
const LOG_MAX = 20_000
const RECORDS_MAX = 2000
const FILE_MAX = 3_500_000
const BYTES_MAX = 40_000_000
const NOWHERE: Repo = { key: '', name: '', roots: [], isRepo: false, records: 0, traced: 0, total: 0 }
const IDLE: Run = { ask: null, pending: {}, isLooking: false }
const BLANK: ProvenanceProject = { commits: [], sizes: {}, scannedAt: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'provenance-widget', key: 'isOn' } as const, false)
const repo = atom({ plugin: 'provenance-widget', key: 'repo' } as const, NOWHERE)
const run = atom({ plugin: 'provenance-widget', key: 'run' } as const, IDLE)
const finding = atom({ plugin: 'provenance-widget', key: 'finding' } as const, null as Finding | null)

const cut = (text: string, room: number): string => (text.length <= room ? text : `${text.slice(0, Math.max(0, room - 1))}…`)

const tail = (text: string, room: number): string => (text.length <= room ? text : `…${text.slice(text.length - Math.max(0, room - 1))}`)

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + word.length <= room) return [...lines.slice(0, -1), `${last} ${word}`]

    return [...lines, ...(word.match(new RegExp(`.{1,${room}}`, 'g')) ?? [''])]
  }, [])

const quoted = (ask: string, room: number): string[] => {
  const rows = wrapped(`"${ask}"`, room)
  if (rows.length <= QUOTE_ROWS) return rows

  return [...rows.slice(0, QUOTE_ROWS - 1), `${(rows[QUOTE_ROWS - 1] ?? '').slice(0, room - 2).replace(/[ …]+$/, '')}…"`]
}

const day = (ms: number): string => {
  const date = new Date(ms)

  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

const brief = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= ASK_MAX) return flat

  const head = flat.slice(0, ASK_MAX - 1)
  const at = head.lastIndexOf(' ')

  return `${at > 0 ? head.slice(0, at) : head}…`
}

const tidy = (path: string): string => {
  const flat = path.replaceAll('\\', '/')
  const head = HEAD.exec(flat)?.[0] ?? ''
  const kept = flat
    .slice(head.length)
    .split('/')
    .reduce<string[]>((held, part) => (part === '' || part === '.' ? held : part === '..' ? held.slice(0, -1) : [...held, part]), [])

  return `${head}${kept.join('/')}`
}

const absolute = (path: string, cwd: string): string => tidy(ROOTED.test(path) ? path : `${cwd}/${path}`)

const rootOf = (roots: readonly string[], path: string): string | undefined => {
  const key = folder(path)

  return roots.filter(root => key === root || key.startsWith(`${root}/`)).sort((a, b) => b.length - a.length)[0]
}

const shown = (roots: readonly string[], path: string): string => {
  const root = rootOf(roots, path)

  return root === undefined ? path : path.slice(root.length + 1)
}

const ranged = ({ first, last }: Pick<Finding, 'first' | 'last'>): string => (first === last ? `${first}` : `${first}-${last}`)

const enc = (path: string): string => path.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

const newlines = (text: string): number => text.split('\n').length - 1

const stepped = (trail: Trail, step: Step, session: string, roots: readonly string[]): { trail: Trail; made: ProvenanceCommit[] } => {
  if ('said' in step) return { trail: { ...trail, ask: { text: brief(step.said.text), at: step.said.at } }, made: [] }
  if ('edited' in step) {
    const key = folder(step.edited)

    return { trail: trail.ask === null || trail.pending[key] !== undefined ? trail : { ...trail, pending: { ...trail.pending, [key]: trail.ask } }, made: [] }
  }

  const found = [...step.ran.matchAll(COMMIT_LINE)]
  if (found.length === 0) return { trail, made: [] }

  const asks = new Map<string, { text: string; at: number; files: string[] }>()
  for (const [path, ask] of Object.entries(trail.pending)) {
    const root = rootOf(roots, path)
    if (root === undefined || path === root) continue

    const mark = `${ask.at} ${ask.text}`
    const held = asks.get(mark) ?? { text: ask.text, at: ask.at, files: [] }
    asks.set(mark, { ...held, files: [...held.files, path.slice(root.length + 1).toLowerCase()] })
  }
  const carried = [...asks.values()].sort((a, b) => a.at - b.at)

  return {
    trail: { ...trail, pending: {} },
    made: found.map(([, short = '', subject = '']) => ({ short, subject: subject.trim(), at: step.at, session, asks: carried })),
  }
}

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return (content as Block[])
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

const when = (stamp: unknown, fallback: number): number => {
  const at = typeof stamp === 'number' ? stamp : typeof stamp === 'string' ? Date.parse(stamp) : Number.NaN

  return Number.isFinite(at) ? at : fallback
}

const rowsOf = (text: string): Row[] =>
  text.split('\n').flatMap(line => {
    try {
      const row: unknown = JSON.parse(line)

      return typeof row === 'object' && row !== null ? [row as Row] : []
    } catch {
      return []
    }
  })

const reduced = (text: string, session: string, mtimeMs: number, roots: readonly string[]): ProvenanceCommit[] | undefined => {
  const rows = rowsOf(text)
  const cwd = rows.find(row => typeof row.cwd === 'string')?.cwd
  if (typeof cwd !== 'string' || rootOf(roots, tidy(cwd)) === undefined) return undefined

  const gits = new Set<string>()
  const made: ProvenanceCommit[] = []
  let trail: Trail = { ask: null, pending: {} }
  const take = (step: Step): void => {
    const next = stepped(trail, step, session, roots)
    trail = next.trail
    made.push(...next.made)
  }

  for (const row of rows) {
    const content = row.message?.content
    const blocks = Array.isArray(content) ? (content as Block[]).filter(block => typeof block === 'object' && block !== null) : []
    const at = when(row.timestamp, mtimeMs)
    if (row.type === 'assistant') {
      for (const block of blocks.filter(used => used.type === 'tool_use')) {
        const isEdit = block.name === 'Edit' || block.name === 'Write'
        const isShell = block.name === 'Bash' || block.name === 'PowerShell'
        if (isEdit && typeof block.input?.file_path === 'string') take({ edited: absolute(block.input.file_path, typeof row.cwd === 'string' ? row.cwd : cwd) })
        if (isShell && typeof block.id === 'string' && typeof block.input?.command === 'string' && block.input.command.includes('git')) gits.add(block.id)
      }
    }
    if (row.type !== 'user') continue

    const results = blocks.filter(block => block.type === 'tool_result')
    for (const block of results) {
      if (block.is_error !== true && typeof block.tool_use_id === 'string' && gits.has(block.tool_use_id)) take({ ran: textOf(block.content), at })
    }
    const said = brief(textOf(content))
    const isHuman = row.origin?.kind === undefined || row.origin.kind === 'human'
    const isTyped = row.isMeta !== true && row.isSidechain !== true && row.isCompactSummary !== true && isHuman
    if (results.length === 0 && isTyped && said !== '' && !said.startsWith('<') && !said.startsWith(INTERRUPTED)) take({ said: { text: said, at } })
  }

  return made
}

const joiner = (commits: readonly ProvenanceCommit[]): ((hash: string, at: number, summary: string) => Match | undefined) => {
  const heads = new Map<string, ProvenanceCommit[]>()
  const subjects = new Map<string, ProvenanceCommit[]>()
  for (const commit of commits) {
    heads.set(commit.short.slice(0, SHORT), [...(heads.get(commit.short.slice(0, SHORT)) ?? []), commit])
    subjects.set(commit.subject, [...(subjects.get(commit.subject) ?? []), commit])
  }

  return (hash, at, summary) => {
    const exact = heads.get(hash.slice(0, SHORT))?.find(commit => hash.startsWith(commit.short))
    if (exact !== undefined) return { record: exact, isMoved: false }

    const moved = summary === '' ? undefined : subjects.get(summary)?.find(commit => Math.abs(commit.at - at) <= JOIN_MS)

    return moved === undefined ? undefined : { record: moved, isMoved: true }
  }
}

const merged = (held: readonly ProvenanceCommit[], made: readonly ProvenanceCommit[]): { commits: ProvenanceCommit[]; fresh: number } => {
  const seen = new Set(held.map(commit => `${commit.session} ${commit.short}`))
  const fresh = made.filter(commit => {
    const mark = `${commit.session} ${commit.short}`
    if (seen.has(mark)) return false
    seen.add(mark)

    return true
  })

  return { commits: [...held, ...fresh].sort((a, b) => a.at - b.at).slice(-RECORDS_MAX), fresh: fresh.length }
}

const isCommit = (commit: ProvenanceCommit | null): commit is ProvenanceCommit =>
  typeof commit === 'object' &&
  commit !== null &&
  typeof commit.short === 'string' &&
  typeof commit.subject === 'string' &&
  typeof commit.session === 'string' &&
  typeof commit.at === 'number' &&
  Array.isArray(commit.asks) &&
  commit.asks.every(ask => typeof ask?.text === 'string' && typeof ask.at === 'number' && Array.isArray(ask.files))

const sane = (text: string): ProvenanceMap => {
  try {
    const parsed = JSON.parse(text) as Partial<ProvenanceMap> | null
    const projects = parsed?.projects
    if (typeof projects !== 'object' || projects === null || Array.isArray(projects)) return { projects: {} }

    return {
      projects: Object.fromEntries(
        Object.entries(projects)
          .filter(([, project]) => typeof project === 'object' && project !== null && Array.isArray(project.commits))
          .map(([key, project]) => [
            key,
            {
              commits: project.commits.filter(isCommit),
              sizes: typeof project.sizes === 'object' && project.sizes !== null ? project.sizes : {},
              scannedAt: typeof project.scannedAt === 'number' ? project.scannedAt : 0,
            },
          ]),
      ),
    }
  } catch {
    return { projects: {} }
  }
}

const blamed = (porcelain: string): Blamed[] => {
  const held = new Map<string, Blamed>()
  let current: Blamed | undefined
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('\t')) continue

    const hash = BLAME_HEADER.exec(line)?.[1]
    if (hash !== undefined) {
      current = held.get(hash) ?? { hash, lines: 0, at: 0, summary: '', filename: '' }
      current.lines += 1
      held.set(hash, current)
    } else if (current !== undefined && line.startsWith('author-time ')) current.at = Number(line.slice(12)) * 1000
    else if (current !== undefined && line.startsWith('summary ')) current.summary = line.slice(8).trim()
    else if (current !== undefined && line.startsWith('filename ') && current.filename === '') current.filename = line.slice(9).trim()
  }

  return [...held.values()]
}

const resting = ({ records, traced, total }: Repo, isNarrow: boolean): string =>
  total === 0 ? `${plural(records, 'commit')} recorded.` : `${traced} of ${total} ${isNarrow ? 'commits traced.' : 'commits trace to a conversation.'}`

const drawn = (place: Repo, found: Finding | null, width: number): Card => {
  const inner = width - 4
  const isNarrow = width < NOTE_COLUMNS
  const own = isNarrow ? '' : '/provenance-widget '
  const say = (text: string, tone: Line['tone'] = 'plain'): Line[] => wrapped(text, inner).map(row => ({ text: row, tone }))
  const noted = (note: string, lines: Line[]): Card => (isNarrow ? { lines } : { note, lines })

  if (found === null) {
    if (place.key !== '' && !place.isRepo) return { lines: [...say(NO_REPO), ...say(NEEDS_GIT, 'dim')] }
    if (place.records === 0) return { lines: [...say(NONE_YET), ...say(`${own}${EMPTY}`, 'dim')] }

    const rest = [...say(resting(place, isNarrow)), ...say(isNarrow ? HINT : `Shown when Claude edits lines, or ${own}${HINT}`, 'dim')]

    return place.total === 0 ? { lines: rest } : noted(`${place.traced} of ${place.total}`, rest)
  }

  const spot: Line = { text: tail(`${shown(place.roots, found.path)}:${ranged(found)}`, inner), tone: 'plain' }
  if (found.kind === 'unread') return noted('no blame', [spot, ...say(UNREAD)])
  if (found.kind === 'uncommitted') return noted('no record', [spot, ...say(UNCOMMITTED)])

  const share = isNarrow ? `${found.lines}/${found.of}` : `${found.lines} of ${found.of} lines`
  const commit: Line = { text: cut(`${found.hash.slice(0, SHORT)} · ${share}`, inner), tone: 'dim' }
  if (found.kind === 'untraced') {
    return noted('no record', [spot, ...say(NO_RECORD), commit, { text: cut(`${day(found.commitAt)} · ${found.subject}`, inner), tone: 'dim' }])
  }

  return noted(day(found.askAt), [
    spot,
    ...(found.kind === 'promptless'
      ? say(PROMPTLESS)
      : [...say(isNarrow ? 'after you said:' : 'written after you said:'), ...quoted(found.ask, inner).map(text => ({ text, tone: 'quote' as const }))]),
    commit,
    ...(isNarrow ? say(day(found.askAt), 'dim') : []),
    ...say(`${own}copy resumes it`, 'dim'),
  ])
}

const told = (place: Repo, found: Finding): string => {
  const spot = `${shown(place.roots, found.path)}:${ranged(found)}`
  if (found.kind === 'unread') return `git blame gave no answer for ${spot}.`
  if (found.kind === 'uncommitted') return `${spot} is not committed yet.`

  const resume = `Resume: claude --resume ${found.session}`

  return [
    `${spot} · commit ${found.hash.slice(0, SHORT)} (${found.lines} of ${found.of} lines), ${day(found.commitAt)}`,
    ...(found.kind === 'traced' ? [`You said, on ${day(found.askAt)}: "${found.ask}"`, resume] : []),
    ...(found.kind === 'promptless' ? [`Session ${found.session} wrote these lines; its prompt for this file was not found.`, resume] : []),
    ...(found.kind === 'untraced' ? [`${NO_RECORD} Commit: ${found.subject}`] : []),
    ...(found.isMoved ? [MOVED] : []),
  ].join('\n')
}

const mapOf = async ($: EngineInterface): Promise<ProvenanceMap> => sane(await $.fs.read(`${$.plugin.root}/provenance.json`).catch(() => ''))

const amend = async (
  $: EngineInterface,
  key: string,
  change: (held: ProvenanceProject) => ProvenanceProject | null,
): Promise<{ before: ProvenanceProject; after: ProvenanceProject }> => {
  const { projects } = await mapOf($)
  const before = projects[key] ?? BLANK
  const after = change(before)
  if (after === null && projects[key] === undefined) return { before, after: BLANK }

  const { [key]: _gone, ...others } = projects
  await $.fs.write(`${$.plugin.root}/provenance.json`, JSON.stringify({ projects: after === null ? others : { ...others, [key]: after } }))

  return { before, after: after ?? BLANK }
}

const tally = async ($: EngineInterface, place: Repo, commits: readonly ProvenanceCommit[]): Promise<Repo> => {
  const log = place.isRepo
    ? await $.process
        .run(['git', '--no-optional-locks', 'log', '--format=%H%x09%at%x09%s', `--max-count=${LOG_MAX}`, 'HEAD'], { cwd: place.roots[0], timeoutMs: GIT_MS })
        .catch(() => undefined)
    : undefined
  const printed = log?.exitCode === 0 ? log.stdout.split('\n') : []
  const rows = (log?.isStdoutTruncated === true ? printed.slice(0, -1) : printed).flatMap(line => {
    const [, hash, seconds, subject] = LOG_ROW.exec(line.replace(/\r$/, '')) ?? []

    return hash === undefined ? [] : [{ hash, at: Number(seconds) * 1000, subject: subject ?? '' }]
  })
  const find = joiner(commits)
  const counted = { ...place, records: commits.length, total: rows.length, traced: rows.filter(row => find(row.hash, row.at, row.subject) !== undefined).length }
  if (await read($, isOn)) await update($, repo, () => counted)

  return counted
}

const locate = async ($: EngineInterface): Promise<Repo> => {
  const top = await $.session.root()
  const listed = await $.process.run(['git', '--no-optional-locks', 'worktree', 'list', '--porcelain'], { cwd: top, timeoutMs: GIT_MS }).catch(() => undefined)
  const paths = listed?.exitCode === 0 ? [...listed.stdout.matchAll(WORKTREE)].map(([, path = '']) => tidy(path.trim())) : []
  const main = paths[0] ?? tidy(top)
  const place = { ...NOWHERE, key: folder(main), name: main.split('/').at(-1) ?? '', roots: paths.map(folder), isRepo: paths.length > 0 }

  return tally($, place, place.isRepo ? ((await mapOf($)).projects[place.key]?.commits ?? []) : [])
}

const settled = async ($: EngineInterface): Promise<Repo> => {
  const place = await read($, repo)

  return place.isRepo ? place : locate($)
}

const trace = async ($: EngineInterface, place: Repo, path: string, first: number, last: number): Promise<Finding> => {
  const bare: Finding = { kind: 'unread', path, first, last, hash: '', lines: 0, of: 0, commitAt: 0, subject: '', session: '', ask: '', askAt: 0, isMoved: false }
  const ran = await $.process
    .run(['git', '--no-optional-locks', 'blame', '--porcelain', '-L', `${first},${last}`, '--', path], { cwd: rootOf(place.roots, path) ?? place.key, timeoutMs: BLAME_MS })
    .catch(() => undefined)
  if (ran === undefined || ran.exitCode !== 0) return bare

  const all = blamed(ran.stdout)
  const of = all.reduce((sum, commit) => sum + commit.lines, 0)
  const owned = all.filter(commit => !/^0+$/.test(commit.hash))
  if (of === 0) return bare
  if (owned.length === 0) return { ...bare, kind: 'uncommitted', of }

  const find = joiner((await mapOf($)).projects[place.key]?.commits ?? [])
  const [top] = owned
    .map(commit => ({ ...commit, match: find(commit.hash, commit.at, commit.summary) }))
    .sort((a, b) => Number(b.match !== undefined) - Number(a.match !== undefined) || b.lines - a.lines || b.at - a.at)
  if (top === undefined) return bare

  const seen = { ...bare, of, hash: top.hash, lines: top.lines, commitAt: top.at, subject: top.summary }
  if (top.match === undefined) return { ...seen, kind: 'untraced' }

  const { record, isMoved } = top.match
  const ask = record.asks.find(held => held.files.includes(top.filename.toLowerCase()))

  return { ...seen, kind: ask === undefined ? 'promptless' : 'traced', session: record.session, ask: ask?.text ?? '', askAt: ask?.at ?? record.at, isMoved }
}

const lookup = async ($: EngineInterface, place: Repo, path: string, first: number, last: number): Promise<Finding> => {
  await update($, run, kept => ({ ...(kept ?? IDLE), isLooking: true }))
  try {
    const found = await trace($, place, path, first, last)
    if (await read($, isOn)) await update($, finding, () => found)

    return found
  } finally {
    if (await read($, isOn)) await update($, run, kept => ({ ...(kept ?? IDLE), isLooking: false }))
  }
}

// An Edit with replace_all is looked up at its first occurrence only: one card, one blame.
const glance = async ($: EngineInterface, file: string, old: string): Promise<void> => {
  const place = await read($, repo)
  if (!place.isRepo || place.records === 0 || old === '' || (await read($, run)).isLooking) return

  const path = absolute(file, await $.session.cwd())
  if (rootOf(place.roots, path) === undefined) return

  const text = (await $.fs.read(file).catch(() => undefined))?.replaceAll('\r\n', '\n')
  const lines = old.replaceAll('\r\n', '\n')
  const at = text?.indexOf(lines) ?? -1
  if (text === undefined || at < 0) return

  const first = 1 + newlines(text.slice(0, at))
  const held = await read($, finding)
  if (held !== null && folder(held.path) === folder(path) && held.first === first) return

  await lookup($, place, path, first, first + newlines(lines.replace(/\n$/, '')))
}

const hold = async ($: EngineInterface, step: Step): Promise<void> => {
  if (!(await read($, isOn))) return

  await update($, run, kept => ({ ...(kept ?? IDLE), ...stepped(kept ?? IDLE, step, '', []).trail }))
}

const enter = async ($: EngineInterface, text: string): Promise<void> => {
  if (text.match(COMMIT_LINE) === null) return

  const place = await settled($)
  if (!place.isRepo || !(await read($, isOn))) return

  const { trail, made } = stepped(await read($, run), { ran: text, at: await $.clock.now() }, await $.session.id(), place.roots)
  await update($, run, kept => ({ ...(kept ?? IDLE), pending: trail.pending }))
  const { after } = await amend($, place.key, held => ({ ...held, commits: merged(held.commits, made).commits }))
  await tally($, place, after.commits)
}

const scan = async ($: EngineInterface, place: Repo): Promise<string> => {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = config ? undefined : (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const base = config || (home ? `${home}/.claude` : undefined)
  if (base === undefined) return NO_BASE

  const folders = await $.fs.list(`${base}/projects`).catch(() => undefined)
  if (folders === undefined) return `Could not read ${base}.`

  const names = place.roots.map(enc)
  const mine = folders.filter(entry => entry.kind === 'dir' && names.some(name => entry.name.toLowerCase() === name || entry.name.toLowerCase().startsWith(`${name}-`)))
  const listed = await Promise.all(
    mine.map(async ({ name }) =>
      (await $.fs.list(`${base}/projects/${name}`).catch(() => []))
        .filter(entry => entry.kind === 'file' && SESSION_FILE.test(entry.name))
        .map(entry => ({ id: entry.name.slice(0, -'.jsonl'.length), path: `${base}/projects/${name}/${entry.name}`, size: entry.size, mtimeMs: entry.mtimeMs })),
    ),
  )
  const kept = (await mapOf($)).projects[place.key]?.sizes ?? {}
  const changed = listed.flat().filter(file => kept[file.id] !== file.size)
  const queue = changed.filter(file => file.size <= FILE_MAX).sort((a, b) => b.mtimeMs - a.mtimeMs)
  const long = changed.length - queue.length
  const sizes: Record<string, number> = {}
  const made: ProvenanceCommit[] = []
  let spent = 0
  let taken = 0
  let sessions = 0
  for (const file of queue) {
    if (spent >= BYTES_MAX) break

    spent += file.size
    taken += 1
    const text = await $.fs.read(file.path).catch(() => undefined)
    if (text === undefined) continue

    sizes[file.id] = file.size
    const commits = reduced(text, file.id, file.mtimeMs, place.roots)
    if (commits === undefined) continue

    sessions += 1
    made.push(...commits)
  }
  if (!(await read($, isOn))) return OFF

  const now = await $.clock.now()
  let fresh = 0
  const { after } = await amend($, place.key, held => {
    const next = merged(held.commits, made)
    fresh = next.fresh

    return { commits: next.commits, sizes: { ...held.sizes, ...sizes }, scannedAt: now }
  })
  const { traced, total } = await tally($, place, after.commits)
  const waiting = queue.length - taken

  return [
    `Read ${plural(sessions, 'saved session')} of ${place.name}: ${plural(fresh, 'commit')} recorded. ${traced} of ${total} commits trace to a conversation.${long > 0 ? ` ${long} too long to read.` : ''}`,
    ...(waiting > 0 ? [`${waiting} more to read: run scan again.`] : []),
  ].join('\n')
}

const look = async ($: EngineInterface, place: Repo, typed: string): Promise<string> => {
  const [, given = '', from = '', to = from] = SPOT.exec(typed === '' ? ((await $.ui.selection())?.text.trim() ?? '') : typed) ?? []
  const first = Number(from)
  const last = Number(to)
  if (given.trim() === '' || first < 1 || last < first) return SELECT

  const path = absolute(given.trim(), await $.session.cwd())
  if (rootOf(place.roots, path) === undefined) return `${given.trim()} is outside this repository.`

  return told(place, await lookup($, place, path, first, last))
}

const copy = async ($: EngineInterface): Promise<string> => {
  const found = await read($, finding)
  if (found === null || (found.kind !== 'traced' && found.kind !== 'promptless')) return NOTHING

  const text = `claude --resume ${found.session}`
  const isCopied = await $.ui.copy({ text }).then(
    copied => copied.isCopied,
    () => false,
  )

  return isCopied ? `Copied: ${text}` : `Could not copy. Run: ${text}`
}

const clear = async ($: EngineInterface): Promise<string> => {
  const place = await settled($)
  const { before } = await amend($, place.key, () => null)
  await update($, finding, () => null)
  await tally($, place, [])

  return `Provenance cleared: ${plural(before.commits.length, 'commit')} forgotten for ${place.name}.`
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

  const width = fit((await $.state.get(widths)).value?.['provenance-widget'] ?? CARD_COLUMNS, columns)
  const { note: aside, lines } = drawn(await read($, repo), await read($, finding), width)

  return $.widgets.card({
    beneath,
    width,
    title: 'Provenance',
    note: aside,
    body: (
      <Box key="provenance" flexDirection="column">
        {lines.map((line, index) => (
          <Text key={`line-${index}`} color={line.tone === 'quote' ? 'yellow' : undefined} dimColor={line.tone === 'dim'} wrap="truncate-end">
            {line.text}
          </Text>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'provenance-widget',
      description: 'Toggle the Provenance card, scan saved sessions, or look up the conversation behind a line',
      argumentHint: '[on|off|scan|look [<path>:<line>]|copy|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if (await read($, isOn)) {
      await update($, run, kept => ({ ...(kept ?? IDLE), isLooking: false }))
      await locate($)
    }

    return next(e)
  })

  on('command.run', { command: 'provenance-widget' }, async ($, e) => {
    const typed = e.args.trim()
    const [first = ''] = typed.split(/\s+/)
    const verb = first.toLowerCase()
    const rest = typed.slice(first.length).trim()

    if (verb === 'scan' || verb === 'look' || verb === 'copy' || verb === 'clear') {
      if (verb !== 'look' && rest !== '') return { text: USAGE }
      if (!(await read($, isOn))) return { text: OFF }
      if (verb === 'copy') return { text: await copy($) }
      if (verb === 'clear') return { text: await clear($) }

      const place = await settled($)
      if (!place.isRepo) return { text: NO_REPO }

      return { text: verb === 'scan' ? await scan($, place) : await look($, place, rest) }
    }

    const arg = typed.toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await locate($)
    else {
      await update($, run, () => IDLE)
      await update($, finding, () => null)
    }

    return { text: isShown ? 'Provenance on; /widgets places it.' : 'Provenance off.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const isTyped = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (isTyped && (await read($, isOn))) await hold($, { said: { text: e.text, at: await $.clock.now() } }).catch(() => undefined)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const given = e as { tool: string; file_path?: unknown; old_string?: unknown; command?: unknown }
    const file = (given.tool === 'Edit' || given.tool === 'Write') && typeof given.file_path === 'string' ? given.file_path : undefined
    const command = (given.tool === 'Bash' || given.tool === 'PowerShell') && typeof given.command === 'string' ? given.command : undefined
    if (file !== undefined && given.tool === 'Edit' && typeof given.old_string === 'string') await glance($, file, given.old_string).catch(() => undefined)

    const ran = await next(e)
    const { deny, isError, text }: Outcome = ran
    const isDone = deny === undefined && isError !== true
    if (isDone && file !== undefined) await hold($, { edited: absolute(file, await $.session.cwd()) }).catch(() => undefined)
    if (isDone && command?.includes('git') === true && typeof text === 'string') await enter($, text).catch(() => undefined)

    return ran
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

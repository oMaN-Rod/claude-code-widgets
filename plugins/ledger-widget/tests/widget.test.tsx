import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type Ran = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
type Meta = { size: number; mtimeMs: number }
type Entry = { usd: number | null; at: number; size: number; isOurs: boolean }
type Kept = { sessions: Record<string, Entry>; scannedAt: number }
type Setup = { store?: Record<string, unknown>; root?: string; git?: Ran | 'reject'; env?: Record<string, string>; hasNoId?: boolean }
type Desk = {
  world: Ground
  calls: string[]
  runs: { argv: string[]; cwd: unknown; timeoutMs: unknown }[]
  meta: Map<string, Meta>
  dirs: Set<string>
  env: Record<string, string>
  usage: { cost: unknown; isRejecting: boolean }
}
type Drawn = { note: string; width: unknown; lines: string[]; colors: unknown[]; texts: string[] }

const NAME = 'ledger-widget'
const USAGE = 'Usage: /ledger-widget [on|off|scan|show|clear]'
const OFF = 'Ledger is off.'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const HOME = '/home/me'
const BASE = `${HOME}/.claude/projects`
const EMPTY = ['Nothing counted yet.', "Each turn's cost is added here.", '/ledger-widget scan adds this', "project's saved sessions."]
const HINT = '/ledger-widget scan adds saved ones'
const FAULT = 'Saved sessions could not be read'
const WORKTREES ='worktree /work/project\nHEAD 3f2a1c9e\nbranch refs/heads/main\n\nworktree /work/project-fix\nHEAD 91b0c2aa\nbranch refs/heads/fix\n\n'

const PROBE: Plugin = {
  name: 'probe',
  register(on) {
    on('fs.read', async ($, e, next) => {
      $.ui.toast(`fs.read ${e.path}`)

      return next(e)
    })
  },
}
const WITH = { plugins: [LAYOUT, PROBE] }

const noon = (year: number, month: number, date: number): number => new Date(year, month - 1, date, 12).getTime()

const NOW = noon(2026, 10, 4)

const flat = (path: string): string => path.replaceAll('\\', '/').replace(/^[a-z]:/i, '')

const ran = (exitCode: number, stdout = '', isStdoutTruncated = false): Ran => ({ exitCode, stdout, stderr: '', isStdoutTruncated, isStderrTruncated: false })

const cost = (totalCostUSD: unknown): string =>
  JSON.stringify({
    type: 'cost-state',
    sessionId: 'd106b9be-9de0-4955-8d07-ac0f68bc9eb1',
    totalCostUSD,
    totalAPIDuration: 27254,
    totalToolDuration: 4106,
    modelUsage: { 'claude-opus-5-5': { inputTokens: 16, outputTokens: 2570, costUSD: totalCostUSD } },
    hasUnknownModelCost: false,
  })

const saved = (cwd: string | null, startedAt: number, records: readonly string[] = []): string =>
  [
    JSON.stringify({ type: 'mode', mode: 'normal', sessionId: 'd106b9be-9de0-4955-8d07-ac0f68bc9eb1' }),
    JSON.stringify({
      parentUuid: null,
      isSidechain: false,
      type: 'user',
      message: { role: 'user', content: 'Why does "type":"cost-state" show a "cwd" of /work/other?' },
      ...(cwd === null ? {} : { cwd }),
      timestamp: new Date(startedAt).toISOString(),
    }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] }, ...(cwd === null ? {} : { cwd }), timestamp: new Date(startedAt + 9000).toISOString() }),
    ...records,
    JSON.stringify({ type: 'permission-mode', permissionMode: 'auto' }),
    '',
  ].join('\n')

const open = async ($: Engine, on: On, setup: Setup = {}): Promise<Desk> => {
  const listed = (e: { path: string }): object[] => {
    desk.calls.push(`fs.list ${flat(e.path)}`)
    const base = `${flat(e.path)}/`
    const seen = new Map<string, object>()
    for (const [path, { size, mtimeMs }] of desk.meta) {
      if (!path.startsWith(base)) continue
      const [head = '', ...rest] = path.slice(base.length).split('/')
      seen.set(head, rest.length > 0 ? { name: head, kind: 'dir', size: 0, mtimeMs: 0, isLink: false } : { name: head, kind: 'file', size, mtimeMs, isLink: false })
    }
    if (seen.size === 0 && !desk.dirs.has(flat(e.path))) throw new Error(`ENOENT: no such file or directory, scandir '${e.path}'`)

    return [...seen.values()]
  }
  const world = ground(on, {
    now: NOW,
    store: setup.store,
    answers: {
      'session.root': () => {
        desk.calls.push('session.root')

        return setup.root ?? '/work/project'
      },
      'session.id': () => {
        desk.calls.push('session.id')
        if (setup.hasNoId === true) throw new Error('no session yet')

        return 'session-1'
      },
      'session.usage': () => {
        desk.calls.push('session.usage')
        if (desk.usage.isRejecting) throw new Error('usage is not available')

        return { startedAt: NOW, context: { window: 200_000, tokens: 46_000, percent: 23 }, rateLimits: [], ...(desk.usage.cost === undefined ? {} : { cost: desk.usage.cost }) }
      },
      'process.run': (e: { argv: string[]; init?: { cwd?: unknown; timeoutMs?: unknown } }) => {
        desk.calls.push('process.run')
        desk.runs.push({ argv: [...e.argv], cwd: e.init?.cwd, timeoutMs: e.init?.timeoutMs })
        if (setup.git === 'reject') throw new Error('git timed out after 3000 ms')

        return setup.git ?? ran(1)
      },
      'env.get': (e: { name: string }) => {
        desk.calls.push(`env.get ${e.name}`)

        return desk.env[e.name]
      },
      'fs.list': listed,
    },
  })
  const desk: Desk = { world, calls: [], runs: [], meta: new Map(), dirs: new Set(), env: setup.env ?? { HOME }, usage: { cost: { usd: 0.38 }, isRejecting: false } }
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))

  await session($)
  await $.command.run(run('place', 'side'))

  return desk
}

const cmd = async ($: Engine, args = ''): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const put = (desk: Desk, path: string, text: string, meta: Partial<Meta> = {}): void => {
  desk.world.files.set(flat(path), text)
  desk.meta.set(flat(path), { size: meta.size ?? text.length, mtimeMs: meta.mtimeMs ?? NOW - DAY })
}

const ended = ($: Engine, extra: Record<string, unknown> = {}): Promise<unknown> =>
  $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId: 'turn-1', reason: 'answer', ...extra } as never)

const measured = async ($: Engine, desk: Desk, usd: number): Promise<void> => {
  desk.usage.cost = { usd }
  await turn($)
}

const reads = (desk: Desk): string[] => desk.world.toasts.filter(toast => toast.startsWith('fs.read ')).map(toast => flat(toast.slice('fs.read '.length)))

const sessionReads = (desk: Desk): string[] => reads(desk).filter(path => path.endsWith('.jsonl')).map(path => path.slice(BASE.length + 1))

const ledgerPath = (desk: Desk): string => reads(desk).find(path => path.endsWith('/ledger.json')) ?? ''

const ledgerText = (desk: Desk): string => desk.world.files.get(ledgerPath(desk)) ?? ''

const ledger = (desk: Desk, key = '/work/project'): Kept | undefined => (JSON.parse(ledgerText(desk) || '{"projects":{}}') as { projects: Record<string, Kept> }).projects[key]

const keep = (desk: Desk, projects: Record<string, unknown>): void => void desk.world.files.set(ledgerPath(desk), JSON.stringify({ projects }))

const drawn = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const card = await ui.find({ key: 'card' })
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const all = await ui.findAll({ type: 'Text' })
  const rows = all.filter(row => row.props.wrap === 'truncate-end')
  await ui.unmount()

  return card === undefined ? undefined : { note, width: card.props.width, lines: rows.map(row => row.text), colors: rows.map(row => row.props.color), texts: all.map(row => row.text) }
}

test('A1: on with no record, the card says nothing is counted yet and what will be', WITH, async ($, on) => {
  const desk = await open($, on)

  expect(await cmd($, 'on')).toBe('Ledger on; /widgets places it.')
  const card = await drawn($)
  expect(card?.note).toBe('project')
  expect(card?.lines).toEqual(['Nothing counted yet.', "Each turn's cost is added here.", '/ledger-widget scan adds this', "project's saved sessions."])
  expect((await drawn($, 20))?.lines).toEqual(['Nothing counted', 'yet.', "Each turn's cost", 'is added here.', '/ledger-widget', 'scan adds this', "project's saved", 'sessions.'])
  expect(desk.runs).toEqual([{ argv: ['git', '--no-optional-locks', 'worktree', 'list', '--porcelain'], cwd: '/work/project', timeoutMs: 3000 }])
  expect(reads(desk)).toHaveLength(1)
})

test('A1: a switch restored from the store gives the same card after one git run and one read', WITH, async ($, on) => {
  const desk = await open($, on, { store: { isOn: true } })

  expect(desk.runs).toHaveLength(1)
  expect(reads(desk)).toEqual([ledgerPath(desk)])
  const card = await drawn($)
  expect(card?.note).toBe('project')
  expect(card?.lines).toEqual(EMPTY)
  expect(card?.lines).not.toContain(FAULT)
  expect(desk.world.writes).toEqual([])
})

test('A2: a turn end adds the session cost, keeps the highest figure and passes the turn through', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')

  expect(await ended($)).toEqual({ text: 'Done.' })
  const card = await drawn($)
  expect(card?.lines).toEqual([
    `$0.38${' '.repeat(22)}1 session`,
    'this session $0.38  since 4 Oct 2026',
    HINT,
  ])
  expect(ledger(desk)).toEqual({ sessions: { 'session-1': { usd: 0.38, at: NOW, size: 0, isOurs: true } }, scannedAt: 0 })

  await desk.world.clock.advance(HOUR)
  await measured($, desk, 0.5)
  expect((await drawn($))?.lines[0]).toMatch(/^\$0\.50 +1 session$/)
  await measured($, desk, 0.1)
  expect((await drawn($))?.lines[0]).toMatch(/^\$0\.50 +1 session$/)
  expect(ledger(desk)?.sessions['session-1']).toEqual({ usd: 0.5, at: NOW, size: 0, isOurs: true })
})

test('A3: a subagent turn and a session with no cost reading write nothing; aborted and failed turns are measured', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')
  const before = desk.world.writes.length

  await ended($, { agentId: 'agent-7' })
  expect(desk.calls).not.toContain('session.usage')
  desk.usage.isRejecting = true
  await ended($)
  desk.usage.isRejecting = false
  for (const reading of [undefined, {}, { usd: Number.NaN }, { usd: -1 }, { usd: '0.38' }]) {
    desk.usage.cost = reading
    await ended($)
  }
  expect(desk.world.writes).toHaveLength(before)
  expect((await drawn($))?.lines).toEqual(EMPTY)

  desk.usage.cost = { usd: 0.2 }
  await ended($, { isAborted: true, reason: 'aborted' })
  expect((await drawn($))?.lines[0]).toMatch(/^\$0\.20 +1 session$/)
  desk.usage.cost = { usd: 0.3 }
  await ended($, { reason: 'error' })
  expect((await drawn($))?.lines[0]).toMatch(/^\$0\.30 +1 session$/)
})

test('A3: a session whose id cannot be read is never measured', WITH, async ($, on) => {
  const desk = await open($, on, { hasNoId: true })
  await cmd($, 'on')
  const before = desk.world.writes.length

  await turn($)
  expect(desk.calls).not.toContain('session.usage')
  expect(desk.world.writes).toHaveLength(before)
  expect((await drawn($))?.lines).toEqual(EMPTY)
})

test('A4: a worktree is counted under the main worktree of its project', WITH, async ($, on) => {
  const desk = await open($, on, { root: '/work/project-fix', git: ran(0, WORKTREES) })
  await cmd($, 'on')
  await turn($)

  expect(desk.runs[0]?.cwd).toBe('/work/project-fix')
  expect((await drawn($))?.note).toBe('project')
  expect(Object.keys(JSON.parse(ledgerText(desk)).projects)).toEqual(['/work/project'])
})

for (const root of ['C:\\Work\\Project', 'c:/work/project']) {
  test(`A4: ${root} is the same project however Windows spells it`, WITH, async ($, on) => {
    const desk = await open($, on, { root, git: ran(0, 'worktree C:/Work/Project\r\nHEAD 3f2a1c9e\r\nbranch refs/heads/main\r\n\r\n'), env: { USERPROFILE: 'C:\\Users\\me' } })
    await cmd($, 'on')
    await turn($)

    expect((await drawn($))?.note).toBe('Project')
    expect(Object.keys(JSON.parse(ledgerText(desk)).projects)).toEqual(['c:/work/project'])

    put(desk, 'C:\\Users\\me/.claude/projects/C--Work-Project/a.jsonl', saved('C:\\Work\\Project\\src', noon(2025, 9, 3), [cost(2)]))
    expect(await cmd($, 'scan')).toBe('Read 1 saved session of Project.\n$2.38 over 2 sessions since 3 Sep 2025.')
    expect(desk.calls).toContain('fs.list /Users/me/.claude/projects/C--Work-Project')
  })
}

for (const [how, git] of [
  ['exits 1', ran(1)],
  ['rejects', 'reject'],
  ['is truncated', ran(0, WORKTREES, true)],
  ['prints no worktree line', ran(0, 'HEAD 3f2a1c9e\nbranch refs/heads/main\n')],
] as const) {
  test(`A4: the project is the session root when git ${how}`, WITH, async ($, on) => {
    const desk = await open($, on, { root: '/work/project-fix', git })
    await cmd($, 'on')
    await turn($)

    expect(desk.runs).toHaveLength(1)
    expect((await drawn($))?.note).toBe('project-fix')
    expect(Object.keys(JSON.parse(ledgerText(desk)).projects)).toEqual(['/work/project-fix'])
  })
}

test('A4: a project at the root of the disk still has a name', WITH, async ($, on) => {
  const desk = await open($, on, { root: '/' })
  await cmd($, 'on')

  expect((await drawn($))?.note).toBe('/')
  expect(await cmd($, 'clear')).toBe('Ledger cleared for /.')
  expect(desk.runs).toHaveLength(1)
})

const project = (desk: Desk): void => {
  put(desk, `${BASE}/-work-project/a.jsonl`, saved('/work/project', noon(2025, 9, 3), [cost(1), cost(2.5)]))
  put(desk, `${BASE}/-work-project/notes.txt`, 'not a session')
  put(desk, `${BASE}/-work-project-src/b.jsonl`, saved('/work/project/src', noon(2025, 9, 10), [cost(1.25)]))
  put(desk, `${BASE}/-work-project-fix/c.jsonl`, saved('/work/project-fix', noon(2026, 10, 1), [cost(0.75)]))
  put(desk, `${BASE}/-work-project-old/d.jsonl`, saved('/work/project-old', noon(2024, 1, 5), [cost(9)]))
  put(desk, `${BASE}/-work-other/e.jsonl`, saved('/work/other', noon(2024, 1, 5), [cost(5)]))
}

test('A5: scan sums the saved sessions of every folder and worktree of the project and no other', WITH, async ($, on) => {
  const desk = await open($, on, { root: '/work/project-fix', git: ran(0, WORKTREES) })
  await cmd($, 'on')
  project(desk)

  expect(await cmd($, 'scan')).toBe('Read 4 saved sessions of project.\n$4.50 over 3 sessions since 3 Sep 2025.')
  expect(desk.calls.filter(call => call.startsWith('fs.list')).sort()).toEqual(
    [BASE, `${BASE}/-work-project`, `${BASE}/-work-project-fix`, `${BASE}/-work-project-old`, `${BASE}/-work-project-src`].map(path => `fs.list ${path}`),
  )
  expect(sessionReads(desk).sort()).toEqual(['-work-project-fix/c.jsonl', '-work-project-old/d.jsonl', '-work-project-src/b.jsonl', '-work-project/a.jsonl'])
  expect((await drawn($))?.lines).toEqual([
    `$4.50${' '.repeat(21)}3 sessions`,
    'this session $0.00  since 3 Sep 2025',
  ])
  expect(ledger(desk)?.sessions.a).toEqual({ usd: 2.5, at: noon(2025, 9, 3), size: desk.meta.get(`${BASE}/-work-project/a.jsonl`)?.size ?? -1, isOurs: true })
  expect(ledger(desk)?.sessions.d).toMatchObject({ usd: null, isOurs: false })
  expect(ledger(desk)?.scannedAt).toBe(NOW)
})

test('A6: a session both measured and saved is counted once, at the higher figure', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')
  await turn($)

  put(desk, `${BASE}/-work-project/session-1.jsonl`, saved('/work/project', noon(2026, 10, 4), [cost(0.3)]))
  expect(await cmd($, 'scan')).toBe('Read 1 saved session of project.\n$0.38 over 1 session since 4 Oct 2026.')

  put(desk, `${BASE}/-work-project/session-1.jsonl`, saved('/work/project', noon(2026, 10, 4), [cost(0.3), cost(0.9)]))
  expect(await cmd($, 'scan')).toBe('Read 1 saved session of project.\n$0.90 over 1 session since 4 Oct 2026.')
  expect((await drawn($))?.lines[0]).toMatch(/^\$0\.90 +1 session$/)
  expect((await drawn($))?.lines[1]).toBe('this session $0.90  since 4 Oct 2026')
})

test('A7: a saved session with no usable cost record is unpriced, never priced', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')
  const started = noon(2026, 9, 20)
  put(desk, `${BASE}/-work-project/none.jsonl`, saved('/work/project', started))
  put(desk, `${BASE}/-work-project/cut.jsonl`, saved('/work/project', started, [cost(3).slice(0, 60)]))
  put(desk, `${BASE}/-work-project/negative.jsonl`, saved('/work/project', started, [cost(-1)]))
  put(desk, `${BASE}/-work-project/worded.jsonl`, saved('/work/project', started, [cost('1.20')]))
  put(desk, `${BASE}/-work-project/session-1.jsonl`, saved('/work/project', started))
  put(desk, `${BASE}/-work-project/nowhere.jsonl`, saved(null, started, [cost(4)]))
  put(desk, `${BASE}/-work-project/none/subagents/agent-a1.jsonl`, saved('/work/project', started, [cost(7)]))

  expect(await cmd($, 'scan')).toBe('Read 6 saved sessions of project.\nNothing counted yet for project. 5 without a cost record.')
  expect(desk.calls.filter(call => call.includes('subagents') || call.endsWith('/none'))).toEqual([])
  expect((await drawn($))?.lines).toEqual([
    `$0.00${' '.repeat(21)}0 sessions`,
    `this session $0.00${' '.repeat(18)}`,
    '5 without a cost record',
  ])
  expect(ledger(desk)?.sessions.nowhere).toMatchObject({ usd: null, isOurs: false })

  put(desk, `${BASE}/-work-project/good.jsonl`, saved('/work/project', started, [cost(1)]))
  expect(await cmd($, 'scan')).toBe('Read 1 saved session of project.\n$1.00 over 1 session since 20 Sep 2026. 5 without a cost record.')

  await turn($)
  expect((await drawn($))?.lines).toEqual([
    `$1.38${' '.repeat(21)}2 sessions`,
    'this session $0.38 since 20 Sep 2026',
    '4 without a cost record',
  ])
})

test('A8: a file too long for one read is never read, and a second scan reads only what changed', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')
  const long = saved('/work/project', noon(2026, 9, 1), [cost(40)])
  put(desk, `${BASE}/-work-project/long.jsonl`, long, { size: 4_000_000, mtimeMs: NOW - 2 * DAY })
  put(desk, `${BASE}/-work-project-src/longer.jsonl`, long, { size: 4_000_000 })
  put(desk, `${BASE}/-work-project/a.jsonl`, saved('/work/project', noon(2026, 9, 3), [cost(1)]))
  put(desk, `${BASE}/-work-project-old/d.jsonl`, saved('/work/project-old', noon(2024, 1, 5), [cost(9)]))

  expect(await cmd($, 'scan')).toBe('Read 2 saved sessions of project.\n$1.00 over 1 session since 3 Sep 2026. 1 too long to read.')
  expect(sessionReads(desk).sort()).toEqual(['-work-project-old/d.jsonl', '-work-project/a.jsonl'])
  expect(ledger(desk)?.sessions.long).toEqual({ usd: null, at: NOW - 2 * DAY, size: 4_000_000, isOurs: true })
  expect(ledger(desk)?.sessions.longer).toBeUndefined()
  expect((await drawn($))?.lines).toEqual([
    `$1.00${' '.repeat(22)}1 session`,
    'this session $0.00  since 3 Sep 2026',
    '1 too long to read',
  ])
  expect((await drawn($, 20))?.lines.at(-1)).toBe('1 too long')

  put(desk, `${BASE}/-work-project/a.jsonl`, saved('/work/project', noon(2026, 9, 3), [cost(1), cost(2)]))
  expect(await cmd($, 'scan')).toBe('Read 1 saved session of project.\n$2.00 over 1 session since 3 Sep 2026. 1 too long to read.')
  expect(sessionReads(desk).slice(2)).toEqual(['-work-project/a.jsonl'])

  expect(await cmd($, 'scan')).toBe('Read 0 saved sessions of project.\n$2.00 over 1 session since 3 Sep 2026. 1 too long to read.')
  expect(sessionReads(desk)).toHaveLength(3)
  expect((await drawn($))?.lines).not.toContain(FAULT)
})

test('A8: a scan stops at forty million bytes and the next ones read the rest', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')
  const ids = Array.from({ length: 30 }, (_, at) => `s${String(at).padStart(2, '0')}`)
  ids.forEach((id, at) => put(desk, `${BASE}/-work-project/${id}.jsonl`, saved('/work/project', NOW - (at + 1) * DAY, [cost(1)]), { size: 3_000_000, mtimeMs: NOW - at * HOUR }))

  expect(await cmd($, 'scan')).toBe('Read 13 saved sessions of project.\n$13.00 over 13 sessions since 21 Sep 2026.\n17 more to read: run scan again.')
  expect(sessionReads(desk)).toEqual(ids.slice(0, 13).map(id => `-work-project/${id}.jsonl`))
  expect(await cmd($, 'scan')).toBe('Read 13 saved sessions of project.\n$26.00 over 26 sessions since 8 Sep 2026.\n4 more to read: run scan again.')
  expect(await cmd($, 'scan')).toBe('Read 4 saved sessions of project.\n$30.00 over 30 sessions since 4 Sep 2026.')
  expect(sessionReads(desk)).toEqual(ids.map(id => `-work-project/${id}.jsonl`))
})

test('A9: a scan that cannot find or list the saved sessions says so and keeps what was counted', WITH, async ($, on) => {
  const desk = await open($, on, { env: {} })
  await cmd($, 'on')

  expect(await cmd($, 'scan')).toBe('Could not find where sessions are saved.')
  expect(desk.calls.filter(call => call.startsWith('env.get'))).toEqual(['env.get CLAUDE_CONFIG_DIR', 'env.get HOME', 'env.get USERPROFILE'])
  expect(desk.calls.filter(call => call.startsWith('fs.list'))).toEqual([])
  let card = await drawn($)
  expect(card?.lines).toEqual([...EMPTY, FAULT])
  expect(card?.colors.at(-1)).toBe('yellow')

  await turn($)
  desk.env = { USERPROFILE: 'C:\\Users\\me' }
  expect(await cmd($, 'scan')).toBe('Could not read C:\\Users\\me/.claude/projects.')
  card = await drawn($)
  expect(card?.lines).toEqual([
    `$0.38${' '.repeat(22)}1 session`,
    'this session $0.38  since 4 Oct 2026',
    FAULT,
  ])
  expect(ledger(desk)?.scannedAt).toBe(0)

  desk.env = { HOME, USERPROFILE: 'C:\\Users\\me' }
  desk.dirs.add(BASE)
  expect(await cmd($, 'scan')).toBe('Read 0 saved sessions of project.\n$0.38 over 1 session since 4 Oct 2026.')
  expect(desk.calls.at(-1)).toBe(`fs.list ${BASE}`)
  expect((await drawn($))?.lines).toEqual([`$0.38${' '.repeat(22)}1 session`, 'this session $0.38  since 4 Oct 2026'])

  desk.env = { CLAUDE_CONFIG_DIR: '/cfg', HOME }
  expect(await cmd($, 'scan')).toBe('Could not read /cfg/projects.')
  expect(desk.calls.at(-1)).toBe('fs.list /cfg/projects')
  expect((await drawn($))?.lines.at(-1)).toBe(FAULT)
})

test('A10: show answers the project, the summary and this session', WITH, async ($, on) => {
  const desk = await open($, on, { root: '/work/project-fix', git: ran(0, WORKTREES) })
  await cmd($, 'on')

  expect(await cmd($, 'show')).toBe(
    'project (/work/project)\nNothing counted yet for project.\nThis session: $0.00\nSaved sessions not read yet: /ledger-widget scan',
  )

  project(desk)
  put(desk, `${BASE}/-work-project/none.jsonl`, saved('/work/project', noon(2026, 9, 20)))
  await cmd($, 'scan')
  expect(await cmd($, 'show')).toBe('project (/work/project)\n$4.50 over 3 sessions since 3 Sep 2025. 1 without a cost record.\nThis session: $0.00')
})

test('A11: clear empties this project and leaves every other project as it was', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')
  await turn($)
  const other = { sessions: { 'session-9': { usd: 12.4, at: noon(2026, 8, 1), size: 5120, isOurs: true } }, scannedAt: noon(2026, 8, 2) }
  keep(desk, { '/work/other': other, '/work/project': ledger(desk) })
  desk.dirs.add(BASE)
  await cmd($, 'scan')
  expect((await drawn($))?.lines).not.toContain(HINT)

  expect(await cmd($, 'clear')).toBe('Ledger cleared for project.')
  expect(ledgerText(desk)).toBe(`{"projects":{"/work/other":${JSON.stringify(other)}}}`)
  expect((await drawn($))?.lines).toEqual(EMPTY)
  expect(await cmd($, 'show')).toContain('Saved sessions not read yet: /ledger-widget scan')

  await turn($)
  expect((await drawn($))?.lines.at(-1)).toBe(HINT)
  expect(ledger(desk, '/work/other')).toEqual(other)
})

test('A12: off, nothing is run, read, measured or written, and the verbs say so', WITH, async ($, on) => {
  const desk = await open($, on)
  project(desk)

  await turn($)
  for (const verb of ['scan', 'show', 'clear']) expect(await cmd($, verb)).toBe(OFF)
  expect(desk.calls).toEqual([])
  expect(reads(desk)).toEqual([])
  expect(desk.world.writes).toEqual([])
  expect(desk.world.store.get('isOn')).toBeUndefined()
  expect(await drawn($)).toBeUndefined()

  await cmd($, 'on')
  await turn($)
  const lines = (await drawn($))?.lines
  expect(lines?.[0]).toMatch(/^\$0\.38 +1 session$/)

  const before = desk.world.writes.length
  expect(await cmd($, 'off')).toBe('Ledger off.')
  expect(await drawn($)).toBeUndefined()
  await turn($)
  expect(await cmd($, 'clear')).toBe(OFF)
  expect(desk.world.writes.slice(before)).toEqual(['store isOn'])

  await cmd($, 'on')
  expect((await drawn($))?.lines).toEqual(lines)
  expect(desk.runs).toHaveLength(1)
  expect(desk.calls.filter(call => call === 'session.root' || call === 'session.id')).toEqual(['session.root', 'session.id'])
})

test('A13: an unknown verb answers the usage and changes nothing; the verb is read in any case', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')
  await turn($)
  const lines = (await drawn($))?.lines
  const before = desk.world.writes.length

  expect(await cmd($, 'budget 5')).toBe(USAGE)
  expect(await cmd($, 'stop')).toBe(USAGE)
  expect(desk.world.store.get('isOn')).toBe(true)
  expect(desk.world.writes).toHaveLength(before)
  expect((await drawn($))?.lines).toEqual(lines)

  desk.dirs.add(BASE)
  expect(await cmd($, '  SCAN ')).toBe('Read 0 saved sessions of project.\n$0.38 over 1 session since 4 Oct 2026.')
})

test('A14: a turn end picks up what another session of the project wrote', WITH, async ($, on) => {
  const desk = await open($, on)
  await cmd($, 'on')
  await turn($)

  const theirs = { usd: 1.5, at: NOW - DAY, size: 0, isOurs: true }
  keep(desk, { '/work/project': { sessions: { ...ledger(desk)?.sessions, 'session-2': theirs }, scannedAt: 0 } })
  await measured($, desk, 0.5)
  expect((await drawn($))?.lines).toEqual([
    `$2.00${' '.repeat(21)}2 sessions`,
    'this session $0.50  since 3 Oct 2026',
    HINT,
  ])
  expect(ledger(desk)?.sessions).toEqual({ 'session-1': { usd: 0.5, at: NOW, size: 0, isOurs: true }, 'session-2': theirs })

  const damaged = { 'session-2': theirs, 'session-3': { at: NOW }, 'session-4': { usd: 'NaN', at: NOW, size: 0, isOurs: true }, 'session-5': { usd: -2, at: NOW, size: 0, isOurs: true }, 'session-6': null }
  keep(desk, { '/work/project': { sessions: damaged, scannedAt: 'never' } })
  expect(await cmd($, 'show')).toBe('project (/work/project)\n$1.50 over 1 session since 3 Oct 2026.\nThis session: $0.00\nSaved sessions not read yet: /ledger-widget scan')
  for (const text of ['null', '[]', '{"projects":[]}', '{"projects":{"/work/project":[]}}', '{"projects":{"/work/project":{"sessions":7}}}', '{"projects":']) {
    desk.world.files.set(ledgerPath(desk), text)
    expect(await cmd($, 'show')).toContain('Nothing counted yet for project.')
  }
  expect((await drawn($))?.lines).toEqual(EMPTY)
})

test('A15: short rows under 40 columns, long rows from 40, in every placement', WITH, async ($, on) => {
  const desk = await open($, on, { env: {} })
  await cmd($, 'on')
  const others = Object.fromEntries(Array.from({ length: 130 }, (_, at) => [`past-${at}`, { usd: at === 0 ? 31 : 9, at: noon(2025, 9, 23) + at * DAY, size: 5120, isOurs: true }]))
  const blank = Object.fromEntries(Array.from({ length: 12 }, (_, at) => [`blank-${at}`, { usd: null, at: NOW, size: 5120, isOurs: true }]))
  const sessions = { 'session-1': { usd: 12.4, at: NOW, size: 0, isOurs: true }, ...others, ...blank }
  keep(desk, { '/work/project': { sessions, scannedAt: 0 } })
  await cmd($, 'show')

  for (const columns of [20, 39]) {
    const card = await drawn($, columns)
    expect(card?.width).toBe(columns)
    expect(card?.lines).toEqual(['$1,204', '131 sessions', 'now $12.40', '12 no record', 'scan adds more'])
  }

  const long = await drawn($, 40)
  expect(long?.lines).toEqual([
    `$1,204${' '.repeat(18)}131 sessions`,
    `this session $12.40${' '.repeat(6)}23 Sep 2025`,
    '12 without a cost record',
    HINT,
  ])
  for (const [place, component] of SITES) {
    await $.command.run(run('place', place))
    expect((await drawn($, 40, component))?.lines).toEqual(long?.lines)
  }
  await $.command.run(run('place', 'side'))

  await $.command.run(run('widen', `${NAME} 60`))
  expect((await drawn($, 60))?.lines).toEqual([
    `$1,204${' '.repeat(38)}131 sessions`,
    `this session $12.40${' '.repeat(20)}since 23 Sep 2025`,
    '12 without a cost record',
    HINT,
  ])

  await cmd($, 'scan')
  expect((await drawn($, 60))?.lines.at(-1)).toBe(FAULT)
  expect((await drawn($, 60))?.lines).not.toContain(HINT)
  const short = await drawn($, 20)
  expect(short?.lines).toEqual(['$1,204', '131 sessions', 'now $12.40', '12 no record', 'scan failed'])
  expect(short?.colors.at(-1)).toBe('yellow')

  for (const [usd, shown] of [[99.5, '$99.50'], [0, '$0.00'], [99.994, '$99.99'], [99.996, '$100'], [100, '$100'], [1204.4, '$1,204'], [1234567.8, '$1,234,568']] as const) {
    keep(desk, { '/work/project': { sessions: { 'session-1': { usd, at: NOW, size: 0, isOurs: true } }, scannedAt: 0 } })
    await cmd($, 'show')
    const card = await drawn($, 20)
    expect(card?.lines[0]).toBe(shown)
    expect(card?.lines[2]).toBe(`now ${shown}`)
  }
})

test('A15: a 30-character project name is left to the card to cut', WITH, async ($, on) => {
  const name = 'customer-billing-reconciliation'.slice(0, 30)
  await open($, on, { root: `/work/${name}` })
  await cmd($, 'on')
  await turn($)

  for (const columns of [20, 40]) {
    const card = await drawn($, columns)
    expect(card?.width).toBe(columns)
    expect(card?.note).toBe(name)
    expect(card?.texts.slice(1, 3)).toEqual(['Ledger', name])
  }
})

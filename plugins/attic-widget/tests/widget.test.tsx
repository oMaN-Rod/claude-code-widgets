import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { register } from '../hooks/register'
import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type Tool = { isEngine: boolean; isDeferred: boolean; since: number; seen: number; used: number[] }
type Stored = { sessions: number; base: number; keep: string[]; stow: string[]; tools: Record<string, Tool> }
type Row = { name: string; tokens: number; color: string; isDeferred: boolean; kind: 'used' | 'free' | 'buffer' | 'deferred' }
type Scene = { names: string[]; rows: Row[]; repo: { root: string; branch: string } | null; root: string; invalidates: number; lists: number; usages: number }
type Hook = ($: unknown, e: object, next: unknown) => Promise<unknown>

const NAME = 'attic-widget'
const SLOW = 30_000
const KEY = 'book:/work/project'
const USAGE = 'Usage: /attic-widget [on|off|show|keep <tool>|stow <tool>|clear]'
const EMPTY = 'Counting the tools Claude calls in this project. After 5 sessions the unused ones wait behind ToolSearch.'
const AIRING = 'Airing: every tool is where the engine puts it this session, so a stowed tool can earn its way back.'
const BLIND = 'No ToolSearch in this session, so nothing is moved. Still counting.'
const GITHUB = 'mcp__github__search_pull_requests_and_issues'
const NAMES = ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'ToolSearch', 'PowerShell', 'Artifact', 'SendFeedback', 'Skill', 'Agent', 'WebFetch', 'WebSearch', GITHUB]
const ROWS = ['fetch', 'stays', 'said', 'still', 'counts', 'unused', 'figure', 'change']
const RAN = { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }
const USED: Row[] = [
  { name: 'System prompt', tokens: 6000, color: 'promptBorder', isDeferred: false, kind: 'used' },
  { name: 'System tools', tokens: 16_000, color: 'inactive', isDeferred: false, kind: 'used' },
  { name: 'Free space', tokens: 120_000, color: 'inactive', isDeferred: false, kind: 'free' },
]

const waiting = (...tokens: number[]): Row[] => [
  ...USED,
  ...tokens.map((count, at) => ({ name: at === 0 ? 'MCP tools' : 'System tools', tokens: count, color: 'inactive', isDeferred: true, kind: 'deferred' as const })),
]

const tool = (seen: number, over: Partial<Tool> = {}): Tool => ({ isEngine: true, isDeferred: false, since: 1, seen, used: [], ...over })

const shelf = (sessions: number, tools: Record<string, Partial<Tool>>, over: Partial<Stored> = {}): Stored => ({
  sessions,
  base: -1,
  keep: [],
  stow: [],
  tools: Object.fromEntries(Object.entries(tools).map(([name, given]) => [name, tool(sessions, given)])),
  ...over,
})

const WEEK = {
  Bash: { used: [3, 4, 5, 6, 7] },
  Edit: { used: [3, 4, 5, 6, 7] },
  PowerShell: {},
  Artifact: {},
  Skill: { used: [6] },
  WebFetch: { isDeferred: true, used: [3, 5, 7] },
  WebSearch: { isDeferred: true, used: [4, 6] },
  [GITHUB]: { isEngine: false, isDeferred: true },
}

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async $ => ({
      text: JSON.stringify([
        await $.state.get({ plugin: 'attic-widget', key: 'isOn' } as never),
        await $.state.get({ plugin: 'attic-widget', key: 'book' } as never),
        await $.state.get({ plugin: 'attic-widget', key: 'plan' } as never),
        await $.state.get({ plugin: 'attic-widget', key: 'run' } as never),
      ]),
    }))
  },
}

const open = (on: On, store: Readonly<Record<string, unknown>> = {}): { world: Ground; scene: Scene } => {
  const scene: Scene = { names: NAMES, rows: waiting(5000, 3400), repo: null, root: '/work/project', invalidates: 0, lists: 0, usages: 0 }
  const world = ground(on, {
    store,
    answers: {
      'session.repo': () => scene.repo,
      'session.root': () => scene.root,
      'tool.list': () => {
        scene.lists += 1

        return scene.names.map(name => ({ name, description: `${name} does its work.`, mcp: name.startsWith('mcp__') }))
      },
      'ui.invalidate': (e: { event?: string }) => void (scene.invalidates += e.event === 'tool.describe' ? 1 : 100),
      'session.usage': (e: { breakdown?: string }) => {
        scene.usages += 1

        return {
          startedAt: 1_700_000_000_000,
          context: { window: 200_000, tokens: 46_000, percent: 23, ...(e.breakdown === 'summary' ? { breakdown: { categories: scene.rows, totalTokens: 46_000, maxTokens: 200_000 } } : {}) },
          rateLimits: [],
          cost: { usd: 0.38 },
        }
      },
    },
  })
  on('tool.describe', async (_$, e) => ({ description: e.description }))
  on('tool.call', async () => RAN)

  return { world, scene }
}

const say = async ($: Engine, args = ''): Promise<string> => (await $.command.run(run(NAME, args))).text ?? ''

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
}

const again = async ($: Engine, world: Ground, stored?: Stored): Promise<void> => {
  await say($, 'off')
  if (stored === undefined) world.store.delete(KEY)
  else world.store.set(KEY, stored)
  await say($, 'on')
}

const described = ($: Engine, name: string, isDeferred = false, plugin = 'engine') =>
  $.tool.describe({ tool: name, description: `${name} does its work.`, ...(isDeferred ? { isDeferred: true } : {}), provider: { plugin, tier: plugin === 'engine' ? 'core' : 'user' } } as never)

const plain = (name: string, isDeferred = false) => ({ description: `${name} does its work.`, ...(isDeferred ? { isDeferred: true } : {}) })

const called = ($: Engine, name: string, agentId?: string) =>
  $.tool.call({ tool: name, tool_use_id: `use-${name}`, ...(agentId === undefined ? {} : { agentId }) } as never)

const done = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId: 'turn-9', reason: 'answer', ...(agentId === undefined ? {} : { agentId }) } as never)

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane') => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const lines = async (key: string): Promise<string[]> => {
    const found: string[] = []
    for (let at = 0; ; at += 1) {
      const line = await ui.find({ key: `${key}:${at}` })
      if (line === undefined) return found
      found.push(line.text)
    }
  }
  const text = async (key: string): Promise<string> => (await lines(key)).join(' ')
  const body: string[] = []
  for (const key of ROWS) body.push(...(await lines(key)))
  const seen = {
    width: Number((await ui.find({ key: 'card' }))?.props.width),
    note: (await ui.find({ key: 'note' }))?.text ?? '',
    lines: body,
    fetch: await text('fetch'),
    stays: await text('stays'),
    said: await text('said'),
    still: await text('still'),
    counts: await text('counts'),
    unused: await text('unused'),
    figure: await text('figure'),
    change: await text('change'),
  }
  await ui.unmount()

  return seen
}

const saved = (world: Ground, key = KEY): Stored => world.store.get(key) as Stored

const books = (world: Ground): number => world.writes.filter(write => write === `store ${KEY}`).length

const bench = (stored: Record<string, unknown>) => {
  const hooks: Record<string, Hook> = {}
  register(((event: string, ...rest: unknown[]) => {
    if (event !== 'ui.render' && event !== 'command.run') hooks[event] = rest.at(-1) as Hook
  }) as unknown as On, {} as never)
  const state = new Map<string, { value: unknown; version: number }>()
  const calls: string[] = []
  const reads: string[] = []
  const $ = {
    state: {
      get: async (ref: { key: string }) => state.get(ref.key) ?? { value: undefined, version: 0 },
      set: async (ref: { key: string }, value: unknown) => {
        const version = (state.get(ref.key)?.version ?? 0) + 1
        state.set(ref.key, { value, version })

        return { isSet: true, version }
      },
    },
    store: { get: async (key: string) => (reads.push(key), stored[key]), set: async (key: string) => void calls.push(`store.set ${key}`) },
    command: { register: async () => ({ command: NAME }) },
    session: { repo: async () => null, root: async () => '/work/project', usage: async () => void calls.push('session.usage') },
    tool: { list: async () => NAMES.map(name => ({ name, description: '', mcp: false })) },
    ui: { invalidate: () => void calls.push('ui.invalidate') },
  }

  return {
    calls,
    reads,
    state,
    raise: async (event: string, e: object, answer: unknown): Promise<unknown> => hooks[event]?.($, e, async () => answer),
  }
}

test('A1: a project with no book shows the empty sentence everywhere, and a describe passes through and is recorded', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world } = open(on)

  await start($)
  await say($, 'on')
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    const seen = await card($, 40, component)
    expect(seen.said).toBe(EMPTY)
    expect(seen.lines).toEqual(['Counting the tools Claude calls in', 'this project. After 5 sessions the', 'unused ones wait behind ToolSearch.'])
    expect(seen.note).toBe('watching 1/5')
  }

  await $.command.run(run('place', 'side'))
  await turn($)
  expect(await card($)).toMatchObject({ note: 'watching 1/5', said: EMPTY, still: '', unused: '', figure: 'On demand now: 8.4k tokens' })
  expect((await card($, 20)).lines).toEqual(['Counting the', 'tools Claude', 'calls in this', 'project. After 5', 'sessions the', 'unused ones wait', 'behind', 'ToolSearch.', '8.4k on demand'])
  expect(await say($, 'show')).toBe(['Attic, session 1 of 5 in project: watching, nothing moved.', 'On demand now: 8.4k tokens'].join('\n'))
  expect(saved(world).tools.Bash).toEqual({ isEngine: false, isDeferred: false, since: 1, seen: 0, used: [1] })

  expect(await described($, 'PowerShell')).toEqual(plain('PowerShell'))
  expect(await card($)).toMatchObject({ said: '', still: 'Nothing moved yet.', unused: '1 tool never called here so far.' })
  await turn($, 'Again', 'turn-2')
  expect(saved(world).tools.PowerShell).toEqual({ isEngine: true, isDeferred: false, since: 1, seen: 1, used: [] })

  const answer = { description: 'Runs a PowerShell command.' }
  const asked = { tool: 'PowerShell', description: answer.description, provider: { plugin: 'engine', tier: 'core' } }
  const ready = bench({ isOn: true })
  await ready.raise('session.start', { cwd: '/work/project' }, { cwd: '/work/project' })
  expect(await ready.raise('tool.describe', asked, answer)).toBe(answer)

  const early = bench({ isOn: true, [KEY]: shelf(2, { Bash: { used: [1, 2] }, PowerShell: {} }) })
  expect(early.state.size).toBe(0)
  expect(await early.raise('tool.describe', asked, answer)).toBe(answer)
  expect(await early.raise('tool.describe', { ...asked, tool: 'Artifact' }, answer)).toBe(answer)
  await early.raise('session.start', { cwd: '/work/project' }, { cwd: '/work/project' })
  const held = early.state.get('book')?.value as Stored
  expect(held.tools.PowerShell).toEqual({ isEngine: true, isDeferred: false, since: 1, seen: 3, used: [] })
  expect(held.tools.Artifact).toEqual({ isEngine: true, isDeferred: false, since: 3, seen: 3, used: [] })
  expect(held.tools.Bash?.seen).toBe(2)
  expect(early.calls).toEqual([])

  const asleep = bench({})
  expect(await asleep.raise('tool.describe', asked, answer)).toBe(answer)
  expect(await asleep.raise('tool.describe', { ...asked, tool: 'Artifact' }, answer)).toBe(answer)
  expect([...asleep.state].map(([key, held]) => [key, held.value])).toEqual([['isOn', false]])
  expect(asleep.reads).toEqual(['isOn'])
})

test('A2: the dry run moves nothing, counts the tools never called and stores each called tool once a turn', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world } = open(on, { isOn: true, [KEY]: shelf(2, { Bash: { used: [1, 2] }, Edit: { used: [2] }, PowerShell: {} }) })

  await start($)
  for (const name of ['Bash', 'Edit', 'PowerShell', 'Artifact']) expect(await described($, name)).toEqual(plain(name))
  expect(await described($, 'WebFetch', true)).toEqual(plain('WebFetch', true))

  const seen = await card($)
  expect(seen.note).toBe('watching 3/5')
  expect(seen.still).toBe('Nothing moved yet.')
  expect(seen.unused).toBe('2 tools never called here so far.')

  await done($)
  expect(books(world)).toBe(0)
  expect(saved(world).sessions).toBe(2)

  await turn($)
  expect(books(world)).toBe(1)
  expect(saved(world).sessions).toBe(3)
  expect(saved(world).tools.Bash?.used).toEqual([1, 2, 3])
  expect(saved(world).tools.Edit?.used).toEqual([2, 3])
  expect(saved(world).tools.Artifact).toEqual({ isEngine: true, isDeferred: false, since: 3, seen: 3, used: [] })

  await called($, 'PowerShell')
  expect((await card($)).unused).toBe('1 tool never called here so far.')
  await called($, 'Artifact', 'agent-7')
  expect((await card($)).unused).toBe('Every tool has been called here.')
  await turn($, 'Again', 'turn-2')
  expect(books(world)).toBe(2)
  expect(saved(world).tools.PowerShell?.used).toEqual([3])
  expect(saved(world).tools.Artifact?.used).toEqual([3])
})

test('A3: after the dry run evidence stows an unused engine tool, forwards a daily deferred one and spares the rest', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  open(on, {
    isOn: true,
    [KEY]: shelf(7, { ...WEEK, Grep: {}, SendFeedback: { since: 4 }, Agent: {}, Stale: { seen: 2 }, Gone: {} }, { keep: ['Agent'] }),
  })

  await start($)
  expect((await card($)).note).toBe('3 away')
  expect(await described($, 'PowerShell')).toEqual({ ...plain('PowerShell'), isDeferred: true })
  expect(await described($, 'Artifact')).toEqual({ ...plain('Artifact'), isDeferred: true })
  expect(await described($, 'WebFetch', true)).toEqual({ ...plain('WebFetch'), isDeferred: false })
  expect(await described($, 'WebSearch', true)).toEqual(plain('WebSearch', true))
  for (const name of ['Grep', 'Bash', 'SendFeedback', 'Skill', 'Agent']) expect(await described($, name)).toEqual(plain(name))
  expect(await described($, GITHUB, true, 'mcp:github')).toEqual(plain(GITHUB, true))

  const seen = await card($)
  expect(seen.note).toBe('2 away')
  expect(seen.counts).toBe('2 tools in the attic, 1 forward.')
  expect(await say($, 'show')).toBe(
    [
      'Attic, session 8 in project: 2 away, 1 forward.',
      'away Artifact: no call in the last 5 sessions',
      'away PowerShell: no call in the last 5 sessions',
      'forward WebFetch: called in 3 of the last 5 sessions',
      'kept Agent: kept by you',
    ].join('\n'),
  )
})

test('A4: a describe answer does not change with the calls of this session, and a tool call resolves to what next gave', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { scene } = open(on, { isOn: true, [KEY]: shelf(7, WEEK) })

  await start($)
  const before = [await described($, 'PowerShell'), await described($, 'WebFetch', true), await described($, 'Skill')]
  expect(await called($, 'PowerShell')).toEqual(RAN)
  for (const name of ['Skill', 'WebFetch', 'Bash', 'Artifact']) await called($, name)
  await turn($)
  expect([await described($, 'PowerShell'), await described($, 'WebFetch', true), await described($, 'Skill')]).toEqual(before)
  expect(before[0]).toEqual({ ...plain('PowerShell'), isDeferred: true })

  expect(await described($, 'Artifact', true)).toEqual({ ...plain('Artifact'), isDeferred: true })
  expect(await described($, 'WebFetch')).toEqual({ ...plain('WebFetch'), isDeferred: false })
  expect(await say($, 'keep Skill')).toBe('Skill stays listed.')
  expect(scene.invalidates).toBe(1)
  expect(await described($, 'Artifact', true)).toEqual({ ...plain('Artifact'), isDeferred: true })
  expect(await described($, 'WebFetch')).toEqual({ ...plain('WebFetch'), isDeferred: false })

  const direct = bench({ isOn: true })
  await direct.raise('session.start', { cwd: '/work/project' }, { cwd: '/work/project' })
  expect(await direct.raise('tool.call', { tool: 'PowerShell', tool_use_id: 'use-1' }, RAN)).toBe(RAN)
})

test('A5: the first main-loop turn measures the schemas on demand against the baseline, once', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { isOn: true, [KEY]: shelf(7, WEEK, { base: 3100 }) })

  await start($)
  await called($, 'Bash', 'agent-7')
  await done($, 'agent-7')
  expect(scene.usages).toBe(0)
  expect((await card($)).figure).toBe('')

  await turn($)
  expect(scene.usages).toBe(1)
  expect(await card($)).toMatchObject({ figure: 'On demand 3.1k -> 8.4k tokens', change: '5.3k less in every request' })
  await turn($, 'Again', 'turn-2')
  expect(scene.usages).toBe(1)

  const measure = async (stored: Stored, ...tokens: number[]) => {
    scene.rows = waiting(...tokens)
    await again($, world, stored)
    await turn($)
    const { figure, change } = await card($)

    return [figure, change]
  }

  expect(await measure(shelf(7, WEEK, { base: 3100 }), 2000)).toEqual(['On demand 3.1k -> 2.0k tokens', '1.1k more in every request'])
  expect(await measure(shelf(7, WEEK, { base: 3100 }), 3000, 100)).toEqual(['On demand 3.1k -> 3.1k tokens', 'No change in a request'])
  expect(await measure(shelf(7, WEEK, { base: 3100 }), 1000)).toEqual(['On demand 3.1k -> 1.0k tokens', ''])
  expect(await measure(shelf(7, WEEK), 5000, 3400)).toEqual(['On demand now: 8.4k tokens', ''])
  expect(await measure(shelf(7, WEEK, { base: 3100 }))).toEqual(['', ''])
  for (const [tokens, written] of [[999, '999'], [1049, '1.0k'], [1050, '1.1k'], [99_949, '99.9k'], [99_950, '100k'], [100_000, '100k']] as const) {
    expect(await measure(shelf(7, WEEK), tokens)).toEqual([`On demand now: ${written} tokens`, ''])
  }
})

test('A6: a call to a stowed tool is named on the card and lists the tool again from the next session', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world } = open(on, { isOn: true, [KEY]: shelf(7, { ...WEEK, SendFeedback: {} }, { stow: ['SendFeedback'] }) })

  await start($)
  await called($, 'PowerShell')
  expect((await card($)).fetch).toBe('Claude fetched PowerShell from the attic. Listed again next session.')
  await called($, 'Artifact', 'agent-7')
  await called($, 'Artifact', 'agent-7')
  expect((await card($)).fetch).toBe('Claude fetched Artifact and 1 more from the attic. Listed again next session.')
  await called($, 'SendFeedback')
  expect(await card($)).toMatchObject({ fetch: 'Claude fetched SendFeedback and 2 more from the attic. Stowed by you, so it stays.', counts: '3 tools in the attic, 1 forward.' })

  await turn($)
  const kept = saved(world)
  expect(kept.tools.PowerShell?.used).toEqual([8])

  await again($, world, kept)
  expect(await described($, 'PowerShell')).toEqual(plain('PowerShell'))
  expect(await described($, 'Artifact')).toEqual(plain('Artifact'))
  expect(await described($, 'SendFeedback')).toEqual({ ...plain('SendFeedback'), isDeferred: true })
  expect(await described($, 'WebFetch', true)).toEqual(plain('WebFetch', true))
  expect(await card($)).toMatchObject({ note: '1 away', fetch: '', counts: '1 tool in the attic.' })

  await again($, world, { ...kept, sessions: 10, tools: { ...kept.tools, WebFetch: tool(10, { isDeferred: true, used: [7] }) } })
  expect(await described($, 'WebFetch', true)).toEqual(plain('WebFetch', true))
  await again($, world, { ...kept, sessions: 10, tools: { ...kept.tools, WebFetch: tool(10, { isDeferred: true, used: [7, 9, 10] }) } })
  expect(await described($, 'WebFetch', true)).toEqual({ ...plain('WebFetch'), isDeferred: false })
})

test('A7: without ToolSearch nothing is moved, the card says so and calls are still counted', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { isOn: true, [KEY]: shelf(7, WEEK, { stow: ['Skill'], keep: ['WebSearch'] }) })
  scene.names = NAMES.filter(name => name !== 'ToolSearch')

  await start($)
  for (const name of ['PowerShell', 'Skill', 'Bash']) expect(await described($, name)).toEqual(plain(name))
  for (const name of ['WebFetch', 'WebSearch']) expect(await described($, name, true)).toEqual(plain(name, true))
  expect(scene.invalidates).toBe(0)

  const seen = await card($)
  expect(seen.note).toBe('no search')
  expect(seen.said).toBe(BLIND)
  expect(seen.lines).toEqual(['No ToolSearch in this session, so', 'nothing is moved. Still counting.'])
  expect(await say($, 'show')).toBe(['Attic, session 8 in project: 0 away, 0 forward.', BLIND].join('\n'))
  expect(await say($, 'stow Artifact')).toBe(`Artifact is on the stow list. ${BLIND}`)
  expect(await described($, 'Artifact')).toEqual(plain('Artifact'))

  await turn($)
  expect(saved(world).sessions).toBe(8)
  expect(saved(world).tools.Bash?.used).toEqual([3, 4, 5, 6, 7, 8])

  scene.names = []
  await again($, world, shelf(7, WEEK, { stow: ['Skill'] }))
  expect(scene.invalidates).toBe(0)
  expect(await card($)).toMatchObject({ note: 'no search', said: BLIND })
  for (const name of ['PowerShell', 'Skill']) expect(await described($, name)).toEqual(plain(name))
  expect(await say($, 'stow bash')).toBe('Bash is never put away.')
  expect(await say($, 'stow grep')).toBe('Grep is never put away.')
  expect(await say($, 'keep grep')).toBe('No tool named grep in this session.')
})

test('A8: every tenth session airs the attic, and only a session that moves nothing sets the baseline', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const nine = Object.fromEntries(Object.entries(WEEK).map(([name, given]) => [name, { ...given, used: [...('used' in given ? given.used : [])].map(at => at + 2) }]))
  const { world } = open(on, { isOn: true, [KEY]: shelf(9, nine, { base: 3100, stow: ['Skill'] }) })

  await start($)
  expect(await described($, 'PowerShell')).toEqual(plain('PowerShell'))
  expect(await described($, 'WebFetch', true)).toEqual(plain('WebFetch', true))
  expect(await described($, 'Skill')).toEqual({ ...plain('Skill'), isDeferred: true })

  const seen = await card($)
  expect(seen.note).toBe('airing')
  expect(seen.said).toBe(AIRING)
  expect(seen.lines).toEqual(['Airing: every tool is where the', 'engine puts it this session, so a', 'stowed tool can earn its way back.', '1 tool in the attic.'])
  expect((await say($, 'show')).split('\n').slice(0, 3)).toEqual(['Attic, session 10 in project: 1 away, 0 forward.', AIRING, 'away Skill: stowed by you'])

  await turn($)
  expect(saved(world).sessions).toBe(10)
  expect(saved(world).base).toBe(3100)
  expect(await card($)).toMatchObject({ figure: 'On demand 3.1k -> 8.4k tokens', change: '5.3k less in every request' })

  await again($, world, shelf(9, nine, { base: 3100 }))
  expect((await card($)).lines).toEqual(['Airing: every tool is where the', 'engine puts it this session, so a', 'stowed tool can earn its way back.'])
  await turn($)
  expect(saved(world).base).toBe(8400)
  expect((await card($)).figure).toBe('On demand now: 8.4k tokens')
})

test('A9: stow and keep move a tool at once, write the book, release on a repeat and refuse the floor', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { isOn: true })

  await start($)
  expect(await described($, 'PowerShell')).toEqual(plain('PowerShell'))
  expect(await described($, 'WebFetch', true)).toEqual(plain('WebFetch', true))
  expect(await described($, 'Skill')).toEqual(plain('Skill'))

  expect(await say($, 'stow  powershell ')).toBe('PowerShell is in the attic from the next request. One prompt-cache miss.')
  expect(scene.invalidates).toBe(1)
  expect(books(world)).toBe(1)
  expect(saved(world).stow).toEqual(['PowerShell'])
  expect(await described($, 'PowerShell')).toEqual({ ...plain('PowerShell'), isDeferred: true })
  expect(await card($)).toMatchObject({ note: 'watching 1/5', still: '', counts: '1 tool in the attic.', unused: '2 tools never called here so far.' })
  expect(await say($, 'show')).toBe(
    ['Attic, session 1 of 5 in project: watching, nothing moved.', 'away PowerShell: stowed by you', 'would go Skill: never called here'].join('\n'),
  )
  await called($, 'Skill')
  expect(await card($)).toMatchObject({ counts: '1 tool in the attic.', unused: '1 tool never called here so far.' })

  expect(await say($, 'stow bash')).toBe('Bash is never put away.')
  expect(await say($, 'Keep webfetch')).toBe('WebFetch stays listed.')
  expect(scene.invalidates).toBe(2)
  expect(await described($, 'WebFetch', true)).toEqual({ ...plain('WebFetch'), isDeferred: false })
  expect((await card($)).counts).toBe('1 tool in the attic, 1 forward.')

  expect(await say($, 'keep SKILL')).toBe('Skill stays listed.')
  expect(scene.invalidates).toBe(2)
  expect(saved(world)).toMatchObject({ sessions: 1, stow: ['PowerShell'], keep: ['WebFetch', 'Skill'] })
  expect((await card($)).unused).toBe('1 tool never called here so far.')

  expect(await say($, 'keep PowerShell')).toBe('PowerShell stays listed.')
  expect(saved(world)).toMatchObject({ stow: [], keep: ['WebFetch', 'Skill', 'PowerShell'] })
  expect(scene.invalidates).toBe(3)
  expect(await say($, 'stow PowerShell')).toBe('PowerShell is in the attic from the next request. One prompt-cache miss.')
  expect(scene.invalidates).toBe(4)

  expect(await say($, 'stow POWERSHELL')).toBe('PowerShell is back to evidence.')
  expect(scene.invalidates).toBe(5)
  expect(await described($, 'PowerShell')).toEqual(plain('PowerShell'))
  expect(await say($, 'keep skill')).toBe('Skill is back to evidence.')
  expect(scene.invalidates).toBe(5)
  expect(await say($, 'keep WebFetch')).toBe('WebFetch is back to evidence.')
  expect(scene.invalidates).toBe(6)
  expect(saved(world)).toMatchObject({ stow: [], keep: [] })

  const before = books(world)
  expect(await say($, 'stow nosuch')).toBe('No tool named nosuch in this session.')
  expect(await say($, 'stow')).toBe(USAGE)
  expect(await say($, 'keep')).toBe(USAGE)
  expect(books(world)).toBe(before)
  expect(scene.invalidates).toBe(6)

  await again($, world)
  expect(await say($, 'keep webfetch')).toBe('WebFetch stays listed.')
  expect(scene.invalidates).toBe(7)
  expect(await say($, 'show')).toBe('Attic, session 1 of 5 in project: watching, nothing moved.')
  expect(await described($, 'WebFetch', true)).toEqual({ ...plain('WebFetch'), isDeferred: false })
  expect(await described($, 'WebFetch', true)).toEqual({ ...plain('WebFetch'), isDeferred: false })
  expect(await say($, 'show')).toBe(['Attic, session 1 of 5 in project: watching, nothing moved.', 'forward WebFetch: kept by you'].join('\n'))
  expect((await card($)).counts).toBe('Nothing in the attic, 1 forward.')
  expect(await say($, 'keep Agent')).toBe('Agent stays listed.')
  expect(scene.invalidates).toBe(8)
  expect(await described($, 'Agent')).toEqual(plain('Agent'))
  expect(await say($, 'show')).toBe(
    ['Attic, session 1 of 5 in project: watching, nothing moved.', 'forward WebFetch: kept by you', 'kept Agent: kept by you'].join('\n'),
  )
})

test('A10: show lists away, forward and kept tools in order with the figure last, and would-go rows in the dry run', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world } = open(on, {
    isOn: true,
    [KEY]: shelf(7, { ...WEEK, SendFeedback: { used: [7] }, Agent: { used: [6] } }, { base: 3100, stow: ['SendFeedback'], keep: ['WebSearch', 'Agent'] }),
  })

  await start($)
  await turn($)
  expect(await say($, 'SHOW')).toBe(
    [
      'Attic, session 8 in project: 3 away, 2 forward.',
      'away Artifact: no call in the last 5 sessions',
      'away PowerShell: no call in the last 5 sessions',
      'away SendFeedback: stowed by you',
      'forward WebFetch: called in 3 of the last 5 sessions',
      'forward WebSearch: kept by you',
      'kept Agent: kept by you',
      'On demand 3.1k -> 8.4k tokens, 5.3k less in every request',
    ].join('\n'),
  )

  const many = Object.fromEntries(Array.from({ length: 25 }, (_, at) => [`Tool${String(at + 1).padStart(2, '0')}`, {}]))
  await again($, world, shelf(2, { Bash: { used: [1, 2] }, ...many }))
  expect(await say($, 'show')).toBe('Attic, session 3 of 5 in project: watching, nothing moved.')
  for (const name of ['Bash', ...Object.keys(many)]) await described($, name)
  const rows = (await say($, 'show')).split('\n')
  expect(rows[0]).toBe('Attic, session 3 of 5 in project: watching, nothing moved.')
  expect(rows[1]).toBe('would go Tool01: never called here')
  expect(rows[20]).toBe('would go Tool20: never called here')
  expect(rows.slice(21)).toEqual(['and 5 more'])
})

test('A11: clear forgets this project alone and starts the dry run over', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const other = shelf(4, { Bash: { used: [4] } })
  const { world, scene } = open(on, { isOn: true, [KEY]: shelf(7, { Bash: { used: [7] }, PowerShell: {}, Skill: { used: [6] } }), 'book:/other/app': other })

  await start($)
  expect((await card($)).note).toBe('1 away')
  expect(scene.invalidates).toBe(1)
  expect(await say($, 'clear')).toBe('Attic cleared: 3 tools forgotten for project.')
  expect(scene.invalidates).toBe(2)
  expect(world.store.has(KEY)).toBe(false)
  expect(world.store.get('book:/other/app')).toEqual(other)
  expect(await card($)).toMatchObject({ note: 'watching 1/5', said: EMPTY })
  expect(await described($, 'PowerShell')).toEqual(plain('PowerShell'))

  await called($, 'Bash')
  await called($, 'Bash')
  expect(await say($, 'Clear')).toBe('Attic cleared: 2 tools forgotten for project.')
  await called($, 'Bash')
  expect(await say($, 'clear')).toBe('Attic cleared: 1 tool forgotten for project.')
  expect(scene.invalidates).toBe(2)
  expect(world.store.has(KEY)).toBe(false)

  await turn($)
  expect(saved(world).sessions).toBe(1)
})

test('A12: the plan is made at session.start and at the switch, and each invalidates once only when it moves a tool', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { isOn: true })
  const moving = shelf(7, WEEK, { stow: ['Skill'] })

  expect(await described($, 'PowerShell')).toEqual(plain('PowerShell'))
  await start($)
  expect(scene.invalidates).toBe(0)
  expect(scene.lists).toBe(1)
  expect(await card($)).toMatchObject({ still: 'Nothing moved yet.', unused: '1 tool never called here so far.' })
  expect(await say($, 'show')).toBe(['Attic, session 1 of 5 in project: watching, nothing moved.', 'would go PowerShell: never called here'].join('\n'))
  await say($, 'on')
  expect(scene.lists).toBe(1)

  await say($, 'off')
  expect(scene.invalidates).toBe(0)
  world.store.set(KEY, moving)
  await say($, 'on')
  expect(scene.invalidates).toBe(1)
  expect(scene.lists).toBe(2)
  expect(await described($, 'PowerShell')).toEqual({ ...plain('PowerShell'), isDeferred: true })
  expect(await described($, 'WebFetch', true)).toEqual({ ...plain('WebFetch'), isDeferred: false })
  expect(scene.lists).toBe(2)

  await called($, 'PowerShell')
  const before = books(world)
  await say($, 'off')
  expect(scene.invalidates).toBe(2)
  expect(books(world)).toBe(before + 1)
  expect(saved(world).tools.PowerShell?.used).toEqual([8])
  for (const name of ['PowerShell', 'Skill']) expect(await described($, name)).toEqual(plain(name))
  expect(await described($, 'WebFetch', true)).toEqual(plain('WebFetch', true))

  world.store.delete(KEY)
  await say($, 'on')
  expect(scene.invalidates).toBe(2)
  expect(await card($)).toMatchObject({ note: 'watching 1/5', said: EMPTY, fetch: '', figure: '' })

  await say($, 'off')
  world.store.set(KEY, moving)
  world.store.set('isOn', true)
  await session($)
  expect(scene.invalidates).toBe(3)
  expect(await described($, 'Skill')).toEqual({ ...plain('Skill'), isDeferred: true })
})

test('A13: while off the verbs answer that Attic is off and nothing is placed, counted, measured or written', { plugins: [LAYOUT, PEEK], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { [KEY]: shelf(7, WEEK, { stow: ['Skill'] }) })
  const peek = async (): Promise<string> => (await $.command.run(run('peek'))).text ?? ''

  await start($)
  const before = await peek()
  for (const verb of ['show', 'keep PowerShell', 'stow PowerShell', 'clear']) expect(await say($, verb)).toBe('Attic is off.')
  expect(await described($, 'Skill')).toEqual(plain('Skill'))
  expect(await described($, 'WebFetch', true)).toEqual(plain('WebFetch', true))
  expect(await called($, 'PowerShell')).toEqual(RAN)
  await turn($)

  expect(await peek()).toBe(before)
  expect(world.writes).toEqual([])
  expect(world.store.get('isOn')).toBeUndefined()
  expect(scene).toMatchObject({ usages: 0, lists: 0, invalidates: 0 })

  world.store.set('isOn', true)
  expect(await described($, 'Skill')).toEqual(plain('Skill'))
  expect(await peek()).toBe(before)
  const ui = await $.ui.mount(target(NAME, 'Pane'))
  expect(await ui.find({ key: 'card' })).toBeUndefined()
  await ui.unmount()
  expect(await say($, 'stow PowerShell')).toBe('Attic is off.')
  expect([...world.store.keys()].sort()).toEqual([KEY, 'isOn'])

  const stored: Record<string, unknown> = {}
  const left = bench(stored)
  await left.raise('session.start', { cwd: '/work/project' }, { cwd: '/work/project' })
  stored.isOn = true
  const answer = plain('Skill')
  expect(await left.raise('tool.describe', { tool: 'Skill', description: answer.description, provider: { plugin: 'engine', tier: 'core' } }, answer)).toBe(answer)
  expect([...left.state].map(([key, held]) => [key, held.value, held.version])).toEqual([['isOn', false, 1]])
  expect(left.reads).toEqual(['isOn'])
})

test('A14: every state keeps inside the border at 20, 40 and 60 columns and takes its narrow forms under 30', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { isOn: true })
  const fits = async (): Promise<void> => {
    for (const columns of [20, 28, 30, 40, 60]) {
      const seen = await card($, columns)
      expect(seen.lines.length).toBeGreaterThan(0)
      for (const line of [seen.note, ...seen.lines]) expect([...line].length).toBeLessThanOrEqual(seen.width - 4)
    }
  }

  await start($)
  await fits()
  expect((await card($, 20)).note).toBe('1/5')
  expect((await card($, 20)).said).toBe(EMPTY)

  await again($, world, shelf(2, { Bash: { used: [1, 2] }, PowerShell: {}, Artifact: {} }))
  for (const name of ['Bash', 'PowerShell', 'Artifact']) await described($, name)
  await turn($)
  await fits()
  expect((await card($, 20)).lines).toEqual(['nothing moved', '2 never called', '8.4k on demand'])
  expect((await card($, 40)).lines).toEqual(['Nothing moved yet.', '2 tools never called here so far.', 'On demand now: 8.4k tokens'])

  await again($, world, shelf(7, WEEK, { base: 3100, stow: [GITHUB] }))
  await called($, 'PowerShell')
  await turn($)
  await fits()
  expect((await card($, 20)).lines).toEqual(['fetched PowerSh…', '3 away, 1 fwd', '3.1k -> 8.4k', '-5.3k/request'])
  await called($, GITHUB)
  await fits()
  expect((await card($, 20)).note).toBe('3 away')
  expect((await card($, 20)).lines).toEqual(['fetched mcp_… +1', 'stays stowed', '3 away, 1 fwd', '3.1k -> 8.4k', '-5.3k/request'])
  expect((await card($, 40)).lines).toEqual([
    'Claude fetched mcp__github__search_…',
    'and 1 more from the attic. Stowed by',
    'you, so it stays.',
    '3 tools in the attic, 1 forward.',
    'On demand 3.1k -> 8.4k tokens',
    '5.3k less in every request',
  ])

  scene.rows = waiting(2000)
  await again($, world, shelf(7, { Bash: { used: [7] }, WebFetch: { isDeferred: true, used: [3, 5, 7] } }, { base: 3100 }))
  await turn($)
  await fits()
  expect(await card($, 20)).toMatchObject({ note: '1 forward', lines: ['0 away, 1 fwd', '3.1k -> 2.0k', '+1.1k/request'] })
  expect((await card($, 40)).counts).toBe('Nothing in the attic, 1 forward.')

  await again($, world, shelf(7, { Bash: { used: [7] } }))
  await fits()
  expect(await card($, 20)).toMatchObject({ note: '0 away', lines: ['nothing moved'] })
  expect((await card($, 40)).still).toBe('Nothing to move this session.')

  await again($, world, shelf(9, WEEK, { stow: ['Skill'] }))
  await fits()
  expect(await card($, 20)).toMatchObject({ note: 'airing', said: AIRING, counts: '1 away, 0 fwd' })

  scene.names = ['Bash', 'Read', 'PowerShell']
  await again($, world, shelf(7, WEEK))
  await fits()
  expect(await card($, 20)).toMatchObject({ note: 'no search', said: BLIND })
})

test('A15: verbs ignore case, stray words get the usage, and a worktree shares the main tree book', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on)
  scene.repo = { root: 'C:\\Work\\App', branch: 'feature' }
  scene.root = 'C:\\Work\\App-worktrees\\feature'

  await start($)
  for (const verb of ['SHOW', 'Keep PowerShell', 'STOW PowerShell', 'cLear']) expect(await say($, verb)).toBe('Attic is off.')
  expect(world.store.get('isOn')).toBeUndefined()
  expect(world.writes).toEqual([])

  expect(await say($, 'ON')).toBe('Attic on; /widgets places it.')
  expect(await say($, 'SHOW')).toBe('Attic, session 1 of 5 in app: watching, nothing moved.')
  const before = world.writes.length
  for (const words of ['attic', 'keep a b', 'show all', 'clear now', 'on please']) expect(await say($, words)).toBe(USAGE)
  expect(world.writes.length).toBe(before)
  expect(world.store.get('isOn')).toBe(true)

  await turn($)
  expect(saved(world, 'book:c:/work/app').sessions).toBe(1)

  await say($, 'off')
  scene.repo = null
  scene.root = 'c:/work/app/'
  await say($, 'on')
  expect((await card($)).note).toBe('watching 2/5')
  await turn($)
  expect(saved(world, 'book:c:/work/app').sessions).toBe(2)
  expect([...world.store.keys()].filter(key => key.startsWith('book:'))).toEqual(['book:c:/work/app'])

  await say($, 'off')
  scene.root = '/'
  await say($, 'on')
  expect(await say($, 'show')).toBe('Attic, session 1 of 5 in /: watching, nothing moved.')
})

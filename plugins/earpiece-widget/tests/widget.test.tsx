import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { AgentInfo, AgentStatus, On, SessionMessage, ToolUseSummary } from 'claude-code'

import type { EarpieceRow } from '../types'
import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Said = SessionMessage[] | { deny: string } | Error
type Planted = NonNullable<EarpieceRow['whisper']>
type Desk = {
  world: Ground
  agents: AgentInfo[]
  said: Map<string, Said>
  lists: number
  reads: string[]
  sends: { to: unknown; text: string }[]
  calls: unknown[]
  plants: Map<string, Planted>
  isDeaf: boolean
  hold: Promise<void> | undefined
}
type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] }
type Drawn = {
  title: string
  note: string
  names: string[]
  marks: string[]
  lines: string[]
  dims: boolean[]
  more: string | undefined
  hint: string | undefined
  sentence: string[]
  color: unknown
}

const NAME = 'earpiece-widget'
const HINT = '/whisper <number> <note>'
const EMPTY = `No agents running. When Claude starts subagents, each gets a row here, and ${HINT} slips one a note.`
const BLIND = 'Could not read the agents.'
const OFF = 'Earpiece is off.'
const USAGE = 'Usage: /whisper <number> <note>'
const UNREACHED = 'Agent 2 could not be reached: '
const NOTE = 'Note from the person running this session, typed while you work (sent with /whisper): leave tests alone'
const HOUR = 3_600_000
const STARTED = { model: 'claude-opus-5-5', agentId: 'a1f0c2d4e5b60718' }

const agent = (id: string, description: string, status: AgentStatus = 'running', more: Partial<AgentInfo> = {}): AgentInfo => ({
  id,
  description,
  type: 'general-purpose',
  status,
  ...more,
})

const AUDIT = agent('a1f0c2d4e5b60718', 'audit the auth module')
const TESTS = agent('b7e94103aa5c2f6d', 'rewrite tests')
const LOG = agent('c03d58e1f7a94b20', 'update the changelog')

const use = (tool: string, text?: string): ToolUseSummary => ({
  tool_use_id: `toolu_${tool}`,
  tool,
  input: {},
  ...(text === undefined ? {} : { result: text, text }),
})

const says = (text: string, ...toolUses: ToolUseSummary[]): SessionMessage => ({ role: 'assistant', text, toolUses })

const hears = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })

const AUDIT_SAID = [hears('Audit the auth module and report every caller that skips the token check.'), says('I will start with the callers of verify().\n\nTwo callers skip the token check.', use('Grep'))]
const TESTS_SAID = [hears('Rewrite the tests for src/sum.js.'), says('The old suite is thin. Now rewriting the tests folder.', use('Edit'))]
const LOG_SAID = [hears('Add the 2.4.0 entry to the changelog.')]

const WATCH: Plugin = {
  name: 'stand-in-watch',
  tier: 'append',
  register(on) {
    on('command.register', async ($, e, next) => {
      await $.ui.toast(JSON.stringify(e))

      return next(e)
    })
    on('command.run', { command: 'peek' }, async $ => ({
      text: JSON.stringify((await $.state.get({ plugin: 'earpiece-widget', key: 'roster' } as const)).value),
    }))
  },
}

const DEMO_CLOCK: Plugin = {
  name: 'stand-in-demo-clock',
  tier: 'append',
  register(on) {
    on('clock.sleep', async () => {
      throw new TypeError('$.clock.sleep is not a function')
    })
  },
}

const STOPPED_CLOCK: Plugin = {
  name: 'stand-in-stopped-clock',
  tier: 'append',
  register(on) {
    on('clock.now', () => new Promise<never>(() => undefined))
  },
}

const PLUGINS = { plugins: [LAYOUT, WATCH] }

const open = (on: On, given: { store?: Record<string, unknown>; isBare?: boolean; isSlow?: boolean } = {}): Desk => {
  const desk: Desk = {
    world: undefined as never,
    agents: [],
    said: new Map(),
    lists: 0,
    reads: [],
    sends: [],
    calls: [],
    plants: new Map(),
    isDeaf: false,
    hold: undefined,
  }
  const list = (): AgentInfo[] => {
    desk.lists += 1
    if (desk.isDeaf) throw new Error('the agent roster is not available')

    return desk.agents.map(listed => ({ ...listed }))
  }
  desk.world = ground(on, {
    store: given.store ?? {},
    answers: {
      ...(given.isBare || given.isSlow ? {} : { 'agent.list': list }),
      'session.messages': (e: { agentId: string }) => {
        desk.reads.push(e.agentId)
        const said = desk.said.get(e.agentId) ?? []
        if (said instanceof Error) throw said

        return Array.isArray(said) ? [...said] : said
      },
    } as never,
  })
  on('session.send', async (_$, e) => {
    desk.sends.push({ to: e.to, text: e.text })

    return { isDelivered: true } as never
  })
  on('state.set', async (_$, e, next) => {
    const write = e as { plugin: string; key: string; value: unknown }
    if (write.plugin !== NAME || write.key !== 'roster' || desk.plants.size === 0) return next(e)

    const held = write.value as { rows: EarpieceRow[] }
    const rows = held.rows.map(row => {
      const whisper = desk.plants.get(row.id)
      desk.plants.delete(row.id)

      return whisper === undefined ? row : { ...row, whisper }
    })

    return next({ ...write, value: { ...held, rows } } as never)
  })
  if (given.isSlow) {
    on('agent.list', async () => {
      const listed = list()
      await desk.hold

      return { value: listed } as never
    })
  }
  on('agent.spawn', async () => STARTED)
  on('tool.call', async (_$, e) => {
    desk.calls.push(e)

    return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' } as never
  })

  return desk
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const idle = async (): Promise<void> => {
  await new Promise(done => setTimeout(done, 0))
}

const spawn = async ($: Engine): Promise<unknown> => {
  const started = await $.agent.spawn({
    tool_use_id: 'toolu_agent_1',
    prompt: 'Audit the auth module and report every caller that skips the token check.',
    description: 'audit the auth module',
    subagentType: 'general-purpose',
    provider: { kind: 'composer' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  } as never)
  await idle()

  return started
}

const tick = async ($: Engine, agentId: string): Promise<unknown> => {
  const answer = await $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId: 'turn-1', reason: 'answer', agentId } as never)
  await idle()

  return answer
}

const work = (agentId?: string) =>
  ({ tool: 'Bash', tool_use_id: 'toolu_bash_7', command: 'npm test', ...(agentId === undefined ? {} : { agentId }) }) as never

const call = async ($: Engine, agentId?: string): Promise<unknown> => {
  const result = await $.tool.call(work(agentId))
  await idle()

  return result
}

const whisper = async ($: Engine, args = ''): Promise<string> => {
  const { text } = await $.command.run(run('whisper', args))
  await idle()

  return text ?? ''
}

const ask = async ($: Engine, desk: Desk, args: string): Promise<string> => {
  let text: string | undefined
  void $.command.run(run('whisper', args)).then(answer => {
    text = answer.text ?? ''
  })
  for (let step = 0; step < 6 && text === undefined; step += 1) {
    await idle()
    if (text === undefined) await desk.world.clock.advance(750)
  }
  await idle()

  return text ?? 'no answer within the bound'
}

const pass = async (desk: Desk, ms: number): Promise<void> => {
  await desk.world.clock.advance(ms)
  await idle()
}

const set = (desk: Desk, id: string, status: AgentStatus): void => {
  desk.agents = desk.agents.map(listed => (listed.id === id ? { ...listed, status } : listed))
}

const add = (desk: Desk, id: string, ...more: SessionMessage[]): void => {
  const said = desk.said.get(id)
  desk.said.set(id, [...(Array.isArray(said) ? said : []), ...more])
}

const plant = async ($: Engine, desk: Desk, id: string, status: Planted['status'] = 'sent', seen: number | null = null): Promise<void> => {
  desk.plants.set(id, { note: NOTE, status, seen })
  await tick($, id)
}

const rows = async ($: Engine): Promise<EarpieceRow[]> => (JSON.parse((await $.command.run(run('peek'))).text ?? '') as { rows: EarpieceRow[] }).rows

const read = (node: Node | string | undefined): string =>
  typeof node === 'string' ? node : (node?.children ?? []).map(read).join('')

const keyed = (node: Node | string | undefined, key: string): Node | undefined => {
  if (node === undefined || typeof node === 'string') return undefined
  if (node.props?.key === key) return node

  return (node.children ?? []).map(kid => keyed(kid, key)).find(found => found !== undefined)
}

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const tree = (await ui.drawn()) as Node
  await ui.unmount()
  const title = read(keyed(tree, 'title'))
  const note = read(keyed(tree, 'note'))
  const isRoster = keyed(tree, 'agents') !== undefined
  const body = (keyed(tree, 'agents') ?? keyed(tree, 'empty') ?? keyed(tree, 'blind'))?.children as Node[] | undefined
  if (keyed(tree, 'card') === undefined || body === undefined) return undefined

  const heads = body.filter(node => node.type === 'Box')
  const rest = body.filter(node => node.type === 'Text').map(read)
  const tail = isRoster ? rest.slice(heads.length) : []

  return {
    title,
    note,
    names: heads.map(head => read(head.children?.[0])),
    marks: heads.map(head => read(head.children?.[1])),
    lines: isRoster ? rest.slice(0, heads.length) : [],
    dims: heads.map(head => (head.children?.[0] as Node | undefined)?.props?.dimColor === true),
    more: tail.find(row => row.startsWith('+')),
    hint: tail.find(row => row.startsWith('/')),
    sentence: isRoster ? [] : rest,
    color: isRoster ? undefined : body[0]?.props?.color,
  }
}

const fits = (drawn: Drawn | undefined, columns: number): void => {
  const inner = columns - 4
  expect(drawn).toBeDefined()
  if (drawn === undefined) return

  expect(drawn.title).toBe('Earpiece')
  expect(drawn.title.length + (drawn.note === '' ? 0 : drawn.note.length + 1)).toBeLessThanOrEqual(inner)
  drawn.names.forEach((name, at) => {
    const mark = drawn.marks[at] ?? ''
    expect(name.length + (mark === '' ? 0 : mark.length + 1)).toBeLessThanOrEqual(inner)
  })
  for (const row of [...drawn.lines, ...drawn.sentence, drawn.more ?? '', drawn.hint ?? '']) expect(row.length).toBeLessThanOrEqual(inner)
}

const crowd = (count: number): AgentInfo[] =>
  ['audit the auth module', 'rewrite tests', 'update the changelog', 'check the docs build', 'profile the cold start', 'sort the imports', 'bump the lockfile']
    .concat(Array.from({ length: Math.max(0, count - 7) }, (_, at) => `shard ${at + 8} of the migration`))
    .slice(0, count)
    .map((description, at) => agent(`d${String(at + 1).padStart(3, '0')}9f3c5e7a1b2c`, description))

const fill = (desk: Desk, count: number): void => {
  desk.agents = crowd(count)
  desk.agents.forEach((listed, at) => desk.said.set(listed.id, [hears(`Brief ${at + 1}.`), says(`Running the ${listed.description} step now.`, use('Bash'))]))
}

const sized = async ($: Engine, on: On, columns: number): Promise<{ desk: Desk; busy: Drawn | undefined; over: Drawn | undefined }> => {
  const desk = open(on)

  await start($)
  if (columns > 40) await $.command.run(run('widen', `${NAME} ${columns}`))
  fits(await card($, columns), columns)

  fill(desk, 7)
  const ids = desk.agents.map(listed => listed.id)
  desk.said.set(ids[1]!, [hears('Brief 2.'), says('Understood, leaving tests alone.', use('Edit'))])
  desk.said.set(ids[2]!, [hears('Brief 3.')])
  set(desk, ids[2]!, 'waiting')
  await spawn($)
  await plant($, desk, ids[1]!, 'heard', 1)
  await plant($, desk, ids[3]!)
  const busy = await card($, columns)
  fits(busy, columns)

  desk.isDeaf = true
  await tick($, ids[0]!)
  fits(await card($, columns), columns)
  desk.isDeaf = false

  for (const id of ids) set(desk, id, 'failed')
  await tick($, ids[0]!)
  const over = await card($, columns)
  fits(over, columns)

  return { desk, busy, over }
}

test('A1: on with no agents shows the empty sentence and both commands are registered, whisper immediate', PLUGINS, async ($, on) => {
  const desk = open(on)

  await session($)
  expect(desk.lists).toBe(0)
  expect(desk.world.commands).toEqual([NAME, 'whisper'])
  const specs = desk.world.toasts.map(toast => JSON.parse(toast) as { name: string; immediate?: boolean; argumentHint?: string })
  expect(specs.find(spec => spec.name === 'whisper')).toMatchObject({ immediate: true, argumentHint: '<number> <note>' })
  expect(specs.find(spec => spec.name === NAME)?.immediate).toBeUndefined()

  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  const drawn = await card($)
  expect(drawn?.title).toBe('Earpiece')
  expect(drawn?.note).toBe('')
  expect(drawn?.sentence).toEqual(['No agents running. When Claude', 'starts subagents, each gets a row', 'here, and /whisper <number> <note>', 'slips one a note.'])
  expect(drawn?.sentence.join(' ')).toBe(EMPTY)
  expect(drawn?.names).toEqual([])
  expect(drawn?.hint).toBeUndefined()
  expect(desk.sends).toEqual([])
})

test('A2: a spawn that resolves gives three numbered rows, the note, the hint and its own result', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  desk.agents = [AUDIT, TESTS, LOG]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  desk.said.set(LOG.id, LOG_SAID)
  expect(await spawn($)).toEqual(STARTED)

  const drawn = await card($)
  expect(drawn?.note).toBe('3 live')
  expect(drawn?.names).toEqual(['1 audit the auth module', '2 rewrite tests', '3 update the changelog'])
  expect(drawn?.marks).toEqual(['Grep', 'Edit', ''])
  expect(drawn?.lines).toEqual(['  Two callers skip the token check.', '  Now rewriting the tests folder.', '  starting…'])
  expect(drawn?.dims).toEqual([false, false, false])
  expect(drawn?.hint).toBe(HINT)
  expect(desk.sends).toEqual([])
})

test('A2: a spawn whose agent is not listed yet is looked for again', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const lists = desk.lists
  await spawn($)
  expect((await card($))?.names).toEqual([])
  desk.agents = [AUDIT]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  await pass(desk, 750)
  expect((await card($))?.names).toEqual(['1 audit the auth module'])
  expect(desk.lists - lists).toBe(2)
  expect(desk.sends).toEqual([])
})

test('A2: a spawn that brings nothing new stops looking after three looks', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const lists = desk.lists
  await spawn($)
  await pass(desk, 750)
  await pass(desk, 750)
  expect(desk.lists - lists).toBe(3)
  await pass(desk, HOUR)
  expect(desk.lists - lists).toBe(3)
  expect(desk.sends).toEqual([])
})

test('A2: a long description with line breaks is one line of 80 characters and a blank one shows the type', PLUGINS, async ($, on) => {
  const desk = open(on)
  const brief = 'Go through every migration under db/migrations in order,\n  check each one against the schema dump,\n\tand list the ones that drop a column without a backfill, then open a draft with the fixes for review'
  const name = 'Go through every migration under db/migrations in order, check each one against…'

  desk.agents = [agent('d14e69f2a8b05c31', brief.padEnd(200, '.')), agent('e25f7a03b9c16d42', ' \n ', 'running', { type: 'code-reviewer' })]
  await start($)
  expect(name).toHaveLength(80)
  expect((await whisper($)).split('\n')).toEqual([`1 ${name}`, '2 code-reviewer'])
  expect((await rows($)).map(row => row.description)).toEqual([name, 'code-reviewer'])
  expect((await card($))?.names).toEqual(['1 Go through every migration under…', '2 code-reviewer'])
  expect(desk.sends).toEqual([])
})

test('A3: the line is the last sentence, the tool is the one in flight, and waiting shows when there is none', PLUGINS, async ($, on) => {
  const desk = open(on)
  const row = async (): Promise<EarpieceRow> => (await rows($))[0]!

  desk.agents = [AUDIT]
  desk.said.set(AUDIT.id, [hears('Audit the auth module.'), says('I read   the module.\n\nTwo callers skip\tthe token check.  '), says('   ')])
  await start($)
  expect(await row()).toMatchObject({ line: 'Two callers skip the token check.', tool: '' })
  expect((await card($))?.marks).toEqual([''])

  const long = `It turns out ${'that the session helper wraps the token helper and '.repeat(6)}nothing ends`
  add(desk, AUDIT.id, says(`Done with the callers. ${long}`, use('mcp__db__run_query_now')))
  await tick($, AUDIT.id)
  expect((await row()).line).toBe(long.slice(0, 200))
  expect((await row()).line.length).toBe(200)
  expect((await card($))?.marks).toEqual(['run_query_'])

  desk.said.set(AUDIT.id, [hears('Audit the auth module.'), says('Two callers skip the token check.', use('Bash', 'ok'))])
  await tick($, AUDIT.id)
  const answered = await card($)
  expect(answered?.marks).toEqual([''])
  expect(answered?.lines).toEqual(['  Two callers skip the token check.'])

  set(desk, AUDIT.id, 'waiting')
  await tick($, AUDIT.id)
  expect((await card($))?.marks).toEqual(['waiting'])

  add(desk, AUDIT.id, says('', use('Read')))
  await tick($, AUDIT.id)
  const reading = await card($)
  expect(reading?.marks).toEqual(['Read'])
  expect(reading?.note).toBe('1 live')
  expect(desk.sends).toEqual([])
})

test('A4: a refused append answers with its reason, leaves the rows as they were and tries nothing else', PLUGINS, async ($, on) => {
  const desk = open(on)

  desk.agents = [AUDIT, TESTS]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  await start($)
  await plant($, desk, AUDIT.id, 'heard', 1)
  const [lists, reads] = [desk.lists, desk.reads.length]

  const answer = await whisper($, '  2 Leave Tests alone  ')
  const reason = answer.slice(UNREACHED.length)
  expect(answer.startsWith(UNREACHED)).toBe(true)
  expect(reason).toContain('session.append')
  expect(reason).not.toMatch(/\s\s|\n/)
  expect(reason.length).toBeLessThanOrEqual(120)
  expect(await whisper($, '1 skip the vendored code')).toBe(answer.replace('Agent 2', 'Agent 1'))
  expect([desk.lists - lists, desk.reads.length - reads]).toEqual([2, 0])

  const held = await rows($)
  expect(held[1]?.whisper).toBeNull()
  expect(held[0]?.whisper).toEqual({ note: NOTE, status: 'heard', seen: 1 })
  const drawn = await card($)
  expect(drawn?.names).toEqual(['1 audit the auth module', '2 rewrite tests'])
  expect(drawn?.marks).toEqual(['Grep · heard', 'Edit'])
  expect(desk.sends).toEqual([])
})

test('A5: a sent whisper is heard on the first read with one more assistant message than the first read counted', PLUGINS, async ($, on) => {
  const desk = open(on)
  const kept = async (): Promise<EarpieceRow['whisper'] | undefined> => (await rows($))[1]?.whisper

  desk.agents = [AUDIT, TESTS]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  await start($)
  await plant($, desk, TESTS.id)
  expect(await kept()).toEqual({ note: NOTE, status: 'sent', seen: null })

  add(desk, TESTS.id, says('', use('Read')))
  await tick($, TESTS.id)
  expect(await kept()).toEqual({ note: NOTE, status: 'sent', seen: 2 })
  await tick($, TESTS.id)
  add(desk, TESTS.id, hears('<system-reminder>The fixtures folder changed on disk.</system-reminder>'))
  await tick($, TESTS.id)
  expect(await kept()).toEqual({ note: NOTE, status: 'sent', seen: 2 })
  expect((await card($))?.marks).toEqual(['Grep', 'Read · sent'])

  add(desk, TESTS.id, says('Understood, leaving tests alone.'))
  await tick($, TESTS.id)
  expect((await kept())?.status).toBe('heard')
  const drawn = await card($)
  expect(drawn?.marks).toEqual(['Grep', 'heard'])
  expect(drawn?.lines[1]).toBe('  Understood, leaving tests alone.')
  expect(desk.sends).toEqual([])
})

test('A5: a row that goes over while sent is missed, and heard when its last read has one more', PLUGINS, async ($, on) => {
  const desk = open(on)

  desk.agents = [AUDIT, TESTS, LOG]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  desk.said.set(LOG.id, [...LOG_SAID, says('Reading CHANGELOG.md.', use('Read'))])
  await start($)
  await plant($, desk, AUDIT.id)
  await plant($, desk, LOG.id)
  await plant($, desk, TESTS.id)
  expect((await rows($)).map(row => row.whisper?.seen)).toEqual([1, null, 1])

  add(desk, TESTS.id, says('Rewrote two of the five suites.'))
  add(desk, LOG.id, says('Added the 2.4.0 entry.'))
  for (const listed of [AUDIT, TESTS, LOG]) set(desk, listed.id, 'completed')
  await tick($, LOG.id)
  const drawn = await card($)
  expect(drawn?.note).toBe('done')
  expect(drawn?.names).toEqual(['1 audit the auth modu…', '2 rewrite tests', '3 update the changelog'])
  expect(drawn?.marks).toEqual(['done · missed', 'done · missed', 'done · heard'])
  expect(drawn?.lines[2]).toBe('  Added the 2.4.0 entry.')
  expect(desk.sends).toEqual([])
})

test('A5: a refresh that answers late does not turn heard back into sent', PLUGINS, async ($, on) => {
  const desk = open(on, { isSlow: true })
  let release = (): void => undefined

  desk.agents = [AUDIT, TESTS]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  await start($)
  await plant($, desk, TESTS.id)
  await tick($, TESTS.id)

  desk.hold = new Promise(done => {
    release = done
  })
  await tick($, TESTS.id)
  desk.hold = undefined
  add(desk, TESTS.id, says('Understood, leaving tests alone.', use('Read')))
  await tick($, TESTS.id)
  expect((await card($))?.marks).toEqual(['Grep', 'Read · heard'])

  desk.said.set(TESTS.id, TESTS_SAID)
  release()
  await idle()
  const drawn = await card($)
  expect(drawn?.marks).toEqual(['Grep', 'Read · heard'])
  expect(drawn?.lines[1]).toBe('  Understood, leaving tests alone.')
  expect(desk.sends).toEqual([])
})

test('A6: bare whisper lists what one fresh list and its reads say, with no timer period passed', PLUGINS, async ($, on) => {
  const desk = open(on)

  desk.agents = [AUDIT, TESTS]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  await start($)
  const [lists, reads] = [desk.lists, desk.reads.length]

  add(desk, TESTS.id, says('The fixtures are done. Moving on to the snapshots.', use('Bash')))
  expect(await whisper($)).toBe('1 audit the auth module · Grep · Two callers skip the token check.\n2 rewrite tests · Bash · Moving on to the snapshots.')
  expect([desk.lists - lists, desk.reads.length - reads]).toEqual([1, 2])
  expect(desk.sends).toEqual([])
})

test('A6: a row whose read is denied or rejects lists unread, keeps what it had and loses unread on the next read', PLUGINS, async ($, on) => {
  const desk = open(on)
  const slow = agent('4bb7e06291d38fca', 'profile the cold start')
  const sent = '2 rewrite tests · Edit · sent · unread · Now rewriting the tests folder.'

  desk.agents = [AUDIT, TESTS]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  await start($)
  await plant($, desk, TESTS.id)

  desk.said.set(TESTS.id, { deny: 'This agent cannot be read right now.' })
  expect((await whisper($)).split('\n')[1]).toBe(sent)
  expect((await rows($))[1]?.whisper?.seen).toBeNull()

  desk.agents = [AUDIT, TESTS, slow]
  for (const listed of desk.agents) desk.said.set(listed.id, new Error('the transcript is not written yet'))
  expect((await whisper($)).split('\n')).toEqual(['1 audit the auth module · Grep · unread · Two callers skip the token check.', sent, '3 profile the cold start · unread'])
  const drawn = await card($)
  expect(drawn?.marks).toEqual(['Grep', 'Edit · sent', ''])
  expect(JSON.stringify(drawn)).not.toContain('unread')

  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  expect((await whisper($)).split('\n')).toEqual([
    '1 audit the auth module · Grep · Two callers skip the token check.',
    '2 rewrite tests · Edit · sent · Now rewriting the tests folder.',
    '3 profile the cold start · unread',
  ])
  expect((await rows($))[1]?.whisper?.seen).toBe(1)
  expect(desk.sends).toEqual([])
})

test('A6: bare whisper answers from the card as it stands when the list does not answer in time', PLUGINS, async ($, on) => {
  const desk = open(on, { isSlow: true })

  desk.agents = [AUDIT]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  await start($)

  desk.hold = new Promise(() => undefined)
  add(desk, AUDIT.id, says('Three callers skip it after all.'))
  const asked = $.command.run(run('whisper'))
  await idle()
  await desk.world.clock.advance(3000)
  expect((await asked).text).toBe('1 audit the auth module · Grep · Two callers skip the token check.')
  expect(desk.sends).toEqual([])
})

test('A7: malformed, too long, unknown and finished whispers answer for themselves, and bare lists the rows', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(await whisper($)).toBe('No agents on the card.')

  desk.agents = [AUDIT, TESTS]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  await spawn($)
  await plant($, desk, TESTS.id, 'heard', 1)
  for (const args of ['x', '2', 'two words', '99999999999999999999999 hi', '10000 hi']) expect(await whisper($, args)).toBe(USAGE)
  expect(await whisper($, `2 ${'a'.repeat(301)}`)).toBe('A whisper is at most 300 characters.')
  expect(await whisper($)).toBe('1 audit the auth module · Grep · Two callers skip the token check.\n2 rewrite tests · Edit · heard · Now rewriting the tests folder.')

  set(desk, TESTS.id, 'completed')
  expect(await whisper($, '2 hi')).toBe('Agent 2 has finished.')
  desk.agents = [AUDIT]
  expect(await whisper($, '0002 hi')).toBe('Agent 2 has finished.')
  expect((await rows($))[1]?.whisper).toEqual({ note: NOTE, status: 'heard', seen: 1 })
  expect(desk.sends).toEqual([])
})

test('A7: a whisper typed before the card has the agent finds it in the list itself, at once or a look later', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(await rows($)).toEqual([])
  desk.agents = [AUDIT]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  const at = await desk.world.clock.now()
  const answer = await whisper($, '1 the word is heron')
  expect(answer.startsWith('Agent 1 could not be reached: ')).toBe(true)
  expect(answer).toContain('session.append')
  expect(await desk.world.clock.now()).toBe(at)
  expect((await card($))?.names).toEqual(['1 audit the auth module'])

  desk.said.set(TESTS.id, TESTS_SAID)
  const asked = $.command.run(run('whisper', '2 leave tests alone'))
  await idle()
  desk.agents = [AUDIT, TESTS]
  await pass(desk, 750)
  expect((await asked).text?.startsWith(UNREACHED)).toBe(true)
  expect((await card($))?.names).toEqual(['1 audit the auth module', '2 rewrite tests'])
  expect(await ask($, desk, '0009 hi')).toBe('No agent 9 on the card.')
  expect(desk.sends).toEqual([])
})

test('A7: a number that is not there answers no agent after three looks and reads nothing', PLUGINS, async ($, on) => {
  const desk = open(on, { isSlow: true })

  await start($)
  const lists = desk.lists
  const asked = $.command.run(run('whisper', '1 hi'))
  await pass(desk, 750)
  await pass(desk, 749)
  expect(desk.lists - lists).toBe(2)
  await pass(desk, 1)
  expect((await asked).text).toBe('No agent 1 on the card.')
  expect(await ask($, desk, '0 hi')).toBe('No agent 0 on the card.')
  expect(desk.lists - lists).toBe(6)
  expect(desk.reads).toEqual([])
  expect(await rows($)).toEqual([])
  expect(desk.sends).toEqual([])
})

test('A7: with a list that never answers, a whisper to a number that is not there still answers within its bound', PLUGINS, async ($, on) => {
  const desk = open(on, { isSlow: true })

  await start($)
  const lists = desk.lists
  desk.hold = new Promise(() => undefined)
  const asked = $.command.run(run('whisper', '1 hi'))
  await pass(desk, 4000)
  expect((await asked).text).toBe('No agent 1 on the card.')
  await pass(desk, HOUR)
  expect(desk.lists - lists).toBe(1)
  expect(desk.sends).toEqual([])
})

test('A8: finished agents keep number and line, dim, and an agent started meanwhile takes the next number', PLUGINS, async ($, on) => {
  const desk = open(on)

  desk.agents = [AUDIT, TESTS, LOG]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  desk.said.set(LOG.id, [...LOG_SAID, says('Added the 2.4.0 entry.', use('Edit'))])
  await start($)

  set(desk, AUDIT.id, 'completed')
  set(desk, TESTS.id, 'failed')
  set(desk, LOG.id, 'killed')
  desk.agents = [...desk.agents, agent('e5519a0c3b7d2f64', 'check the docs build')]
  await tick($, AUDIT.id)
  const mixed = await card($)
  expect(mixed?.note).toBe('1 live')
  expect(mixed?.names).toEqual(['4 check the docs build', '1 audit the auth module', '2 rewrite tests', '3 update the changelog'])
  expect(mixed?.marks).toEqual(['', 'done', 'failed', 'stopped'])
  expect(mixed?.dims).toEqual([false, true, true, true])
  expect(mixed?.lines.slice(1)).toEqual(['  Two callers skip the token check.', '  Now rewriting the tests folder.', '  Added the 2.4.0 entry.'])
  expect(desk.sends).toEqual([])
})

test('A8: a main turn drops the over rows and keeps live ones with their numbers', PLUGINS, async ($, on) => {
  const desk = open(on)
  const build = agent('e5519a0c3b7d2f64', 'check the docs build')
  const lock = agent('f6620b1d4c8e3a75', 'bump the lockfile')

  desk.agents = [agent(AUDIT.id, AUDIT.description), TESTS, build]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  await start($)
  set(desk, AUDIT.id, 'completed')
  set(desk, TESTS.id, 'failed')
  await tick($, AUDIT.id)

  await $.turn.start({ text: 'Carry on', turnId: 'turn-2' } as never)
  expect((await card($))?.names).toEqual(['3 check the docs build'])
  expect(await ask($, desk, '1 hi')).toBe('No agent 1 on the card.')

  desk.agents = [...desk.agents, lock]
  await spawn($)
  expect((await card($))?.names).toEqual(['3 check the docs build', '4 bump the lockfile'])
  expect(desk.sends).toEqual([])
})

test('A8: a main turn that leaves no row makes the next agent number 1', PLUGINS, async ($, on) => {
  const desk = open(on)
  const build = agent('e5519a0c3b7d2f64', 'check the docs build')
  const lock = agent('f6620b1d4c8e3a75', 'bump the lockfile')

  desk.agents = [build, lock]
  await start($)
  expect((await card($))?.names).toEqual(['1 check the docs build', '2 bump the lockfile'])

  set(desk, build.id, 'completed')
  set(desk, lock.id, 'completed')
  await tick($, lock.id)
  expect((await card($))?.note).toBe('done')
  await $.turn.start({ text: 'And again', turnId: 'turn-3' } as never)
  expect((await card($))?.sentence.join(' ')).toBe(EMPTY)

  desk.agents = [...desk.agents, agent('0773ac2e5d9f4b86', 'sort the imports')]
  await spawn($)
  expect((await card($))?.names).toEqual(['1 sort the imports'])
  expect(desk.sends).toEqual([])
})

test('A9: denied, idle and finished agents get no row or number, a rejected first read does, and a later deny keeps the line', PLUGINS, async ($, on) => {
  const desk = open(on)
  const mate = agent('1884bd3f6ea05c97', 'review the migration', 'running', { teammateId: 'reviewer@release' })
  const rest = agent('2995ce407fb16da8', 'wait for the review', 'idle')
  const gone = agent('3aa6df5180c27eb9', 'tag the release', 'completed')
  const slow = agent('4bb7e06291d38fca', 'profile the cold start')
  const nested = agent('5cc8f173a2e4900b', 'grep the fixtures', 'running', { parentId: AUDIT.id })

  desk.agents = [AUDIT, mate, TESTS, rest, gone, slow, nested]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(mate.id, { deny: 'This agent runs in its own pane.' })
  desk.said.set(TESTS.id, TESTS_SAID)
  desk.said.set(slow.id, new Error('the transcript is not written yet'))
  desk.said.set(nested.id, [hears('List the fixture files.'), says('Found nine fixture files.', use('Grep'))])
  await start($)

  const drawn = await card($)
  expect(drawn?.note).toBe('4 live')
  expect(drawn?.names).toEqual(['1 audit the auth module', '2 rewrite tests', '3 profile the cold start', '4 grep the fixtures'])
  expect(drawn?.lines).toEqual(['  Two callers skip the token check.', '  Now rewriting the tests folder.', '  starting…', '  Found nine fixture files.'])
  expect(drawn?.more).toBeUndefined()

  await tick($, AUDIT.id)
  await tick($, TESTS.id)
  expect(desk.reads.filter(id => id === mate.id)).toHaveLength(1)
  expect(desk.reads).not.toContain(rest.id)
  expect(desk.reads).not.toContain(gone.id)

  desk.said.set(AUDIT.id, { deny: 'This agent cannot be read right now.' })
  await tick($, AUDIT.id)
  expect(await card($)).toEqual(drawn)
  expect(desk.sends).toEqual([])
})

test('A10: seven live agents draw four and a count, live before over, and a refresh reads only what it needs', PLUGINS, async ($, on) => {
  const desk = open(on)

  fill(desk, 7)
  await start($)
  const drawn = await card($)
  expect(drawn?.note).toBe('7 live')
  expect(drawn?.names).toEqual(['1 audit the auth module', '2 rewrite tests', '3 update the changelog', '4 check the docs build'])
  expect(drawn?.more).toBe('+3 more')

  const ids = desk.agents.map(listed => listed.id)
  desk.reads = []
  await tick($, ids[0]!)
  expect(desk.reads.toSorted()).toEqual(ids.slice(0, 4).toSorted())

  await plant($, desk, ids[5]!)
  desk.reads = []
  await tick($, ids[0]!)
  expect(desk.reads.toSorted()).toEqual([...ids.slice(0, 4), ids[5]!].toSorted())
  expect((await whisper($)).split('\n')).toHaveLength(7)

  for (const id of [ids[0]!, ...ids.slice(3)]) set(desk, id, 'completed')
  await tick($, ids[0]!)
  const mixed = await card($)
  expect(mixed?.note).toBe('2 live')
  expect(mixed?.names).toEqual(['2 rewrite tests', '3 update the changelog', '1 audit the auth module', '4 check the docs build'])
  expect(mixed?.dims).toEqual([false, false, true, true])
  expect(mixed?.more).toBe('+3 more')
  expect(desk.sends).toEqual([])
})

test('A11: the timer runs only with a live row, agent tool calls are throttled, and every call passes through unchanged', PLUGINS, async ($, on) => {
  const desk = open(on)

  desk.agents = [AUDIT]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  await start($)
  expect(desk.lists).toBe(1)

  await pass(desk, 3000)
  expect(desk.lists).toBe(2)

  await pass(desk, 1000)
  await Promise.all([$.tool.call(work(AUDIT.id)), $.tool.call(work(AUDIT.id))])
  await idle()
  expect(desk.lists).toBe(3)
  await pass(desk, 500)
  await call($, AUDIT.id)
  expect(desk.lists).toBe(3)
  await pass(desk, 500)
  await call($, AUDIT.id)
  expect(desk.lists).toBe(4)
  await call($)
  expect(desk.lists).toBe(4)
  expect(desk.calls).toEqual([work(AUDIT.id), work(AUDIT.id), work(AUDIT.id), work(AUDIT.id), work()])

  await pass(desk, 1000)
  expect(desk.lists).toBe(5)
  set(desk, AUDIT.id, 'completed')
  await pass(desk, 3000)
  expect(desk.lists).toBe(6)
  expect((await card($))?.note).toBe('done')
  await pass(desk, HOUR)
  expect(desk.lists).toBe(6)
  expect(desk.sends).toEqual([])
})

test('A11: with a list that never answers, an agent tool call, turn and spawn still resolve, and later refreshes still land', PLUGINS, async ($, on) => {
  const desk = open(on, { isSlow: true })

  desk.agents = [AUDIT]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  await start($)

  desk.hold = new Promise(() => undefined)
  await desk.world.clock.advance(1000)
  expect(await call($, AUDIT.id)).toEqual({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' })
  expect(await tick($, AUDIT.id)).toEqual({ text: 'Done.' })
  expect(await spawn($)).toEqual(STARTED)
  expect(desk.lists).toBe(4)
  expect((await card($))?.names).toEqual(['1 audit the auth module'])

  desk.hold = undefined
  desk.agents = [AUDIT, TESTS]
  desk.said.set(TESTS.id, TESTS_SAID)
  await pass(desk, 3000)
  expect((await card($))?.names).toEqual(['1 audit the auth module', '2 rewrite tests'])
  expect(desk.sends).toEqual([])
})

test('A11: with a list that never answers, a restored session start and switching on still return', PLUGINS, async ($, on) => {
  const desk = open(on, { isSlow: true, store: { isOn: true } })

  desk.agents = [AUDIT]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.hold = new Promise(() => undefined)
  const begun = session($)
  await idle()
  await desk.world.clock.advance(3000)
  await begun
  await $.command.run(run('place', 'side'))
  expect((await card($))?.sentence.join(' ')).toBe(EMPTY)

  await $.command.run(run(NAME, 'off'))
  const asked = $.command.run(run(NAME, 'on'))
  await idle()
  await desk.world.clock.advance(3000)
  expect((await asked).text).toBe('Earpiece on; /widgets places it.')
  expect(desk.lists).toBe(2)
  expect(desk.sends).toEqual([])
})

test('A11: an agent tool call reaches next while the clock and the list are still unanswered', { plugins: [LAYOUT, WATCH, STOPPED_CLOCK] }, async ($, on) => {
  const desk = open(on, { isSlow: true })

  desk.agents = [AUDIT]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  await start($)

  desk.hold = new Promise(() => undefined)
  expect(await call($, AUDIT.id)).toEqual({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' })
  expect(desk.calls).toEqual([work(AUDIT.id)])
  expect(desk.lists).toBe(1)
  expect(desk.sends).toEqual([])
})

test('A12: on a clock with no sleep, bare whisper still answers and the card still draws the error state', { plugins: [LAYOUT, WATCH, DEMO_CLOCK] }, async ($, on) => {
  const desk = open(on, { isBare: true })

  await start($)
  expect(await whisper($)).toBe(BLIND)
  expect((await card($))?.sentence).toEqual([BLIND])
  expect(desk.sends).toEqual([])
})

test('A12: a list that rejects shows only the error sentence and the next one that answers brings the rows back', PLUGINS, async ($, on) => {
  const desk = open(on)

  desk.agents = [AUDIT, TESTS]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  await start($)
  const before = await card($)

  desk.isDeaf = true
  await tick($, AUDIT.id)
  const blind = await card($)
  expect(blind?.sentence).toEqual([BLIND])
  expect(blind?.color).toBe('red')
  expect(blind?.note).toBe('')
  expect(blind?.names).toEqual([])
  expect(blind?.hint).toBeUndefined()
  for (const args of ['1 hi', '9 hi', '']) expect(await whisper($, args)).toBe(BLIND)

  desk.isDeaf = false
  await tick($, AUDIT.id)
  expect(await card($)).toEqual(before)
  expect(before?.names).toEqual(['1 audit the auth module', '2 rewrite tests'])
  expect(desk.sends).toEqual([])
})

test('A12: with no agent answer at all the card still draws the error state', PLUGINS, async ($, on) => {
  const desk = open(on, { isBare: true })

  await start($)
  const blind = await card($)
  expect(blind?.sentence).toEqual([BLIND])
  expect(blind?.note).toBe('')
  expect(await whisper($, '1 hi')).toBe(BLIND)
  expect(await whisper($)).toBe(BLIND)
  expect(desk.sends).toEqual([])
})

test('A13: off reads and sends nothing, switching off empties the roster and stops the timer, and only isOn is stored', PLUGINS, async ($, on) => {
  const desk = open(on)

  desk.agents = [AUDIT, TESTS]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, TESTS_SAID)
  await session($)
  await $.command.run(run('place', 'side'))
  expect(await spawn($)).toEqual(STARTED)
  await $.tool.call(work(AUDIT.id))
  await tick($, AUDIT.id)
  await $.turn.start({ text: 'Carry on', turnId: 'turn-2' } as never)
  await pass(desk, HOUR)
  expect(await whisper($, '1 hi')).toBe(OFF)
  expect(await whisper($)).toBe(OFF)
  expect([desk.lists, desk.reads.length]).toEqual([0, 0])
  expect(desk.calls).toEqual([work(AUDIT.id)])

  await $.command.run(run(NAME, 'on'))
  expect((await card($))?.names).toEqual(['1 audit the auth module', '2 rewrite tests'])
  await $.command.run(run(NAME, 'off'))
  const lists = desk.lists
  await pass(desk, HOUR)
  await tick($, AUDIT.id)
  expect(desk.lists).toBe(lists)
  expect(await card($)).toBeUndefined()

  desk.agents = [agent(AUDIT.id, AUDIT.description, 'completed'), agent(TESTS.id, TESTS.description, 'completed'), LOG]
  desk.said.set(LOG.id, LOG_SAID)
  await $.command.run(run(NAME, 'on'))
  expect((await card($))?.names).toEqual(['1 update the changelog'])
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
  expect(new Set(desk.world.writes)).toEqual(new Set(['store isOn']))
  expect(desk.sends).toEqual([])
})

test('A14: every state fits 20 columns, with the short mark, no hint and the title whole beside 12 live', PLUGINS, async ($, on) => {
  const { desk, busy, over } = await sized($, on, 20)

  expect(busy?.note).toBe('7 live')
  expect(busy?.names).toEqual(['1 audit th…', '2 rewrite…', '3 updat…', '4 check th…'])
  expect(busy?.marks).toEqual(['Bash', 'heard', 'waiting', 'sent'])
  expect(busy?.lines[2]).toBe('  starting…')
  expect(busy?.more).toBe('+3 more')
  expect(busy?.hint).toBeUndefined()
  expect(over?.note).toBe('done')
  expect(over?.marks).toEqual(['failed', 'heard', 'failed', 'missed'])

  await $.turn.start({ text: 'Fan the migration out', turnId: 'turn-2' } as never)
  fill(desk, 12)
  await spawn($)
  const dozen = await card($, 20)
  fits(dozen, 20)
  expect(dozen?.note).toBe('12 live')
  expect(desk.sends).toEqual([])
})

test('A14: every state fits 40 columns, with both words in the mark and the hint row', PLUGINS, async ($, on) => {
  const { desk, busy, over } = await sized($, on, 40)

  expect(busy?.marks).toEqual(['Bash', 'Edit · heard', 'waiting', 'Bash · sent'])
  expect(busy?.hint).toBe(HINT)
  expect(busy?.more).toBe('+3 more')
  expect(over?.note).toBe('done')
  expect(over?.marks).toEqual(['failed', 'failed · heard', 'failed', 'failed · missed'])
  expect(over?.hint).toBeUndefined()
  expect(desk.sends).toEqual([])
})

test('A14: every state fits 60 columns when the card is widened', PLUGINS, async ($, on) => {
  const { desk, busy, over } = await sized($, on, 60)

  expect(busy?.names[3]).toBe('4 check the docs build')
  expect(busy?.marks[3]).toBe('Bash · sent')
  expect(busy?.lines[0]).toBe('  Running the audit the auth module step now.')
  expect(busy?.hint).toBe(HINT)
  expect(over?.note).toBe('done')
  expect(desk.sends).toEqual([])
})

test('A14: a hundred live agents read 99+ live, and 99+ alone where the title would touch it', PLUGINS, async ($, on) => {
  const desk = open(on)

  fill(desk, 100)
  await start($)
  const [narrow, normal] = [await card($, 20), await card($, 40)]
  fits(narrow, 20)
  fits(normal, 40)
  expect(normal?.note).toBe('99+ live')
  expect(narrow?.note).toBe('99+')
  expect(narrow?.more).toBe('+96 more')
  expect(desk.sends).toEqual([])
})

test('A15: the best-moment card is the same in all three placements and absent from the other two', PLUGINS, async ($, on) => {
  const desk = open(on)

  desk.agents = [AUDIT, TESTS, LOG]
  desk.said.set(AUDIT.id, AUDIT_SAID)
  desk.said.set(TESTS.id, [...TESTS_SAID, says('Understood, leaving tests alone.', use('Read'))])
  desk.said.set(LOG.id, [...LOG_SAID, says('Added the 2.4.0 entry.', use('Edit'))])
  await start($)
  set(desk, LOG.id, 'completed')
  await plant($, desk, TESTS.id, 'heard', 1)

  const best = await card($)
  expect(best?.note).toBe('2 live')
  expect(best?.names).toEqual(['1 audit the auth module', '2 rewrite tests', '3 update the changelog'])
  expect(best?.marks).toEqual(['Grep', 'Read · heard', 'done'])
  expect(best?.lines).toEqual(['  Two callers skip the token check.', '  Understood, leaving tests alone.', '  Added the 2.4.0 entry.'])
  expect(best?.dims).toEqual([false, false, true])
  expect(best?.hint).toBe(HINT)

  for (const [site] of SITES) {
    await $.command.run(run('place', site))
    for (const [other, component] of SITES) expect(await card($, 40, component)).toEqual(other === site ? best : undefined)
  }
  expect(desk.sends).toEqual([])
})

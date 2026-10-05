import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type Run = { isWith: boolean; turns: number; clean: number }
type Runs = Record<string, Run>
type Call = { command?: unknown; agentId?: string; outcome?: object }
type Desk = { world: Ground; env: Record<string, string>; names: string[]; who: { id: string }; results: Map<string, object>; turns: number }
type Drawn = { note: string; width: unknown; lines: string[]; wraps: unknown[] }

const NAME = 'trial-widget'
const MOON_NAME = 'moon-widget'
const FILE = `${import.meta.dir.replaceAll('\\', '/').replace(/^[a-z]:/i, '').replace(/\/tests$/, '')}/trial.json`
const HOUR = 3_600_000
const JOIN = 50
const ME = 'session-1'
const USAGE = 'Usage: /trial-widget [on|off|test <widget>|clear]'
const OFF = 'Trial is off.'
const STARTED = 'Trial of moon-widget started. This session runs with it, the next without, and so on. Leave its switch alone meanwhile.'
const RUNNING = 'A trial of moon-widget is running; /trial-widget clear ends it.'
const NO_TRIAL = 'No trial is running.'
const BLANK = '{"subject":"","runs":{}}'
const EMPTY = ['No trial yet.', '/trial-widget test <widget> runs it', 'on one session and off the next.']
const EMPTY_NARROW = ['No trial yet.', '/trial-widget', 'test <widget>', 'runs it on one', 'session and off', 'the next.']
const STALLED = ['moon-widget', 'Could not switch it here.', 'This session is not counted.']
const STALLED_NARROW = ['moon-widget', 'switch failed', 'not counted']
const AHEAD = 'With it is ahead, beyond chance.'
const BEHIND = 'Without it is ahead, beyond chance.'
const LEVEL = 'No difference beyond chance.'
const LONG_NAME = 'long-long-long-long-long-named-on-widget'
const PASSED = { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }
const FAILED = { result: 'Error: Exit code 1\n1 failing', text: 'Error: Exit code 1\n1 failing', isError: true }
const DENIED = { deny: 'Blocked by a PreToolUse hook.' }

const MOON: Plugin = {
  name: 'moon-widget',
  register(on) {
    on('session.start', async ($, e, next) => {
      await $.command.register({ name: 'moon-widget', description: 'Toggle the Moon card', argumentHint: '[on|off]' })

      return next(e)
    })
    on('command.run', { command: /^(?:moon|long-long-long-long-long-named-on)-widget$/ }, async ($, e) => {
      await $.ui.toast(`${e.command} ${e.args}`)
      const fault = await $.env.get('MOON')
      if (fault === 'slow') await $.clock.sleep(100)
      if (fault === 'broken') throw new Error('moon-widget could not be switched')

      return { text: `Moon ${e.args}.` }
    })
  },
}

const DISK: Plugin = {
  name: 'stand-in-disk',
  tier: 'append',
  register(on) {
    on('fs.read', async ($, e, next) => {
      await $.ui.toast('read')

      return next(e)
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, MOON, DISK] }

const one = (isWith: boolean, turns: number, clean: number): Run => ({ isWith, turns, clean })

const trial = (runs: Runs, subject = MOON_NAME): string => JSON.stringify({ subject, runs })

const open = (on: On, given: { isOn?: boolean; file?: string } = {}): Desk => {
  const env: Record<string, string> = {}
  const names = ['help', 'widgets', NAME, MOON_NAME, LONG_NAME]
  const who = { id: ME }
  const results = new Map<string, object>()
  on('tool.call', async (_$, e) => (results.get(e.tool_use_id ?? '') ?? PASSED) as never)
  const world = ground(on, {
    store: given.isOn === true ? { isOn: true } : {},
    files: given.file === undefined ? {} : { [FILE]: given.file },
    answers: {
      'env.get': (e: { name: string }) => env[e.name],
      'command.list': () => {
        if (env.LIST === 'broken') throw new Error('the command list is not ready')

        return names.map(name => ({ name, description: `Toggle ${name}`, source: 'plugin', plugin: name.replace(/^[/]/, '') }))
      },
      'session.id': () => {
        if (who.id === '') throw new Error('no session')

        return who.id
      },
    },
  })
  const write = world.files.set.bind(world.files)
  Object.defineProperty(world.files, 'set', {
    value: (path: string, text: string): Map<string, string> => {
      if (env.DISK === 'full') throw new Error('ENOSPC: no space left on device')

      return write(path, text)
    },
  })

  return { world, env, names, who, results, turns: 0 }
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const joined = async ($: Engine, desk: Desk): Promise<void> => {
  await start($)
  await cmd($, 'on')
  await cmd($, 'test moon')
  await desk.world.clock.advance(JOIN)
}

const reopened = async ($: Engine, desk: Desk, file?: string, id = ME): Promise<void> => {
  await cmd($, 'off')
  desk.world.store.set('isOn', true)
  desk.who.id = id
  if (file !== undefined) desk.world.files.set(FILE, file)
  await session($)
  await desk.world.clock.advance(JOIN)
}

const played = async ($: Engine, desk: Desk, calls: Call[] = [], ending: Record<string, unknown> = {}, origin: object | null = { kind: 'composer' }): Promise<unknown[]> => {
  desk.turns += 1
  const turnId = `turn-${desk.turns}`
  const text = 'Fix the failing test'
  const got: unknown[] = []
  if (origin !== null) got.push(await $.prompt.submit({ text, wait: false, origin } as never))
  await $.turn.start({ text, turnId })
  for (const [at, { outcome = PASSED, ...input }] of calls.entries()) {
    desk.results.set(`${turnId}-${at}`, outcome)
    got.push(await $.tool.call({ tool: 'Bash', tool_use_id: `${turnId}-${at}`, ...input } as never))
  }
  got.push(await $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId, reason: 'answer', ...ending } as never))

  return got
}

const flips = (desk: Desk): string[] => desk.world.toasts.filter(toast => toast !== 'read')

const reads = (desk: Desk): number => desk.world.toasts.filter(toast => toast === 'read').length

const filed = (desk: Desk): string | undefined => desk.world.files.get(FILE)

const mine = (desk: Desk, id = ME): unknown => (JSON.parse(filed(desk) ?? BLANK) as { runs: Runs }).runs[id]

const fileWrites = (desk: Desk): number => desk.world.writes.filter(write => write.startsWith('file ')).length

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const box = await ui.find({ key: 'card' })
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const texts = (await ui.findAll({ type: 'Text' })).slice(3)
  const rows = (await ui.findAll({ type: 'Box' })).filter(row => row.props.justifyContent === 'space-between')
  await ui.unmount()
  if (box === undefined) return undefined

  let at = 0
  const lines = rows.map(row => {
    const parts: string[] = []
    while (parts.join('') !== row.text && at < texts.length) {
      parts.push(texts[at]?.text ?? '')
      at += 1
    }

    return parts.join(' | ')
  })

  return { note, width: box.props.width, lines, wraps: texts.map(part => part.props.wrap) }
}

const seen = async ($: Engine, columns = 40): Promise<{ note: string; lines: string[] } | undefined> => {
  const drawn = await card($, columns)

  return drawn === undefined ? undefined : { note: drawn.note, lines: drawn.lines }
}

const widest = (lines: readonly string[]): number => Math.max(...lines.map(line => line.replace(' | ', ' ').length))

test('A1: with no trial, switched on or restored over a missing, broken or blank file, the card says what starts one', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(await cmd($, 'on')).toBe('Trial on; /widgets places it.')
  await desk.world.clock.advance(HOUR)
  const drawn = await card($)
  expect(drawn).toEqual({ note: '', width: 40, lines: EMPTY, wraps: EMPTY.map(() => 'truncate-end') })
  expect((await card($, 20))?.lines).toEqual(EMPTY_NARROW)

  await reopened($, desk)
  expect(await seen($)).toEqual({ note: '', lines: EMPTY })

  const broken = [
    'not json {',
    '',
    'null',
    '[]',
    '"moon-widget"',
    '{"subject":"moon-widget"}',
    '{"subject":"moon-widget","runs":[]}',
    '{"subject":"moon-widget","runs":null}',
    '{"subject":7,"runs":{}}',
    '{"subject":"moon-widget","runs":{"a":{"isWith":"yes","turns":3,"clean":3}}}',
    '{"subject":"moon-widget","runs":{"a":null}}',
    BLANK,
    trial({ a: one(true, 9, 9) }, ''),
  ]
  for (const text of broken) {
    await reopened($, desk, text)
    await desk.world.clock.advance(HOUR)
    expect(await seen($)).toEqual({ note: '', lines: EMPTY })
    expect(filed(desk)).toBe(text)
  }
  expect(flips(desk)).toEqual([])
  expect(fileWrites(desk)).toBe(0)
})

test('A2: test starts a trial in the file and joins this session with the subject switched on', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, 'on')

  expect(await cmd($, 'test moon')).toBe(STARTED)
  expect(filed(desk)).toBe('{"subject":"moon-widget","runs":{}}')
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
  expect(await seen($)).toEqual({ note: '', lines: ['moon-widget', 'with     no turns yet', 'without  no turns yet', 'Too early: 60 more turns'] })
  await desk.world.clock.advance(JOIN - 1)
  expect(flips(desk)).toEqual([])
  await desk.world.clock.advance(1)
  expect(flips(desk)).toEqual(['moon-widget on'])
  expect(await seen($)).toEqual({ note: 'with', lines: ['moon-widget', 'with     no turns yet', 'without  no turns yet', 'Too early: 60 more turns'] })
  expect(await seen($, 20)).toEqual({ note: 'with', lines: ['moon-widget', 'on  none', 'off none', '60 more turns'] })
  await desk.world.clock.advance(HOUR)
  expect(flips(desk)).toEqual(['moon-widget on'])
  expect(filed(desk)).toBe('{"subject":"moon-widget","runs":{}}')

  await cmd($, 'clear')
  expect(await cmd($, 'test moon-widget')).toBe(STARTED)
  expect(filed(desk)).toBe('{"subject":"moon-widget","runs":{}}')
  await desk.world.clock.advance(JOIN)
  expect(flips(desk)).toEqual(['moon-widget on', 'moon-widget on'])
  expect((await card($))?.note).toBe('with')

  await cmd($, 'clear')
  desk.names.splice(0, desk.names.length, '/help', '/trial-widget', '/moon-widget')
  expect(await cmd($, '  TEST   Moon  ')).toBe(STARTED)
  await desk.world.clock.advance(JOIN)
  expect(flips(desk)).toEqual(['moon-widget on', 'moon-widget on', 'moon-widget on'])
  expect(await seen($)).toEqual({ note: 'with', lines: ['moon-widget', 'with     no turns yet', 'without  no turns yet', 'Too early: 60 more turns'] })
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
})

test('A3: test refuses an unknown widget, itself and a second trial, and changes nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, 'on')

  expect(await cmd($, 'test tide')).toBe('No widget called tide-widget.')
  expect(await cmd($, 'test tide-widget')).toBe('No widget called tide-widget.')
  expect(await cmd($, 'test trial')).toBe('No widget called trial-widget.')
  expect(await cmd($, 'test trial-widget')).toBe('No widget called trial-widget.')
  desk.env.LIST = 'broken'
  expect(await cmd($, 'test moon')).toBe('No widget called moon-widget.')
  delete desk.env.LIST
  await desk.world.clock.advance(HOUR)
  expect(filed(desk)).toBeUndefined()
  expect(fileWrites(desk)).toBe(0)
  expect(await seen($)).toEqual({ note: '', lines: EMPTY })

  await cmd($, 'test moon')
  await desk.world.clock.advance(JOIN)
  await turn($)
  const before = { file: filed(desk), card: await card($), writes: desk.world.writes.length }
  expect(await cmd($, 'test moon')).toBe(RUNNING)
  expect(await cmd($, 'test tide')).toBe(RUNNING)
  await desk.world.clock.advance(HOUR)
  expect({ file: filed(desk), card: await card($), writes: desk.world.writes.length }).toEqual(before)
  expect(flips(desk)).toEqual(['moon-widget on'])

  await cmd($, 'clear')
  const elsewhere = trial({ 'session-2': one(true, 4, 3) })
  desk.world.files.set(FILE, elsewhere)
  expect(await cmd($, 'test moon')).toBe(RUNNING)
  await desk.world.clock.advance(HOUR)
  expect(filed(desk)).toBe(elsewhere)
  expect(await seen($)).toEqual({ note: '', lines: EMPTY })
  expect(flips(desk)).toEqual(['moon-widget on'])
})

test('A4: a counted turn is clean when it ends with an answer and its last check did not fail', PLUGINS, async ($, on) => {
  const desk = open(on)
  await joined($, desk)

  await played($, desk)
  expect(mine(desk)).toEqual(one(true, 1, 1))
  await played($, desk, [], { isAborted: true, reason: 'aborted' })
  expect(mine(desk)).toEqual(one(true, 2, 1))
  await played($, desk, [], { isAborted: true })
  expect(mine(desk)).toEqual(one(true, 3, 1))
  await played($, desk, [], { reason: 'error' })
  expect(mine(desk)).toEqual(one(true, 4, 1))
  await played($, desk, [{ command: 'npm test', outcome: FAILED }])
  expect(mine(desk)).toEqual(one(true, 5, 1))
  await played($, desk, [{ command: 'npm test', outcome: FAILED }, { command: 'git status' }, { command: 'npm test' }])
  expect(mine(desk)).toEqual(one(true, 6, 2))
  await played($, desk, [{ command: 'npm test' }, { command: 'bunx tsc --noEmit\necho done', outcome: FAILED }])
  expect(mine(desk)).toEqual(one(true, 7, 2))
  await played($, desk)
  expect(mine(desk)).toEqual(one(true, 8, 3))
  await played($, desk, [{ command: 'npm run lint', outcome: FAILED }, { command: 'npm run lint', outcome: DENIED }])
  expect(mine(desk)).toEqual(one(true, 9, 3))
  await turn($)
  expect(mine(desk)).toEqual(one(true, 10, 4))

  await $.prompt.submit({ text: 'Fix the failing test', wait: false, origin: { kind: 'composer' } })
  desk.results.set('interrupted', FAILED)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'interrupted', command: 'npm test' } as never)
  await played($, desk)
  expect(mine(desk)).toEqual(one(true, 11, 5))

  expect(await seen($)).toEqual({ note: 'with', lines: ['moon-widget', 'with     45% clean | 11 turns', 'without  no turns yet', 'Too early: 49 more turns'] })
  expect(await seen($, 20)).toEqual({ note: 'with', lines: ['moon-widget', 'on  45% of 11', 'off none', '49 more turns'] })
})

test('A5: turns of agents and of plugins are not counted, and only a real check of the main thread can fail a turn', PLUGINS, async ($, on) => {
  const desk = open(on)
  await joined($, desk)

  const [submitted, agentEnd] = await played($, desk, [], { agentId: 'agent-7' })
  expect(submitted).toEqual({ text: 'Fix the failing test' })
  expect(agentEnd).toEqual({ text: 'Done.' })
  expect(mine(desk)).toBeUndefined()
  expect(await played($, desk, [], {}, null)).toEqual([{ text: 'Done.' }])
  expect(mine(desk)).toEqual(one(true, 1, 1))

  await played($, desk, [], {}, null)
  await played($, desk, [{ command: 'npm test', outcome: FAILED }], {}, { kind: 'task-notification' })
  await played($, desk, [{ command: 'npm test', outcome: FAILED }], {}, { kind: 'plugin', name: 'queue-widget' })
  expect(mine(desk)).toEqual(one(true, 1, 1))
  expect(fileWrites(desk)).toBe(2)

  expect(await played($, desk, [{ command: 'npm test', outcome: FAILED, agentId: 'agent-7' }])).toEqual([{ text: 'Fix the failing test' }, FAILED, { text: 'Done.' }])
  expect(mine(desk)).toEqual(one(true, 2, 2))
  expect(await played($, desk, [{ command: 'npm test', outcome: DENIED }])).toEqual([{ text: 'Fix the failing test' }, DENIED, { text: 'Done.' }])
  expect(mine(desk)).toEqual(one(true, 3, 3))
  expect(await played($, desk, [{ outcome: FAILED }])).toEqual([{ text: 'Fix the failing test' }, FAILED, { text: 'Done.' }])
  expect(mine(desk)).toEqual(one(true, 4, 4))
  await played($, desk, [{ command: 'cat .env', outcome: FAILED }])
  expect(mine(desk)).toEqual(one(true, 5, 5))
  await played($, desk, [{ command: 'echo start\nnpm test', outcome: FAILED }])
  expect(mine(desk)).toEqual(one(true, 6, 6))
  await played($, desk, [{ command: 'bun run contest', outcome: FAILED }], {}, { kind: 'bridge' })
  expect(mine(desk)).toEqual(one(true, 7, 7))
  expect(await played($, desk, [{ command: 'npm test' }], {}, { kind: 'sdk' })).toEqual([{ text: 'Fix the failing test' }, PASSED, { text: 'Done.' }])
  expect(mine(desk)).toEqual(one(true, 8, 8))

  await played($, desk, [{ command: 'ls build', outcome: FAILED }])
  expect(mine(desk)).toEqual(one(true, 9, 8))
})

test('A6: a session joins the arm with fewer counted runs, or its own run in the file', PLUGINS, async ($, on) => {
  const level = { a: one(true, 5, 5), b: one(false, 5, 3) }
  const desk = open(on, { isOn: true, file: trial(level) })
  await start($)
  expect(flips(desk)).toEqual([])
  expect((await card($))?.note).toBe('')
  await desk.world.clock.advance(JOIN)
  expect(flips(desk)).toEqual(['moon-widget on'])
  expect(await seen($)).toEqual({ note: 'with', lines: ['moon-widget', 'with     100% clean | 5 turns', 'without  60% clean | 5 turns', 'Too early: 50 more turns'] })
  expect(filed(desk)).toBe(trial(level))

  await reopened($, desk, trial({ a: one(true, 5, 5) }), 'session-2')
  expect(flips(desk)).toEqual(['moon-widget on', 'moon-widget off'])
  expect((await card($))?.note).toBe('without')

  await reopened($, desk, trial({ a: one(true, 5, 5), b: one(false, 0, 0) }), 'session-3')
  expect(flips(desk).at(-1)).toBe('moon-widget off')
  await reopened($, desk, trial({ a: one(true, 0, 0) }), 'session-4')
  expect(flips(desk).at(-1)).toBe('moon-widget on')
  await reopened($, desk, trial({ a: one(true, 0, 0), b: one(true, 2, 2), c: one(false, 1, 0), d: one(false, 6, 6) }), 'session-5')
  expect(flips(desk).at(-1)).toBe('moon-widget on')
  expect(flips(desk)).toHaveLength(5)

  const own = { a: one(true, 1, 1), 'session-9': one(false, 4, 3) }
  await reopened($, desk, trial(own), 'session-9')
  expect(flips(desk).at(-1)).toBe('moon-widget off')
  expect(await seen($)).toEqual({ note: 'without', lines: ['moon-widget', 'with     100% clean | 1 turn', 'without  75% clean | 4 turns', 'Too early: 55 more turns'] })
  expect(filed(desk)).toBe(trial(own))
  await played($, desk)
  expect(filed(desk)).toBe(trial({ a: one(true, 1, 1), 'session-9': one(false, 5, 4) }))
  expect((await card($))?.lines[2]).toBe('without  80% clean | 5 turns')
})

test('A7: each counted turn writes the whole run of this session beside the runs of the others, and stops when the trial is gone', PLUGINS, async ($, on) => {
  const desk = open(on)
  await joined($, desk)

  await played($, desk)
  expect(filed(desk)).toBe(trial({ [ME]: one(true, 1, 1) }))
  await played($, desk, [{ command: 'npm test', outcome: FAILED }])
  expect(filed(desk)).toBe(trial({ [ME]: one(true, 2, 1) }))

  desk.world.files.set(FILE, trial({ 'session-2': one(false, 3, 2) }))
  await played($, desk)
  expect(filed(desk)).toBe(trial({ 'session-2': one(false, 3, 2), [ME]: one(true, 3, 2) }))
  expect(await seen($)).toEqual({ note: 'with', lines: ['moon-widget', 'with     67% clean | 3 turns', 'without  67% clean | 3 turns', 'Too early: 54 more turns'] })

  desk.env.DISK = 'full'
  expect(await played($, desk)).toEqual([{ text: 'Fix the failing test' }, { text: 'Done.' }])
  expect(filed(desk)).toBe(trial({ 'session-2': one(false, 3, 2), [ME]: one(true, 3, 2) }))
  expect((await card($))?.lines[1]).toBe('with     75% clean | 4 turns')
  delete desk.env.DISK
  await played($, desk)
  expect(filed(desk)).toBe(trial({ 'session-2': one(false, 3, 2), [ME]: one(true, 5, 4) }))

  for (const ended of [BLANK, undefined, trial({ 'session-2': one(true, 8, 8) }, 'tide-widget')]) {
    if (ended === undefined) desk.world.files.delete(FILE)
    else desk.world.files.set(FILE, ended)
    const before = desk.world.writes.length
    await played($, desk)
    await played($, desk)
    expect(desk.world.writes.length).toBe(before)
    expect(filed(desk)).toBe(ended)
    expect(await seen($)).toEqual({ note: '', lines: EMPTY })

    desk.world.files.delete(FILE)
    await cmd($, 'test moon')
    await desk.world.clock.advance(JOIN)
    await played($, desk)
    expect(filed(desk)).toBe(trial({ [ME]: one(true, 1, 1) }))
  }
  expect(desk.world.toasts.filter(toast => toast !== 'read' && toast !== 'moon-widget on')).toEqual([])
})

test('A8: the card waits for 30 turns in each arm, then says which arm is ahead beyond chance', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, file: trial({ a: one(true, 29, 27), b: one(false, 30, 20) }) })
  await start($)
  await desk.world.clock.advance(JOIN)
  expect(await seen($)).toEqual({ note: 'with', lines: ['moon-widget', 'with     93% clean | 29 turns', 'without  67% clean | 30 turns', 'Too early: 1 more turn'] })
  expect(await seen($, 20)).toEqual({ note: 'with', lines: ['moon-widget', 'on  93% of 29', 'off 67% of 30', '1 more turn'] })

  const cases: [Run, Run, string[], string[]][] = [
    [one(true, 30, 28), one(false, 30, 20), ['with     93% clean | 30 turns', 'without  67% clean | 30 turns', AHEAD], ['on  93% of 30', 'off 67% of 30', 'with is ahead']],
    [one(true, 30, 20), one(false, 30, 28), ['with     67% clean | 30 turns', 'without  93% clean | 30 turns', BEHIND], ['on  67% of 30', 'off 93% of 30', 'without is ahead']],
    [one(true, 30, 24), one(false, 30, 22), ['with     80% clean | 30 turns', 'without  73% clean | 30 turns', LEVEL], ['on  80% of 30', 'off 73% of 30', 'no difference']],
    [one(true, 30, 30), one(false, 30, 30), ['with     100% clean | 30 turns', 'without  100% clean | 30 turns', LEVEL], ['on  100% of 30', 'off 100% of 30', 'no difference']],
    [one(true, 30, 0), one(false, 30, 0), ['with     0% clean | 30 turns', 'without  0% clean | 30 turns', LEVEL], ['on  0% of 30', 'off 0% of 30', 'no difference']],
    [one(true, 40, 5), one(false, 48, 6), ['with     13% clean | 40 turns', 'without  13% clean | 48 turns', LEVEL], ['on  13% of 40', 'off 13% of 48', 'no difference']],
    [one(true, 30, 10), one(false, 3, 2), ['with     33% clean | 30 turns', 'without  67% clean | 3 turns', 'Too early: 27 more turns'], ['on  33% of 30', 'off 67% of 3', '27 more turns']],
  ]
  for (const [a, b, long, short] of cases) {
    await reopened($, desk, trial({ a, b }))
    expect((await card($))?.lines).toEqual(['moon-widget', ...long])
    expect((await card($, 20))?.lines).toEqual(['moon-widget', ...short])
  }

  await reopened($, desk, trial({ a: one(true, 29, 27), b: one(false, 20, 13), c: one(false, 10, 7) }))
  expect((await card($))?.lines.at(-1)).toBe('Too early: 1 more turn')
  await played($, desk)
  expect(await seen($)).toEqual({ note: 'with', lines: ['moon-widget', 'with     93% clean | 30 turns', 'without  67% clean | 30 turns', AHEAD] })
})

test('A9: a subject that cannot be switched stalls the session, which then counts nothing', PLUGINS, async ($, on) => {
  const file = trial({ a: one(true, 5, 5), b: one(false, 5, 3) })
  const desk = open(on, { isOn: true, file })
  desk.env.MOON = 'broken'
  await start($)
  await desk.world.clock.advance(JOIN)
  expect(flips(desk)).toEqual(['moon-widget on'])
  expect(await seen($)).toEqual({ note: 'stalled', lines: STALLED })
  expect(await seen($, 20)).toEqual({ note: 'stalled', lines: STALLED_NARROW })

  await played($, desk)
  await played($, desk, [{ command: 'npm test', outcome: FAILED }])
  await turn($)
  await desk.world.clock.advance(HOUR)
  expect(desk.world.writes).toEqual([])
  expect(filed(desk)).toBe(file)
  expect(await seen($)).toEqual({ note: 'stalled', lines: STALLED })
  expect(flips(desk)).toEqual(['moon-widget on'])

  delete desk.env.MOON
  desk.names.splice(desk.names.indexOf(MOON_NAME), 1)
  await reopened($, desk)
  expect(flips(desk)).toEqual(['moon-widget on'])
  expect(await seen($)).toEqual({ note: 'stalled', lines: STALLED })
  await played($, desk)
  expect(filed(desk)).toBe(file)

  desk.names.push(MOON_NAME)
  desk.env.LIST = 'broken'
  await reopened($, desk)
  expect(await seen($)).toEqual({ note: 'stalled', lines: STALLED })
  delete desk.env.LIST
  await reopened($, desk, undefined, '')
  expect(await seen($)).toEqual({ note: 'stalled', lines: STALLED })
  expect(flips(desk)).toEqual(['moon-widget on'])
  await played($, desk)
  expect(filed(desk)).toBe(file)
  expect(fileWrites(desk)).toBe(0)

  await reopened($, desk)
  expect(flips(desk)).toEqual(['moon-widget on', 'moon-widget on'])
  expect((await card($))?.note).toBe('with')
})

test('A10: clear ends the trial for every session and reports the figures, the verdict and how the subject is left', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, file: trial({ a: one(true, 30, 28) }) })
  await start($)
  await desk.world.clock.advance(JOIN)
  expect(flips(desk)).toEqual(['moon-widget off'])
  await played($, desk)
  await played($, desk)
  desk.world.files.set(FILE, trial({ a: one(true, 30, 28), [ME]: one(false, 2, 2), 'session-2': one(false, 28, 18) }))

  expect(await cmd($, 'clear')).toBe('Trial of moon-widget ended: with 93% of 30 turns, without 67% of 30 turns. With it is ahead, beyond chance. moon-widget is left off.')
  expect(filed(desk)).toBe(BLANK)
  expect(flips(desk)).toEqual(['moon-widget off'])
  expect(await seen($)).toEqual({ note: '', lines: EMPTY })
  await desk.world.clock.advance(HOUR)
  expect(flips(desk)).toEqual(['moon-widget off'])

  const before = desk.world.writes.length
  expect(await cmd($, 'clear')).toBe(NO_TRIAL)
  desk.world.files.delete(FILE)
  expect(await cmd($, 'clear')).toBe(NO_TRIAL)
  expect(desk.world.writes.length).toBe(before)
  expect(filed(desk)).toBeUndefined()

  await cmd($, 'test moon')
  await desk.world.clock.advance(JOIN)
  await played($, desk)
  desk.world.files.set(FILE, trial({ x: one(true, 29, 29), y: one(false, 18, 9) }))
  expect(await cmd($, 'clear')).toBe('Trial of moon-widget ended: with 100% of 30 turns, without 50% of 18 turns. Too early: 12 more turns. moon-widget is left on.')
  expect(filed(desk)).toBe(BLANK)

  await cmd($, 'test moon')
  await desk.world.clock.advance(JOIN)
  await played($, desk)
  desk.world.files.set(FILE, trial({ x: one(true, 1233, 1233), y: one(false, 1, 0) }))
  expect(await cmd($, 'clear')).toBe('Trial of moon-widget ended: with 100% of 1,234 turns, without 0% of 1 turn. Too early: 29 more turns. moon-widget is left on.')

  desk.env.MOON = 'broken'
  await cmd($, 'test moon')
  await desk.world.clock.advance(JOIN)
  expect((await card($))?.note).toBe('stalled')
  expect(await cmd($, 'clear')).toBe('Trial of moon-widget ended: with no turns, without no turns. Too early: 60 more turns.')
  expect(filed(desk)).toBe(BLANK)
  expect(await seen($)).toEqual({ note: '', lines: EMPTY })

  delete desk.env.MOON
  await cmd($, 'test moon')
  expect(await cmd($, 'clear')).toBe('Trial of moon-widget ended: with no turns, without no turns. Too early: 60 more turns.')
  await desk.world.clock.advance(HOUR)
  expect(flips(desk).filter(flip => flip === 'moon-widget on')).toHaveLength(3)
  expect(await seen($)).toEqual({ note: '', lines: EMPTY })

  desk.env.MOON = 'slow'
  await cmd($, 'test moon')
  await desk.world.clock.advance(JOIN)
  expect(flips(desk).filter(flip => flip === 'moon-widget on')).toHaveLength(4)
  expect(await cmd($, 'clear')).toBe('Trial of moon-widget ended: with no turns, without no turns. Too early: 60 more turns.')
  await desk.world.clock.advance(HOUR)
  expect(await seen($)).toEqual({ note: '', lines: EMPTY })
  await played($, desk)
  expect(filed(desk)).toBe(BLANK)
})

test('A11: while off nothing is read, run, counted or written, and switching on again rejoins the same run', PLUGINS, async ($, on) => {
  const file = trial({ a: one(true, 5, 5), b: one(false, 5, 3) })
  const desk = open(on, { file })
  await start($)
  await desk.world.clock.advance(HOUR)
  for (const at of [1, 2, 3]) await played($, desk, [{ command: 'npm test', outcome: at === 2 ? FAILED : PASSED }])
  expect(await cmd($, 'test moon')).toBe(OFF)
  expect(await cmd($, 'clear')).toBe(OFF)
  await desk.world.clock.advance(HOUR)
  expect(desk.world.toasts).toEqual([])
  expect(desk.world.writes).toEqual([])
  expect(filed(desk)).toBe(file)
  expect(await card($)).toBeUndefined()

  desk.world.files.delete(FILE)
  await cmd($, 'on')
  expect(await cmd($, 'test moon')).toBe(STARTED)
  await desk.world.clock.advance(JOIN - 1)
  await cmd($, 'off')
  await desk.world.clock.advance(HOUR)
  expect(flips(desk)).toEqual([])

  await cmd($, 'on')
  await desk.world.clock.advance(JOIN)
  expect(flips(desk)).toEqual(['moon-widget on'])
  await played($, desk)
  const counted = trial({ [ME]: one(true, 1, 1), 'session-2': one(true, 6, 6) })
  desk.world.files.set(FILE, counted)

  await cmd($, 'off')
  const before = { writes: desk.world.writes.length, reads: reads(desk) }
  await played($, desk)
  await played($, desk, [{ command: 'npm test', outcome: FAILED }])
  await desk.world.clock.advance(HOUR)
  expect({ writes: desk.world.writes.length, reads: reads(desk) }).toEqual(before)
  expect(filed(desk)).toBe(counted)
  expect(flips(desk)).toEqual(['moon-widget on'])
  expect(await card($)).toBeUndefined()

  await cmd($, 'on')
  expect(reads(desk)).toBe(before.reads + 1)
  await desk.world.clock.advance(JOIN)
  expect(flips(desk)).toEqual(['moon-widget on', 'moon-widget on'])
  expect(await seen($)).toEqual({ note: 'with', lines: ['moon-widget', 'with     100% clean | 7 turns', 'without  no turns yet', 'Too early: 53 more turns'] })
  await played($, desk)
  expect(filed(desk)).toBe(trial({ [ME]: one(true, 2, 2), 'session-2': one(true, 6, 6) }))

  await cmd($, 'on')
  await desk.world.clock.advance(HOUR)
  expect(flips(desk)).toEqual(['moon-widget on', 'moon-widget on'])
  expect((await card($))?.note).toBe('with')
})

test('A12: anything else answers with the usage and changes nothing, and one command and one store key exist', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const typed = ['test', 'test Moon!', 'stop', 'start moon', 'test moon now', 'test -widget', 'clear now', 'on now', 'trial moon']
  for (const args of typed) expect(await cmd($, args)).toBe(USAGE)
  expect(desk.world.writes).toEqual([])
  expect(desk.world.toasts).toEqual([])
  expect(await card($)).toBeUndefined()

  await cmd($, 'on')
  await cmd($, 'test moon')
  await desk.world.clock.advance(JOIN)
  await played($, desk)
  const before = { file: filed(desk), card: await card($), writes: desk.world.writes.length, reads: reads(desk) }
  for (const args of typed) expect(await cmd($, args)).toBe(USAGE)
  await desk.world.clock.advance(HOUR)
  expect({ file: filed(desk), card: await card($), writes: desk.world.writes.length, reads: reads(desk) }).toEqual(before)
  expect(desk.world.store.get('isOn')).toBe(true)
  expect(flips(desk)).toEqual(['moon-widget on'])

  await cmd($, 'clear')
  await cmd($, 'off')
  expect(desk.world.commands.filter(name => name !== MOON_NAME)).toEqual([NAME])
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
})

test('A13: every state keeps to 16 characters a line on a narrow card and 36 on a wide one, with a long subject and large counts', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true })
  await start($)
  await $.command.run(run('widen', `${NAME} 60`))
  expect(LONG_NAME).toHaveLength(40)

  const states: [string | undefined, string, string[], string[]][] = [
    [undefined, '', EMPTY_NARROW, EMPTY],
    [
      trial({ a: one(true, 1234, 1234), b: one(false, 12, 6) }, LONG_NAME),
      'with',
      [LONG_NAME, 'on  100% of 1.2k', 'off 50% of 12', '18 more turns'],
      [LONG_NAME, 'with     100% clean | 1,234 turns', 'without  50% clean | 12 turns', 'Too early: 18 more turns'],
    ],
    [
      trial({ a: one(true, 1234, 1234), b: one(false, 1234, 900) }, LONG_NAME),
      'with',
      [LONG_NAME, 'on  100% of 1.2k', 'off 73% of 1.2k', 'with is ahead'],
      [LONG_NAME, 'with     100% clean | 1,234 turns', 'without  73% clean | 1,234 turns', AHEAD],
    ],
    [
      trial({ a: one(true, 1234, 900), b: one(false, 1234, 1234) }, LONG_NAME),
      'with',
      [LONG_NAME, 'on  73% of 1.2k', 'off 100% of 1.2k', 'without is ahead'],
      [LONG_NAME, 'with     73% clean | 1,234 turns', 'without  100% clean | 1,234 turns', BEHIND],
    ],
    [
      trial({ a: one(true, 999, 500), b: one(false, 1000, 1000), c: one(true, 0, 0) }, LONG_NAME),
      'with',
      [LONG_NAME, 'on  50% of 999', 'off 100% of 1.0k', 'without is ahead'],
      [LONG_NAME, 'with     50% clean | 999 turns', 'without  100% clean | 1,000 turns', BEHIND],
    ],
    [
      trial({ a: one(true, 1, 1) }, LONG_NAME),
      'without',
      [LONG_NAME, 'on  100% of 1', 'off none', '59 more turns'],
      [LONG_NAME, 'with     100% clean | 1 turn', 'without  no turns yet', 'Too early: 59 more turns'],
    ],
  ]
  const shown = async (note: string, short: string[], long: string[]): Promise<void> => {
    for (const [columns, width, lines, most] of [[20, 20, short, 16], [39, 39, short, 16], [40, 40, long, 36], [90, 60, long, 36]] as const) {
      const drawn = await card($, columns)
      expect(drawn).toEqual({ note, width, lines, wraps: drawn?.wraps.map(() => 'truncate-end') ?? [] })
      expect(widest(lines.filter(line => line !== LONG_NAME))).toBeLessThanOrEqual(most)
      expect(lines.filter(line => line === LONG_NAME).length).toBe(note === '' ? 0 : 1)
    }
  }
  for (const [file, note, short, long] of states) {
    if (file !== undefined) await reopened($, desk, file)
    await shown(note, short, long)
  }

  desk.env.MOON = 'broken'
  await reopened($, desk)
  await shown('stalled', [LONG_NAME, 'switch failed', 'not counted'], [LONG_NAME, 'Could not switch it here.', 'This session is not counted.'])
})

test('A14: during a trial the card is the same in each placement and absent from the other two', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, file: trial({ a: one(true, 30, 28), b: one(false, 30, 20) }) })
  await session($)
  await desk.world.clock.advance(JOIN)
  await played($, desk)

  const wanted = { note: 'with', width: 40, lines: ['moon-widget', 'with     94% clean | 31 turns', 'without  67% clean | 30 turns', AHEAD], wraps: Array.from({ length: 6 }, () => 'truncate-end') }
  for (const [site] of SITES) {
    await $.command.run(run('place', site))
    for (const [other, component] of SITES) expect(await card($, 40, component)).toEqual(other === site ? wanted : undefined)
  }
})

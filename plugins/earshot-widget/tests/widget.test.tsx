import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { register } from '../hooks/register'
import type { EarshotCall, EarshotMessage } from '../types'
import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Hook = ($: unknown, e: object, next: (e: object) => Promise<unknown>) => Promise<unknown>
type Held = { messages: EarshotMessage[]; flight: EarshotCall[] }
type Desk = {
  world: Ground
  results: Map<string, unknown>
  gates: Map<string, Promise<void>>
  ticks: unknown[]
}
type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] }
type Drawn = { note: string; lines: string[]; colors: unknown[]; dims: unknown[] }

const NAME = 'earshot-widget'
const USAGE = 'Usage: /earshot-widget [on|off|last|clear]'
const OFF = 'Earshot is off.'
const NONE = 'No message typed over a turn yet.'
const FRAME = 'The user sent a new message while you were working:\n'
const NOTICE = '<task-notification>\n<task-id>b4c1</task-id>\n<status>completed</status>\n<summary>Background command "bun run build" completed (exit code 0)</summary>\n</task-notification>'
const RAN = { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }
const EDITED = { result: { filePath: '/work/project/package.json', oldString: '"npm"', newString: '"pnpm"', structuredPatch: [] }, text: 'The file /work/project/package.json has been updated.' }
const READ = { result: { type: 'text', file: { filePath: '/work/project/package.json', content: '{}', numLines: 1, startLine: 1, totalLines: 1 } }, text: '{}', isReadOnly: true }
const FOUND = { result: { mode: 'files_with_matches', filenames: ['package.json'], numFiles: 1 }, text: 'package.json', isReadOnly: true }
const LISTED = { result: { stdout: 'M package.json', stderr: '', interrupted: false }, text: 'M package.json', isReadOnly: true }
const FAILED = { result: { stdout: '', stderr: 'npm ERR! code ERESOLVE', interrupted: false }, text: 'npm ERR! code ERESOLVE', isError: true }
const MOVED = { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b4c1', backgroundedToDeliverMessage: true }, text: 'Command running in background with ID: b4c1' }
const LONG = `${'refactor the parser so that every node keeps its source range '.repeat(2)}and then stop`

const WATCH: Plugin = {
  name: 'stand-in-watch',
  tier: 'append',
  register(on) {
    on('command.run', { command: 'peek' }, async $ => ({
      text: JSON.stringify({
        messages: (await $.state.get({ plugin: 'earshot-widget', key: 'messages' } as const)).value ?? [],
        flight: (await $.state.get({ plugin: 'earshot-widget', key: 'flight' } as const)).value ?? [],
      }),
    }))
  },
}

const CHUNKS = [
  { kind: 'text', index: 0, text: 'Switching ' },
  { kind: 'text', index: 0, text: 'to pnpm.' },
  { kind: 'stop', stopReason: 'end_turn', usage: null },
]

const BLOCK: Plugin = {
  name: 'stand-in-block',
  tier: 'append',
  register(on) {
    on('prompt.submit', async ($, e, next) => {
      if (e.text.includes('@lock')) await $.clock.sleep(5000)
      if (e.text.startsWith('blocked:')) return { drop: 'A settings hook blocked the prompt.' }
      if (e.text === '/review') return next({ ...e, text: 'Review the changes on this branch.' })

      return next({ ...e, text: e.text.replace('@pkg', 'package.json').replace('@lock', 'pnpm-lock.yaml') })
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, WATCH, BLOCK] }

const open = (on: On, store: Record<string, unknown> = {}): Desk => {
  const desk: Desk = { world: undefined as never, results: new Map(), gates: new Map(), ticks: [] }
  desk.world = ground(on, {
    store,
    answers: {
      'command.list': () => [
        { name: 'earshot-widget', description: 'Toggle the Earshot card', source: 'plugin' },
        { name: 'compact', description: 'Compact the conversation', source: 'builtin' },
      ],
      'ui.invalidate': (e: unknown) => void desk.ticks.push(e),
    } as never,
  })
  on('prompt.attachment', async (_$, e) => ({ text: e.text }))
  on('turn.step', async function* (_$, e) {
    yield* CHUNKS as never[]

    return { turnId: e.turnId, index: e.index, answer: 'Switching to pnpm.', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  on('tool.call', async (_$, e) => {
    const id = e.tool_use_id ?? ''
    await desk.gates.get(id)
    const result = desk.results.get(id)
    return (result ?? RAN) as never
  })

  return desk
}

const start = async ($: Engine, isSwitched = true): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  if (isSwitched) await $.command.run(run(NAME, 'on'))
}

const say = async ($: Engine, args = ''): Promise<string> => (await $.command.run(run(NAME, args))).text ?? ''

const peek = async ($: Engine): Promise<Held> => JSON.parse((await $.command.run(run('peek'))).text ?? '{}') as Held

const typed = async ($: Engine, text: string, kind = 'composer', turnId: string | null = 'turn-1', wait = false): Promise<unknown> =>
  $.prompt.submit({ text, wait, origin: { kind }, ...(turnId === null ? {} : { turnId }) } as never)

const request = (turnId = 'turn-1', agentId?: string) => ({ turnId, index: 3, model: 'claude-opus-4-5', messageCount: 9, ...(agentId === undefined ? {} : { agentId }) })

const step = async ($: Engine, turnId = 'turn-1', agentId?: string): Promise<{ chunks: unknown[]; result: unknown }> => {
  const stream = $.turn.step(request(turnId, agentId) as never)
  const chunks: unknown[] = []
  let piece = await stream.next()
  while (piece.done !== true) {
    chunks.push(piece.value)
    piece = await stream.next()
  }

  return { chunks, result: piece.value }
}

const delivery = (text: string, more: Record<string, unknown> = {}) => ({ type: 'queued_command', text: `${FRAME}${text}`, origin: { kind: 'engine' }, ...more })

const deliver = async ($: Engine, text: string, more: Record<string, unknown> = {}): Promise<unknown> => $.prompt.attachment(delivery(text, more) as never)

const call = async ($: Engine, desk: Desk, id: string, tool: string, input: Record<string, unknown> = {}, result?: unknown): Promise<unknown> => {
  if (result !== undefined) desk.results.set(id, result)

  return $.tool.call({ tool, tool_use_id: id, ...input } as never)
}

const edit = async ($: Engine, desk: Desk, id: string, path = '/work/project/package.json'): Promise<unknown> =>
  call($, desk, id, 'Edit', { file_path: path, old_string: '"npm"', new_string: '"pnpm"' }, EDITED)

const look = async ($: Engine, desk: Desk, id: string): Promise<unknown> => call($, desk, id, 'Read', { file_path: '/work/project/package.json' }, READ)

const gate = (desk: Desk, id: string): (() => void) => {
  let release = (): void => undefined
  desk.gates.set(
    id,
    new Promise<void>(done => {
      release = done
    }),
  )

  return release
}

const end = async ($: Engine, reason = 'answer', agentId?: string): Promise<unknown> =>
  $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: reason === 'aborted', turnId: 'turn-1', reason, ...(agentId === undefined ? {} : { agentId }) } as never)

const begin = async ($: Engine, text: string): Promise<unknown> => $.turn.start({ text, turnId: 'turn-2' } as never)

const said = (node: Node | string): string => (typeof node === 'string' ? node : (node.children ?? []).map(said).join(''))

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const rows = (((await ui.find({ key: 'heard' })) ?? (await ui.find({ key: 'empty' })))?.children ?? []) as Node[]
  const seen = {
    note: (await ui.find({ key: 'note' }))?.text ?? '',
    lines: rows.map(said),
    colors: rows.map(row => row.props?.color),
    dims: rows.map(row => row.props?.dimColor),
  }
  await ui.unmount()

  return seen
}

const bench = (isShown: boolean) => {
  const hooks: Record<string, Hook> = {}
  register(((event: string, ...rest: unknown[]) => {
    if (event !== 'ui.render' && event !== 'command.run') hooks[event] = rest.at(-1) as Hook
  }) as unknown as On, {} as never)
  const state = new Map<string, { value: unknown; version: number }>([['isOn', { value: isShown, version: 1 }]])
  const calls: string[] = []
  const passed: object[] = []
  const $ = {
    state: {
      get: async (ref: { key: string }) => state.get(ref.key) ?? { value: undefined, version: 0 },
      set: async (ref: { key: string }, value: unknown) => {
        const version = (state.get(ref.key)?.version ?? 0) + 1
        state.set(ref.key, { value, version })
        calls.push(`state.set ${ref.key}`)

        return { isSet: true, version }
      },
    },
    store: { get: async () => undefined, set: async (key: string) => void calls.push(`store.set ${key}`) },
    command: { register: async () => ({ command: NAME }), list: async () => [] },
    clock: {
      now: async () => (calls.push('clock.now'), 1_700_000_000_000),
      every: () => (calls.push('clock.every'), { cancel: () => void calls.push('timer.cancel') }),
    },
    ui: { invalidate: () => void calls.push('ui.invalidate') },
  }

  return {
    calls,
    passed,
    flight: (): unknown => state.get('flight')?.value,
    raise: async (event: string, e: object, answer: unknown): Promise<unknown> =>
      hooks[event]?.($, e, async given => {
        passed.push(given)
        if (answer instanceof Error) throw answer

        return answer
      }),
    stream: async (e: object, chunks: readonly object[], answer: object): Promise<{ chunks: unknown[]; result: unknown }> => {
      const hook = hooks['turn.step'] as unknown as ($: unknown, e: object, next: (e: object) => AsyncGenerator<object, object>) => AsyncGenerator<object, object>
      const stream = hook($, e, async function* (given) {
        passed.push(given)
        yield* chunks

        return answer
      })
      const seen: unknown[] = []
      let piece = await stream.next()
      while (piece.done !== true) {
        seen.push(piece.value)
        piece = await stream.next()
      }

      return { chunks: seen, result: piece.value }
    },
  }
}

test('A1: on with no message, the empty sentences and no note in all three placements, and last says so', PLUGINS, async ($, on) => {
  open(on)

  await start($)
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    const seen = await card($, 40, component)
    expect(seen.lines).toEqual(['Nothing waiting to be heard.', 'Type while Claude works: this shows', 'when Claude got your message and', 'what it ran first.'])
    expect(seen.note).toBe('')
  }
  await $.command.run(run('place', 'side'))
  expect((await card($, 20)).lines).toEqual(['Nothing waiting', 'to be heard.', 'Type while', 'Claude works:', 'this shows when', 'Claude got your', 'message and what', 'it ran first.'])
  expect(await say($, 'last')).toBe(NONE)
})

test('A2: a composer prompt typed over a turn waits, ending as the answered text; idle, wait-your-turn, notification, peer and dropped prompts leave none', PLUGINS, async ($, on) => {
  open(on)

  await start($)
  expect(await typed($, '  no,\n  use   @pkg ')).toEqual({ text: '  no,\n  use   package.json ' })
  await typed($, LONG)
  const { messages } = await peek($)
  expect(messages.map(message => message.text)).toEqual(['no, use package.json', LONG.slice(0, 80).trimEnd()])
  expect(messages[1]?.text.length).toBeLessThanOrEqual(80)
  expect(messages[0]).toEqual({
    text: 'no, use package.json',
    at: 1_700_000_000_000,
    turnId: 'turn-1',
    isTimed: true,
    status: 'waiting',
    settledAt: 0,
    changes: [],
    changeCount: 0,
    readCount: 0,
    isPushed: false,
  })

  await typed($, 'typed while idle', 'composer', null)
  await typed($, 'do this after you finish', 'composer', 'turn-1', true)
  await typed($, NOTICE, 'task-notification')
  await typed($, 'a note from another session', 'peer')
  expect(await typed($, 'blocked: rm -rf everything')).toEqual({ drop: 'A settings hook blocked the prompt.' })
  expect((await peek($)).messages.length).toBe(2)

  const entered = { text: 'no, use pnpm' }
  const dropped = { drop: 'A settings hook blocked the prompt.' }
  const direct = bench(true)
  for (const kind of ['composer', 'bridge', 'sdk', 'peer']) {
    const asked = { text: 'no, use pnpm', wait: false, origin: { kind }, turnId: 'turn-1' }
    expect(await direct.raise('prompt.submit', asked, entered)).toBe(entered)
    expect(direct.passed.at(-1)).toBe(asked)
  }
  expect(await direct.raise('prompt.submit', { text: 'no, use pnpm', wait: false, origin: { kind: 'composer' } }, entered)).toBe(entered)
  expect(await direct.raise('prompt.submit', { text: 'no, use pnpm', wait: true, origin: { kind: 'composer' }, turnId: 'turn-1' }, entered)).toBe(entered)
  expect(await direct.raise('prompt.submit', { text: '/compact', wait: false, origin: { kind: 'composer' }, turnId: 'turn-1' }, entered)).toBe(entered)
  expect(await direct.raise('prompt.submit', { text: 'blocked: x', wait: false, origin: { kind: 'composer' }, turnId: 'turn-1' }, dropped)).toBe(dropped)
  await direct.raise('turn.complete', { answer: 'Done.', durationMs: 1, isAborted: false, turnId: 'turn-1', reason: 'answer' }, { text: 'Done.' })
  expect(direct.calls.filter(made => made === 'clock.every' || made === 'timer.cancel')).toEqual(['clock.every', 'timer.cancel'])
})

test('A2: the message is there while next is still pending, so a step or an attachment arriving meanwhile hears it', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  for (const hear of [() => step($), () => deliver($, 'no, keep @lock')]) {
    const entering = typed($, 'no, keep @lock')
    await desk.world.clock.advance(2000)
    expect((await peek($)).messages.at(-1)).toMatchObject({ text: 'no, keep @lock', status: 'waiting' })

    await hear()
    expect((await peek($)).messages.at(-1)).toMatchObject({ text: 'no, keep @lock', status: 'heard' })

    await desk.world.clock.advance(3000)
    expect(await entering).toEqual({ text: 'no, keep pnpm-lock.yaml' })
    const last = (await peek($)).messages.at(-1)
    expect(last).toMatchObject({ text: 'no, keep pnpm-lock.yaml', status: 'heard' })
    expect((last?.settledAt ?? 0) - (last?.at ?? 0)).toBe(2000)
  }

  const blocked = typed($, 'blocked: delete @lock')
  await desk.world.clock.advance(2000)
  expect((await peek($)).messages.length).toBe(3)
  await desk.world.clock.advance(3000)
  expect(await blocked).toEqual({ drop: 'A settings hook blocked the prompt.' })
  expect((await peek($)).messages.length).toBe(2)
})

test('A2: a text whose first character is / leaves no message, whether or not next rewrote it', PLUGINS, async ($, on) => {
  open(on)

  await start($)
  await typed($, '/earshot-widget last')
  await typed($, '/compact')
  expect(await typed($, '/review')).toEqual({ text: 'Review the changes on this branch.' })
  await typed($, '/tmp/build is the wrong folder')
  await typed($, '/compact', 'sdk')
  expect((await peek($)).messages).toEqual([])

  await typed($, 'use ./tmp/build instead')
  expect((await peek($)).messages.map(message => message.text)).toEqual(['use ./tmp/build instead'])
})

test('A3: a waiting message counts up and names the call it waits behind until that call returns', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const release = gate(desk, 'toolu_01')
  const running = call($, desk, 'toolu_01', 'Bash', { command: 'bun test' })
  await desk.world.clock.advance(4000)
  await typed($, 'no, use pnpm')
  await desk.world.clock.advance(41_000)

  const waiting = await card($)
  expect(waiting.lines).toEqual(['"no, use pnpm"', 'not heard yet · 41s', 'behind Bash bun test'])
  expect(waiting.note).toBe('waiting')
  expect(waiting.colors[0]).toBe('yellow')
  expect((await card($, 20)).lines).toEqual(['"no, use pnpm"', 'waiting · 41s', 'behind bun test'])

  release()
  await running
  expect((await card($)).lines).toEqual(['"no, use pnpm"', 'not heard yet · 41s'])
  expect((await peek($)).messages[0]).toMatchObject({ changeCount: 0, readCount: 0 })
})

test('A3: with several calls in flight the behind row moves to the next oldest, and calls counted while waiting have no heading', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'no, use pnpm')
  const first = gate(desk, 'toolu_01')
  const second = gate(desk, 'toolu_02')
  const one = call($, desk, 'toolu_01', 'Bash', { command: 'bun test' })
  await desk.world.clock.settle()
  const two = call($, desk, 'toolu_02', 'Grep', { pattern: 'npm' }, FOUND)
  await desk.world.clock.settle()
  expect((await card($)).lines.at(-1)).toBe('behind Bash bun test')

  first()
  await one
  expect((await peek($)).flight.map(flying => flying.id)).toEqual(['toolu_02'])
  expect((await card($)).lines).toEqual(['"no, use pnpm"', 'not heard yet · 0s', 'behind Grep', '! Bash bun test'])

  second()
  await two
  expect((await card($)).lines).toEqual(['"no, use pnpm"', 'not heard yet · 0s', '! Bash bun test', 'and 1 read'])
})

test('A3: one 1000 ms timer redraws while a message waits and stops when the last is heard or missed, on clear and on off', PLUGINS, async ($, on) => {
  const desk = open(on)
  const ticked = async (ms: number): Promise<number> => {
    const before = desk.ticks.length
    await desk.world.clock.advance(ms)

    return desk.ticks.length - before
  }

  await start($)
  expect(await ticked(5000)).toBe(0)

  await typed($, 'no, use pnpm')
  await typed($, 'and keep the lockfile')
  expect(await ticked(3000)).toBe(3)
  expect(desk.ticks.at(-1)).toMatchObject({ event: 'ui.render' })

  await deliver($, 'no, use pnpm')
  expect(await ticked(2000)).toBe(2)
  await deliver($, 'and keep the lockfile')
  expect(await ticked(5000)).toBe(0)

  await typed($, 'heard by the next request')
  expect(await ticked(1000)).toBe(1)
  await step($)
  expect(await ticked(5000)).toBe(0)

  await typed($, 'one more thing')
  expect(await ticked(1000)).toBe(1)
  await end($)
  expect(await ticked(5000)).toBe(0)

  await typed($, 'still there?')
  expect(await ticked(1000)).toBe(1)
  await say($, 'clear')
  expect(await ticked(5000)).toBe(0)

  await typed($, 'hello')
  expect(await ticked(1000)).toBe(1)
  await say($, 'off')
  expect(await ticked(5000)).toBe(0)
})

test('A4: an sdk and a bridge prompt delivered into a turn are heard at once and untimed, and nothing later changes them', PLUGINS, async ($, on) => {
  const desk = open(on)

  for (const kind of ['sdk', 'bridge']) {
    await start($)
    const release = gate(desk, 'toolu_01')
    const sleeping = call($, desk, 'toolu_01', 'Bash', { command: 'bun -e "await Bun.sleep(30000)"' }, MOVED)
    await desk.world.clock.advance(30_000)
    await typed($, 'Also say pineapple.', kind)
    const before = desk.ticks.length
    const first = (await peek($)).messages
    expect(first).toEqual([
      { text: 'Also say pineapple.', at: first[0]?.at ?? 0, turnId: 'turn-1', isTimed: false, status: 'heard', settledAt: first[0]?.at ?? 0, changes: [], changeCount: 0, readCount: 0, isPushed: false },
    ])

    const seen = await card($)
    expect(seen.note).toBe('heard')
    expect(seen.lines).toEqual(['"Also say pineapple."', 'heard in the turn it was sent over', 'Sent remotely: wait not measured.'])
    expect((await card($, 20)).lines).toEqual(['"Also say pine…"', 'heard this turn', 'Wait not timed.'])
    const told = '"Also say pineapple." was heard in the turn it was sent over. It was sent remotely, so Earshot got it only at delivery and its wait is not measured.'
    expect(await say($, 'last')).toBe(told)

    release()
    await sleeping
    await edit($, desk, 'toolu_02')
    await look($, desk, 'toolu_03')
    await deliver($, 'Also say pineapple.')
    await step($)
    await desk.world.clock.advance(1000)
    await end($)
    await begin($, 'Also say pineapple.')
    expect((await peek($)).messages).toEqual(first)
    expect(desk.ticks.length).toBe(before)
    expect(await say($, 'last')).toBe(told)

    await typed($, 'wait')
    expect((await card($)).lines).toEqual(['"wait"', 'not heard yet · 0s', '"Also say pineapple." · heard'])
    expect((await card($, 20)).lines.at(-1)).toBe('"Also…" · heard')
    await say($, 'off')
  }
})

test('A5: a delivery 48 seconds after Enter gives the heard card with the changes in the order run and the reads counted', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'no, use pnpm')
  await desk.world.clock.advance(12_000)
  await edit($, desk, 'toolu_01')
  await look($, desk, 'toolu_02')
  await call($, desk, 'toolu_03', 'Write', { file_path: 'C:\\work\\project\\pnpm-workspace.yaml', content: 'packages:\n  - app\n' })
  await call($, desk, 'toolu_04', 'Grep', { pattern: 'npm' }, FOUND)
  await call($, desk, 'toolu_05', 'Bash', { command: 'npm install\n  --no-audit' })
  await desk.world.clock.advance(36_000)
  expect(await deliver($, 'no, use pnpm')).toEqual({ text: `${FRAME}no, use pnpm` })

  const seen = await card($)
  expect(seen.note).toBe('48s late')
  expect(seen.lines).toEqual(['"no, use pnpm"', 'heard 48s after you sent it', 'Before it heard you:', '! Edit package.json', '! Write pnpm-workspace.yaml', '! Bash npm install --no-audit', 'and 2 reads'])
  expect((await card($, 20)).lines).toEqual(['"no, use pnpm"', 'heard 48s late', 'Before that:', '! package.json', '! pnpm-workspac…', '! npm install -…', 'and 2 reads'])
  expect((await peek($)).messages[0]).toMatchObject({ status: 'heard', settledAt: 1_700_000_048_000, changeCount: 3, readCount: 2 })

  const direct = bench(true)
  await direct.raise('prompt.submit', { text: 'no, use pnpm', wait: false, origin: { kind: 'composer' }, turnId: 'turn-1' }, { text: 'no, use pnpm' })
  const asked = delivery('no, use pnpm')
  const answer = { text: asked.text }
  expect(await direct.raise('prompt.attachment', asked, answer)).toBe(answer)
  expect(direct.passed.at(-1)).toBe(asked)
  expect(direct.calls).toContain('timer.cancel')
})

test('A6: the list leaves out earlier, denied and subagent calls, counts a read-only Bash as a read and lists a failed call', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const release = gate(desk, 'toolu_01')
  const early = call($, desk, 'toolu_01', 'Bash', { command: 'bun test' })
  await desk.world.clock.settle()
  await desk.world.clock.advance(1000)
  await typed($, 'no, use pnpm')
  release()
  await early

  expect(await call($, desk, 'toolu_02', 'Bash', { command: 'git push --force' }, { deny: 'Blocked by a hook.' })).toEqual({ deny: 'Blocked by a hook.' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'toolu_03', file_path: '/work/project/src/sum.js', old_string: 'a', new_string: 'b', agentId: 'a1f0c2d4e5b60718' } as never)
  await call($, desk, 'toolu_04', 'Bash', { command: 'git status --short' }, LISTED)
  await call($, desk, 'toolu_05', 'Bash', { command: 'npm install' }, FAILED)
  await call($, desk, 'toolu_06', 'mcp__github__create_issue', { title: 'Use pnpm' }, { result: { number: 12 }, text: '#12' })
  expect((await peek($)).messages[0]).toMatchObject({ changes: ['Bash npm install'], changeCount: 1, readCount: 2 })

  const direct = bench(true)
  let thrown = ''
  await direct.raise('tool.call', { tool: 'Bash', tool_use_id: 'toolu_07', command: 'npm run build' }, new Error('the tool crashed')).catch((error: Error) => {
    thrown = error.message
  })
  expect(thrown).toBe('the tool crashed')
  expect(direct.calls.filter(made => made === 'state.set flight').length).toBe(2)
  expect(direct.flight()).toEqual([])
  expect((await peek($)).flight).toEqual([])
})

test('A7: a subagent, another type, a hook origin, an unmatched text and a repeated delivery change nothing', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'no, use pnpm')
  await desk.world.clock.advance(7000)
  await deliver($, 'no, use pnpm', { agentId: 'a1f0c2d4e5b60718' })
  await $.prompt.attachment({ type: 'todo_reminder', text: 'no, use pnpm', origin: { kind: 'engine' } } as never)
  await deliver($, 'no, use pnpm', { origin: { kind: 'hook', event: 'UserPromptSubmit' } })
  await $.prompt.attachment({ type: 'queued_command', text: NOTICE, origin: { kind: 'engine' } } as never)
  expect((await peek($)).messages[0]).toMatchObject({ status: 'waiting', settledAt: 0 })

  await deliver($, 'no, use pnpm')
  await desk.world.clock.advance(60_000)
  await deliver($, 'no, use pnpm')
  expect((await peek($)).messages[0]).toMatchObject({ status: 'heard', settledAt: 1_700_000_007_000 })
  expect((await card($)).note).toBe('7s late')
})

test('A7: whichever of the attachment and the step comes first hears the message, and the other changes nothing', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'no, use pnpm')
  await desk.world.clock.advance(7000)
  await deliver($, 'no, use pnpm')
  await desk.world.clock.advance(5000)
  await step($)
  expect((await peek($)).messages[0]).toMatchObject({ status: 'heard', settledAt: 1_700_000_007_000 })

  await typed($, 'and stop')
  await desk.world.clock.advance(3000)
  await step($)
  await desk.world.clock.advance(5000)
  await deliver($, 'and stop')
  await step($)
  expect((await peek($)).messages[1]).toMatchObject({ status: 'heard', settledAt: 1_700_000_015_000 })
  expect((await card($)).lines).toEqual(['"and stop"', 'heard 3s after you sent it', 'Nothing ran before it heard you.', '"no, use pnpm" · 7s late'])
})

test('A8: identical messages are heard one per delivery, the older first, and different ones by their text in any order', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'stop')
  await desk.world.clock.advance(2000)
  await typed($, 'stop')
  await desk.world.clock.advance(3000)
  await deliver($, 'stop')
  expect((await peek($)).messages.map(message => message.status)).toEqual(['heard', 'waiting'])
  await desk.world.clock.advance(1000)
  await deliver($, 'stop')
  expect((await peek($)).messages.map(message => message.settledAt - message.at)).toEqual([5000, 4000])

  await say($, 'clear')
  await typed($, 'use pnpm')
  await typed($, 'leave the tests alone')
  await deliver($, 'leave the tests alone')
  expect((await peek($)).messages.map(message => message.status)).toEqual(['waiting', 'heard'])
  await deliver($, 'use pnpm')
  expect((await peek($)).messages.map(message => message.status)).toEqual(['heard', 'heard'])
})

test('A8: with no attachment, the next main-loop step of the turn hears every waiting message of that turn and passes the stream on untouched', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'hold on')
  await desk.world.clock.advance(3000)
  await typed($, 'no, use pnpm')
  await typed($, 'typed over an older turn', 'composer', 'turn-0')
  await desk.world.clock.advance(12_000)
  await edit($, desk, 'toolu_01')
  await look($, desk, 'toolu_02')
  await call($, desk, 'toolu_03', 'Write', { file_path: 'C:\\work\\project\\pnpm-workspace.yaml', content: 'packages:\n  - app\n' })
  await call($, desk, 'toolu_04', 'Grep', { pattern: 'npm' }, FOUND)
  await call($, desk, 'toolu_05', 'Bash', { command: 'npm install\n  --no-audit' })
  await desk.world.clock.advance(36_000)

  await step($, 'turn-1', 'a1f0c2d4e5b60718')
  await step($, 'turn-9')
  expect((await peek($)).messages.map(message => message.status)).toEqual(['waiting', 'waiting', 'waiting'])

  const stepped = await step($)
  expect(stepped.chunks).toEqual(CHUNKS)
  expect(stepped.result).toEqual({ turnId: 'turn-1', index: 3, answer: 'Switching to pnpm.', toolUses: [], stopReason: 'end_turn', usage: null })
  expect((await peek($)).messages.map(message => [message.status, message.settledAt - message.at])).toEqual([['heard', 51_000], ['heard', 48_000], ['waiting', -1_700_000_003_000]])

  await say($, 'clear')
  await typed($, 'hold on')
  await desk.world.clock.advance(3000)
  await typed($, 'no, use pnpm')
  await desk.world.clock.advance(12_000)
  await edit($, desk, 'toolu_11')
  await look($, desk, 'toolu_12')
  await call($, desk, 'toolu_13', 'Write', { file_path: 'C:\\work\\project\\pnpm-workspace.yaml', content: 'packages:\n  - app\n' })
  await call($, desk, 'toolu_14', 'Grep', { pattern: 'npm' }, FOUND)
  await call($, desk, 'toolu_15', 'Bash', { command: 'npm install\n  --no-audit' })
  await desk.world.clock.advance(36_000)
  await step($)
  const seen = await card($)
  expect(seen.note).toBe('48s late')
  expect(seen.lines).toEqual([
    '"no, use pnpm"',
    'heard 48s after you sent it',
    'Before it heard you:',
    '! Edit package.json',
    '! Write pnpm-workspace.yaml',
    '! Bash npm install --no-audit',
    'and 2 reads',
    '"hold on" · 51s late',
  ])

  const direct = bench(true)
  await direct.raise('prompt.submit', { text: 'no, use pnpm', wait: false, origin: { kind: 'composer' }, turnId: 'turn-1' }, { text: 'no, use pnpm' })
  const asked = request()
  const answer = { turnId: 'turn-1', index: 3, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  const passed = await direct.stream(asked, CHUNKS, answer)
  expect(passed.chunks.length).toBe(3)
  passed.chunks.forEach((chunk, at) => expect(chunk).toBe(CHUNKS[at]))
  expect(passed.result).toBe(answer)
  expect(direct.passed.at(-1)).toBe(asked)
  expect(direct.calls).toContain('timer.cancel')

  const written = direct.calls.length
  await direct.stream(asked, CHUNKS, answer)
  expect(direct.calls.length).toBe(written)
})

test('A8: a message typed while a step is already streaming is not heard by that step, only by the next one', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const stream = $.turn.step(request() as never)
  await stream.next()
  await typed($, 'no, use pnpm')
  for await (const chunk of stream) expect(CHUNKS).toContainEqual(chunk)
  expect((await peek($)).messages[0]).toMatchObject({ status: 'waiting', settledAt: 0 })

  await desk.world.clock.advance(4000)
  await step($)
  expect((await peek($)).messages[0]).toMatchObject({ status: 'heard', settledAt: 1_700_000_004_000 })
})

test('A8: a message with no text is heard by a step only, never by an attachment, and never becomes its own turn by text', PLUGINS, async ($, on) => {
  open(on)

  await start($)
  await typed($, ' \n ')
  await typed($, 'use pnpm')
  await deliver($, 'use pnpm')
  expect((await peek($)).messages.map(message => message.status)).toEqual(['waiting', 'heard'])
  expect((await card($)).lines.at(-1)).toBe('(no text) · waiting')

  await deliver($, '[Image #1]')
  expect((await peek($)).messages.map(message => message.status)).toEqual(['waiting', 'heard'])
  await step($)
  expect((await peek($)).messages.map(message => message.status)).toEqual(['heard', 'heard'])

  await typed($, '')
  await end($)
  await begin($, 'anything at all')
  expect((await peek($)).messages.at(-1)?.status).toBe('missed')
  expect((await card($)).lines[0]).toBe('(no text)')
})

test('A9: nothing, reads only, six changes, a thirteenth change, a sixth message and the earlier rows', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'wait')
  await desk.world.clock.advance(3000)
  await deliver($, 'wait')
  const clean = await card($)
  expect(clean.lines).toEqual(['"wait"', 'heard 3s after you sent it', 'Nothing ran before it heard you.'])
  expect(clean.colors[2]).toBe('green')
  expect((await card($, 20)).lines).toEqual(['"wait"', 'heard 3s late', 'Nothing ran.'])

  await typed($, 'which file is it')
  await look($, desk, 'toolu_01')
  await call($, desk, 'toolu_02', 'Grep', { pattern: 'npm' }, FOUND)
  await deliver($, 'which file is it')
  expect((await card($)).lines).toEqual(['"which file is it"', 'heard 0s after you sent it', '2 reads, nothing changed', '"wait" · 3s late'])
  expect((await card($, 20)).lines).toEqual(['"which file is…"', 'heard 0s late', '2 reads only', '"wait" · 3s late'])

  await typed($, 'no, use pnpm')
  for (let at = 1; at <= 6; at += 1) await edit($, desk, `toolu_1${at}`, `/work/project/src/part-${at}.ts`)
  await look($, desk, 'toolu_20')
  await desk.world.clock.advance(65_000)
  await deliver($, 'no, use pnpm')
  const busy = await card($)
  expect(busy.lines).toEqual([
    '"no, use pnpm"',
    'heard 1m 05s after you sent it',
    'Before it heard you:',
    '! Edit part-1.ts',
    '! Edit part-2.ts',
    '! Edit part-3.ts',
    '! Edit part-4.ts',
    '+2 more',
    'and 1 read',
    '"which file is it" · 0s late',
    '"wait" · 3s late',
  ])
  expect(busy.dims.slice(-2)).toEqual([true, true])
  expect((await card($, 20)).lines).toEqual(['"no, use pnpm"', 'heard +1m 05s', 'Before that:', '! part-1.ts', '! part-2.ts', '! part-3.ts', '! part-4.ts', '+2 more', 'and 1 read', '"whi…" · 0s late', '"wait" · 3s late'])

  await typed($, 'fourth')
  for (let at = 1; at <= 13; at += 1) await edit($, desk, `toolu_3${at}`, `/work/project/src/unit-${at}.ts`)
  const fourth = (await peek($)).messages.at(-1)
  expect(fourth?.changeCount).toBe(13)
  expect(fourth?.changes.length).toBe(12)
  expect(fourth?.changes.at(-1)).toBe('Edit unit-12.ts')

  await typed($, 'fifth')
  await typed($, 'sixth')
  const { messages } = await peek($)
  expect(messages.map(message => message.text)).toEqual(['which file is it', 'no, use pnpm', 'fourth', 'fifth', 'sixth'])
  expect((await card($)).lines).toEqual(['"sixth"', 'not heard yet · 0s', '"fifth" · waiting', '"fourth" · waiting'])
  expect((await card($, 20)).lines.at(-1)).toBe('"fou…" · waiting')
})

test('A10: a Bash and a PowerShell command moved to the background mark the oldest waiting message; a failed call with a string result adds nothing', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const release = gate(desk, 'toolu_01')
  await desk.world.clock.advance(1000)
  const sleeping = call($, desk, 'toolu_01', 'Bash', { command: 'sleep 30' }, MOVED)
  await desk.world.clock.advance(20_000)
  await typed($, 'also say pineapple')
  await typed($, 'and mango')
  expect(await call($, desk, 'toolu_02', 'Bash', { command: 'npm test' }, { result: 'Error: command not found', text: 'Error: command not found', isError: true })).toMatchObject({ isError: true })
  expect((await peek($)).messages.map(message => message.isPushed)).toEqual([false, false])

  release()
  await sleeping
  expect((await peek($)).messages.map(message => message.isPushed)).toEqual([true, false])
  expect((await peek($)).messages[0]?.changes).toEqual(['Bash npm test'])
  await desk.world.clock.advance(9000)
  await deliver($, 'also say pineapple')
  await say($, 'clear')

  await typed($, 'also say pineapple')
  await call($, desk, 'toolu_03', 'PowerShell', { command: 'Start-Sleep 30' }, MOVED)
  await desk.world.clock.advance(2000)
  await deliver($, 'also say pineapple')
  expect((await card($)).lines).toEqual(['"also say pineapple"', 'heard 2s after you sent it', 'A command went to the background', 'Before it heard you:', '! PowerShell Start-Sleep 30'])
  expect((await card($, 20)).lines).toEqual(['"also say pine…"', 'heard 2s late', 'Backgrounded', 'Before that:', '! Start-Sleep 30'])
  expect((await card($, 28)).lines[2]).toBe('Went to background')
})

test('A11: a main-loop turn end, answered or aborted, leaves every waiting message not heard and empties flight; a subagent turn end does not', PLUGINS, async ($, on) => {
  const desk = open(on)

  for (const reason of ['answer', 'aborted']) {
    await start($)
    await typed($, 'no, use pnpm')
    await typed($, 'and stop')
    await call($, desk, 'toolu_01', 'Bash', { command: 'git commit -m "Add pnpm"' })
    const release = gate(desk, 'toolu_02')
    const sleeping = call($, desk, 'toolu_02', 'Bash', { command: 'sleep 600' })
    await desk.world.clock.advance(20_000)

    await end($, 'answer', 'a1f0c2d4e5b60718')
    expect((await peek($)).messages.map(message => message.status)).toEqual(['waiting', 'waiting'])

    await end($, reason)
    const held = await peek($)
    expect(held.messages.map(message => [message.status, message.settledAt - message.at])).toEqual([['missed', 20_000], ['missed', 20_000]])
    expect(held.flight).toEqual([])
    const seen = await card($)
    expect(seen.note).toBe('not heard')
    expect(seen.lines).toEqual(['"and stop"', 'The turn ended before Claude got it.', 'Meanwhile:', '! Bash git commit -m "Add pnpm"', '"no, use pnpm" · not heard'])
    expect((await card($, 20)).lines).toEqual(['"and stop"', 'Turn ended.', 'Meanwhile:', '! git commit -m…', '"n…" · not heard'])
    release()
    await sleeping
    expect((await peek($)).messages.map(message => message.changeCount)).toEqual([1, 1])
    await say($, 'off')
  }
})

test('A12: a not heard message that starts the next turn reads as its own turn, measured from Enter; a heard one never changes', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'wait')
  await deliver($, 'wait')
  await typed($, 'no, use pnpm')
  await desk.world.clock.advance(60_000)
  await end($)
  await begin($, 'Something else entirely')
  expect((await peek($)).messages.map(message => message.status)).toEqual(['heard', 'missed'])

  await desk.world.clock.advance(5000)
  await begin($, 'no,  use\npnpm')
  const held = await peek($)
  expect(held.messages.map(message => message.status)).toEqual(['heard', 'own'])
  expect(held.messages[1]?.settledAt).toBe(1_700_000_065_000)
  const seen = await card($)
  expect(seen.note).toBe('own turn')
  expect(seen.lines).toEqual(['"no, use pnpm"', 'Ran as its own turn, 1m 05s later.', 'Nothing ran meanwhile.', '"wait" · 0s late'])
  expect((await card($, 20)).lines.slice(0, 3)).toEqual(['"no, use pnpm"', 'Own turn +1m 05s', 'Nothing ran.'])
  expect((await card($, 28)).lines[1]).toBe('Own turn, 1m 05s later.')
  expect(await say($, 'last')).toBe('"no, use pnpm" was not heard in that turn and ran as its own turn 1m 05s after you sent it.\nNothing ran in between.')

  await begin($, 'wait')
  await end($)
  expect((await peek($)).messages[0]).toMatchObject({ status: 'heard', settledAt: 1_700_000_000_000 })
})

test('A13: last answers in full for each status, clear forgets, and anything else is usage', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, 'no, use pnpm')
  await desk.world.clock.advance(41_000)
  expect(await say($, 'last')).toBe('"no, use pnpm" is not heard yet, 41s so far.\nNothing ran in between.')

  await edit($, desk, 'toolu_01')
  await call($, desk, 'toolu_02', 'Bash', { command: 'npm install' })
  await desk.world.clock.advance(7000)
  await deliver($, 'no, use pnpm')
  expect(await say($, 'LAST')).toBe('"no, use pnpm" was heard 48s after you sent it.\nChanges first: Edit package.json, Bash npm install.')

  await typed($, 'which file')
  await look($, desk, 'toolu_03')
  await look($, desk, 'toolu_04')
  await deliver($, 'which file')
  expect(await say($, ' Last ')).toBe('"which file" was heard 0s after you sent it.\n2 reads, nothing changed.')

  await typed($, 'wait')
  await deliver($, 'wait')
  expect(await say($, 'last')).toBe('"wait" was heard 0s after you sent it.\nNothing ran in between.')

  await typed($, 'stop editing')
  for (let at = 1; at <= 14; at += 1) await edit($, desk, `toolu_1${at}`, `/work/project/src/unit-${at}.ts`)
  await look($, desk, 'toolu_30')
  await call($, desk, 'toolu_31', 'Bash', { command: 'sleep 30' }, MOVED)
  await deliver($, 'stop editing')
  expect(await say($, 'last')).toBe(
    [
      '"stop editing" was heard 0s after you sent it.',
      `Changes first: ${Array.from({ length: 12 }, (_, at) => `Edit unit-${at + 1}.ts`).join(', ')} and 3 more; 1 read.`,
      'A command went to the background to let it through.',
    ].join('\n'),
  )

  await say($, 'clear')
  await typed($, 'never mind')
  await typed($, 'one more')
  await desk.world.clock.advance(9000)
  await end($, 'aborted')
  expect(await say($, 'last')).toBe('"one more" was not heard: the turn ended 9s after you sent it.\nNothing ran in between.')
  await desk.world.clock.advance(2000)
  await begin($, 'one more')
  expect(await say($, 'last')).toBe('"one more" was not heard in that turn and ran as its own turn 11s after you sent it.\nNothing ran in between.')

  for (const wrong of ['earshot', 'last 2', 'clear all']) expect(await say($, wrong)).toBe(USAGE)
  expect((await peek($)).messages.length).toBe(2)
  expect(desk.world.store.get('isOn')).toBe(true)

  expect(await say($, 'clear')).toBe('Earshot cleared: 2 messages forgotten.')
  expect((await card($)).lines[0]).toBe('Nothing waiting to be heard.')
  expect(await say($, 'last')).toBe(NONE)
  await typed($, 'only one')
  expect(await say($, 'CLEAR')).toBe('Earshot cleared: 1 message forgotten.')
})

test('A14: while off nothing is written or timed, last and clear say it is off, and switching off forgets everything', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($, false)
  expect(await say($, 'last')).toBe(OFF)
  expect(await say($, 'clear')).toBe(OFF)
  await typed($, 'no, use pnpm')
  await deliver($, 'no, use pnpm')
  await step($)
  await call($, desk, 'toolu_01', 'Bash', { command: 'npm install' })
  await end($)
  await begin($, 'no, use pnpm')
  await desk.world.clock.advance(5000)
  expect(await peek($)).toEqual({ messages: [], flight: [] })
  expect(desk.ticks).toEqual([])
  expect(desk.world.writes).toEqual([])

  const direct = bench(false)
  const answers = {
    'prompt.submit': [{ text: 'no, use pnpm', wait: false, origin: { kind: 'composer' }, turnId: 'turn-1' }, { text: 'no, use pnpm' }],
    'prompt.attachment': [delivery('no, use pnpm'), { text: `${FRAME}no, use pnpm` }],
    'tool.call': [{ tool: 'Bash', tool_use_id: 'toolu_01', command: 'npm install' }, RAN],
    'turn.complete': [{ answer: 'Done.', durationMs: 4200, isAborted: false, turnId: 'turn-1', reason: 'answer' }, { text: 'Done.' }],
    'turn.start': [{ text: 'no, use pnpm', turnId: 'turn-2' }, { turnId: 'turn-2' }],
  } as const
  for (const [event, [asked, answer]] of Object.entries(answers)) {
    expect(await direct.raise(event, asked, answer)).toBe(answer)
    expect(direct.passed.at(-1)).toBe(asked)
  }
  const asked = request()
  const answer = { turnId: 'turn-1', index: 3, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  const passed = await direct.stream(asked, CHUNKS, answer)
  passed.chunks.forEach((chunk, at) => expect(chunk).toBe(CHUNKS[at]))
  expect(passed.result).toBe(answer)
  expect(direct.passed.at(-1)).toBe(asked)
  expect(direct.calls).toEqual([])

  await say($, 'on')
  const release = gate(desk, 'toolu_02')
  const running = call($, desk, 'toolu_02', 'Bash', { command: 'bun test' })
  await desk.world.clock.settle()
  await typed($, 'no, use pnpm')
  expect((await peek($)).flight.length).toBe(1)
  expect(await say($, 'off')).toBe('Earshot off.')
  expect(await peek($)).toEqual({ messages: [], flight: [] })
  release()
  await running
  expect(await peek($)).toEqual({ messages: [], flight: [] })
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
  expect(new Set(desk.world.writes)).toEqual(new Set(['store isOn']))
})

test('A15: every state fits its card at 20, 40 and 60 columns, with the narrow forms and no note under 30', { ...PLUGINS, timeoutMs: 30_000 }, async ($, on) => {
  const desk = open(on)
  const fits = async (isEmpty = false): Promise<void> => {
    for (const [columns, wide] of [[20, 20], [40, 40], [60, 60]] as const) {
      await $.command.run(run('widen', `${NAME} ${wide}`))
      const seen = await card($, columns)
      const inner = Math.min(wide, columns) - 4
      for (const line of seen.lines) expect(line.length).toBeLessThanOrEqual(inner)
      expect(seen.note === '').toBe(isEmpty || wide < 30)
      expect(seen.lines.length).toBeGreaterThan(1)
    }
    await $.command.run(run('widen', `${NAME} 40`))
  }

  await start($)
  await fits(true)

  const release = gate(desk, 'toolu_01')
  const running = call($, desk, 'toolu_01', 'Bash', { command: 'bun test --watch src/parser/ranges.test.ts --reporter verbose' })
  await desk.world.clock.advance(1000)
  await typed($, LONG)
  await desk.world.clock.advance(65_000)
  const waiting = await card($)
  expect(waiting.lines[0]).toBe(`"${LONG.slice(0, 33)}…"`)
  expect(waiting.lines[2]).toBe('behind Bash bun test --watch src/pa…')
  expect((await card($, 20)).lines).toEqual(['"refactor the…"', 'waiting · 1m 05s', 'behind bun test…'])
  release()
  await running
  await fits()

  for (let at = 1; at <= 6; at += 1) await call($, desk, `toolu_1${at}`, 'Bash', { command: `git commit --all --message "Step ${at} of the parser refactor, with ranges"` })
  await look($, desk, 'toolu_20')
  await call($, desk, 'toolu_21', 'PowerShell', { command: 'Start-Sleep 30' }, MOVED)
  await fits()
  await deliver($, LONG)
  await fits()
  expect((await card($)).lines[4]).toBe('! Bash git commit --all --message "…')
  expect((await card($, 20)).lines[4]).toBe('! git commit --…')

  await typed($, '')
  await typed($, 'x'.repeat(80))
  await desk.world.clock.advance(125_000)
  await deliver($, 'x'.repeat(80))
  await fits()
  expect((await card($)).lines).toEqual([`"${'x'.repeat(33)}…"`, 'heard 2m 05s after you sent it', 'Nothing ran before it heard you.', '(no text) · waiting', `"${LONG.slice(0, 19)}…" · 1m 05s late`])
  expect((await card($, 20)).lines).toEqual([`"${'x'.repeat(13)}…"`, 'heard +2m 05s', 'Nothing ran.', '(no t… · waiting', '"ref…" · +1m 05s'])

  await end($)
  await fits()
  await typed($, 'no, use pnpm')
  await end($, 'aborted')
  await fits()
  await begin($, 'no, use pnpm')
  await fits()
  expect((await card($, 20)).lines[1]).toBe('Own turn +0s')
})

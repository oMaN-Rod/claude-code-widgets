import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type Sent = { origin: unknown; text: string }
type Gate = { exitCode: number; stdout?: string; stderr?: string } | 'rejects'
type Desk = { world: Ground; ran: unknown[]; gates: Gate[]; env: Record<string, string>; beneath: { isClosing: boolean } }
type Lead = { text: string; color: unknown }
type Drawn = { note: string; width: unknown; lines: string[]; wraps: unknown[]; colors: unknown[]; dims: unknown[]; leads: Lead[] }

const NAME = 'queue-widget'
const HOUR = 3_600_000
const STEP = 400
const USAGE = 'Usage: /queue-widget [on|off|add <prompt>|until <command|off>|start|drop <number>|report|clear]'
const OFF = 'Queue is off.'
const EMPTY = ['Nothing queued. /queue-widget add', '<prompt> lines up work to run back', 'to back; until <command> keeps each', 'going until the command passes.']
const GATE_SET = 'Gate set: after each queued prompt `bun test` runs; while it fails Claude is sent its output, up to 3 times.'
const RETRY = '`bun test` is still failing after your last change. Find the cause, fix it, and stop when you believe it passes. Its output:\n'
const FLAKY = 'fix the flaky date test'
const CHANGELOG = 'update the changelog'
const VERSION = 'bump the version'
const TAG = 'tag the release'
const AS_USER = { kind: 'plugin', name: NAME, asUser: true }
const FRAMED = { kind: 'plugin', name: NAME }
const SH = { argv: ['sh', '-c', 'bun test'], timeoutMs: 600_000 }
const FAILS = { exitCode: 1, stdout: '1 fail\n', stderr: 'error: expected 3, received 2' }
const LATE = 'late'

const BENEATH: Plugin = {
  name: 'stand-in-beneath',
  tier: 'append',
  register(on) {
    on('prompt.submit', async ($, e, next) => {
      await $.ui.toast(JSON.stringify({ origin: e.origin, text: e.text.length > 2000 ? `${e.text.length} characters ending ${e.text.slice(-20)}` : e.text }))
      const fault = await $.env.get('STAND_IN')
      if (fault === 'late') await $.clock.sleep(100)

      return fault === undefined || fault === 'late' ? next(e) : { drop: fault }
    })
    on('process.run', async ($, e, next) => {
      const ran = await next(e)
      if ((await $.env.get('SLOW_GATE')) !== undefined) await $.clock.sleep(1000)

      return ran
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, BENEATH] }

const open = (on: On, store: Record<string, unknown> = {}): Desk => {
  const ran: unknown[] = []
  const gates: Gate[] = []
  const env: Record<string, string> = {}
  const beneath = { isClosing: false }
  const done = (gate: Exclude<Gate, string>) => ({ stdout: '', stderr: '', ...gate, isStdoutTruncated: false, isStderrTruncated: false })
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))
  const world = ground(on, {
    store,
    answers: {
      'env.get': (e: { name: string }) => env[e.name],
      'process.run': (e: { argv: string[]; init?: { timeoutMs?: number } }) => {
        ran.push({ argv: e.argv, timeoutMs: e.init?.timeoutMs })
        const gate = gates.shift() ?? { exitCode: 0 }
        if (gate === 'rejects') throw new Error('timed out after 600000 ms')

        return done(gate)
      },
    },
  })

  Object.defineProperty(world.contexts, 'push', {
    value: (...blocks: string[]): number => {
      if (beneath.isClosing) throw new Error('the session is closing')

      return Array.prototype.push.apply(world.contexts, blocks)
    },
  })

  return { world, ran, gates, env, beneath }
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const began = ($: Engine, turnId: string): Promise<unknown> => $.turn.start({ text: 'a queued prompt', turnId })

const ended = ($: Engine, turnId: string, extra: Record<string, unknown> = {}): Promise<unknown> =>
  $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId, reason: 'answer', ...extra } as never)

const played = async ($: Engine, desk: Desk, turnId: string, extra: Record<string, unknown> = {}): Promise<void> => {
  await began($, turnId)
  await ended($, turnId, extra)
  await desk.world.clock.advance(STEP)
}

const sent = (desk: Desk): Sent[] => desk.world.toasts.map(toast => JSON.parse(toast) as Sent)

const queued = (desk: Desk): Sent[] => sent(desk).filter(sent => (sent.origin as { kind?: string } | undefined)?.kind === 'plugin')

const drawn = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const card = await ui.find({ key: 'card' })
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const texts = (await ui.findAll({ type: 'Text' })).slice(3)
  await ui.unmount()
  if (card === undefined) return undefined

  const rows = texts.filter(row => row.props.wrap !== undefined)

  return {
    note,
    width: card.props.width,
    lines: rows.map(row => row.text),
    wraps: rows.map(row => row.props.wrap),
    colors: rows.map(row => row.props.color),
    dims: rows.map(row => row.props.dimColor),
    leads: texts.filter(row => row.props.wrap === undefined).map(lead => ({ text: lead.text, color: lead.props.color })),
  }
}

test('A1: the empty card says what will queue, switched on or restored, and a restore sends and writes nothing', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true })
  await session($)
  await $.command.run(run('place', 'side'))
  const plain = [undefined, undefined, undefined, undefined]
  const empty = { note: '', width: 40, lines: EMPTY, wraps: EMPTY.map(() => 'truncate-end'), colors: plain, dims: [false, false, false, false], leads: [] }
  expect(await drawn($)).toEqual(empty)
  expect((await drawn($, 20))?.lines).toEqual(['Nothing queued.', '/queue-widget', 'add <prompt>', 'lines up work to', 'run back to', 'back; until', '<command> keeps', 'each going until', 'the command', 'passes.'])

  await desk.world.clock.advance(HOUR)
  expect(sent(desk)).toEqual([])
  expect(desk.ran).toEqual([])
  expect(desk.world.writes).toEqual([])

  expect(await cmd($, 'off')).toBe('Queue off; nothing more is sent.')
  expect(await cmd($, 'on')).toBe('Queue on; /queue-widget add <prompt> lines one up. /widgets places it.')
  expect(await drawn($)).toEqual(empty)
})

test('A2: add queues a prompt as typed, sends it as the person after 400 ms, and refuses no text and an eleventh', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  expect(await cmd($, 'ADD  Fix the   flaky test')).toBe('Queued at 1.')
  await desk.world.clock.advance(STEP - 1)
  expect(sent(desk)).toEqual([])
  await desk.world.clock.advance(1)
  expect(sent(desk)).toEqual([{ origin: AS_USER, text: 'Fix the   flaky test' }])
  expect(await drawn($)).toMatchObject({ note: 'running', lines: ['▶ Fix the flaky test'], colors: [undefined], leads: [{ text: '▶', color: 'cyan' }] })

  expect(await cmd($, 'add')).toBe('Add what? Try /queue-widget add run the tests and fix what fails')
  expect(await cmd($, 'add   ')).toBe('Add what? Try /queue-widget add run the tests and fix what fails')
  expect(await cmd($, 'report')).toBe('Nothing has finished yet.\nRunning: Fix the flaky test (sent; its turn has not started)')
  for (let at = 1; at <= 10; at += 1) expect(await cmd($, `add prompt ${at}`)).toBe(`Queued at ${at}.`)
  expect(await cmd($, 'add one too many')).toBe('The queue is full (10 prompts). /queue-widget drop <number> makes room.')
  expect(await cmd($, 'report')).toBe('Nothing has finished yet.\nRunning: Fix the flaky test (sent; its turn has not started)\n10 prompts waiting.')
  expect(await drawn($)).toMatchObject({ note: '10 waiting', lines: ['▶ Fix the flaky test', '1 prompt 1', '2 prompt 2', '3 prompt 3', '+7 more'] })
  expect(sent(desk)).toHaveLength(1)
})

test('A3: with no gate the second prompt waits for the first turn to end and 400 ms more, and both finish clean', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, `add ${FLAKY}`)
  await cmd($, `add ${CHANGELOG}`)

  await desk.world.clock.advance(STEP)
  expect(sent(desk)).toEqual([{ origin: AS_USER, text: FLAKY }])
  expect(await drawn($)).toMatchObject({ note: '1 waiting', lines: [`▶ ${FLAKY}`, `1 ${CHANGELOG}`] })
  await began($, 'turn-1')
  await desk.world.clock.advance(HOUR)
  expect(sent(desk)).toHaveLength(1)

  await ended($, 'turn-1')
  await desk.world.clock.advance(STEP - 1)
  expect(sent(desk)).toHaveLength(1)
  await desk.world.clock.advance(1)
  expect(sent(desk)).toEqual([{ origin: AS_USER, text: FLAKY }, { origin: AS_USER, text: CHANGELOG }])
  expect(await drawn($)).toMatchObject({ note: 'running', lines: ['1 clean', `▶ ${CHANGELOG}`] })

  await played($, desk, 'turn-2')
  expect(await drawn($)).toMatchObject({
    note: 'all clean',
    lines: ['2 clean', `✓ ${FLAKY}`, `✓ ${CHANGELOG}`],
    leads: [{ text: '2 clean', color: 'green' }, { text: '✓', color: 'green' }, { text: '✓', color: 'green' }],
  })
  expect(await cmd($, 'report')).toBe(`2 of 2 finished clean.\n✓ ${FLAKY} (1h 00m)\n✓ ${CHANGELOG} (0s)`)
  expect(desk.ran).toEqual([])
})

test('A4: a gate runs through sh, or cmd where ComSpec is set, after each queued turn until it is removed', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  expect(await cmd($, 'until')).toBe('Until what? Try /queue-widget until bun test')
  expect(await cmd($, 'until bun test')).toBe(GATE_SET)
  expect(await drawn($)).toMatchObject({ note: '', lines: [...EMPTY, 'until: bun test'] })
  await cmd($, `add ${FLAKY}`)
  await desk.world.clock.advance(STEP)
  expect(await drawn($)).toMatchObject({ lines: [`▶ ${FLAKY}`, 'until: bun test'], colors: [undefined, undefined], dims: [false, true] })
  await began($, 'turn-1')
  expect(desk.ran).toEqual([])
  await ended($, 'turn-1')
  await desk.world.clock.advance(STEP)
  expect(desk.ran).toEqual([SH])
  expect(await cmd($, 'report')).toBe(`1 of 1 finished clean.\n✓ ${FLAKY} (0s; gate passed)\nGate: bun test`)

  desk.env.ComSpec = 'C:\\WINDOWS\\system32\\cmd.exe'
  await cmd($, `add ${CHANGELOG}`)
  await desk.world.clock.advance(STEP)
  await played($, desk, 'turn-2')
  expect(desk.ran).toEqual([SH, { argv: ['cmd', '/c', 'bun test'], timeoutMs: 600_000 }])

  expect(await cmd($, 'until OFF')).toBe('Gate removed; a prompt is finished when its turn ends.')
  await cmd($, `add ${VERSION}`)
  await desk.world.clock.advance(STEP)
  await played($, desk, 'turn-3')
  expect(desk.ran).toHaveLength(2)
  expect(await cmd($, 'report')).toBe(`3 of 3 finished clean.\n✓ ${FLAKY} (0s; gate passed)\n✓ ${CHANGELOG} (0s; gate passed)\n✓ ${VERSION} (0s)`)

  expect(await cmd($, 'until bun test `--bail`\n  --timeout 5000')).toBe(
    'Gate set: after each queued prompt `bun test `--bail` --timeout 5000` runs; while it fails Claude is sent its output, up to 3 times.',
  )
})

test('A5: a failing gate sends Claude the last 40 lines of its output and the prompt finishes clean on the retry', PLUGINS, async ($, on) => {
  const desk = open(on)
  const lines = Array.from({ length: 50 }, (_, at) => `test ${at + 1} of 50 failed`)
  desk.gates.push({ exitCode: 1, stdout: `${lines.join('\n')}\n` }, { exitCode: 0 }, { exitCode: 1 }, { exitCode: 1, stdout: 'x'.repeat(5000), stderr: 'the last word' })
  await start($)
  await cmd($, 'until bun test')
  await cmd($, `add ${FLAKY}`)
  await desk.world.clock.advance(STEP)
  await played($, desk, 'turn-1')

  expect(queued(desk)).toEqual([
    { origin: AS_USER, text: FLAKY },
    { origin: FRAMED, text: `${RETRY}${lines.slice(10).join('\n')}` },
  ])
  expect(queued(desk)[1]?.text).not.toContain('test 10 of 50 failed')
  expect(await drawn($)).toMatchObject({ note: 'running', lines: [`▶ ${FLAKY}`, 'retry 1/3: bun test'], colors: [undefined, 'yellow'], dims: [false, false] })

  await played($, desk, 'turn-2')
  expect(desk.ran).toEqual([SH, SH])
  expect(await cmd($, 'report')).toBe(`1 of 1 finished clean.\n✓ ${FLAKY} (1s; gate passed on retry 1)\nGate: bun test`)
  expect(await drawn($)).toMatchObject({ note: 'all clean', lines: ['1 clean', `✓ ${FLAKY}`, 'until: bun test'] })

  await cmd($, `add ${CHANGELOG}`)
  await desk.world.clock.advance(STEP)
  await played($, desk, 'turn-3')
  expect(queued(desk)[3]).toEqual({ origin: FRAMED, text: `${RETRY}(no output)` })

  await played($, desk, 'turn-4')
  expect(queued(desk)[4]?.text).toBe(`${RETRY.length + 4000} characters ending xxxxxx\nthe last word`)
})

test('A6: a gate that never passes is run 4 times, then the prompt is failed and the queue halts until start', PLUGINS, async ($, on) => {
  const desk = open(on)
  desk.gates.push(FAILS, 'rejects', FAILS, FAILS)
  await start($)
  await cmd($, 'until bun test')
  await cmd($, `add ${FLAKY}`)
  await cmd($, `add ${VERSION}`)
  await desk.world.clock.advance(STEP)
  for (const turnId of ['turn-1', 'turn-2', 'turn-3', 'turn-4']) await played($, desk, turnId)

  expect(desk.ran).toEqual([SH, SH, SH, SH])
  expect(queued(desk)).toEqual([
    { origin: AS_USER, text: FLAKY },
    { origin: FRAMED, text: `${RETRY}1 fail\nerror: expected 3, received 2` },
    { origin: FRAMED, text: expect.stringMatching(/Its output:\n.*Error/) },
    { origin: FRAMED, text: `${RETRY}1 fail\nerror: expected 3, received 2` },
  ])
  expect(await cmd($, 'report')).toBe(
    `0 of 1 finished clean.\n✗ ${FLAKY} (2s; gate still failing after 3 retries)\n1 prompt waiting.\nGate: bun test\nHalted: gate failing. /queue-widget start resumes.`,
  )
  expect(await drawn($)).toMatchObject({
    note: 'halted',
    lines: ['0 clean · 1 not', `1 ${VERSION}`, 'until: bun test', '■ gate failing'],
    colors: ['red', undefined, undefined, 'red'],
    dims: [false, true, true, false],
    leads: [{ text: '0 clean', color: 'green' }],
  })
  expect((await drawn($, 20))?.lines[0]).toBe('0 ✓ · 1 ✗')

  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(4)

  expect(await cmd($, 'start')).toBe('Queue running: 1 prompt waiting.')
  await desk.world.clock.advance(STEP)
  expect(queued(desk)[4]).toEqual({ origin: AS_USER, text: VERSION })
})

test('A7: a queued turn that is interrupted, errors or is refused is logged stopped, halts the queue and runs no gate', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, 'until bun test')
  for (const prompt of [FLAKY, CHANGELOG, VERSION]) await cmd($, `add ${prompt}`)

  await desk.world.clock.advance(STEP)
  await played($, desk, 'turn-1', { isAborted: true, reason: 'aborted' })
  expect(await drawn($)).toMatchObject({ note: 'halted', lines: ['0 clean · 1 not', `1 ${CHANGELOG}`, `2 ${VERSION}`, 'until: bun test', '■ interrupted'] })
  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(1)

  await cmd($, 'start')
  await desk.world.clock.advance(STEP)
  await played($, desk, 'turn-2', { reason: 'error' })
  expect((await drawn($))?.lines.at(-1)).toBe('■ turn error')

  await cmd($, 'start')
  await desk.world.clock.advance(STEP)
  await played($, desk, 'turn-3', { reason: 'refusal', refusal: { category: null, explanation: null } })
  expect(await drawn($)).toMatchObject({
    note: 'halted',
    lines: ['0 clean · 3 not', `■ ${FLAKY}`, `■ ${CHANGELOG}`, `■ ${VERSION}`, 'until: bun test', '■ turn refusal'],
    leads: [{ text: '0 clean', color: 'green' }, { text: '■', color: 'yellow' }, { text: '■', color: 'yellow' }, { text: '■', color: 'yellow' }],
  })

  expect(await cmd($, 'report')).toBe(
    [
      '0 of 3 finished clean.',
      `■ ${FLAKY} (0s; turn interrupted)`,
      `■ ${CHANGELOG} (0s; turn ended with error)`,
      `■ ${VERSION} (0s; turn ended with refusal)`,
      'Gate: bun test',
      'Halted: turn refusal. /queue-widget start resumes.',
    ].join('\n'),
  )
  expect(desk.ran).toEqual([])
})

test('A8: a turn of a subagent, another turn and a turn the person typed are not taken for the queued one, and every result passes through', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, `add ${FLAKY}`)
  await desk.world.clock.advance(STEP)
  await began($, 'turn-1')

  expect(await ended($, 'turn-1', { agentId: 'agent-7' })).toEqual({ text: 'Done.' })
  expect(await ended($, 'turn-0', { answer: 'Another.' })).toEqual({ text: 'Another.' })
  await desk.world.clock.advance(HOUR)
  expect(await cmd($, 'report')).toBe(`Nothing has finished yet.\nRunning: ${FLAKY}`)

  expect(await ended($, 'turn-1', { answer: 'Fixed.' })).toEqual({ text: 'Fixed.' })
  await desk.world.clock.advance(STEP)
  expect(await cmd($, 'report')).toBe(`1 of 1 finished clean.\n✓ ${FLAKY} (1h 00m)`)

  await turn($, 'What changed?', 'turn-2')
  await desk.world.clock.advance(HOUR)
  expect(await cmd($, 'report')).toBe(`1 of 1 finished clean.\n✓ ${FLAKY} (1h 00m)`)
  expect(queued(desk)).toHaveLength(1)
})

test('A9: a prompt that is dropped or whose submit fails is logged stopped and halts the queue until start', PLUGINS, async ($, on) => {
  const desk = open(on)
  desk.gates.push(FAILS)
  await start($)
  for (const prompt of [FLAKY, CHANGELOG, VERSION, TAG]) await cmd($, `add ${prompt}`)

  desk.env.STAND_IN = 'blocked by policy'
  await desk.world.clock.advance(STEP)
  expect(queued(desk)).toEqual([{ origin: AS_USER, text: FLAKY }])
  expect(await drawn($)).toMatchObject({ note: 'halted', lines: ['0 clean · 1 not', `1 ${CHANGELOG}`, `2 ${VERSION}`, `3 ${TAG}`, '■ prompt refused'] })
  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(1)

  delete desk.env.STAND_IN
  desk.beneath.isClosing = true
  await cmd($, 'start')
  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(2)
  expect((await drawn($))?.lines.at(-1)).toBe('■ prompt refused')

  desk.beneath.isClosing = false
  await cmd($, 'until bun test')
  await cmd($, 'start')
  await desk.world.clock.advance(STEP)
  desk.env.STAND_IN = `${'no retries here '.repeat(4)}today`
  await played($, desk, 'turn-1')
  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(4)

  desk.env.STAND_IN = LATE
  desk.beneath.isClosing = true
  await cmd($, 'until off')
  await cmd($, 'start')
  await desk.world.clock.advance(STEP)
  await began($, 'turn-2')
  await desk.world.clock.advance(100)
  await ended($, 'turn-2')
  await desk.world.clock.advance(HOUR)

  const report = (await cmd($, 'report'))?.split('\n') ?? []
  expect(report).toHaveLength(6)
  expect(report[0]).toBe('0 of 4 finished clean.')
  expect(report[1]).toBe(`■ ${FLAKY} (0s; prompt refused: blocked by policy)`)
  expect(report[2]).toMatch(new RegExp(`^■ ${CHANGELOG} \\(0s; prompt refused: .+\\)$`))
  expect(report[3]).toBe(`■ ${VERSION} (0s; prompt refused: ${'no retries here '.repeat(4).slice(0, 60)})`)
  expect(report[4]).toMatch(new RegExp(`^■ ${TAG} \\(0s; prompt refused: .+\\)$`))
  expect(report[5]).toBe('Halted: prompt refused. /queue-widget start resumes.')
})

test('A10: drop removes one waiting prompt by its number and refuses anything that is not one', PLUGINS, async ($, on) => {
  open(on)
  await start($)
  for (const prompt of [FLAKY, CHANGELOG, VERSION]) await cmd($, `add ${prompt}`)

  expect(await cmd($, 'drop 2')).toBe(`Dropped 2: ${CHANGELOG}`)
  expect(await drawn($)).toMatchObject({ note: '2 waiting', lines: [`1 ${FLAKY}`, `2 ${VERSION}`] })

  expect(await cmd($, 'drop')).toBe('There is no waiting prompt "".')
  expect(await cmd($, 'drop x')).toBe('There is no waiting prompt "x".')
  expect(await cmd($, 'drop 0')).toBe('There is no waiting prompt "0".')
  expect(await cmd($, 'drop 9')).toBe('There is no waiting prompt "9".')
  expect(await cmd($, 'drop -1')).toBe('There is no waiting prompt "-1".')
  expect(await cmd($, 'drop 1 2')).toBe('There is no waiting prompt "1 2".')
  expect(await cmd($, 'drop the one about the changelog')).toBe('There is no waiting prompt "the one about the ch".')
  expect(await drawn($)).toMatchObject({ note: '2 waiting', lines: [`1 ${FLAKY}`, `2 ${VERSION}`] })

  expect(await cmd($, 'drop 02')).toBe(`Dropped 2: ${VERSION}`)
  expect(await cmd($, `add ${'a very long prompt '.repeat(6)}`)).toBe('Queued at 2.')
  expect(await cmd($, 'drop 2')).toBe(`Dropped 2: ${'a very long prompt '.repeat(6).slice(0, 79)}…`)
  expect(await drawn($)).toMatchObject({ note: '1 waiting', lines: [`1 ${FLAKY}`] })
})

test('A11: report lists how each prompt ended, what is running, what waits, the gate and the halt', PLUGINS, async ($, on) => {
  const desk = open(on)
  desk.gates.push({ exitCode: 0 }, FAILS, FAILS, FAILS, FAILS)
  await start($)
  expect(await cmd($, 'report')).toBe('Nothing has finished yet.')

  await cmd($, 'until bun test')
  for (const prompt of [FLAKY, CHANGELOG, VERSION, TAG]) await cmd($, `add ${prompt}`)
  await desk.world.clock.advance(STEP)
  await began($, 'turn-1')
  await desk.world.clock.advance(65_000 - STEP)
  await ended($, 'turn-1')
  await desk.world.clock.advance(STEP)
  for (const turnId of ['turn-2', 'turn-3', 'turn-4', 'turn-5']) await played($, desk, turnId)

  const finished = ['1 of 2 finished clean.', `✓ ${FLAKY} (1m 05s; gate passed)`, `✗ ${CHANGELOG} (2s; gate still failing after 3 retries)`]
  expect(await cmd($, 'report')).toBe([...finished, '2 prompts waiting.', 'Gate: bun test', 'Halted: gate failing. /queue-widget start resumes.'].join('\n'))

  expect(await cmd($, 'start')).toBe('Queue running: 2 prompts waiting.')
  await desk.world.clock.advance(STEP)
  await began($, 'turn-6')
  expect(await cmd($, 'REPORT')).toBe([...finished, `Running: ${VERSION}`, '1 prompt waiting.', 'Gate: bun test'].join('\n'))
  expect(await cmd($, 'start')).toBe('Queue running: 1 prompt waiting.')
  expect(await cmd($, 'report')).toBe([...finished, `Running: ${VERSION}`, '1 prompt waiting.', 'Gate: bun test'].join('\n'))
})

test('A12: clear empties the waiting prompts, the report and the halt, and keeps the gate and a run in progress', PLUGINS, async ($, on) => {
  const desk = open(on)
  desk.gates.push(FAILS, FAILS, FAILS, FAILS)
  await start($)
  await cmd($, 'until bun test')
  await cmd($, `add ${FLAKY}`)
  await desk.world.clock.advance(STEP)
  for (const turnId of ['turn-1', 'turn-2', 'turn-3', 'turn-4']) await played($, desk, turnId)

  expect(await cmd($, `add ${CHANGELOG}`)).toBe('Queued at 1. The queue is halted (gate failing); /queue-widget start resumes.')
  expect(await cmd($, 'clear')).toBe('Queue and report cleared.')
  expect(await drawn($)).toMatchObject({ note: '', lines: [...EMPTY, 'until: bun test'], dims: [false, false, false, false, true] })
  expect(await cmd($, 'report')).toBe('Nothing has finished yet.\nGate: bun test')

  await cmd($, `add ${VERSION}`)
  await desk.world.clock.advance(STEP)
  await began($, 'turn-5')
  await cmd($, `add ${TAG}`)
  expect(await cmd($, 'clear')).toBe('Queue and report cleared.')
  expect(await drawn($)).toMatchObject({ note: 'running', lines: [`▶ ${VERSION}`, 'until: bun test'] })
  expect(await cmd($, 'report')).toBe(`Nothing has finished yet.\nRunning: ${VERSION}\nGate: bun test`)

  await cmd($, 'until off')
  await ended($, 'turn-5')
  await desk.world.clock.advance(STEP)
  await cmd($, 'clear')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
})

test('A13: while off every verb answers that the queue is off, and turns and the clock send, run and write nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await session($)
  await $.command.run(run('place', 'side'))

  for (const verb of ['add x', 'until bun test', 'start', 'drop 1', 'report', 'clear']) expect(await cmd($, verb)).toBe(OFF)
  await turn($)
  await began($, 'turn-2')
  await ended($, 'turn-2')
  await desk.world.clock.advance(HOUR)

  expect(queued(desk)).toEqual([])
  expect(desk.ran).toEqual([])
  expect(desk.world.writes).toEqual([])
  expect(desk.world.store.get('isOn')).toBeUndefined()
  expect(await drawn($)).toBeUndefined()

  await cmd($, 'on')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
})

test('A14: switching off stops the run, sends and gates nothing after, and on again waits for start only after a cut run', PLUGINS, async ($, on) => {
  const desk = open(on)
  desk.gates.push(FAILS)
  await start($)
  await cmd($, 'until bun test')
  await cmd($, `add ${FLAKY}`)
  await cmd($, `add ${CHANGELOG}`)
  await desk.world.clock.advance(STEP)
  await began($, 'turn-1')

  const before = desk.world.writes.length
  expect(await cmd($, 'off')).toBe('Queue off; nothing more is sent.')
  expect(desk.world.writes.slice(before)).toEqual(['store isOn'])
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
  await ended($, 'turn-1')
  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(1)
  expect(desk.ran).toEqual([])
  expect(await drawn($)).toBeUndefined()

  await cmd($, 'on')
  expect(await drawn($)).toMatchObject({ note: 'halted', lines: ['0 clean · 1 not', `1 ${CHANGELOG}`, 'until: bun test', '■ switched off'] })
  expect(await cmd($, 'report')).toBe(
    `0 of 1 finished clean.\n■ ${FLAKY} (0s; switched off)\n1 prompt waiting.\nGate: bun test\nHalted: switched off. /queue-widget start resumes.`,
  )
  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(1)

  await cmd($, 'start')
  await desk.world.clock.advance(STEP)
  expect(queued(desk)).toHaveLength(2)
  desk.env.SLOW_GATE = 'yes'
  await began($, 'turn-2')
  await ended($, 'turn-2')
  await desk.world.clock.advance(STEP)
  expect(desk.ran).toEqual([SH])
  await cmd($, 'off')
  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(2)
  await cmd($, 'on')
  expect(await cmd($, 'report')).toBe(
    `0 of 2 finished clean.\n■ ${FLAKY} (0s; switched off)\n■ ${CHANGELOG} (0s; switched off)\nGate: bun test\nHalted: switched off. /queue-widget start resumes.`,
  )

  await cmd($, 'clear')
  await cmd($, `add ${VERSION}`)
  await cmd($, 'off')
  await desk.world.clock.advance(HOUR)
  expect(queued(desk)).toHaveLength(2)
  await cmd($, 'on')
  await desk.world.clock.advance(STEP - 1)
  expect(queued(desk)).toHaveLength(2)
  await desk.world.clock.advance(1)
  expect(queued(desk)[2]).toEqual({ origin: AS_USER, text: VERSION })
})

test('A15: the busiest card keeps one line a row at every width and placement, and an unknown verb changes nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  const gate = `bun test ${'packages/client/retry.test.ts '.repeat(7)}`.slice(0, 200)
  const long = Array.from({ length: 5 }, (_, at) => `${at + 1}: ${'rewrite the retry loop so that it backs off '.repeat(2)}`.slice(0, 80))
  desk.gates.push({ exitCode: 0 }, { exitCode: 0 }, FAILS, FAILS, FAILS, FAILS, FAILS, FAILS)
  await start($)
  await cmd($, `until ${gate}`)
  for (const prompt of [FLAKY, CHANGELOG, VERSION, TAG]) await cmd($, `add ${prompt}`)
  await desk.world.clock.advance(STEP)
  for (const turnId of ['turn-1', 'turn-2', 'turn-3', 'turn-4', 'turn-5', 'turn-6']) await played($, desk, turnId)
  await cmd($, 'start')
  await desk.world.clock.advance(STEP)
  for (const turnId of ['turn-7', 'turn-8']) await played($, desk, turnId)
  for (const prompt of long) await cmd($, `add ${prompt}`)

  const rows = [`▶ ${TAG}`, ...long.slice(0, 3).map((prompt, at) => `${at + 1} ${prompt}`), '+2 more', `retry 2/3: ${gate}`]
  for (const [columns, tally] of [[20, '2 ✓ · 1 ✗'], [39, '2 ✓ · 1 ✗'], [40, '2 clean · 1 not']] as const) {
    const card = await drawn($, columns)
    expect(card).toMatchObject({ note: '5 waiting', width: columns, lines: [tally, ...rows] })
    expect(card?.wraps).toEqual(Array.from({ length: 7 }, () => 'truncate-end'))
  }

  const report = await cmd($, 'report')
  for (const verb of ['stop', 'rounds 5', 'start now', 'on now', 'report all', 'clear everything']) expect(await cmd($, verb)).toBe(USAGE)
  expect(await cmd($, 'report')).toBe(report)
  expect(desk.world.store.get('isOn')).toBe(true)

  const side = await drawn($)
  for (const [place] of SITES) {
    await $.command.run(run('place', place))
    for (const [other, component] of SITES) expect(await drawn($, 40, component)).toEqual(other === place ? side : undefined)
  }

  await $.command.run(run('place', 'side'))
  await $.command.run(run('widen', `${NAME} 60`))
  expect(await drawn($, 60)).toMatchObject({ note: '5 waiting', width: 60, lines: ['2 clean · 1 not', ...rows] })
})

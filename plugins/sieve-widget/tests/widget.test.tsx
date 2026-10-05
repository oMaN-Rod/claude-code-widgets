import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, SessionCompactResult, SessionMessage, ToolUseSummary } from 'claude-code'

import { sieve, size } from '../hooks/register'
import { LAYOUT, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Row = { name: string; kind: 'used' | 'free' | 'buffer' | 'deferred'; tokens: number }
type Live = {
  messages: SessionMessage[]
  tokens: number | undefined
  window: number
  breakdown: { totalTokens: number; categories: Row[] } | undefined
  reads: number
  asks: unknown[]
  isBroken: boolean
}
type Drawn = { note: string; lines: string[]; wraps: unknown[] }
type Wording = { note: string; long: string[]; short: string[] }

const NAME = 'sieve-widget'
const MARKER = 'STAND-IN '
const USAGE = 'Usage: /sieve-widget [on|off]'
const EMPTY = ['Nothing to sieve yet.', 'After a turn with tool calls: what a compaction would keep and drop.']
const SPENT = 'No summary written, no tokens spent'
const BAR = /^█+▒*░*$/

const STAND: Plugin = {
  name: 'stand-in',
  register(on) {
    on('session.compact', async ($, e) => {
      const seen = `STAND-IN ${JSON.stringify(e, (_key, value) => (typeof value === 'bigint' ? `${value}n` : value))}`

      return (await $.store.get('standIn')) === 'skip' ? { skip: seen } : { messages: [{ role: 'user', text: seen, toolUses: [] }] }
    })
  },
}

const WITNESS: Plugin = {
  name: 'witness',
  register(on) {
    on('session.compact', async ($, e) => {
      await $.store.set('witness', e.trigger)

      return { messages: [{ role: 'user', text: 'The usual summary.', toolUses: [] }] }
    })
  },
}

const call = (id: string, tool: string, input: Record<string, unknown>, chars = 40, isFailed = false): ToolUseSummary => ({
  tool_use_id: id,
  tool,
  input,
  text: 'x'.repeat(chars),
  ...(isFailed ? { isError: true as const } : {}),
})

const said = (role: 'user' | 'assistant', text: string): SessionMessage => ({ role, text, toolUses: [] })

const asked = (text: string, uses: ToolUseSummary[]): SessionMessage => ({ role: 'assistant', text, toolUses: uses })

const answered = (uses: ToolUseSummary[], text = ''): SessionMessage => ({
  role: 'user',
  text,
  toolUses: [],
  toolResults: uses.map(use => ({ tool_use_id: use.tool_use_id, text: use.text ?? '', isError: use.isError === true })),
})

const work = (turn: number, chars: number): SessionMessage[] => {
  const read = call(`t${turn}-read`, 'Read', { file_path: `src/sum${turn}.js` }, chars / 2)
  const tested = call(`t${turn}-test`, 'Bash', { command: 'npm test' }, chars / 4, true)
  const found = call(`t${turn}-grep`, 'Grep', { pattern: 'sum(' }, chars / 4)

  return [
    said('user', `Fix failing test ${turn}`),
    asked('I will read the file first.', [read]),
    answered([read]),
    asked('', [tested, found]),
    answered([tested, found]),
    said('assistant', `Test ${turn} passes now.`),
  ]
}

const stamped = (messages: SessionMessage[]): SessionMessage[] => messages.map((message, at) => ({ ...message, handle: `h${at}` }))

const transcript = (turns: number, chars: number): SessionMessage[] =>
  stamped(Array.from({ length: turns }, (_, at) => work(at + 1, chars)).flat())

const weight = (messages: readonly SessionMessage[]): { talk: number; traffic: number; all: number } => {
  const talk = messages.reduce((held, message) => held + message.text.length, 0) / 4
  const traffic =
    messages.reduce(
      (held, message) => held + message.toolUses.reduce((sum, use) => sum + JSON.stringify(use.input).length + (use.text?.length ?? 0), 0),
      0,
    ) / 4

  return { talk, traffic, all: talk + traffic }
}

const leaves = (total: number, before: readonly SessionMessage[], after: readonly SessionMessage[], conv = total): number =>
  total - conv + (conv * weight(after).all) / weight(before).all

const broken = (totalTokens: number, conv?: number): Live['breakdown'] => ({
  totalTokens,
  categories: [
    { name: 'System prompt', kind: 'used', tokens: 3000 },
    { name: 'System tools', kind: 'used', tokens: 17_000 },
    ...(conv === undefined ? [] : [{ name: 'Messages', kind: 'used' as const, tokens: conv }]),
    { name: 'Free space', kind: 'free', tokens: 67_000 },
    { name: 'Autocompact buffer', kind: 'buffer', tokens: 33_000 },
  ],
})

const digestFor = (turn: number): string =>
  `[sieve-widget] 3 tool calls folded here by a widget, results dropped (not written by the user): Read src/sum${turn}.js; Bash npm test (failed); Grep sum(. Run a call again if you need its result.`

const setup = (on: On, store: Record<string, unknown> = {}): { world: Ground; live: Live } => {
  const live: Live = { messages: [], tokens: 40_000, window: 200_000, breakdown: undefined, reads: 0, asks: [], isBroken: false }
  const world = ground(on, {
    store,
    answers: {
      'session.messages': () => {
        live.reads += 1
        if (live.isBroken) throw new Error('the transcript could not be read')

        return live.messages
      },
      'session.usage': (e: unknown) => {
        live.reads += 1
        live.asks.push(e)

        return {
          startedAt: 1_700_000_000_000,
          context: {
            window: live.window,
            ...(live.tokens === undefined ? {} : { tokens: live.tokens }),
            ...(live.breakdown === undefined ? {} : { breakdown: live.breakdown }),
          },
          rateLimits: [],
        }
      },
    },
  })

  return { world, live }
}

const drawn = async ($: Engine, columns = 40): Promise<Drawn> => {
  const ui = await $.ui.mount(target(NAME, 'Pane', columns))
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const rows = (await ui.findAll({ type: 'Text' })).slice(3)
  await ui.unmount()

  return { note, lines: rows.map(row => row.text), wraps: rows.map(row => row.props.wrap) }
}

const card = async ($: Engine, columns = 40): Promise<{ note: string; lines: string[] }> => {
  const { note, lines } = await drawn($, columns)

  return { note, lines }
}

const compact = ($: Engine, messages: SessionMessage[], trigger = 'auto', more: object = {}): Promise<SessionCompactResult> =>
  $.session.compact({ trigger, messages, ...more } as never)

const measured = async ($: Engine, live: Live, changed = ['context', 'cost']): Promise<void> => {
  await $.session.measure({
    changed,
    context: { window: live.window, ...(live.tokens === undefined ? {} : { tokens: live.tokens }) },
    rateLimits: [],
  } as never)
}

const seen = (result: SessionCompactResult): { trigger: string; instructions?: string; agentId?: string; messages: unknown[] } | undefined => {
  const text = result.skip ?? result.messages?.[0]?.text ?? ''

  return text.startsWith(MARKER) ? JSON.parse(text.slice(MARKER.length)) : undefined
}

const CHAT = [said('user', 'Why does the sum come out one short?'), said('assistant', 'The loop starts at 1, so the first item is skipped.')]
const BIG = transcript(6, 20_000)
const ONE = stamped(work(1, 20_000))
const SLIGHT = transcript(4, 400)
const DENSE = stamped([
  ...[1, 2, 3, 4].flatMap(part => {
    const input = { file_path: `dist/part${part}.min.js` }
    const read = call(`dense-${part}`, 'Read', input, 38_000 - JSON.stringify(input).length)

    return [said('user', `Check the bundle of part ${part}`), asked('', [read]), answered([read]), said('assistant', `Part ${part} is sound.`)]
  }),
  said('user', 'Which part is the largest?'),
  said('assistant', 'Part 3, by a little.'),
  said('user', 'Write up what you checked.'),
  said('assistant', `Checked four bundles. ${'Each one loads and exports what the entry expects. '.repeat(200)}`.slice(0, 7760)),
])
const UNWEIGHABLE = stamped([
  ...work(1, 20_000),
  said('user', 'Sum the ledger totals'),
  asked('', [call('ledger', 'mcp__ledger__sum', { account: 'main', floor: 10n }, 20_000)]),
  answered([call('ledger', 'mcp__ledger__sum', {}, 20_000)]),
  said('assistant', 'The total is 42.'),
  ...work(3, 400),
  ...work(4, 400),
])

test('A1: says nothing to sieve yet until the transcript holds a tool call', { plugins: [LAYOUT] }, async ($, on) => {
  const { live } = setup(on)

  await session($)
  await $.command.run(run('place', 'side'))
  for (const messages of [[], CHAT]) {
    live.messages = messages
    await $.command.run(run(NAME, 'off'))
    await $.command.run(run(NAME, 'on'))
    expect(await card($)).toEqual({ note: '', lines: EMPTY })
  }
})

test('A1: says the same when the switch comes back from the store', { plugins: [LAYOUT] }, async ($, on) => {
  const { live } = setup(on, { isOn: true })

  for (const messages of [[], CHAT]) {
    live.messages = messages
    await session($)
    await $.command.run(run('place', 'side'))
    expect(await card($)).toEqual({ note: '', lines: EMPTY })
  }
})

test('A2: shows what a sieve would leave once the transcript holds tool calls', { plugins: [LAYOUT] }, async ($, on) => {
  const { live } = setup(on)
  const small = transcript(3, 800)
  const { talk, traffic, all } = weight(small)
  live.messages = small
  live.tokens = 900

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  const first = await card($)
  expect(first.note).toBe('about 900')
  expect(first.lines).toHaveLength(4)
  expect(first.lines[0]).toHaveLength(36)
  expect(first.lines[0]).toMatch(/^█+▒+$/)
  expect(first.lines[1]).toBe(`about ${Math.floor((900 * talk) / all)} conversation`)
  expect(first.lines[2]).toBe(`about ${Math.floor((900 * traffic) / all)} tool traffic`)
  expect(Math.floor((900 * talk) / all) + Math.floor((900 * traffic) / all)).toBeLessThanOrEqual(900)
  expect(first.lines[3]).toMatch(/^A sieve leaves about \d+$/)
  expect(Number(first.lines[3]?.split(' ').at(-1))).toBeLessThan(900)

  live.tokens = 500
  await session($)
  const restored = await card($)
  expect(restored.note).toBe('about 500')
  const [shownTalk, shownTraffic] = [restored.lines[1], restored.lines[2]].map(line => Number(line?.split(' ')[1]))
  expect((shownTalk ?? 0) + (shownTraffic ?? 0)).toBeLessThanOrEqual(500)
  expect(restored.lines[0]).toMatch(/^█+▒+$/)

  live.tokens = 990
  await measured($, live)
  expect((await card($)).note).toBe('about 990')

  live.window = 600
  await measured($, live)
  const tight = await card($)
  expect(tight.lines).toHaveLength(5)
  expect(tight.lines[4]).toBe('Too much: a summary would run')

  const before = Math.round((31_500 * weight(BIG).all) / weight(sieve(BIG, 2).messages).all)
  live.tokens = before
  live.window = 200_000
  const { messages = [] } = await compact($, BIG)
  expect((await card($)).lines[0]).toBe(`About ${size(before)} to about 31k`)

  live.messages = [...messages.map(({ handle: _handle, ...message }) => message), ...work(7, 20_000)]
  live.tokens = 28_000
  await measured($, live)
  const later = await card($)
  expect(later.note).toBe('about 28k')
  expect(later.lines.at(-1)).toBe(`Last sieve: about ${size(before)} to 28k`)
  expect(later.lines[3]).toMatch(/^A sieve leaves about /)

  live.tokens = 35_000
  await measured($, live)
  const second = await card($)
  expect(second.note).toBe('about 35k')
  expect(second.lines.at(-1)).toBe(`Last sieve: about ${size(before)} to 28k`)

  live.tokens = undefined
  live.messages = BIG
  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  const untold = await card($)
  expect(untold.note).toBe(`about ${size(weight(BIG).all)}`)
  expect(untold.lines[1]).toBe(`about ${size(weight(BIG).talk)} conversation`)
  expect(untold.lines[2]).toBe(`about ${size(weight(BIG).traffic)} tool traffic`)
  expect(untold.lines[0]).toMatch(/^█+▒+$/)

  const sieved = await compact($, BIG)
  expect((await card($)).lines[0]).toBe(`About ${size(weight(BIG).all)} to about ${size(weight(sieved.messages ?? []).all)}`)
})

test('A3: an auto compaction keeps every text message and folds the head of a realistic transcript', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run(NAME, 'on'))
  const result = await compact($, BIG)
  const messages = result.messages ?? []
  const head = messages.slice(0, -12)
  const tail = messages.slice(-12)

  expect(seen(result)).toBeUndefined()
  expect(tail).toEqual(BIG.slice(-12))
  for (const message of BIG.slice(0, -12)) {
    const isKept = message.toolUses.length === 0 && message.toolResults === undefined
    if (isKept) expect(head).toContainEqual(message)
  }
  expect(head.filter(message => message.handle !== undefined)).toEqual(BIG.slice(0, -12).filter(message => message.toolUses.length === 0 && message.toolResults === undefined))
  for (const message of head) {
    expect(message.toolUses).toEqual([])
    expect(message.toolResults).toBeUndefined()
    if (message.handle === undefined) expect(message.text.trim()).not.toBe('')
  }
  expect(head.filter(message => message.handle === undefined && message.role === 'assistant').map(message => message.text)).toEqual(
    Array.from({ length: 4 }, () => 'I will read the file first.'),
  )

  const used = tail.flatMap(message => message.toolUses.map(use => use.tool_use_id))
  const resulted = tail.flatMap(message => (message.toolResults ?? []).map(found => found.tool_use_id))
  expect(resulted).toHaveLength(6)
  for (const id of resulted) expect(used).toContain(id)

  const queued = call('queued', 'Bash', { command: 'npm run build' }, 20_000)
  const split = [
    said('user', 'First'),
    said('assistant', 'ok'),
    said('user', 'Second'),
    asked('', [queued]),
    said('user', '<task-notification><task-id>b1</task-id><status>completed</status></task-notification>'),
    answered([queued]),
    said('assistant', 'fin'),
    said('user', 'Third'),
    said('assistant', 'ok'),
  ]
  const paired = sieve(split, 2)
  expect(paired.messages).toHaveLength(split.length)
  paired.messages.forEach((message, at) => expect(message).toBe(split[at]))
  expect([paired.calls, paired.lines]).toEqual([0, 0])

  const fromCall = sieve(split.slice(3), 2)
  expect(fromCall.messages).toEqual(split.slice(3))
  expect(fromCall.calls).toBe(0)
})

test('A4: keeps the text beside tool traffic and every row that only looks typed', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { world, live } = setup(on)
  const read = call('early-read', 'Read', { file_path: 'src/sum.js' }, 20_000)
  const tested = call('early-test', 'Bash', { command: 'npm test' }, 400)
  const rows = stamped([
    said('user', ''),
    asked('I will read the file first.', [read]),
    answered([read], 'Stop, look at src/total.js instead.'),
    asked('', [tested]),
    answered([tested]),
    said('user', 'This session is being continued from a previous conversation that ran out of context. Summary: the sum was one short.'),
    said('user', '<local-command-stdout>Set model to opus</local-command-stdout>'),
    said('user', '<task-notification><task-id>b1</task-id><status>completed</status></task-notification>'),
    said('assistant', 'Noted.'),
    ...work(2, 400),
    ...work(3, 400),
  ])
  live.messages = rows
  live.tokens = undefined

  await session($)
  await $.command.run(run('place', 'side'))
  const answer = await $.command.run(run(NAME, 'on'))
  const result = await compact($, rows)
  const { note, lines } = await card($)

  expect((result.messages ?? []).slice(0, 9)).toEqual([
    rows[0],
    { role: 'assistant', text: 'I will read the file first.', toolUses: [] },
    {
      role: 'user',
      text: '[sieve-widget] 1 tool call folded here by a widget, results dropped (not written by the user): Read src/sum.js. Run a call again if you need its result.',
      toolUses: [],
    },
    { role: 'user', text: 'Stop, look at src/total.js instead.', toolUses: [] },
    {
      role: 'user',
      text: '[sieve-widget] 1 tool call folded here by a widget, results dropped (not written by the user): Bash npm test. Run a call again if you need its result.',
      toolUses: [],
    },
    rows[5],
    rows[6],
    rows[7],
    rows[8],
  ])
  expect((result.messages ?? []).slice(9)).toEqual(rows.slice(9))
  expect(note).toBe('sieved')
  expect(lines[1]).toBe(`Every word of ${rows.filter(row => row.text !== '').length} messages kept`)
  expect(lines[1]).toBe('Every word of 12 messages kept')
  for (const text of [...lines, ...world.toasts, answer.text ?? '']) expect(text).not.toContain('your messages')
})

test('A5: folds each run of calls into one marked line', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run(NAME, 'on'))
  const head = ((await compact($, BIG)).messages ?? []).slice(0, -12)
  const digests = head.filter(message => message.text.startsWith('[sieve-widget]'))
  expect(digests).toEqual([1, 2, 3, 4].map(turn => ({ role: 'user', text: digestFor(turn), toolUses: [] })))
  expect(head.map(message => message.text)).toEqual(
    [1, 2, 3, 4].flatMap(turn => [`Fix failing test ${turn}`, 'I will read the file first.', digestFor(turn), `Test ${turn} passes now.`]),
  )

  const repeated = [
    call('a', 'Read', { file_path: 'src/sum.js' }),
    call('b', 'Bash', { command: 'npm test' }, 40, true),
    call('c', 'Bash', { command: 'npm test' }, 40, true),
  ]
  const rest = [said('assistant', 'Done.'), said('user', 'Next'), said('assistant', 'Ok.'), said('user', 'Last'), said('assistant', 'Ok.')]
  const fold = (uses: ToolUseSummary[]): string =>
    sieve([said('user', 'Fix it'), asked('', uses), answered(uses), ...rest], 2).messages[1]?.text ?? ''
  expect(fold(repeated)).toBe(
    '[sieve-widget] 3 tool calls folded here by a widget, results dropped (not written by the user): Read src/sum.js; Bash npm test (failed) x2. Run a call again if you need its result.',
  )

  const long = `grep -rn ${'a'.repeat(491)}`
  expect(long).toHaveLength(500)
  expect(fold([call('long', 'Bash', { command: long })])).toContain(`: Bash ${long.slice(0, 80)}. Run`)

  const heredoc = "cat > notes.txt <<'END'\n\tfirst line\n\n\tsecond  line\nEND\n"
  const flat = fold([call('doc', 'Bash', { command: heredoc })])
  expect(flat).toContain(": Bash cat > notes.txt <<'END' first line second line END. Run")
  expect(flat).not.toMatch(/[\n\t]/)

  const many = fold(Array.from({ length: 60 }, (_, at) => call(`r${at}`, 'Read', { file_path: `src/file${at}.js` })))
  expect(many).toStartWith('[sieve-widget] 60 tool calls folded here')
  expect(many.split('; ')).toHaveLength(41)
  expect(many).toContain('Read src/file39.js; and 20 more. Run')
  expect(many).not.toContain('file40.js')

  expect(fold([call('p', 'TodoWrite', { todos: [] }), call('q', 'TodoWrite', { todos: [] }), call('s', 'mcp__ledger__sum', { account: 1 })])).toContain(
    ': TodoWrite x2; mcp__ledger__sum. Run',
  )

  const old = { role: 'user', text: digestFor(1), toolUses: [], handle: 'old' } as const satisfies SessionMessage
  const again = [
    said('user', 'Fix failing test 1'),
    old,
    said('assistant', 'Test 1 passes now.'),
    said('user', 'Second'),
    said('assistant', 'Ok.'),
    said('user', 'Third'),
    said('assistant', 'Ok.'),
  ]
  const resieved = sieve(again, 2)
  expect(resieved.messages[1]).toBe(old)
  expect(resieved.kept).toBe(6)
  expect(resieved.lines).toBe(0)

  const lone = call('lone', 'Read', { file_path: 'src/sum.js' })
  const afterDigest = sieve([said('user', 'First'), asked('', [lone]), answered([lone]), old, said('assistant', 'Ok.'), said('user', 'Second'), said('assistant', 'Ok.')], 2)
  expect(afterDigest.calls).toBe(0)
})

test('A6: keeps the last two turns whole, or the last one when two leave too much', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run(NAME, 'on'))
  const two = (await compact($, BIG)).messages ?? []
  expect(two.slice(-12)).toEqual(BIG.slice(-12))
  expect(two.filter(message => message.toolUses.length > 0)).toHaveLength(4)

  live.window = 20_000
  const one = (await compact($, BIG)).messages ?? []
  expect(one.slice(-6)).toEqual(BIG.slice(-6))
  expect(one.filter(message => message.toolUses.length > 0)).toHaveLength(2)
  expect(one.filter(message => message.text.startsWith('[sieve-widget]'))).toHaveLength(5)

  const whole = sieve(ONE, 2)
  expect(whole.messages).toHaveLength(ONE.length)
  whole.messages.forEach((message, at) => expect(message).toBe(ONE[at]))
  expect([whole.calls, whole.lines]).toEqual([0, 0])
  expect(seen(await compact($, ONE))).toEqual({ trigger: 'auto', messages: ONE })
})

test('A7: says what a sieve kept and folded, and a bare /compact sieves the same', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { world, live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  const auto = await compact($, BIG)
  const left = size(leaves(40_000, BIG, auto.messages ?? []))
  const best = { note: 'sieved', lines: [`About 40k to about ${left}`, 'Every word of 18 messages kept', '12 tool calls folded to 4 lines', SPENT] }
  expect(await card($)).toEqual(best)
  expect(world.toasts).toEqual([`Sieve: about 40k to about ${left}, every word kept, no summary.`])

  for (const more of [{}, { instructions: '  ' }]) {
    const manual = await compact($, BIG, 'manual', more)
    expect(seen(manual)).toBeUndefined()
    expect(manual).toEqual(auto)
    expect(await card($)).toEqual(best)
  }
  expect(world.toasts).toHaveLength(3)

  live.tokens = undefined
  const shot = call('shot', 'Read', { file_path: 'src/sum.js' }, 20_000)
  const single = await compact($, stamped([said('user', ''), asked('', [shot]), answered([shot]), said('user', 'What does the screenshot show?')]))
  expect(single.messages?.[1]?.text).toStartWith('[sieve-widget] 1 tool call folded here')
  expect((await card($)).lines.slice(1, 3)).toEqual(['Every word of 1 message kept', '1 tool call folded to 1 line'])
  expect((await card($, 20)).lines.slice(1, 3)).toEqual(['1 text kept', '1 folded'])

  const light = call('light', 'Read', { file_path: 'src/index.js' })
  const pair = stamped([said('user', ''), asked('', [light]), answered([light]), said('user', 'First'), asked('', [shot]), answered([shot]), said('user', 'Second')])
  expect(seen(await compact($, pair))).toBeUndefined()
  expect((await card($)).lines.slice(1, 3)).toEqual(['Every word of 2 messages kept', '2 tool calls folded to 2 lines'])
  expect((await card($, 20)).lines.slice(1, 3)).toEqual(['2 texts kept', '2 folded'])
})

test('A8: steps aside when a sieve would not free enough', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { world, live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  const cases = [
    { messages: BIG, tokens: 40_000, window: 10_000, conv: undefined },
    { messages: SLIGHT, tokens: 40_000, window: 200_000, conv: 2000 },
    { messages: ONE, tokens: undefined, window: 200_000, conv: undefined },
  ]
  for (const [at, { messages, tokens, window, conv }] of cases.entries()) {
    live.tokens = tokens
    live.window = window
    live.breakdown = conv === undefined ? undefined : broken(40_000, conv)
    const result = await compact($, messages)
    const total = tokens ?? weight(messages).all
    const left = size(leaves(total, messages, sieve(messages, 1).messages, conv))

    expect(result.messages).toHaveLength(1)
    expect(seen(result)).toEqual({ trigger: 'auto', messages })
    expect(await card($)).toEqual({ note: 'passed on', lines: [`A sieve would leave about ${left}`, 'Not enough: the usual summary ran'] })
    expect(world.toasts).toHaveLength(at + 1)
    expect(world.toasts.at(-1)).toBe(`Sieve would not free enough (about ${left} left): the usual summary ran.`)
  }
})

test('A9: passes a compaction with instructions on, and leaves a subagent alone', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { world, live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run('place', 'side'))
  for (const trigger of ['manual', 'plugin']) {
    await $.command.run(run(NAME, 'off'))
    await $.command.run(run(NAME, 'on'))
    const result = await compact($, BIG, trigger, { instructions: 'Keep the plan for the ledger' })
    const wide = await card($)
    const narrow = await card($, 20)

    expect(seen(result)).toEqual({ trigger, instructions: 'Keep the plan for the ledger', messages: BIG })
    expect(wide).toEqual({ note: 'passed on', lines: ['Compaction came with instructions', 'The usual summary ran with them'] })
    expect(narrow).toEqual({ note: 'passed on', lines: ['had instructions', 'summary ran'] })
    for (const line of [...wide.lines, ...narrow.lines]) expect(line).not.toMatch(/You|\/compact/)
  }

  const before = await card($)
  const result = await compact($, BIG, 'auto', { agentId: 'agent-7' })
  expect(seen(result)).toEqual({ trigger: 'auto', agentId: 'agent-7', messages: BIG })
  expect(await card($)).toEqual(before)
  expect(world.toasts).toEqual([])
})

test('A10: a precompute and a vetoed compaction change nothing', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { world, live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  const before = await card($)
  expect(before.note).toBe('about 40k')

  expect(await compact($, BIG, 'precompute')).toEqual({ skip: 'Sieve will handle the compaction.' })
  expect(seen(await compact($, ONE, 'precompute'))).toEqual({ trigger: 'precompute', messages: ONE })
  expect(seen(await compact($, UNWEIGHABLE, 'precompute'))?.trigger).toBe('precompute')
  expect(seen(await compact($, BIG, 'precompute', { instructions: 'Keep the plan' }))).toEqual({
    trigger: 'precompute',
    instructions: 'Keep the plan',
    messages: BIG,
  })
  expect(await card($)).toEqual(before)

  world.store.set('standIn', 'skip')
  for (const [messages, more] of [[ONE, {}], [BIG, { instructions: 'Keep the plan' }], [UNWEIGHABLE, {}]] as const) {
    const result = await compact($, messages, 'auto', more)
    expect(result.messages).toBeUndefined()
    expect(result.skip).toStartWith(MARKER)
    expect(await card($)).toEqual(before)
  }
  expect(world.toasts).toEqual([])
})

test('A10: off, a compaction is the one beneath and nothing else', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { world, live } = setup(on)
  live.messages = BIG

  await session($)
  const result = await compact($, BIG)

  expect(seen(result)).toEqual({ trigger: 'auto', messages: BIG })
  expect(result).toEqual({ messages: [{ role: 'user', text: `${MARKER}${JSON.stringify({ trigger: 'auto', messages: BIG })}`, toolUses: [] }] })
  expect(world.writes).toEqual([])
  expect(world.toasts).toEqual([])
  expect(world.store.size).toBe(0)
  expect(live.reads).toBe(0)
})

test('A11: has no verb that starts a compaction', { plugins: [LAYOUT, WITNESS] }, async ($, on) => {
  const { world, live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  const before = await card($)

  for (const verb of ['now', 'sieve', 'clear', 'compact']) {
    expect((await $.command.run(run(NAME, verb))).text).toBe(USAGE)
    expect(await card($)).toEqual(before)
  }
  for (const verb of ['off', 'on', '', '']) await $.command.run(run(NAME, verb))

  expect(world.store.has('witness')).toBe(false)
  expect(world.toasts).toEqual([])

  await compact($, BIG, 'manual', { instructions: 'Keep the plan' })
  expect(world.store.get('witness')).toBe('manual')
})

test('A12: says so when it cannot sieve or cannot read, and looks again only on a measured turn', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { world, live } = setup(on)
  live.messages = BIG

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  await compact($, BIG)
  const best = await card($)
  expect(best.note).toBe('sieved')

  const reads = live.reads
  await measured($, live, ['cost', 'rateLimits'])
  live.tokens = undefined
  await measured($, live, ['context'])
  expect(live.reads).toBe(reads)
  expect(await card($)).toEqual(best)

  live.tokens = 40_000
  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  const afresh = await card($)
  expect(afresh.note).toBe('about 40k')
  expect(afresh.lines).toHaveLength(4)
  expect(afresh.lines.join(' ')).not.toContain('Last sieve')

  const toasts = world.toasts.length
  live.isBroken = true
  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  const unread = await card($)
  expect(unread).toEqual({ note: 'no reading', lines: ['Could not read the conversation', 'The next turn tries again'] })
  expect(unread.lines.join(' ')).not.toMatch(/summary/i)
  expect(world.toasts).toHaveLength(toasts)

  live.isBroken = false
  await measured($, live)
  expect((await card($)).note).toBe('about 40k')

  const failed = await compact($, UNWEIGHABLE)
  expect(seen(failed)?.trigger).toBe('auto')
  expect(seen(failed)?.messages).toHaveLength(UNWEIGHABLE.length)
  expect(await card($)).toEqual({ note: 'failed', lines: ['Could not sieve this conversation', 'The usual summary ran'] })
  expect(world.toasts).toHaveLength(toasts)
})

test('A13: every state reads at every width with large figures', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { live } = setup(on)
  const chat = Array.from({ length: 495 }, (_, at) => [said('user', `Question ${at}`), said('assistant', `Answer ${at}`)]).flat()
  const blocks = Array.from({ length: 120 }, (_, at) => {
    const uses = Array.from({ length: at < 12 ? 11 : 10 }, (_use, nth) => call(`b${at}-${nth}`, 'Read', { file_path: `src/part${at}/file${nth}.js` }, 4100))

    return [said('user', `Check part ${at}`), asked('', uses), answered(uses), said('assistant', `Part ${at} is sound.`)]
  }).flat()
  const huge = stamped([...chat, ...blocks, said('user', 'Anything left?'), said('assistant', 'No.'), said('user', 'Thanks'), said('assistant', 'Welcome.')])
  const { talk, traffic, all } = weight(huge)
  const total = 1_234_567
  const scale = total / all

  const reads = async (wording: Wording): Promise<void> => {
    for (const columns of [20, 39, 40, 60]) {
      const inner = Math.min(40, columns) - 4
      const { note, lines, wraps } = await drawn($, columns)

      expect(note).toBe(wording.note)
      expect(note.length).toBeLessThanOrEqual(10)
      expect(lines.map(line => (BAR.test(line) ? 'bar' : line))).toEqual(columns >= 40 ? wording.long : wording.short)
      for (const line of lines.filter(line => BAR.test(line))) expect(line).toHaveLength(inner)
      lines.forEach((line, at) => {
        if (wraps[at] !== 'wrap') expect(line.length).toBeLessThanOrEqual(Math.min(inner, 36))
      })
    }
  }

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  await reads({ note: '', long: EMPTY, short: EMPTY })
  expect((await drawn($, 20)).wraps).toEqual(['wrap', 'wrap'])

  live.tokens = total
  live.window = 2_000_000
  const sieved = await compact($, huge)
  const left = size(weight(sieved.messages ?? []).all * scale)
  expect(seen(sieved)).toBeUndefined()
  await reads({
    note: 'sieved',
    long: [`About 1.2M to about ${left}`, 'Every word of 1.2k messages kept', '1.2k tool calls folded to 120 lines', SPENT],
    short: [`1.2M to ${left}`, '1.2k texts kept', '1.2k folded', 'no tokens spent'],
  })

  live.messages = huge
  live.window = 1000
  await measured($, live)
  const kept = size(weight(sieve(huge, 1).messages).all * scale)
  await reads({
    note: 'about 1.2M',
    long: [
      'bar',
      `about ${size(talk * scale)} conversation`,
      `about ${size(traffic * scale)} tool traffic`,
      `A sieve leaves about ${kept}`,
      'Too much: a summary would run',
      'Last sieve: about 1.2M to 1.2M',
    ],
    short: ['bar', `${size(talk * scale)} talk`, `${size(traffic * scale)} tools`, `leaves ${kept}`, 'too much left', 'last 1.2M → 1.2M'],
  })

  live.breakdown = broken(total, 2000)
  await compact($, SLIGHT)
  await reads({
    note: 'passed on',
    long: ['A sieve would leave about 1.2M', 'Not enough: the usual summary ran'],
    short: ['1.2M: not enough', 'summary ran'],
  })
  live.breakdown = undefined

  await compact($, SLIGHT, 'manual', { instructions: 'Keep the plan' })
  await reads({
    note: 'passed on',
    long: ['Compaction came with instructions', 'The usual summary ran with them'],
    short: ['had instructions', 'summary ran'],
  })

  await compact($, UNWEIGHABLE)
  await reads({ note: 'failed', long: ['Could not sieve this conversation', 'The usual summary ran'], short: ['could not sieve', 'summary ran'] })

  live.isBroken = true
  await measured($, live)
  await reads({ note: 'no reading', long: ['Could not read the conversation', 'The next turn tries again'], short: ['could not read', 'tries next turn'] })

  const sizes = [
    [999, '999'],
    [1000, '1.0k'],
    [1212, '1.2k'],
    [9999, '9.9k'],
    [142_000, '142k'],
    [999_999, '999k'],
    [1_234_567, '1.2M'],
    [9_999_999, '9.9M'],
    [12_345_678, '12M'],
    [999_999_999, '999M'],
    [5_000_000_000, '999M'],
  ] as const
  for (const [count, text] of sizes) {
    expect(size(count)).toBe(text)
    expect(size(count).length).toBeLessThanOrEqual(4)
  }
  for (const count of [Number.NaN, Number.POSITIVE_INFINITY, -5]) expect(size(count)).toBe('0')

  live.isBroken = false
  live.messages = BIG
  live.window = 20_000_000
  for (const [tokens, note] of [[9999, 'about 9.9k'], [999_999, 'about 999k'], [9_999_999, 'about 9.9M']] as const) {
    live.tokens = tokens
    await measured($, live)
    for (const [columns, most] of [[20, 16], [40, 36]] as const) {
      const shown = await drawn($, columns)
      expect(shown.note).toBe(note)
      expect(shown.note.length).toBeLessThanOrEqual(10)
      for (const line of shown.lines) expect(line.length).toBeLessThanOrEqual(most)
    }
  }
})

test('A14: weighs dense tool traffic as traffic, from the conversation share of the window', { plugins: [LAYOUT, STAND] }, async ($, on) => {
  const { live } = setup(on)
  const { talk, traffic } = weight(DENSE)
  expect([talk * 4, traffic * 4]).toEqual([8000, 152_000])
  expect(sieve(DENSE, 2).calls).toBe(4)
  live.messages = DENSE
  live.tokens = 100_000
  live.breakdown = broken(100_000, 80_000)

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  const dense = { note: 'about 100k', lines: ['about 4.0k conversation', 'about 76k tool traffic', 'A sieve leaves about 24k'] }
  const shown = await card($)
  expect({ note: shown.note, lines: shown.lines.slice(1) }).toEqual(dense)
  expect(shown.lines[0]).toMatch(/^█▒+░+$/)
  expect(live.asks).toEqual([{ breakdown: 'summary' }])

  const sieved = await compact($, DENSE)
  expect(seen(sieved)).toBeUndefined()
  expect((await card($)).lines[0]).toBe('About 100k to about 24k')
  expect(size(20_000 + weight(sieved.messages ?? []).all * 2)).toBe('24k')
  expect(live.asks).toEqual([{ breakdown: 'summary' }, { breakdown: 'summary' }])

  for (const breakdown of [undefined, broken(100_000), broken(100_000, 150_000)]) {
    live.breakdown = breakdown
    await measured($, live)
    const whole = await card($)
    expect(whole.lines.slice(1, 3)).toEqual(['about 5.0k conversation', 'about 95k tool traffic'])
    expect(whole.lines[3]).toMatch(/^A sieve leaves about 5\.\dk$/)
    expect(whole.lines[0]).toMatch(/^█+▒+$/)
  }

  live.tokens = undefined
  live.breakdown = broken(100_000, 80_000)
  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  const untold = await card($)
  expect({ note: untold.note, lines: untold.lines.slice(1) }).toEqual(dense)
  await compact($, DENSE)
  expect((await card($)).lines[0]).toBe('About 100k to about 24k')
})

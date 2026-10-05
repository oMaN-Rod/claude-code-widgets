import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteRequest, ModelCompleteResult, On, ProcessRunResult } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Reply = ModelCompleteResult | Error
type Desk = { world: Ground; runs: (readonly string[])[]; asks: ModelCompleteRequest[]; diff: ProcessRunResult | Error; reply: Reply; queue: Reply[]; gates: Promise<void>[] }
type Drawn = { note: string; width: unknown; lines: string[]; wraps: unknown[]; dims: unknown[]; colors: unknown[]; marks: string[] }

const NAME = 'critic-widget'
const PLUGINS = { plugins: [LAYOUT] }
const USAGE = 'Usage: /critic-widget [on|off|review|tell|clear]'
const OFF = 'Critic is off.'
const GIT = ['git', 'diff', 'HEAD', '--no-color', '--no-ext-diff']
const BRIEF =
  'You are a second pair of eyes on a git diff. Report only defects that would cause wrong behaviour, a crash, data loss or a security hole. Never comment on style, naming, tests that could be added, or anything you only suspect. Write one finding per line as "- path:line: what breaks and when", at most six lines. If you find no defect, reply with exactly NONE.'
const LEAD =
  'critic-widget: an independent reviewer that saw only the uncommitted diff, not this conversation, flagged these. Check each against the code. Fix the ones that are real, and say which you reject and why:'
const EMPTY = ['No review yet. /critic-widget review', 'has a separate model read the', 'uncommitted diff and list only real', 'defects.']
const TELL = '/critic-widget tell hands these to Claude.'
const TELL_ROWS = ['/critic-widget tell hands these to', 'Claude.']
const TOLD = 'Goes to Claude with your next prompt.'
const TOLD_ANSWER = 'The findings go to Claude with your next prompt.'
const NOTHING_TO_TELL = 'No findings to hand over.'
const CUT = 'Only the first part of a long diff was read.'
const CUT_ROWS = ['Only the first part of a long diff', 'was read.']
const CLEAN = 'No defects found in the diff.'
const DROPPED = 'Critic dropped the review.'
const UNREACHED = 'The reviewing model could not be reached.'
const UNREADABLE = "The reviewer's reply could not be read."
const DIFF = [
  'diff --git a/src/sum.js b/src/sum.js',
  'index 3b18e51..9d0f6c2 100644',
  '--- a/src/sum.js',
  '+++ b/src/sum.js',
  '@@ -1,7 +1,7 @@',
  ' export const sum = list => {',
  '   let total = list[0]',
  '-  for (let at = 1; at < list.length; at += 1) {',
  '+  for (let at = 0; at < list.length; at += 1) {',
  '     total += list[at]',
  '   }',
  '   return total',
  '',
].join('\n')
const HUNK = '@@ -40,3 +40,4 @@ export const totals = rows => {\n   const kept = rows.filter(row => row.isKept)\n+  const spare = rows.length - kept.length\n   return kept.map(row => row.price)\n'
const LONG_DIFF = (DIFF + HUNK.repeat(400)).slice(0, 50_000)
const SUM = 'src/sum.js:4: total starts at list[0] and the loop now starts at 0, so the first item is added twice'
const CART = 'src/cart.js:9: price is read before the null check on item'
const TWO = `- ${SUM}\n- ${CART}`
const TAIL =
  'the handler reads the cached total after the await and writes it back, so an update made while the request was in flight is silently lost and the figure on the page drifts from the ledger until someone reloads it, which the retry path then repeats on every attempt'
const LONG_PATH = 'packages/storefront/src/checkout/pricing/discounts/cap.js:4:'
const SIX = ['src/cart.js:9:', 'src/sum.js:4:', LONG_PATH, 'src/api/orders.ts:118:', 'lib/retry.ts:27:', 'server/session/store.ts:63:'].map(head =>
  `${head} ${TAIL}`.slice(0, 240),
)
const USAGE_SPENT = { input_tokens: 812, output_tokens: 41, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const NO_USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const git = (stdout: string, more: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
  ...more,
})

const answered = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage: USAGE_SPENT })

const refused = (reason: 'empty-reply' | 'aborted'): ModelCompleteResult => ({ isAnswered: false, reason, usage: NO_USAGE }) as ModelCompleteResult

const told = (findings: readonly string[]): string => [LEAD, ...findings.map(finding => `- ${finding}`)].join('\n')

const numbered = (findings: readonly string[]): string[] => findings.map((finding, at) => `${at + 1}. ${finding}`)

const open = (on: On, store: Record<string, unknown> = {}): Desk => {
  const desk: Desk = {
    world: ground(on, {
      store,
      answers: {
        'process.run': (e: { argv: readonly string[] }) => {
          desk.runs.push(e.argv)
          if (desk.diff instanceof Error) throw desk.diff

          return desk.diff
        },
      },
    }),
    runs: [],
    asks: [],
    diff: git(DIFF),
    reply: answered(TWO),
    queue: [],
    gates: [],
  }
  const model = on as unknown as (event: 'model.complete', hook: (_$: unknown, e: ModelCompleteRequest) => Promise<{ value: ModelCompleteResult }>) => void
  model('model.complete', async (_$, e) => {
    desk.asks.push(e)
    await desk.gates.shift()
    const reply = desk.queue.shift() ?? desk.reply
    if (reply instanceof Error) throw reply

    return { value: reply }
  })

  return desk
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const reviewed = (
  $: Engine,
  desk: Desk,
  reply: Reply | string = desk.reply,
  diff: ProcessRunResult | Error = git(DIFF),
): Promise<string | undefined> => {
  desk.reply = typeof reply === 'string' ? answered(reply) : reply
  desk.diff = diff

  return cmd($, 'review')
}

const prompted = async ($: Engine, desk: Desk, kind = 'composer', context?: string[]): Promise<string[]> => {
  const before = desk.world.contexts.length
  await $.prompt.submit({ text: 'Why is the total one item too high?', wait: false, origin: { kind }, ...(context === undefined ? {} : { context }) } as never)

  return desk.world.contexts.slice(before)
}

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
    dims: rows.map(row => row.props.dimColor),
    colors: rows.map(row => row.props.color),
    marks: texts.filter(row => row.props.wrap === undefined).map(row => row.text),
  }
}

const settled = async (ready: () => boolean): Promise<void> => {
  for (let wait = 0; wait < 500 && !ready(); wait += 1) await new Promise(done => setTimeout(done, 1))
}

const held = (desk: Desk): { land: (text: string) => void } => {
  const gate: { open: () => void } = { open: () => {} }
  desk.gates.push(
    new Promise<void>(resolve => {
      gate.open = resolve
    }),
  )

  return {
    land: text => {
      desk.queue.push(answered(text))
      gate.open()
    },
  }
}

test('A1: the empty card names /critic-widget review with no note, and neither starting nor switching on runs git or the model', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true })
  await session($)
  await $.command.run(run('place', 'side'))
  expect(await drawn($)).toEqual({ note: '', width: 40, lines: EMPTY, wraps: EMPTY.map(() => 'truncate-end'), dims: EMPTY.map(() => false), colors: EMPTY.map(() => undefined), marks: [] })
  expect(EMPTY.join(' ')).toContain('No review yet.')
  expect(EMPTY.join(' ')).toContain('/critic-widget review has a separate model read the uncommitted diff')

  expect(await cmd($, 'off')).toBe('Critic off.')
  expect(await cmd($, 'on')).toBe('Critic on; /widgets places it.')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
  expect(desk.runs).toEqual([])
  expect(desk.asks).toEqual([])
})

test('A1: a session whose store has no switch starts without git or the model', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
  expect(desk.runs).toEqual([])
  expect(desk.asks).toEqual([])
})

test('A2: review sends the diff alone to sonnet with the brief, and the card and the answer carry both findings', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(await reviewed($, desk, TWO)).toBe([`1. ${SUM}`, `2. ${CART}`, TELL].join('\n'))
  expect(desk.runs).toEqual([GIT])
  expect(desk.asks).toEqual([{ model: 'sonnet', system: BRIEF, prompt: DIFF, maxTokens: 900, timeoutMs: 60000 }])
  expect(await drawn($)).toEqual({
    note: '2 found',
    width: 40,
    lines: ['1 src/sum.js:4: total starts at', '  list[0] and the loop now starts a…', '2 src/cart.js:9: price is read', '  before the null check on item', ...TELL_ROWS],
    wraps: Array.from({ length: 6 }, () => 'truncate-end'),
    dims: [undefined, false, undefined, false, true, true],
    colors: Array.from({ length: 6 }, () => undefined),
    marks: ['1', '2'],
  })
})

test('A3: the card says reading while the model is out, a second review is turned away, and the reply shows when it lands', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const out = held(desk)
  const first = cmd($, 'review')
  await settled(() => desk.asks.length === 1)
  expect(await drawn($)).toEqual({ note: 'reading', width: 40, lines: ['Reading the diff…'], wraps: ['truncate-end'], dims: [true], colors: [undefined], marks: [] })
  expect(await cmd($, 'review')).toBe('Still reading.')
  expect(desk.runs).toHaveLength(1)
  expect(desk.asks).toHaveLength(1)

  out.land(`- ${CART}`)
  expect(await first).toBe([`1. ${CART}`, TELL].join('\n'))
  expect(await drawn($)).toMatchObject({ note: '1 found', lines: ['1 src/cart.js:9: price is read', '  before the null check on item', ...TELL_ROWS] })
})

test('A4: NONE in any case, with or without a full stop, is a clean review, and a later finding replaces it', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  for (const reply of ['NONE', ' none. ', 'None']) {
    expect(await reviewed($, desk, reply)).toBe('No defects found.')
    expect(await drawn($)).toEqual({ note: 'clean', width: 40, lines: [CLEAN], wraps: ['truncate-end'], dims: [false], colors: ['green'], marks: [] })
  }

  expect(await reviewed($, desk, `- ${CART}`)).toBe([`1. ${CART}`, TELL].join('\n'))
  expect(await drawn($)).toMatchObject({ note: '1 found', marks: ['1'] })
})

test('A5: every failure is a sentence on the card and in the answer, and an API error prints neither its status nor its kind', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const overloaded = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: NO_USAGE } as ModelCompleteResult
  const failures: [string, ModelCompleteResult | Error | string, ProcessRunResult | Error, number][] = [
    ['No git repository here, or no commit yet.', TWO, git('', { exitCode: 1, stderr: 'fatal: not a git repository (or any of the parent directories): .git' }), 0],
    ['Could not run git diff.', TWO, new Error('process.run: timed out after 30000ms'), 0],
    ['Nothing uncommitted in tracked files.', TWO, git(' \n\t\n'), 0],
    [UNREACHED, overloaded, git(DIFF), 1],
    [UNREACHED, new Error('model.complete: the connection was reset'), git(DIFF), 1],
    [UNREACHED, { isAnswered: false } as ModelCompleteResult, git(DIFF), 1],
    ['The reviewing model gave no answer.', refused('empty-reply'), git(DIFF), 1],
    ['The review took too long and was stopped.', refused('aborted'), git(DIFF), 1],
    [UNREADABLE, 'The change looks reasonable to me overall.\nI would still run the tests before committing.', git(DIFF), 1],
    [UNREADABLE, '  \n ', git(DIFF), 1],
  ]
  for (const [sentence, reply, diff, calls] of failures) {
    const before = desk.asks.length
    const answer = await reviewed($, desk, reply, diff)
    const card = await drawn($)
    expect(answer).toBe(sentence)
    expect(card?.note).toBe('no review')
    expect(card?.lines.join(' ')).toBe(sentence)
    expect(card?.colors.every(color => color === 'red')).toBe(true)
    expect(desk.asks.length - before).toBe(calls)
    expect(`${answer} ${card?.lines.join(' ')}`).not.toMatch(/529|overloaded/)
  }
})

test('A6: a ragged reply is read as at most six tidy findings, and the note counts them', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const long = `src/api/orders.ts:118: ${TAIL} ${TAIL}`.slice(0, 400)
  const ragged = [
    'Here is what I found in the diff:',
    `- src/sum.js:4:  total starts at list[0]   and the loop now starts at 0`,
    `*   ${CART}`,
    '',
    `- ${long}`,
    'The remaining ones are in the retry path.\r',
    '- lib/retry.ts:27: the delay is in seconds but setTimeout is given it as milliseconds\r',
    '* lib/retry.ts:41: attempts is never reset after a success',
    '  - server/session/store.ts:63: the lock is released before the write finishes',
    '- src/cart.js:30: the seventh finding',
    '- src/cart.js:31: the eighth finding',
  ].join('\n')
  const kept = [
    'src/sum.js:4: total starts at list[0] and the loop now starts at 0',
    CART,
    long.slice(0, 240).trimEnd(),
    'lib/retry.ts:27: the delay is in seconds but setTimeout is given it as milliseconds',
    'lib/retry.ts:41: attempts is never reset after a success',
    'server/session/store.ts:63: the lock is released before the write finishes',
  ]
  expect(await reviewed($, desk, ragged)).toBe([...numbered(kept), TELL].join('\n'))
  expect(kept.every(finding => finding.length <= 240)).toBe(true)
  expect(await drawn($)).toMatchObject({ note: '6 found', marks: ['1', '2', '3', '4', '5', '6'] })

  await reviewed($, desk, `Only one thing:\n- ${CART}`)
  expect(await drawn($)).toMatchObject({ note: '1 found', marks: ['1'] })
})

test('A7: a diff over 40,000 characters is sent cut and says so on the card and in the answer; one of exactly 40,000 does not', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(LONG_DIFF).toHaveLength(50_000)

  expect(await reviewed($, desk, `- ${CART}`, git(LONG_DIFF))).toBe([`1. ${CART}`, TELL, CUT].join('\n'))
  expect(desk.asks.at(-1)?.prompt).toBe(LONG_DIFF.slice(0, 40_000))
  expect(await drawn($)).toMatchObject({
    note: '1 found',
    lines: ['1 src/cart.js:9: price is read', '  before the null check on item', ...CUT_ROWS, ...TELL_ROWS],
    dims: [undefined, false, true, true, true, true],
  })

  expect(await reviewed($, desk, 'NONE', git(LONG_DIFF))).toBe(['No defects found.', CUT].join('\n'))
  expect(desk.asks.at(-1)?.prompt).toHaveLength(40_000)
  expect(await drawn($)).toMatchObject({ note: 'clean', lines: [...CUT_ROWS, CLEAN], dims: [true, true, false], colors: [undefined, undefined, 'green'] })

  expect(await reviewed($, desk, `- ${CART}`, git(DIFF, { isStdoutTruncated: true }))).toBe([`1. ${CART}`, TELL, CUT].join('\n'))
  expect(desk.asks.at(-1)?.prompt).toBe(DIFF)
  expect((await drawn($))?.lines).toEqual(['1 src/cart.js:9: price is read', '  before the null check on item', ...CUT_ROWS, ...TELL_ROWS])
  expect(await reviewed($, desk, 'NONE', git(DIFF, { isStdoutTruncated: true }))).toBe(['No defects found.', CUT].join('\n'))

  const exact = LONG_DIFF.slice(0, 40_000)
  expect(await reviewed($, desk, `- ${CART}`, git(exact))).toBe([`1. ${CART}`, TELL].join('\n'))
  expect(desk.asks.at(-1)?.prompt).toBe(exact)
  expect((await drawn($))?.lines).toEqual(['1 src/cart.js:9: price is read', '  before the null check on item', ...TELL_ROWS])
  expect(await reviewed($, desk, 'NONE', git(exact))).toBe('No defects found.')
  expect((await drawn($))?.lines).toEqual([CLEAN])
})

test('A8: tell hands every finding whole to the next prompt from the composer, a bridge or the SDK, once, and nothing to a notification', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const pair = [SIX[0] ?? '', CART]
  expect(pair[0]).toHaveLength(240)

  for (const kind of ['composer', 'bridge', 'sdk']) {
    await reviewed($, desk, pair.map(finding => `- ${finding}`).join('\n'))
    expect(await cmd($, 'tell')).toBe(TOLD_ANSWER)
    const card = await drawn($)
    expect(card?.note).toBe('2 found')
    expect(card?.lines.slice(-2).join(' ')).toBe(TOLD)
    expect(card?.dims.at(-1)).toBe(true)

    expect(await prompted($, desk, kind, ['notes-widget: the user pinned a note'])).toEqual(['notes-widget: the user pinned a note', told(pair)])
    expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
    expect(await prompted($, desk, kind)).toEqual([])
  }

  await reviewed($, desk, TWO)
  await cmd($, 'tell')
  expect(await prompted($, desk, 'task-notification')).toEqual([])
  expect((await drawn($))?.lines.slice(-2).join(' ')).toBe(TOLD)
  expect(await prompted($, desk)).toEqual([told([SUM, CART])])
})

test('A9: tell needs findings, hands them over once, and a new review or no tell at all hands over nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(await cmd($, 'tell')).toBe(NOTHING_TO_TELL)
  expect(await prompted($, desk)).toEqual([])

  const out = held(desk)
  const first = cmd($, 'review')
  await settled(() => desk.asks.length === 1)
  expect(await cmd($, 'tell')).toBe(NOTHING_TO_TELL)
  expect(await prompted($, desk)).toEqual([])
  out.land('NONE')
  await first

  expect(await cmd($, 'tell')).toBe(NOTHING_TO_TELL)
  expect(await prompted($, desk)).toEqual([])
  await reviewed($, desk, new Error('model.complete: the connection was reset'))
  expect(await cmd($, 'tell')).toBe(NOTHING_TO_TELL)
  expect(await prompted($, desk)).toEqual([])

  await reviewed($, desk, TWO)
  expect(await cmd($, 'tell')).toBe(TOLD_ANSWER)
  expect(await cmd($, 'tell')).toBe(TOLD_ANSWER)
  expect(await prompted($, desk)).toEqual([told([SUM, CART])])
  expect(await prompted($, desk)).toEqual([])

  await reviewed($, desk, TWO)
  await cmd($, 'tell')
  await reviewed($, desk, `- ${CART}`)
  expect((await drawn($))?.lines.slice(-2)).toEqual(TELL_ROWS)
  expect(await prompted($, desk)).toEqual([])

  const before = await drawn($)
  expect(before?.note).toBe('1 found')
  expect(await prompted($, desk)).toEqual([])
  expect(await drawn($)).toEqual(before)
})

test('A10: clear empties the card and a pending tell, drops a reply still on its way, and leaves the next review its own result', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  for (const reply of [TWO, 'NONE', new Error('model.complete: the connection was reset')]) {
    await reviewed($, desk, reply)
    expect((await drawn($))?.note).not.toBe('')
    expect(await cmd($, 'clear')).toBe('Critic cleared.')
    expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
  }

  await reviewed($, desk, TWO)
  await cmd($, 'tell')
  expect(await cmd($, 'clear')).toBe('Critic cleared.')
  expect(await prompted($, desk)).toEqual([])

  const early = held(desk)
  const late = held(desk)
  const first = cmd($, 'review')
  await settled(() => desk.asks.length === 5)
  expect(await cmd($, 'clear')).toBe('Critic cleared.')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })

  const second = cmd($, 'review')
  await settled(() => desk.asks.length === 6)
  expect((await drawn($))?.note).toBe('reading')
  early.land(`- ${SUM}`)
  expect(await first).toBe(DROPPED)
  expect(await drawn($)).toMatchObject({ note: 'reading', lines: ['Reading the diff…'] })

  late.land(`- ${CART}`)
  expect(await second).toBe([`1. ${CART}`, TELL].join('\n'))
  expect(await drawn($)).toMatchObject({ note: '1 found', lines: ['1 src/cart.js:9: price is read', '  before the null check on item', ...TELL_ROWS] })

  const lone = held(desk)
  const third = cmd($, 'review')
  await settled(() => desk.asks.length === 7)
  await cmd($, 'clear')
  lone.land(TWO)
  expect(await third).toBe(DROPPED)
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
})

test('A11: while off the verbs do nothing, prompts pass untouched, and switching off forgets a tell and drops a reply', PLUGINS, async ($, on) => {
  const desk = open(on)
  await session($)
  await $.command.run(run('place', 'side'))
  for (const verb of ['review', 'tell', 'clear']) expect(await cmd($, verb)).toBe(OFF)
  expect(desk.runs).toEqual([])
  expect(desk.asks).toEqual([])
  expect(desk.world.writes).toEqual([])
  expect(await drawn($)).toBeUndefined()
  const passed = await $.prompt.submit({ text: 'Why is the total one item too high?', wait: false, origin: { kind: 'composer' }, context: ['notes-widget: the user pinned a note'] } as never)
  expect(passed).toMatchObject({ text: 'Why is the total one item too high?' })
  expect(desk.world.contexts).toEqual(['notes-widget: the user pinned a note'])

  await cmd($, 'on')
  await reviewed($, desk, TWO)
  await cmd($, 'tell')
  await cmd($, 'off')
  expect(await prompted($, desk)).toEqual([])
  await cmd($, 'on')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
  expect(await prompted($, desk)).toEqual([])

  const out = held(desk)
  const first = cmd($, 'review')
  await settled(() => desk.asks.length === 2)
  await cmd($, 'off')
  out.land(TWO)
  expect(await first).toBe(DROPPED)
  await cmd($, 'on')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
})

test('A12: the dropped verbs answer with the usage and change nothing, one command is registered, and the store holds only the switch', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(desk.world.commands).toEqual([NAME])

  expect(await cmd($, 'REVIEW')).toBe([`1. ${SUM}`, `2. ${CART}`, TELL].join('\n'))
  const before = await drawn($)
  const writes = desk.world.writes.length
  for (const typed of ['model opus', 'auto', 'review now', 'stop']) expect(await cmd($, typed)).toBe(USAGE)
  expect(await drawn($)).toEqual(before)
  expect(desk.world.writes).toHaveLength(writes)
  expect(desk.asks).toHaveLength(1)

  await cmd($, 'tell')
  await prompted($, desk)
  await reviewed($, desk, 'NONE')
  await cmd($, 'clear')
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
  expect(desk.world.store.get('isOn')).toBe(true)
  expect(desk.world.files.size).toBe(0)
})

const fits = async ($: Engine, note: string, rest?: string): Promise<void> => {
  for (const columns of [20, 40, 60]) {
    const inner = Math.min(40, columns) - 4
    const card = await drawn($, columns)
    expect(card?.note).toBe(note)
    expect(card?.width).toBe(inner + 4)
    expect('Critic'.length + 1 + note.length).toBeLessThanOrEqual(inner)
    expect(card?.lines.filter(line => line.length > inner)).toEqual([])
    expect(card?.wraps.every(wrap => wrap === 'truncate-end')).toBe(true)
    if (note !== '6 found') continue

    const rows = card?.lines.slice(0, 12) ?? []
    expect(card?.marks).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(rows.filter((_, at) => at % 2 === 0).map(row => row.slice(0, 2))).toEqual(['1 ', '2 ', '3 ', '4 ', '5 ', '6 '])
    expect(rows.filter((_, at) => at % 2 === 1).every(row => row.startsWith('  ') && row.endsWith('…'))).toBe(true)
    expect(card?.lines.slice(12).join(' ')).toBe(rest)
  }
}

test('A13: at 20, 40 and 60 columns six long findings take two rows each, the second ending in an ellipsis, and no row outgrows the card', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(SIX.map(finding => finding.length)).toEqual([240, 240, 240, 240, 240, 240])
  expect(LONG_PATH).toHaveLength(60)
  expect(LONG_PATH).not.toContain(' ')

  await reviewed($, desk, SIX.map(finding => `- ${finding}`).join('\n'))
  await fits($, '6 found', TELL)

  await cmd($, 'tell')
  await fits($, '6 found', TOLD)
})

test('A13: at 20, 40 and 60 columns no row of an empty or reading card outgrows it', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await fits($, '')

  const out = held(desk)
  const reading = cmd($, 'review')
  await settled(() => desk.asks.length === 1)
  await fits($, 'reading')
  out.land('NONE')
  await reading
})

test('A13: at 20, 40 and 60 columns no row of a cut or clean card outgrows it', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await reviewed($, desk, SIX.map(finding => `- ${finding}`).join('\n'), git(LONG_DIFF))
  await fits($, '6 found', `${CUT} ${TELL}`)
  await reviewed($, desk, 'NONE', git(LONG_DIFF))
  await fits($, 'clean')
  await reviewed($, desk, 'NONE')
  await fits($, 'clean')
})

test('A13: at 20, 40 and 60 columns no row of a card whose git diff failed outgrows it', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  for (const diff of [git('', { exitCode: 128 }), new Error('process.run: timed out after 30000ms'), git('\n')]) {
    await reviewed($, desk, TWO, diff)
    await fits($, 'no review')
  }
})

test('A13: at 20, 40 and 60 columns no row of a card whose model call failed outgrows it', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  for (const reply of [new Error('model.complete: the connection was reset'), refused('empty-reply'), refused('aborted'), 'Looks fine to me.']) {
    await reviewed($, desk, reply)
    await fits($, 'no review')
  }
})

test('A14: the found card is the same in all three placements and absent from the two the layout does not name', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await reviewed($, desk, TWO)
  const side = await drawn($)
  expect(side).toMatchObject({ note: '2 found', marks: ['1', '2'] })

  for (const [place, component] of SITES) {
    await $.command.run(run('place', place))
    expect(await drawn($, 40, component)).toEqual(side)
    for (const [, other] of SITES.filter(([name]) => name !== place)) expect(await drawn($, 40, other)).toBeUndefined()
  }
})

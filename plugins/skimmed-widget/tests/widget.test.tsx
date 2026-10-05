import { expect, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Window = { first: number; last: number; of: number }
type Caveat = { text: string; before: number; weight: number }
type Page = { id: string; turn: number; isGrown: boolean; isDoubted: boolean; moved: number; columns: number; of: number; size: number; weight: number; on: { first: number; last: number; at: number } | null; ms: number[]; caveats: Caveat[] }
type Book = { turn: number; isBusy: boolean; pages: Page[] }
type Part = { type: string; props?: Record<string, unknown>; children?: unknown[] }
type Row = { text: string; isDim: boolean; isButton: boolean }
type Card = { note: string; lines: string[]; buttons: string[]; dim: string[] }
type Desk = Ground & { tally: { writes: number; isShut: boolean } }
type Host = {
  command: { run: (e: object) => Promise<{ text: string }> }
  turn: { start: (e: object) => Promise<unknown>; complete: (e: object) => Promise<unknown> }
  ui: {
    mount: (e: never) => Promise<{
      drawn: () => Promise<unknown>
      find: (match: object) => Promise<(Part & { text: string }) | undefined>
      press: (match: object) => Promise<unknown>
      unmount: () => Promise<void>
    }>
  }
}

const NAME = 'skimmed-widget'
const USAGE = 'Usage: /skimmed-widget [on|off|show|clear]'
const EMPTY = 'No replies watched yet. A caveat that scrolls away while Claude is still writing is quoted here.'
const WORKING = 'Claude is writing. Caveats that leave the screen are quoted when the turn ends.'
const BLIND = 'This layout does not report what is on screen. Skimmed needs the fullscreen layout and claims nothing here.'
const RESTING = 'Nothing off screen in the last turn.'
const UNQUOTED = 'Nothing to quote from the last turn.'
const UNWATCHED = 'No replies watched yet.'
const UNJUDGED = 'not judged: the reply was resized, was never in the window, or runs past row 300.'
const HEAD = 'Off screen since Claude wrote them:'
const RULE =
  'Shown means on screen 1s or more after its reply stopped changing, or on screen now, with a margin of rows either side. Nothing here says a shown line was read.'
const BENEATH = { type: 'Text', children: ['beneath'] }
const REST = { turn: 0, isBusy: false, pages: [] }
const SCREEN = 40
const FLUSH = 100
const SETTLE = 500
const DOUBT = { note: '', lines: [UNQUOTED, '2 caveats found', '2 not judged'], buttons: [], dim: ['2 caveats found', '2 not judged'] }
const NEWS = [
  '| step | result |',
  '| --- | --- |',
  '| lint | skipped |',
  '',
  'All 42 tests passed, 0 failed.',
  'None were skipped.',
  'Nothing failed on the second run.',
  'No, I did not run the migration.',
]
const FIRST = 'Note: the two integration tests were skipped because the database container did not start.'
const SECOND = 'I did not run the migration.'
const THIRD = 'Warning: the rollback path is untested.'
const FIRST_LINE = '- **Note:** the two integration tests were skipped because the database container did not start.'
const SECOND_LINE = 'The schema file is updated. I did not run the migration. Run it first.'
const THIRD_LINE = '> **Warning:** the rollback path is untested.'
const TWO = { 31: FIRST_LINE, 87: SECOND_LINE }
const THREE = { ...TWO, 100: THIRD_LINE }
const SHORT = [
  '## Summary',
  '',
  '- Renamed the column in `src/db/schema.ts`.',
  "- **Note:** I didn't update the seed data.",
  '- The lint step passes.',
  '',
  'I could not reach the staging database, so the change is untested there.',
  '',
  'Warning: the old column is still read by the export job.',
]
const PLAIN = ['## Summary', '', '- Renamed the column in `src/db/schema.ts`.', '- The lint step passes.', '', 'All 42 unit tests pass.']
const MARKED = [
  '## Results',
  '',
  '- **Note:** the `db` tests were _skipped_.   They need   the container.',
  '> I could not reach staging. Everything else passed!',
  '1. Could the cache be stale? Not yet known.',
  '```sh',
  '# did not run: npm test failed',
  '```',
  'All 42 unit tests pass.',
].join('\n')
const PHRASES = [
  'I did not run it.',
  "It DIDN'T finish.",
  'We could not connect.',
  "It couldn't bind the port.",
  'I was unable to log in.',
  'Two tests were Skipped.',
  'The index is not yet built.',
  'The deploy FAILED twice.',
  'The path is untested.',
  'The fix is not verified.',
  'Note that the cache is cold.',
  'NOTE: the cache is cold.',
  'Warning: disk is nearly full.',
  'One caveat remains.',
]
const NAMED = [
  ['I did not run `db_migrate_all`.', 'I did not run db_migrate_all.'],
  ["I didn't update seed_data.sql.", "I didn't update seed_data.sql."],
  ['The glob `src/**/*.test.ts` was skipped.', 'The glob src/**/*.test.ts was skipped.'],
  ['- `test_user_login` was **skipped**, and so was _its_ fixture `__init__.py`.', 'test_user_login was skipped, and so was its fixture __init__.py.'],
  ['I could not reach https://example.com/a_b?x=1 from here.', 'I could not reach https://example.com/a_b?x=1 from here.'],
] as const
const STOPPED = [
  ['The seeds ran. I did not run `db_migrate_all` or the backfill, e.g. the v1.2 path. Run both.', 'I did not run db_migrate_all or the backfill, e.g. the v1.2 path.'],
  ['It did not fail... but 3 were skipped!', 'It did not fail... but 3 were skipped!'],
  ['The old key, i.e. `user_id`, vs. the new one is untested.', 'The old key, i.e. user_id, vs. the new one is untested.'],
  ['I covered login, signup, etc. The export job was skipped.', 'The export job was skipped.'],
  ['The linter, the formatter etc. were skipped.', 'The linter, the formatter etc. were skipped.'],
] as const
const CLEAN = ['The build passed.', 'I ran the migration.', 'All checks are green!', 'Could the cache be stale?', 'Everything was noted and verified.']

// The test host of 2.1.289 gives a plugin's own $.ui.scroll nothing to land on: neither a hook of the test's nor one
// of another plugin hears it, and the call throws this. So A11 holds the thrown path only. Not exercised in this
// file, and so not proved by it: the arguments the call carries and the toast for a `{ deny }` the engine chose.
const THROWN = 'no implementation for ui.scroll'

// The same host cannot make the message hook's body throw: a hook beneath that throws (state.get, clock.after) is
// skipped by the engine before the widget hears of it, and a mount without props is refused. So A3 does not prove
// that a throw in the body still returns the engine's drawing; the `try` around the body is read, not run. What a
// mount hands back is plain data, so A3 holds the drawing equal to the engine's, not the very same object. A flush
// can be made to throw: a `state.set` answered with no result under it breaks the flush where it reads `isSet`.

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async $ => ({
      text: JSON.stringify((await $.state.get({ plugin: 'skimmed-widget', key: 'book' } as const)).value ?? null),
    }))
  },
}

const SPY: Plugin = {
  name: 'spy',
  register(on) {
    const seen = { timers: 0 }
    on('clock.after', (_$, e, next) => {
      seen.timers += 1

      return next(e)
    })
    on('command.run', { command: 'spy' }, async () => ({ text: String(seen.timers) }))
  },
}

const WITH = { plugins: [LAYOUT, PEEK, SPY] }

const reply = (lines: number, marks: Readonly<Record<number, string>> = {}): string[] =>
  Array.from({ length: lines }, (_, at) => {
    const step = at % 20
    if (marks[at] !== undefined) return marks[at]
    if (step === 0) return `## Step ${at / 20 + 1}: the orders table`
    if (step === 1 || step === 19) return ''
    if (step === 2) return '```ts'
    if (step === 6) return '```'
    if (step > 2 && step < 6) return `  await rename(db, 'orders', 'column_${at}')`
    if (step === 7) return `Then I moved on to the next file in the list (${at}).`

    return `- Moved the null check in \`src/db/orders_${at}.ts\` ahead of the write.`
  })

const laid = (text: string, columns = 80): number => text.split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / columns)), 0)

const tail = (text: string, columns = 80): Window => {
  const of = laid(text, columns)

  return { first: Math.max(0, of - SCREEN), last: of - 1, of }
}

const over = (first: number, text: string): Window => ({ first, last: first + SCREEN - 1, of: laid(text) })

const open = async ($: unknown, on: On, isShown = true): Promise<Desk> => {
  const world = ground(on)
  const tally = { writes: 0, isShut: false }
  on('state.set', (_$, e, next) => {
    if ((e as { plugin?: string }).plugin !== NAME) return next(e)
    if (tally.isShut) return { value: null } as never
    tally.writes += 1

    return next(e)
  })

  await session($)
  await ($ as Host).command.run(run('place', 'side'))
  if (isShown) await ($ as Host).command.run(run(NAME, 'on'))
  tally.writes = 0

  return { ...world, tally }
}

const say = async ($: unknown, args: string, isFullscreen = true): Promise<string> =>
  (await ($ as Host).command.run({ ...run(NAME, args), presentation: { isFullscreen, columns: 160 } })).text

const timers = async ($: unknown): Promise<number> => Number((await ($ as Host).command.run(run('spy'))).text)

const peek = async ($: unknown): Promise<Book> => JSON.parse((await ($ as Host).command.run(run('peek'))).text) as Book

const page = async ($: unknown, id: string): Promise<Page | undefined> => (await peek($)).pages.find(held => held.id === id)

const begin = async ($: unknown, turn = 1): Promise<void> => void (await ($ as Host).turn.start({ text: 'Rename the column and migrate', turnId: `turn-${turn}` }))

const end = async ($: unknown, turn = 1): Promise<void> =>
  void (await ($ as Host).turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId: `turn-${turn}`, reason: 'answer' }))

const draw = async ($: unknown, id: string, text: string, onScreen?: Window | null, columns = 80): Promise<unknown> => {
  const ui = await ($ as Host).ui.mount({
    plugin: NAME,
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: id,
    props: { text, isFirstOfReply: true, ...(onScreen === undefined ? {} : { onScreen }) },
    viewport: { columns, rows: SCREEN, isFullscreen: true },
  } as never)
  const drawn = await ui.drawn()
  await ui.unmount()

  return drawn
}

const report = async ($: unknown, desk: Desk, id: string, text: string, onScreen: Window | null, columns = 80): Promise<void> => {
  await draw($, id, text, onScreen, columns)
  await desk.clock.advance(FLUSH)
}

const stream = async ($: unknown, desk: Desk, id: string, lines: readonly string[], steps = 4, from = 1): Promise<string> => {
  for (let step = from; step <= steps; step += 1) {
    const text = lines.slice(0, Math.ceil((lines.length * step) / steps)).join('\n')
    await report($, desk, id, text, tail(text))
  }

  return lines.join('\n')
}

const settle = async ($: unknown, desk: Desk, id: string, lines: readonly string[], steps = 4): Promise<string> => {
  let before: Window | undefined
  for (let step = 1; step <= steps; step += 1) {
    const text = lines.slice(0, Math.ceil((lines.length * step) / steps)).join('\n')
    await draw($, id, text, before)
    await desk.clock.advance(FLUSH)
    await report($, desk, id, text, tail(text))
    before = tail(text)
  }

  return lines.join('\n')
}

const painted = (node: unknown): Row[] => {
  if (typeof node !== 'object' || node === null) return []
  const { type, props = {}, children = [] } = node as Part
  if (type === 'Button') return [{ text: String(props.label ?? ''), isDim: false, isButton: true }]
  if (type === 'Text') return [{ text: children.filter(child => typeof child === 'string').join(''), isDim: props.dimColor === true, isButton: false }]

  return children.flatMap(painted)
}

const rows = (node: unknown): Row[] => {
  if (typeof node !== 'object' || node === null) return []
  const { type, props = {}, children = [] } = node as Part
  const folded = painted(node)
  if (props.key === 'said') return [{ text: folded.map(row => row.text).join(' '), isDim: folded.every(row => row.isDim), isButton: false }]

  return type === 'Button' || type === 'Text' ? folded : children.flatMap(rows)
}

const mount = ($: unknown, columns = 40, isFullscreen = true, component: (typeof SITES)[number][1] = 'Pane') =>
  ($ as Host).ui.mount({ ...(target(NAME, component, columns) as object), viewport: { columns, rows: SCREEN, isFullscreen } } as never)

const card = async ($: unknown, columns = 40, isFullscreen = true): Promise<Card> => {
  const ui = await mount($, columns, isFullscreen)
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const body = rows(await ui.find({ key: 'body' }))
  await ui.unmount()

  return {
    note,
    lines: body.map(row => row.text),
    buttons: body.filter(row => row.isButton).map(row => row.text),
    dim: body.filter(row => row.isDim).map(row => row.text),
  }
}

const fits = async ($: unknown, isFullscreen = true): Promise<boolean[]> => {
  const held: boolean[] = []
  for (const columns of [20, 40, 60]) {
    const ui = await mount($, columns, isFullscreen)
    const drawn = painted(await ui.find({ key: 'body' }))
    await ui.unmount()
    held.push(drawn.length > 0 && drawn.every(row => [...row.text].length <= columns - 4))
  }

  return held
}

const again = async ($: unknown, desk: Desk, turn: number, lines: readonly string[] = reply(159, TWO), window: 'tail' | 'none' = 'tail'): Promise<string> => {
  await say($, 'clear')
  await begin($, turn)
  if (window === 'tail') await stream($, desk, `msg-${turn}`, lines)
  else for (const step of [1, 2, 3, 4]) await report($, desk, `msg-${turn}`, lines.slice(0, Math.ceil((lines.length * step) / 4)).join('\n'), null)
  await end($, turn)

  return lines.join('\n')
}

const skim = async ($: unknown, on: On, marks: Readonly<Record<number, string>> = TWO): Promise<{ desk: Desk; text: string }> => {
  const desk = await open($, on)
  await begin($)
  const text = await stream($, desk, 'msg-1', reply(159, marks))
  await end($)

  return { desk, text }
}

test('A1: on in the fullscreen layout with no report yet, the card shows the empty sentence with no note in all three placements and show says no replies are watched', WITH, async ($, on) => {
  await open($, on)

  for (const [place, component] of SITES) {
    await $.command.run(run('place', place))
    const ui = await mount($, 40, true, component)
    expect((await ui.find({ key: 'title' }))?.text).toBe('Skimmed')
    expect((await ui.find({ key: 'note' }))?.text).toBe('')
    expect(rows(await ui.find({ key: 'body' }))).toEqual([{ text: EMPTY, isDim: true, isButton: false }])
    await ui.unmount()
  }
  expect(await say($, 'show')).toBe('No replies watched yet.')
})

test('A2: a render with no onScreen queues nothing and arms no timer; with no page a layout that is not fullscreen draws and answers the error sentences, and with a page held it draws the ordinary card', WITH, async ($, on) => {
  const desk = await open($, on)
  const text = SHORT.join('\n')

  await begin($)
  await draw($, 'msg-1', text)
  await desk.clock.advance(FLUSH * 5)
  await end($)
  expect(await timers($)).toBe(0)
  expect((await peek($)).pages).toEqual([])
  expect(await card($, 40, false)).toEqual({ note: '', lines: [BLIND], buttons: [], dim: [BLIND] })
  expect(await say($, 'show', false)).toBe(BLIND)
  expect((await card($, 40, true)).lines).toEqual([EMPTY])

  await begin($, 2)
  await report($, desk, 'msg-2', SHORT.slice(0, 4).join('\n'), tail(SHORT.slice(0, 4).join('\n')))
  await report($, desk, 'msg-2', text, tail(text))
  await end($, 2)
  expect(await card($, 40, false)).toEqual({ note: 'all shown', lines: [RESTING, '3 caveats found'], buttons: [], dim: ['3 caveats found'] })
  expect(await say($, 'show', false)).toBe(`Nothing off screen: 3 caveats found in 1 reply.\n${RULE}`)
})

test('A3: the message hook hands back what the engine drew, on and off, writes no state while drawing, twenty reports inside 100ms make one write at the 100ms mark, and a flush that throws drops its batch and the next is applied; a throw in the hook body is not exercised', WITH, async ($, on) => {
  const desk = await open($, on, false)
  const lines = reply(159, TWO)

  expect(await draw($, 'msg-0', SHORT.join('\n'), tail(SHORT.join('\n')))).toEqual(BENEATH)
  expect(await timers($)).toBe(0)

  await say($, 'on')
  await begin($)
  desk.tally.writes = 0

  for (let at = 1; at <= 20; at += 1) {
    const text = lines.slice(0, at * 3).join('\n')
    expect(await draw($, 'msg-1', text, tail(text))).toEqual(BENEATH)
    await desk.clock.advance(4)
  }
  expect(desk.tally.writes).toBe(0)
  expect(await timers($)).toBe(1)
  await desk.clock.advance(19)
  expect(desk.tally.writes).toBe(0)
  await desk.clock.advance(1)
  expect(desk.tally.writes).toBe(1)
  expect((await page($, 'msg-1'))?.of).toBe(laid(lines.slice(0, 60).join('\n')))

  await report($, desk, 'msg-0', SHORT.join('\n'), null)
  expect(desk.tally.writes).toBe(2)
  await report($, desk, 'msg-0', SHORT.join('\n'), null)
  await report($, desk, 'msg-0', SHORT.join('\n'), null)
  expect(desk.tally.writes).toBe(2)
  expect(await timers($)).toBe(4)

  desk.tally.isShut = true
  await report($, desk, 'lost', SHORT.join('\n'), tail(SHORT.join('\n')))
  expect(desk.tally.writes).toBe(2)
  desk.tally.isShut = false
  await report($, desk, 'next', PLAIN.join('\n'), tail(PLAIN.join('\n')))
  expect(desk.tally.writes).toBe(3)
  expect((await peek($)).pages.map(held => held.id)).toEqual(['msg-1', 'msg-0', 'next'])
})

test('A4: a reply that grows to 160 rows with the window on its last 40 leaves both caveats quoted in reading order with their places, whether each row count comes with its text or in the draw after it', WITH, async ($, on) => {
  const desk = await open($, on)
  const lines = reply(159, TWO)
  const quarter = lines.slice(0, 40).join('\n')
  const best = {
    note: '2 off screen',
    lines: [
      HEAD,
      '“Note: the two integration tests',
      'were skipped because the database',
      'container did not start.”',
      '▸ 20% down its reply',
      '“I did not run the migration.”',
      '▸ 55% down its reply',
    ],
    buttons: ['▸ 20% down its reply', '▸ 55% down its reply'],
    dim: [],
  }

  await begin($)
  await report($, desk, 'msg-1', quarter, tail(quarter))
  expect(tail(quarter)).toEqual({ first: 1, last: 40, of: 41 })
  expect((await page($, 'msg-1'))?.caveats).toEqual([{ text: FIRST, before: 31, weight: 2 }])
  await desk.clock.advance(5000)
  const text = await stream($, desk, 'msg-1', lines, 4, 2)
  await end($)

  expect(tail(text)).toEqual({ first: 120, last: 159, of: 160 })
  expect((await page($, 'msg-1'))?.ms).toEqual(Array<number>(160).fill(0))
  expect(await card($)).toEqual(best)

  await say($, 'clear')
  await begin($, 2)
  await draw($, 'msg-2', quarter)
  await report($, desk, 'msg-2', quarter, tail(quarter))
  await desk.clock.advance(5000)
  for (const step of [2, 3, 4]) {
    const grown = lines.slice(0, Math.ceil((lines.length * step) / 4)).join('\n')
    const before = tail(lines.slice(0, Math.ceil((lines.length * (step - 1)) / 4)).join('\n'))
    await report($, desk, 'msg-2', grown, before)
    expect((await page($, 'msg-2'))?.of).toBe(before.of)
    await report($, desk, 'msg-2', grown, tail(grown))
  }
  await end($, 2)

  const settled = await page($, 'msg-2')
  expect(settled?.isDoubted).toBe(false)
  expect(settled?.ms).toEqual(Array<number>(160).fill(0))
  expect(await card($)).toEqual(best)

  await say($, 'clear')
  await begin($, 3)
  await settle($, desk, 'msg-3', lines, 16)
  await end($, 3)
  expect((await page($, 'msg-3'))?.ms).toEqual(Array<number>(160).fill(0))
  expect(await card($)).toEqual(best)
})

test('A5: the same reports draw the working card with no quote until the turn ends, and a reply seen growing before any turn started is never listed', WITH, async ($, on) => {
  const desk = await open($, on)

  await stream($, desk, 'msg-0', reply(159, TWO))
  expect((await page($, 'msg-0'))?.caveats.map(caveat => caveat.text)).toEqual([FIRST, SECOND])
  expect((await card($)).lines).toEqual([EMPTY])
  expect(await say($, 'show')).toBe(UNWATCHED)

  await begin($)
  expect(await card($)).toEqual({ note: 'watching', lines: [WORKING], buttons: [], dim: [] })
  await stream($, desk, 'msg-1', reply(159, TWO))
  expect(await card($)).toEqual({ note: 'watching', lines: [WORKING], buttons: [], dim: [] })
  await end($)

  expect((await card($)).note).toBe('2 off screen')
  expect((await say($, 'show')).split('\n')).toHaveLength(4)
  expect(await say($, 'show')).not.toContain('t0')
})

test('A6: a caveat leaves the card after 1000ms on screen once its reply has been still for 500ms, stays after 900ms and after a 1000ms pair begun 100ms after the last change, is not listed while the window lies over it, and a report that changes the text or the row count earns nothing', WITH, async ($, on) => {
  const { desk, text } = await skim($, on)

  await desk.clock.advance(SETTLE)
  await report($, desk, 'msg-1', text, over(10, text))
  expect((await page($, 'msg-1'))?.ms[31]).toBe(0)
  expect((await card($)).note).toBe('1 off screen')
  await desk.clock.advance(900)
  await report($, desk, 'msg-1', text, tail(text))
  expect((await page($, 'msg-1'))?.ms[31]).toBe(1000)
  expect(await card($)).toMatchObject({ note: '1 off screen', lines: [HEAD, '“I did not run the migration.”', '▸ 55% down its reply'] })

  const second = await again($, desk, 2)
  await desk.clock.advance(SETTLE)
  await report($, desk, 'msg-2', second, over(10, second))
  expect((await card($)).note).toBe('1 off screen')
  await desk.clock.advance(800)
  await report($, desk, 'msg-2', second, tail(second))
  expect((await page($, 'msg-2'))?.ms[31]).toBe(900)
  expect((await card($)).note).toBe('2 off screen')

  await report($, desk, 'msg-2', second, over(10, second))
  await desk.clock.advance(5000)
  const longer = `${second}\n\nOne more thing: the changelog is updated.`
  await report($, desk, 'msg-2', longer, tail(longer))
  expect((await page($, 'msg-2'))?.ms[31]).toBe(900)

  await desk.clock.advance(SETTLE)
  await report($, desk, 'msg-2', longer, over(10, longer))
  await desk.clock.advance(5000)
  const longest = `${longer}\n\nThe pull request is open.`
  await report($, desk, 'msg-2', longest, over(10, longer))
  await report($, desk, 'msg-2', longest, tail(longest))
  const held = await page($, 'msg-2')
  expect(held?.ms[31]).toBe(900)
  expect(held?.isDoubted).toBe(false)
  expect(held?.of).toBe(laid(longest))
  expect((await card($)).note).toBe('2 off screen')

  const third = await again($, desk, 3)
  await report($, desk, 'msg-3', third, over(10, third))
  await desk.clock.advance(900)
  await report($, desk, 'msg-3', third, tail(third))
  expect((await page($, 'msg-3'))?.ms.slice(9, 12)).toEqual([0, 600, 600])
  expect((await card($)).note).toBe('2 off screen')

  const fourth = await again($, desk, 4)
  await desk.clock.advance(SETTLE)
  await report($, desk, 'msg-4', fourth, over(70, fourth))
  await desk.clock.advance(900)
  await report($, desk, 'msg-4', fourth, null)
  expect((await page($, 'msg-4'))?.ms.slice(69, 71)).toEqual([0, 1000])
  expect(await card($)).toMatchObject({ note: '1 off screen', buttons: ['▸ 20% down its reply'] })
})

test('A7: doubt is neither listed nor called shown: a shown row in the margin, other columns, a late row count for the same text, a caveat past row 299, a reply that grew with no window, and a reply never seen growing', WITH, async ($, on) => {
  const { desk, text } = await skim($, on)

  await desk.clock.advance(SETTLE)
  await report($, desk, 'msg-1', text, { first: 0, last: 14, of: 160 })
  await desk.clock.advance(1000)
  await report($, desk, 'msg-1', text, tail(text))
  expect((await card($)).note).toBe('2 off screen')
  await report($, desk, 'msg-1', text, { first: 0, last: 15, of: 160 })
  await desk.clock.advance(1000)
  await report($, desk, 'msg-1', text, tail(text))
  expect((await page($, 'msg-1'))?.ms.slice(14, 17)).toEqual([1000, 1000, 0])
  expect((await card($)).lines).toEqual([HEAD, '“I did not run the migration.”', '▸ 55% down its reply'])

  await report($, desk, 'msg-1', text, tail(text, 100), 100)
  expect(await card($)).toEqual(DOUBT)
  for (const first of [0, 40, 80, 120]) {
    await report($, desk, 'msg-1', text, over(first, text))
    await desk.clock.advance(2000)
  }
  expect(await card($)).toEqual(DOUBT)

  const resized = await again($, desk, 2)
  expect((await card($)).note).toBe('2 off screen')
  await desk.clock.advance(SETTLE)
  await report($, desk, 'msg-2', resized, { first: 123, last: 162, of: 163 })
  expect((await page($, 'msg-2'))?.isDoubted).toBe(true)
  expect(await card($)).toEqual(DOUBT)

  await say($, 'clear')
  await begin($, 3)
  const long = await stream($, desk, 'msg-3', reply(600, { 20: SECOND_LINE, 320: FIRST_LINE }))
  await report($, desk, 'msg-4', SHORT.join('\n'), null)
  await end($, 3)
  expect((await page($, 'msg-3'))?.caveats.map(caveat => caveat.text)).toEqual([SECOND, FIRST])
  expect((await page($, 'msg-3'))?.ms).toHaveLength(300)
  expect(laid(long)).toBe(601)
  expect((await page($, 'msg-4'))?.caveats).toHaveLength(3)
  expect(await card($)).toEqual({
    note: '1 off screen',
    lines: [HEAD, '“I did not run the migration.”', '▸ 3% down its reply', '1 not judged'],
    buttons: ['▸ 3% down its reply'],
    dim: ['1 not judged'],
  })
  expect(await say($, 'show')).toBe(
    [`1 caveat off screen since Claude wrote them, of 2 found in 1 reply:`, `t3  3% down  ${SECOND}`, `1 ${UNJUDGED}`, RULE].join('\n'),
  )

  const unseen = await again($, desk, 4, reply(159, TWO), 'none')
  expect((await page($, 'msg-4'))?.of).toBe(0)
  expect(await card($)).toEqual(DOUBT)
  await desk.clock.advance(5000)
  await report($, desk, 'msg-4', unseen, tail(unseen))
  expect((await page($, 'msg-4'))?.isDoubted).toBe(false)
  expect((await card($)).note).toBe('2 off screen')

  await report($, desk, 'narrow', SHORT.slice(0, 4).join('\n'), tail(SHORT.slice(0, 4).join('\n')), 0)
  await report($, desk, 'narrow', SHORT.join('\n'), tail(SHORT.join('\n')), 80)
  expect(await page($, 'narrow')).toMatchObject({ columns: 80, weight: 9, isDoubted: false })
})

test('A8: the scan quotes whole sentences without their markdown, matches each phrase in either case and nothing else, leaves out good news and table rows, skips fenced code, cuts at 200 characters, keeps five, and reads the same in pieces', WITH, async ($, on) => {
  const desk = await open($, on)

  await report($, desk, 'whole', MARKED, tail(MARKED))
  expect((await page($, 'whole'))?.caveats).toEqual([
    { text: 'Note: the db tests were skipped.', before: 2, weight: 1 },
    { text: 'I could not reach staging.', before: 3, weight: 1 },
    { text: 'Not yet known.', before: 4, weight: 1 },
  ])

  const cuts = [5, 40, MARKED.indexOf('```sh') + 2, MARKED.indexOf('# did') + 9, MARKED.length - 10, MARKED.length]
  for (const cut of cuts) await report($, desk, 'pieces', MARKED.slice(0, cut), tail(MARKED.slice(0, cut)))
  const [whole, pieces] = [await page($, 'whole'), await page($, 'pieces')]
  expect(pieces?.caveats).toEqual(whole?.caveats)
  expect(pieces?.weight).toBe(whole?.weight)
  expect(pieces?.weight).toBe(9)

  await report($, desk, 'pieces', 'I did not run the linter.', tail('I did not run the linter.'))
  expect((await page($, 'pieces'))?.caveats).toEqual([{ text: 'I did not run the linter.', before: 0, weight: 1 }])

  for (const [at, phrase] of PHRASES.entries()) {
    const text = `${CLEAN[at % CLEAN.length]} ${phrase} ${CLEAN[(at + 1) % CLEAN.length]}`
    await report($, desk, `phrase-${at}`, text, tail(text))
    expect((await page($, `phrase-${at}`))?.caveats.map(caveat => caveat.text)).toEqual([phrase])
  }
  await report($, desk, 'clean', CLEAN.join('\n'), tail(CLEAN.join('\n')))
  expect((await page($, 'clean'))?.caveats).toEqual([])
  await report($, desk, 'news', NEWS.join('\n'), tail(NEWS.join('\n')))
  expect((await page($, 'news'))?.caveats).toEqual([{ text: 'No, I did not run the migration.', before: 7, weight: 1 }])

  for (const [id, lines] of [['named', NAMED], ['stopped', STOPPED]] as const) {
    const text = lines.map(([line]) => line).join('\n')
    await report($, desk, id, text, tail(text))
    expect((await page($, id))?.caveats.map(caveat => caveat.text)).toEqual(lines.map(([, quote]) => quote))
  }

  const wordy = `Note that${Array.from({ length: 60 }, (_, at) => `word${at}`).join(' ')}.`
  const many = [wordy, ...PHRASES.slice(0, 6)].join('\n')
  await report($, desk, 'many', many, tail(many))
  const kept = (await page($, 'many'))?.caveats.map(caveat => caveat.text) ?? []
  expect(kept).toEqual([`${wordy.slice(0, 200)}…`, ...PHRASES.slice(0, 4)])
  expect(kept[0]).toHaveLength(201)
})

test('A9: a finished turn with every caveat judged and shown draws all shown with its count, one with none found says only that there is nothing to quote, and caveats of an earlier turn read as a count', WITH, async ($, on) => {
  const desk = await open($, on)

  await begin($)
  await stream($, desk, 'msg-1', SHORT, 3)
  await end($)
  expect(await card($)).toEqual({ note: 'all shown', lines: [RESTING, '3 caveats found'], buttons: [], dim: ['3 caveats found'] })

  await begin($, 2)
  await stream($, desk, 'msg-2', PLAIN, 3)
  await end($, 2)
  expect(await card($)).toEqual({ note: '', lines: [UNQUOTED], buttons: [], dim: [] })

  await begin($, 3)
  await stream($, desk, 'msg-3', reply(159, TWO))
  await end($, 3)
  expect((await card($)).note).toBe('2 off screen')
  await begin($, 4)
  expect((await card($)).lines).toEqual([WORKING])
  await end($, 4)
  expect(await card($)).toEqual({ note: '', lines: [UNQUOTED, '2 earlier in show'], buttons: [], dim: ['2 earlier in show'] })
})

test('A10: show lists each off-screen caveat with its turn and place under the header and above the rule, says nothing is off screen once all were shown, nothing to quote with the count not judged once the page is in doubt, and no replies watched with only pages from before a turn', WITH, async ($, on) => {
  const { desk, text } = await skim($, on)

  expect(await say($, 'show')).toBe(
    ['2 caveats off screen since Claude wrote them, of 2 found in 1 reply:', `t1  20% down  ${FIRST}`, `t1  55% down  ${SECOND}`, RULE].join('\n'),
  )

  await desk.clock.advance(SETTLE)
  for (const first of [0, 40, 80]) {
    await report($, desk, 'msg-1', text, over(first, text))
    await desk.clock.advance(900)
  }
  await report($, desk, 'msg-1', text, tail(text))
  expect(await say($, 'show')).toBe(`Nothing off screen: 2 caveats found in 1 reply.\n${RULE}`)

  await report($, desk, 'msg-1', text, tail(text, 120), 120)
  expect(await say($, 'show')).toBe(['Nothing to quote: 2 caveats found in 1 reply.', `2 ${UNJUDGED}`, RULE].join('\n'))

  await say($, 'clear')
  await stream($, desk, 'msg-0', reply(159, TWO))
  expect((await page($, 'msg-0'))?.turn).toBe(0)
  expect(await say($, 'show')).toBe(UNWATCHED)
})

test('A11: a press takes the jump to the engine, which throws here, toasts that the transcript did not move and writes no state; the call arguments and a chosen deny are not exercised', WITH, async ($, on) => {
  const { desk } = await skim($, on)
  const before = await peek($)
  desk.tally.writes = 0

  const ui = await mount($)
  await ui.press({ key: 'go:0' })
  expect(desk.toasts).toEqual([`Skimmed: the transcript did not move (${THROWN})`])
  await ui.press({ key: 'go:1' })
  expect(desk.toasts).toHaveLength(2)
  expect(rows(await ui.find({ key: 'body' })).filter(row => row.isButton)).toHaveLength(2)
  await ui.unmount()

  expect(desk.tally.writes).toBe(0)
  expect(await peek($)).toEqual(before)
})

test('A12: clear empties the pages and the queue and keeps the turn, SHOW is taken as show, and anything else answers the usage and changes nothing', WITH, async ($, on) => {
  const { desk, text } = await skim($, on)
  const before = await peek($)

  expect(await say($, 'SHOW')).toBe(await say($, 'show'))
  expect(await say($, 'SHOW')).toContain('2 caveats off screen')
  expect(await say($, 'what')).toBe(USAGE)
  expect(await say($, 'show 2')).toBe(USAGE)
  expect(await peek($)).toEqual(before)
  expect(desk.store.get('isOn')).toBe(true)

  await draw($, 'msg-1', text, over(10, text))
  expect(await say($, ' Clear ')).toBe('Skimmed cleared.')
  await desk.clock.advance(FLUSH * 5)
  expect(await peek($)).toEqual({ turn: 1, isBusy: false, pages: [] })
  expect(await card($)).toEqual({ note: '', lines: [EMPTY], buttons: [], dim: [EMPTY] })

  await begin($, 2)
  await stream($, desk, 'msg-2', reply(159, TWO))
  expect(await say($, 'clear')).toBe('Skimmed cleared.')
  expect(await peek($)).toEqual({ turn: 2, isBusy: true, pages: [] })
  expect(await card($)).toEqual({ note: 'watching', lines: [WORKING], buttons: [], dim: [] })
})

test('A13: while off show and clear say so and reports and turns write no state and arm no timer; switching off with a batch queued writes nothing later and resets the book', WITH, async ($, on) => {
  const late = { isArmed: false, offs: 0 }
  on('state.get', async (_$, e, next) => {
    const { plugin, key } = e as { plugin?: string; key?: string }
    if (late.isArmed && plugin === NAME && key === 'book') {
      late.isArmed = false
      await say($, 'off')
      late.offs += 1
    }

    return next(e)
  })
  const desk = await open($, on, false)
  const text = reply(159, TWO).join('\n')

  expect(await say($, 'show')).toBe('Skimmed is off.')
  expect(await say($, 'clear')).toBe('Skimmed is off.')
  await begin($)
  await draw($, 'msg-1', text.slice(0, 900), tail(text.slice(0, 900)))
  await draw($, 'msg-1', text, tail(text))
  await end($)
  await desk.clock.advance(FLUSH * 5)
  expect(desk.tally.writes).toBe(0)
  expect(await timers($)).toBe(0)
  expect(await peek($)).toBeNull()

  await say($, 'on')
  await begin($, 2)
  await report($, desk, 'msg-2', text.slice(0, 900), tail(text.slice(0, 900)))
  await draw($, 'msg-2', text, tail(text))
  expect(await timers($)).toBe(2)
  expect(await say($, 'off')).toBe('Skimmed off.')
  expect(await peek($)).toEqual(REST)
  desk.tally.writes = 0
  await desk.clock.advance(FLUSH * 5)
  await end($, 2)
  expect(desk.tally.writes).toBe(0)
  expect(await peek($)).toEqual(REST)

  await say($, 'on')
  await report($, desk, 'msg-3', SHORT.join('\n'), null)
  expect((await peek($)).pages.map(held => held.id)).toEqual(['msg-3'])

  await draw($, 'msg-4', text, tail(text))
  late.isArmed = true
  await desk.clock.advance(FLUSH)
  expect(late.offs).toBe(1)
  expect(await say($, 'show')).toBe('Skimmed is off.')
  expect(await peek($)).toEqual(REST)
})

test('A14: at 20, 40 and 60 columns every row the widget cuts fits inside the border, a quote takes at most 3 rows, a word too long for a row starts on the row in hand, 3 off screen show 2 and a count, and the short forms are used under 30', WITH, async ($, on) => {
  const { desk } = await skim($, on, THREE)

  expect(await card($, 20)).toEqual({
    note: '3',
    lines: [HEAD, '“Note: the two', 'integration', 'tests were skip…', '▸ 20% down', '“I did not run', 'the migration.”', '▸ 55% down', '… 1 more'],
    buttons: ['▸ 20% down', '▸ 55% down'],
    dim: ['… 1 more'],
  })
  expect(await card($, 29)).toMatchObject({ note: '3', buttons: ['▸ 20% down', '▸ 55% down'], dim: ['… 1 more'] })
  expect(await card($, 30)).toMatchObject({ note: '3 off screen', buttons: ['▸ 20% down its reply', '▸ 55% down its reply'], dim: ['… 1 more in show'] })
  expect((await card($, 40)).lines).toEqual([
    HEAD,
    '“Note: the two integration tests',
    'were skipped because the database',
    'container did not start.”',
    '▸ 20% down its reply',
    '“I did not run the migration.”',
    '▸ 55% down its reply',
    '… 1 more in show',
  ])
  expect(await say($, 'show')).toContain(`t1  63% down  ${THIRD}`)

  await $.command.run(run('widen', `${NAME} 60`))
  expect((await card($, 60)).lines).toEqual([
    HEAD,
    '“Note: the two integration tests were skipped because',
    'the database container did not start.”',
    '▸ 20% down its reply',
    '“I did not run the migration.”',
    '▸ 55% down its reply',
    '… 1 more in show',
  ])
  expect(await fits($)).toEqual([true, true, true])

  await begin($, 2)
  for (const columns of [20, 40, 60]) expect((await card($, columns)).note).toBe(columns < 30 ? '' : 'watching')
  expect(await fits($)).toEqual([true, true, true])
  await end($, 2)
  expect(await fits($)).toEqual([true, true, true])
  expect(await card($, 20)).toEqual({ note: '', lines: [UNQUOTED, '3 earlier'], buttons: [], dim: ['3 earlier'] })
  expect((await card($, 60)).dim).toEqual(['3 earlier in show'])

  const five = { 8: FIRST_LINE, 11: SECOND_LINE, 14: FIRST_LINE, 17: SECOND_LINE, 28: FIRST_LINE }
  await begin($, 3)
  for (const id of ['msg-3', 'msg-4', 'msg-5']) await stream($, desk, id, reply(159, five))
  await end($, 3)
  for (const columns of [20, 40, 60]) {
    const drawn = await card($, columns)
    const cut = drawn.lines.filter(line => line !== HEAD)
    expect(cut).toHaveLength(columns === 20 ? 8 : columns === 40 ? 7 : 6)
    expect(drawn.note).toBe(columns < 30 ? '15' : '15 off screen')
    expect(drawn.buttons).toEqual(columns < 30 ? ['▸ 6% down', '▸ 8% down'] : ['▸ 6% down its reply', '▸ 8% down its reply'])
    expect(drawn.dim).toEqual([columns < 30 ? '… 13 more' : '… 13 more in show'])
  }
  expect(await fits($)).toEqual([true, true, true])

  await begin($, 4)
  for (const id of ['msg-6', 'msg-7', 'msg-8']) await stream($, desk, id, reply(30, five), 3)
  await end($, 4)
  expect(await card($, 20)).toEqual({ note: '', lines: [RESTING, '15 caveats found', '18 earlier'], buttons: [], dim: ['15 caveats found', '18 earlier'] })
  expect((await card($, 40)).dim).toEqual(['15 caveats found', '18 earlier in show'])
  expect(await fits($)).toEqual([true, true, true])

  const word = 'x'.repeat(60)
  const worded = await again($, desk, 5, reply(159, { 31: `Note: ${word}` }))
  expect(await card($, 20)).toEqual({
    note: '1',
    lines: [HEAD, `“Note: ${word.slice(0, 9)}`, word.slice(0, 16), `${word.slice(0, 15)}…`, '▸ 20% down'],
    buttons: ['▸ 20% down'],
    dim: [],
  })
  expect((await card($, 40)).lines).toEqual([HEAD, `“Note: ${word.slice(0, 29)}`, `${word.slice(0, 31)}”`, '▸ 20% down its reply'])
  expect(await fits($)).toEqual([true, true, true])

  await report($, desk, 'msg-5', worded, tail(worded, 100), 100)
  expect(await card($, 20)).toEqual({ note: '', lines: [UNQUOTED, '1 caveat found', '1 not judged'], buttons: [], dim: ['1 caveat found', '1 not judged'] })
  expect((await card($, 60)).note).toBe('')
  expect(await fits($)).toEqual([true, true, true])

  await say($, 'clear')
  expect((await card($, 20)).lines).toEqual([EMPTY])
  expect(await fits($)).toEqual([true, true, true])
  expect((await card($, 20, false)).lines).toEqual([BLIND])
  expect(await fits($, false)).toEqual([true, true, true])
})

test('A15: a 41st page drops the never-grown page reported longest ago and a grown page only when nothing else is left, a row never earns more than 1000ms and no more than 300 rows are kept', WITH, async ($, on) => {
  const desk = await open($, on)
  const text = SHORT.join('\n')
  const ids = async (): Promise<string[]> => (await peek($)).pages.map(held => held.id)

  await begin($)
  await report($, desk, 'old-1', text.slice(0, 60), tail(text.slice(0, 60)))
  await report($, desk, 'old-1', text, tail(text))
  for (let at = 2; at <= 40; at += 1) await report($, desk, `old-${at}`, text, null)
  await report($, desk, 'old-2', text, tail(text))
  expect(await ids()).toHaveLength(40)
  await report($, desk, 'new-1', text, null)
  const held = await ids()
  expect(held).toHaveLength(40)
  expect(held).not.toContain('old-3')
  expect(held.slice(0, 2)).toEqual(['old-1', 'old-4'])
  expect(held.slice(-2)).toEqual(['old-2', 'new-1'])

  await say($, 'clear')
  for (let at = 1; at <= 40; at += 1) {
    await draw($, `grown-${at}`, text.slice(0, 60), tail(text.slice(0, 60)))
    await report($, desk, `grown-${at}`, text, tail(text))
  }
  expect((await peek($)).pages.every(page => page.isGrown)).toBe(true)
  await report($, desk, 'new-2', text, null)
  expect((await ids()).slice(0, 1)).toEqual(['grown-2'])
  expect((await ids()).slice(-1)).toEqual(['new-2'])
  expect(await ids()).toHaveLength(40)

  const long = reply(600, TWO).join('\n')
  await report($, desk, 'long', long.slice(0, 4000), tail(long.slice(0, 4000)))
  for (const wait of [700, 700, 5000]) {
    await report($, desk, 'long', long, over(280, long))
    await desk.clock.advance(wait)
  }
  await report($, desk, 'long', long, tail(long))
  const ms = (await page($, 'long'))?.ms ?? []
  expect(ms).toHaveLength(300)
  expect(Math.max(...ms)).toBe(1000)
  expect(ms.slice(278, 282)).toEqual([0, 0, 1000, 1000])
})

import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Said = { result?: unknown; text?: string; isError?: boolean }
type Desk = { world: Ground; tools: string[]; suggested: string[]; fault: { isThrowing: boolean } }
type Mark = { text: string; color: unknown }
type Drawn = { note: string; width: unknown; lines: string[]; wraps: unknown[]; dims: unknown[]; colors: unknown[]; marks: Mark[] }

const NAME = 'done-widget'
const TICK = 'mcp__done-widget__tick'
const USAGE = 'Usage: /done-widget [on|off|add <criterion>|drop <number>|show|clear]'
const OFF = 'Done is off.'
const OPENING =
  "done-widget: the user's definition of done for this task. Tick each item with the tick tool as you meet it, giving the evidence that proves it, and do not call the work finished while any is open:"
const EMPTY = ['No definition of done yet.', '/done-widget add the tests pass', 'Claude ticks each with its evidence.']
const NEEDS = 'Item 1 needs evidence: the command you ran and its result, or the file and line.'
const TESTS = 'the tests pass'
const DEPS = 'no new dependencies'
const README = 'the README mentions the retry option and its default of three attempts'
const RAN = 'bun test: 14 pass, 0 fail'
const DIFF = 'git diff package.json is empty'
const SIX = [
  'the retry tests in test/retry.test.ts pass on a clean checkout with the wifi off',
  'no new dependencies appear in package.json or in the lockfile after this change.',
  'the README mentions the retry option, its default of three attempts and the flag',
  'the changelog has an entry under Unreleased that names the retry option and why.',
  'the type check passes with no new suppressions anywhere under src or under tests',
  'the fix is committed on its own branch with a message that says what was changed',
]
const PROOF = [
  'bun test test/retry.test.ts: 14 pass, 0 fail, 0 skip, ran in 1.2 seconds on a clean checkout of the branch with wifi off',
  'git diff main -- package.json bun.lock prints nothing at all, and bun install --frozen-lockfile exits 0 with no changes.',
]
const YELLOW = { text: '·', color: 'yellow' }
const GREEN = { text: '✓', color: 'green' }

const TALK = [
  { role: 'user', text: 'Add a retry option to the client', toolUses: [] },
  { role: 'assistant', text: 'The client retries three times by default now; the tests pass.', toolUses: [] },
]
const SUMMARY = { messages: TALK.slice(-1), tokensBefore: 150_000, tokensAfter: 9_000 }

const BENEATH: Plugin = {
  name: 'stand-in-beneath',
  tier: 'append',
  register(on) {
    on('session.compact', async (_$, e) => (e.instructions === 'veto' ? { skip: e.instructions } : { messages: e.messages.slice(-1), tokensBefore: 150_000, tokensAfter: 9_000 }))
  },
}

const PLUGINS = { plugins: [LAYOUT, BENEATH] }

const block = (list: readonly string[]): string => `${OPENING}\n${list.join('\n')}`

const failed = (said: string): Said => ({ result: said, text: said, isError: true })

const open = (on: On, store: Record<string, unknown> = {}): Desk => {
  const tools: string[] = []
  const suggested: string[] = []
  const fault = { isThrowing: false }
  const world = ground(on, {
    store,
    answers: {
      'tool.register': (e: { name: string }) => {
        tools.push(e.name)

        return { tool: `mcp__${NAME}__${e.name}` }
      },
    },
  })
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))
  on('prompt.suggest', (_$, e) => {
    if (fault.isThrowing) throw new Error('the prompt box is gone')
    suggested.push(e.text)

    return { isShown: true }
  })

  return { world, tools, suggested, fault }
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const tick = async ($: Engine, item?: unknown, evidence?: unknown): Promise<Said> =>
  (await $.tool.call({
    tool: TICK,
    tool_use_id: 'toolu_tick',
    ...(item === undefined ? {} : { item }),
    ...(evidence === undefined ? {} : { evidence }),
  } as never)) as Said

const ended = ($: Engine, answer: string, extra: Record<string, unknown> = {}): Promise<unknown> =>
  $.turn.complete({ answer, durationMs: 4200, isAborted: false, turnId: 'turn-1', reason: 'answer', ...extra } as never)

const prompted = async ($: Engine, desk: Desk, kind = 'composer', context?: string[]): Promise<string[]> => {
  const before = desk.world.contexts.length
  await $.prompt.submit({ text: 'Is the retry option finished?', wait: false, origin: { kind }, ...(context === undefined ? {} : { context }) } as never)

  return desk.world.contexts.slice(before)
}

const compacted = ($: Engine, extra: Record<string, unknown> = {}): Promise<unknown> =>
  $.session.compact({ trigger: 'auto', messages: TALK, ...extra } as never)

const drawn = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const card = await ui.find({ key: 'card' })
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const texts = (await ui.findAll({ type: 'Text' })).slice(3)
  await ui.unmount()
  if (card === undefined) return undefined

  const marks = texts.filter(row => row.text === '✓' || row.text === '·')
  const rows = texts.filter(row => row.text !== '✓' && row.text !== '·')

  return {
    note,
    width: card.props.width,
    lines: rows.map(row => row.text),
    wraps: rows.map(row => row.props.wrap),
    dims: rows.map(row => row.props.dimColor),
    colors: rows.map(row => row.props.color),
    marks: marks.map(mark => ({ text: mark.text, color: mark.props.color })),
  }
}

test('A1: the empty card says what to write and what Claude will do, switched on or restored, and the tool is registered', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true })
  await session($)
  await $.command.run(run('place', 'side'))
  expect(await drawn($)).toEqual({ note: '', width: 40, lines: EMPTY, wraps: [undefined, undefined, undefined], dims: [true, true, true], colors: [undefined, undefined, undefined], marks: [] })
  expect(desk.tools).toEqual(['tick'])
  expect(desk.world.writes).toEqual([])

  expect(await cmd($, 'off')).toBe('Done off. The tick tool stays listed until the session ends and ticks nothing.')
  expect(await cmd($, 'on')).toBe('Done on; /done-widget add <criterion> writes the list. /widgets places it.')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY, marks: [] })
  expect(desk.tools).toEqual(['tick', 'tick'])
})

test('A2: add cleans and appends an open item, keeps its case, cuts it at 80 and stores nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  expect(await cmd($, 'add the  tests pass')).toBe('Item 1: done when the tests pass. Claude is told with your next prompt.')
  expect(await cmd($, `add ${DEPS}`)).toBe(`Item 2: done when ${DEPS}. Claude is told with your next prompt.`)
  expect(await drawn($)).toEqual({
    note: '0/2 met',
    width: 40,
    lines: [`· 1 ${TESTS}`, `· 2 ${DEPS}`],
    wraps: ['truncate-end', 'truncate-end'],
    dims: [undefined, undefined],
    colors: [undefined, undefined],
    marks: [YELLOW, YELLOW],
  })

  expect(await cmd($, 'ADD Keep The Case')).toBe('Item 3: done when Keep The Case. Claude is told with your next prompt.')

  const long = `${SIX[0]} and then some more.`
  expect(long).toHaveLength(100)
  expect(SIX[0]).toHaveLength(80)
  expect(await cmd($, `add ${long}`)).toBe(`Item 4: done when ${SIX[0]}. Claude is told with your next prompt.`)
  expect((await drawn($))?.lines).toEqual([`· 1 ${TESTS}`, `· 2 ${DEPS}`, '· 3 Keep The Case', `· 4 ${SIX[0]}`])

  expect(desk.world.writes).toEqual(['store isOn'])
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
})

test('A3: add with no text, a text already held and a seventh item each leave the list as it was', PLUGINS, async ($, on) => {
  open(on)
  await start($)

  expect(await cmd($, 'add')).toBe('Add what? Try /done-widget add the tests pass')
  expect(await cmd($, 'add   ')).toBe('Add what? Try /done-widget add the tests pass')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })

  await cmd($, `add ${TESTS}`)
  expect(await cmd($, `add ${TESTS}`)).toBe('Already on the list as item 1.')
  expect(await cmd($, 'add The  Tests PASS')).toBe('Already on the list as item 1.')
  expect((await drawn($))?.lines).toEqual([`· 1 ${TESTS}`])

  for (const text of SIX.slice(1)) await cmd($, `add ${text}`)
  const six = [TESTS, ...SIX.slice(1)].map((text, at) => `· ${at + 1} ${text}`)
  expect((await drawn($))?.lines).toEqual(six)
  expect(await cmd($, 'add a seventh thing')).toBe('The list is full (6 items). /done-widget drop <number> makes room.')
  expect(await cmd($, `add ${SIX[3]}`)).toBe('Already on the list as item 4.')
  expect(await drawn($)).toMatchObject({ note: '0/6 met', lines: six })
})

test('A4: the list rides one prompt after an add, only a prompt from a person, and never when empty', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(await prompted($, desk)).toEqual([])
  expect(await prompted($, desk, 'composer', ['The user has src/client.ts open.'])).toEqual(['The user has src/client.ts open.'])

  await cmd($, `add ${TESTS}`)
  await cmd($, `add ${DEPS}`)
  const two = block([`1. [ ] ${TESTS}`, `2. [ ] ${DEPS}`])
  expect(two.split('\n')).toEqual([OPENING, '1. [ ] the tests pass', '2. [ ] no new dependencies'])
  expect(await prompted($, desk, 'composer', ['The user has src/client.ts open.'])).toEqual(['The user has src/client.ts open.', two])
  expect(await prompted($, desk)).toEqual([])

  await cmd($, `add ${README}`)
  const three = block([`1. [ ] ${TESTS}`, `2. [ ] ${DEPS}`, `3. [ ] ${README}`])
  for (const kind of ['task-notification', 'scheduled-trigger', 'peer']) {
    expect(await prompted($, desk, kind, ['Background task finished.'])).toEqual(['Background task finished.'])
    expect(await prompted($, desk, kind)).toEqual([])
  }
  expect(await prompted($, desk, 'composer')).toEqual([three])

  for (const kind of ['bridge', 'sdk']) {
    await compacted($)
    expect(await prompted($, desk, kind)).toEqual([three])
    expect(await prompted($, desk, kind)).toEqual([])
  }
})

test('A5: a tick marks the item met with its cleaned evidence and answers with the list', PLUGINS, async ($, on) => {
  open(on)
  await start($)
  await cmd($, `add ${TESTS}`)
  await cmd($, `add ${DEPS}`)

  const said = `1. [x] ${TESTS} (${RAN})\n2. [ ] ${DEPS}\nStill open: 2.`
  expect(await tick($, 1, RAN)).toEqual({ result: said, text: said })
  expect(await drawn($)).toEqual({
    note: '1/2 met',
    width: 40,
    lines: [`✓ 1 ${TESTS}`, `    ${RAN}`, `· 2 ${DEPS}`],
    wraps: ['truncate-end', 'truncate-end', 'truncate-end'],
    dims: [undefined, true, undefined],
    colors: [undefined, undefined, undefined],
    marks: [GREEN, YELLOW],
  })

  expect((await tick($, 1, '  bun test:\n\t14 pass,   0 fail\r\n')).text).toBe(said)

  const long = `${PROOF[0]} ${PROOF[1]}`.slice(0, 200)
  expect(long).toHaveLength(200)
  expect(PROOF[0]).toHaveLength(120)
  expect((await tick($, 1, long)).text).toBe(`1. [x] ${TESTS} (${PROOF[0]})\n2. [ ] ${DEPS}\nStill open: 2.`)
  expect(await drawn($)).toMatchObject({ note: '1/2 met', lines: [`✓ 1 ${TESTS}`, `    ${PROOF[0]}`, `· 2 ${DEPS}`] })
})

test('A6: a tick that names no item, gives no evidence or finds no list is an error and changes nothing', PLUGINS, async ($, on) => {
  open(on)
  await start($)
  expect(await tick($, 1, RAN)).toEqual(failed('The definition of done is empty; there is nothing to tick.'))

  await cmd($, `add ${TESTS}`)
  await cmd($, `add ${DEPS}`)
  const list = `1. [ ] ${TESTS}\n2. [ ] ${DEPS}`
  for (const item of [0, 3, 1.5, '1', -1]) {
    expect(await tick($, item, RAN)).toEqual(failed(`There is no item ${item}. The list:\n${list}`))
  }
  expect(await tick($, undefined, RAN)).toEqual(failed(`There is no item (none given). The list:\n${list}`))
  expect((await tick($, '7'.repeat(500), RAN)).text).toBe(`There is no item ${'7'.repeat(20)}. The list:\n${list}`)

  for (const evidence of ['', ' \n\t ', undefined]) expect(await tick($, 1, evidence)).toEqual(failed(NEEDS))

  expect(await drawn($)).toMatchObject({ note: '0/2 met', lines: [`· 1 ${TESTS}`, `· 2 ${DEPS}`], marks: [YELLOW, YELLOW] })
})

test('A7: with every item met the card says so and a turn that says done is not pulled up', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, `add ${TESTS}`)
  await cmd($, `add ${DEPS}`)
  await tick($, 1, RAN)

  const said = `1. [x] ${TESTS} (${RAN})\n2. [x] ${DEPS} (${DIFF})\nEvery item is met.`
  expect(await tick($, 2, DIFF)).toEqual({ result: said, text: said })
  expect(await drawn($)).toMatchObject({
    note: 'all met',
    lines: [`✓ 1 ${TESTS}`, `    ${RAN}`, `✓ 2 ${DEPS}`, `    ${DIFF}`],
    marks: [GREEN, GREEN],
  })

  expect(await ended($, 'Done.')).toEqual({ text: 'Done.' })
  expect(desk.suggested).toEqual([])
  expect(await cmd($, 'show')).toBe(`2 items, 2 met:\n1. [x] ${TESTS} (${RAN})\n2. [x] ${DEPS} (${DIFF})`)
})

test('A8: a main-loop answer that claims done with items open is counted and a suggestion names them', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  for (const text of [TESTS, DEPS, README]) await cmd($, `add ${text}`)
  await tick($, 1, RAN)

  expect(await ended($, 'The retry is done.')).toEqual({ text: 'The retry is done.' })
  expect(desk.suggested).toEqual(['Items 2, 3 on the done list are still open. Meet them and tick them with evidence, or say why not.'])
  expect(await drawn($)).toMatchObject({
    note: '1/3 met',
    lines: [`✓ 1 ${TESTS}`, `    ${RAN}`, `· 2 ${DEPS}`, `· 3 ${README}`, 'Said done too soon: 1 nudge'],
    colors: [undefined, undefined, undefined, undefined, 'yellow'],
  })

  await tick($, 3, 'README.md line 41 documents --retries and its default of 3')
  await ended($, 'All set, the option is in and documented.')
  expect(desk.suggested.at(-1)).toBe('Item 2 on the done list is still open. Meet it and tick it with evidence, or say why not.')
  expect((await drawn($))?.lines.at(-1)).toBe('Said done too soon: 2 nudges')

  desk.fault.isThrowing = true
  expect(await ended($, 'Everything is finished.')).toEqual({ text: 'Everything is finished.' })
  expect(desk.suggested).toHaveLength(2)
  expect((await drawn($))?.lines.at(-1)).toBe('Said done too soon: 3 nudges')

  for (const [at, claim] of [
    'Done.',
    'All done.',
    'Task completed.',
    '## Done',
    'Implementation complete ✅',
    'Well done!',
    'The fix is complete now.',
    'The fix is in place and everything is completed as requested.',
    'The task has been completed successfully.',
    'All tasks completed successfully.',
    'I have completed the work.',
    "I've finished everything.",
    "I've finished the refactor and all tests pass.",
    "I've successfully completed the task.",
    'I have completed the task successfully.',
    "I'm finished with the task.",
    'I have finished implementing the feature.',
    '**All items are done.**',
    'All three items are done.',
    'Item 2 is not done yet, but the retry itself is done.',
    'The retry is done. Items 2 and 3 are open.',
    'The migration is done, but the tests fail.',
    'Status:\n- option: in src/client.ts\n- retry: done',
    'The build is fixed.',
  ].entries()) {
    expect(await ended($, claim)).toEqual({ text: claim })
    expect((await drawn($))?.lines.at(-1)).toBe(`Said done too soon: ${at + 4} nudges`)
  }
})

test('A9: no nudge without a claim, for a denied claim, in a subagent, or for a turn that did not answer', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, `add ${TESTS}`)
  await cmd($, `add ${DEPS}`)
  await cmd($, 'add the bug is fixed')

  for (const honest of [
    'Still working on it.',
    'Item 1 is done; item 2 is open because the lockfile changed.',
    'Item 3 (the bug is fixed) is still open.',
    'Items 1 and 2 are done. The Bug Is Fixed is the one left, and the trace points at the timer.',
    'Two things still need to be done: run the tests and commit.',
    'I will tick item 2 once the tests are fixed.',
    'I have not yet been able to get this fixed.',
    'The work is far from complete.',
    'I added the complete list of options to the README, but tests still fail.',
    'Fixed the import in src/client.ts; two tests in test/retry.test.ts fail on the timeout.',
    'Item 2 is not done yet.',
    'The tests are not fixed: two still fail in test/retry.test.ts.',
    "That isn't finished; the lockfile still changes.",
    'Item 2 on the done list is still open because the lockfile changed.',
    'Your definition of done has two open items, and I have not completed either.',
    'Nothing is resolved so far.',
    'Is the migration done?',
    'What would you like done?',
    'Should I mark this as resolved?',
    'Here is what I have done so far: added the option. Items 2 and 3 are open.',
    'Here is what is done so far.',
    'Mostly done.',
    'Almost done.',
    'Everything but the tests is done.',
    'Are we done here? I think there is more to do.',
    'Fixed it.',
    'I have fixed the bug.',
    'Done (see the diff).',
    'I am done for now; items 2 and 3 are open.',
    'The build finished with 3 errors.',
    'This is a complete rewrite of the parser.',
    'The build finished.',
    'The download is complete.',
    'The test run is complete: 2 failures.',
    'bun test finished: 14 pass, 2 fail.',
    'The build finished successfully.',
    'npm install has finished.',
    'tsc finished',
    '`bun x tsc` finished.',
    'Done: 14 pass, 2 fail.',
  ]) {
    expect(await ended($, honest)).toEqual({ text: honest })
  }
  await ended($, 'The search is done.', { agentId: 'agent-7' })
  await ended($, 'Done', { isAborted: true, reason: 'aborted' })
  await ended($, 'Done before the API failed.', { reason: 'error' })

  expect(desk.suggested).toEqual([])
  expect(await drawn($)).toMatchObject({ note: '0/3 met', lines: [`· 1 ${TESTS}`, `· 2 ${DEPS}`, '· 3 the bug is fixed'] })

  await ended($, 'Done: 14 pass, 0 fail.')
  expect(desk.suggested).toHaveLength(1)
})

test('A10: a main-loop compaction makes the list due again, and no other does', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, `add ${TESTS}`)
  const one = block([`1. [ ] ${TESTS}`])
  expect(await prompted($, desk)).toEqual([one])

  expect(await compacted($, { trigger: 'manual' })).toEqual(SUMMARY)
  expect(await prompted($, desk)).toEqual([one])
  expect(await prompted($, desk)).toEqual([])

  expect(await compacted($, { agentId: 'agent-7' })).toEqual(SUMMARY)
  expect(await prompted($, desk)).toEqual([])

  expect(await compacted($, { trigger: 'precompute' })).toEqual(SUMMARY)
  expect(await prompted($, desk)).toEqual([])

  expect(await compacted($, { instructions: 'veto' })).toEqual({ skip: 'veto' })
  expect(await prompted($, desk)).toEqual([])
})

test('A11: drop removes one item and renumbers the rest for the card and for Claude', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  for (const text of [TESTS, DEPS, README]) await cmd($, `add ${text}`)
  await tick($, 1, RAN)
  expect(await prompted($, desk)).toHaveLength(1)

  for (const typed of ['', 'x', '0', '9', '2 3', '2abc', '1.5', '-1']) {
    expect(await cmd($, `drop ${typed}`)).toBe(`There is no item "${typed}". /done-widget show lists them.`)
  }
  expect(await cmd($, `drop ${'Nine'.repeat(100)}`)).toBe(`There is no item "${'Nine'.repeat(5)}". /done-widget show lists them.`)
  expect(await drawn($)).toMatchObject({ note: '1/3 met' })
  expect(await prompted($, desk)).toEqual([])

  expect(await cmd($, 'drop 2')).toBe(`Dropped item 2: ${DEPS}`)
  expect(await drawn($)).toMatchObject({ note: '1/2 met', lines: [`✓ 1 ${TESTS}`, `    ${RAN}`, `· 2 ${README}`], marks: [GREEN, YELLOW] })
  expect(await prompted($, desk)).toEqual([block([`1. [x] ${TESTS} (${RAN})`, `2. [ ] ${README}`])])

  expect(await cmd($, 'DROP 02')).toBe(`Dropped item 2: ${README}`)
  expect((await drawn($))?.lines).toEqual([`✓ 1 ${TESTS}`, `    ${RAN}`])
})

test('A12: while off and never switched on nothing is registered, written, added or suggested', PLUGINS, async ($, on) => {
  const desk = open(on)
  await session($)
  await $.command.run(run('place', 'side'))
  expect(desk.tools).toEqual([])
  expect(desk.world.writes).toEqual([])

  for (const args of ['add x', 'drop 1', 'show', 'clear']) expect(await cmd($, args)).toBe(OFF)
  expect(desk.world.store.get('isOn')).toBeUndefined()
  expect(await drawn($)).toBeUndefined()

  expect(await prompted($, desk, 'composer', ['The user has src/client.ts open.'])).toEqual(['The user has src/client.ts open.'])
  expect(await ended($, 'Done.')).toEqual({ text: 'Done.' })
  expect(desk.suggested).toEqual([])
  expect(desk.world.writes).toEqual([])

  await cmd($, 'on')
  expect(desk.tools).toEqual(['tick'])
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
  expect(await cmd($, 'show')).toBe('The definition of done is empty. /done-widget add <criterion> adds an item.')
})

test('A13: switched off the tool ticks nothing and nothing is told or counted; on again the list is back', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await cmd($, `add ${TESTS}`)
  await cmd($, `add ${DEPS}`)
  await tick($, 1, RAN)
  await cmd($, 'off')

  expect(await tick($, 2, DIFF)).toEqual(failed('Done is off; nothing was ticked.'))
  expect(await prompted($, desk)).toEqual([])
  expect(await compacted($)).toEqual(SUMMARY)
  expect(await prompted($, desk)).toEqual([])
  expect(await ended($, 'Done.')).toEqual({ text: 'Done.' })
  expect(desk.suggested).toEqual([])
  expect(await drawn($)).toBeUndefined()
  expect(desk.world.writes).toEqual(['store isOn', 'store isOn'])

  await cmd($, 'on')
  expect(await drawn($)).toMatchObject({ note: '1/2 met', lines: [`✓ 1 ${TESTS}`, `    ${RAN}`, `· 2 ${DEPS}`], marks: [GREEN, YELLOW] })
  expect(await prompted($, desk)).toEqual([block([`1. [x] ${TESTS} (${RAN})`, `2. [ ] ${DEPS}`])])
  expect(await cmd($, 'show')).toBe(`2 items, 1 met:\n1. [x] ${TESTS} (${RAN})\n2. [ ] ${DEPS}`)
})

test('A14: show prints what Claude is told in full, and clear wipes the list, the count and the block', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(await cmd($, 'show')).toBe('The definition of done is empty. /done-widget add <criterion> adds an item.')

  await cmd($, `add ${TESTS}`)
  expect(await cmd($, 'show')).toBe(`1 item, 0 met:\n1. [ ] ${TESTS}`)

  await cmd($, `add ${DEPS}`)
  await cmd($, `add ${README}`)
  await tick($, 2, PROOF[1])
  await ended($, 'The retry option is complete.')
  expect(PROOF[1]).toHaveLength(120)
  expect(await cmd($, 'SHOW')).toBe(`3 items, 1 met:\n1. [ ] ${TESTS}\n2. [x] ${DEPS} (${PROOF[1]})\n3. [ ] ${README}\nSaid done too soon: 1 nudge`)

  expect(await cmd($, 'clear')).toBe('Done list cleared.')
  expect(await drawn($)).toEqual({ note: '', width: 40, lines: EMPTY, wraps: [undefined, undefined, undefined], dims: [true, true, true], colors: [undefined, undefined, undefined], marks: [] })
  expect(await prompted($, desk)).toEqual([])
  expect(await cmd($, 'show')).toBe('The definition of done is empty. /done-widget add <criterion> adds an item.')
})

test('A15: the fullest card keeps one line per row at every width and in every placement, and unknown verbs change nothing', PLUGINS, async ($, on) => {
  open(on)
  await start($)
  for (const text of SIX) {
    expect(text).toHaveLength(80)
    await cmd($, `add ${text}`)
  }
  await tick($, 1, PROOF[0])
  await tick($, 2, PROOF[1])
  await ended($, 'The retry option is done.')
  await ended($, 'All of it is finished.')

  const rows = [`✓ 1 ${SIX[0]}`, `    ${PROOF[0]}`, `✓ 2 ${SIX[1]}`, `    ${PROOF[1]}`, ...SIX.slice(2).map((text, at) => `· ${at + 3} ${text}`)]
  for (const [columns, width, last] of [
    [20, 20, '2 nudges'],
    [39, 39, '2 nudges'],
    [40, 40, 'Said done too soon: 2 nudges'],
    [60, 40, 'Said done too soon: 2 nudges'],
  ] as const) {
    const card = await drawn($, columns)
    expect(card).toMatchObject({ note: '2/6 met', width, lines: [...rows, last], marks: [GREEN, GREEN, YELLOW, YELLOW, YELLOW, YELLOW] })
    expect(card?.wraps).toEqual(Array.from({ length: 9 }, () => 'truncate-end'))
  }

  const side = await drawn($)
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    for (const [, other] of SITES) expect(await drawn($, 40, other)).toEqual(other === component ? side : undefined)
  }

  for (const args of ['when the tests pass', 'tick 1', 'on now', 'show all', 'clear 2']) expect(await cmd($, args)).toBe(USAGE)
  await $.command.run(run('place', 'side'))
  expect(await drawn($)).toEqual(side)
})

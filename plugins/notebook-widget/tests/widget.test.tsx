import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type Said = { result?: unknown; text?: string; isError?: boolean }
type Desk = { world: Ground; tools: string[] }
type Mark = { text: string; color: unknown; bold: unknown; dimColor: unknown }
type Drawn = { note: string; width: unknown; lines: string[]; wraps: unknown[]; marks: Mark[] }

const NAME = 'notebook-widget'
const JOT = 'mcp__notebook-widget__jot'
const KEY = 'notes:/work/project'
const USAGE = 'Usage: /notebook-widget [on|off|show|drop <number>|clear]'
const OFF = 'Notebook is off.'
const OPENING =
  "notebook-widget: notes you left yourself in earlier sessions in this project. Each was true when written; check one against the code before you rely on it, and overwrite it with the jot tool's replace if it is out of date:"
const EMPTY = ['Nothing noted yet.', 'Claude jots here what the next', 'session should know of this project.']
const HINT = '/notebook-widget show: in full'
const FULL = 'Full: a new note replaces an old'
const NOTES = [
  'Tests need Docker: run make up first, or the database suite hangs at connect.',
  'Prices are integer cents, never floats; src/money.ts holds the only conversions.',
  'src/legacy is generated; edit templates/legacy and run make gen instead.',
  'The sum loop must start at 0, not 1: the first item was skipped before.',
  'CI runs on Node 20 only; the old bundler breaks on newer syntax in src/vendor.',
  'Fixtures live in test/data; regenerate with npm run fixtures after a schema change.',
  'The API client retries 3 times; a slow test may just be the retry backoff.',
  'Deploys go through make ship only; pushing to main does not release anything.',
]
const THREE = NOTES.slice(0, 3)
const SUM = 'sum() skipped the first item: its loop began at 1. Loops over list start at 0.'
const LONG = `The export job in scripts/export.ts ${'reads every tenant table in turn and '.repeat(8)}must not run in parallel.`

const TALK = [
  { role: 'user', text: 'Fix the failing test', toolUses: [] },
  { role: 'assistant', text: 'The loop started at 1; it starts at 0 now and the tests pass.', toolUses: [] },
]
const SUMMARY = { messages: TALK.slice(-1), tokensBefore: 150_000, tokensAfter: 9_000 }
const VETO = { skip: 'veto' }

const BENEATH: Plugin = {
  name: 'stand-in-beneath',
  tier: 'append',
  register(on) {
    on('session.compact', async (_$, e) => (e.instructions === 'veto' ? { skip: e.instructions } : { messages: e.messages.slice(-1), tokensBefore: 150_000, tokensAfter: 9_000 }))
  },
}

const PLUGINS = { plugins: [LAYOUT, BENEATH] }

const list = (notes: readonly string[]): string => notes.map((text, at) => `${at + 1}. ${text}`).join('\n')

const block = (notes: readonly string[]): string => `${OPENING}\n${list(notes)}`

const open = (on: On, store: Record<string, unknown> = {}): Desk => {
  const tools: string[] = []
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

  return { world, tools }
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const jot = async ($: Engine, text: unknown, replace?: unknown): Promise<Said> =>
  (await $.tool.call({ tool: JOT, tool_use_id: 'toolu_jot', text, ...(replace === undefined ? {} : { replace }) } as never)) as Said

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const prompted = async ($: Engine, desk: Desk, kind = 'composer', context?: string[]): Promise<string[]> => {
  const before = desk.world.contexts.length
  await $.prompt.submit({ text: 'Why is the total one short?', wait: false, origin: { kind }, ...(context === undefined ? {} : { context }) } as never)

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

  const marks = texts.filter(row => /^\d$/.test(row.text))
  const rows = texts.filter(row => !/^\d$/.test(row.text))

  return {
    note,
    width: card.props.width,
    lines: rows.map(row => row.text),
    wraps: rows.map(row => row.props.wrap),
    marks: marks.map(mark => ({ text: mark.text, color: mark.props.color, bold: mark.props.bold, dimColor: mark.props.dimColor })),
  }
}

const dim = (count: number): Mark[] => Array.from({ length: count }, (_, at) => ({ text: String(at + 1), color: undefined, bold: undefined, dimColor: true }))

const green = (at: number): Mark => ({ text: String(at), color: 'green', bold: true, dimColor: undefined })

const rows = (notes: readonly string[]): string[] => notes.map((text, at) => `${at + 1} ${text}`)

test('A1: the empty card says what will appear, restored or switched on, and the tool is registered once', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true })
  await session($)
  await $.command.run(run('place', 'side'))
  expect(await drawn($)).toEqual({ note: '', width: 40, lines: EMPTY, wraps: [undefined, undefined, undefined], marks: [] })
  expect(desk.tools).toEqual(['jot'])

  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY, marks: [] })
  expect(desk.tools).toEqual(['jot'])
})

test('A2: a jot is stored, answered with the count and shown as new', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  expect(await jot($, SUM)).toEqual({ result: 'Noted (1 of 8).', text: 'Noted (1 of 8).' })
  expect(desk.world.store.get(KEY)).toEqual([SUM])
  expect(await drawn($)).toEqual({ note: '+1', width: 40, lines: [`1 ${SUM}`, HINT], wraps: ['truncate-end', 'truncate-end'], marks: [green(1)] })

  expect((await jot($, NOTES[0])).text).toBe('Noted (2 of 8).')
  expect(desk.world.store.get(KEY)).toEqual([SUM, NOTES[0]])
  expect(await drawn($)).toMatchObject({ note: '+2', lines: [`1 ${SUM}`, `2 ${NOTES[0]}`, HINT], marks: [green(1), green(2)] })
})

test('A3: text is cleaned and cut, and empty or repeated text writes nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  await jot($, '  Tests need Docker:\n\trun  make up   first.\r\n ')
  expect(desk.world.store.get(KEY)).toEqual(['Tests need Docker: run make up first.'])

  expect(LONG.length).toBeGreaterThanOrEqual(300)
  await jot($, LONG.slice(0, 300))
  expect(desk.world.store.get(KEY)).toEqual(['Tests need Docker: run make up first.', LONG.slice(0, 200)])

  const before = desk.world.writes.length
  for (const text of ['', ' \n\t ', undefined]) {
    expect(await jot($, text)).toEqual({ result: 'A note needs text.', text: 'A note needs text.', isError: true })
  }
  expect(await jot($, 'Tests need Docker:  run make up first.')).toEqual({ result: 'Already in the notebook.', text: 'Already in the notebook.' })
  expect(desk.world.writes.slice(before)).toEqual([])
  expect(await drawn($)).toMatchObject({ note: '+2' })
})

test('A4: a full notebook refuses a ninth note and takes one through replace', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, [KEY]: NOTES })
  await session($)
  await $.command.run(run('place', 'side'))

  expect(await drawn($)).toMatchObject({ note: 'full', lines: [...rows(NOTES), FULL, HINT], marks: dim(8) })

  const full = `The notebook is full (8 notes). Pass replace with the number of the least useful one:\n${list(NOTES)}`
  expect(await jot($, SUM)).toEqual({ result: full, text: full, isError: true })
  expect(desk.world.writes).toEqual([])

  expect(await jot($, NOTES[4], 3)).toEqual({ result: 'Already in the notebook.', text: 'Already in the notebook.' })
  expect(desk.world.writes).toEqual([])

  expect((await jot($, SUM, 3)).text).toBe('Noted (8 of 8).')
  const after = NOTES.map((note, at) => (at === 2 ? SUM : note))
  expect(desk.world.store.get(KEY)).toEqual(after)
  expect(await drawn($)).toMatchObject({ note: '+1', lines: [...rows(after), FULL, HINT], marks: dim(8).map((mark, at) => (at === 2 ? green(3) : mark)) })
})

test('A5: a replace that names no note answers with the list and writes nothing', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, [KEY]: NOTES })
  await session($)

  for (const replace of [0, 9, 1.5, '2']) {
    const said = `There is no note ${replace}. The notebook holds:\n${list(NOTES)}`
    expect(await jot($, SUM, replace)).toEqual({ result: said, text: said, isError: true })
  }
  expect((await jot($, SUM, { number: 'x'.repeat(500) })).text).toBe(`There is no note [object Object]. The notebook holds:\n${list(NOTES)}`)
  expect((await jot($, SUM, '7'.repeat(500))).text).toBe(`There is no note ${'7'.repeat(20)}. The notebook holds:\n${list(NOTES)}`)
  expect(desk.world.writes).toEqual([])

  await $.command.run(run(NAME, 'clear'))
  const before = desk.world.writes.length
  const empty = 'There is no note 1. The notebook is empty.'
  expect(await jot($, SUM, 1)).toEqual({ result: empty, text: empty, isError: true })
  expect(desk.world.writes.slice(before)).toEqual([])
})

test('A6: the first prompt of a session carries the notes once, after context already there, and an empty notebook none', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, [KEY]: THREE })
  await session($)

  expect(await prompted($, desk, 'composer', ['The user has src/sum.js open.'])).toEqual(['The user has src/sum.js open.', block(THREE)])
  expect(block(THREE).split('\n')).toEqual([OPENING, `1. ${THREE[0]}`, `2. ${THREE[1]}`, `3. ${THREE[2]}`])
  expect(await prompted($, desk)).toEqual([])
  await turn($)
  expect(desk.world.contexts).toHaveLength(2)

  await $.command.run(run(NAME, 'clear'))
  const before = desk.world.contexts.length
  await turn($, 'Run the tests again', 'turn-2')
  await compacted($)
  expect(await prompted($, desk)).toEqual([])
  expect(desk.world.contexts).toHaveLength(before)
})

test('A7: only a prompt from a person receives the block', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, [KEY]: THREE })
  await session($)

  for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'plugin']) {
    expect(await prompted($, desk, kind, ['Background task finished.'])).toEqual(['Background task finished.'])
    expect(await prompted($, desk, kind)).toEqual([])
  }
  expect(await prompted($, desk, 'composer')).toEqual([block(THREE)])

  for (const kind of ['bridge', 'sdk']) {
    await compacted($)
    expect(await prompted($, desk, 'plugin')).toEqual([])
    expect(await prompted($, desk, kind)).toEqual([block(THREE)])
    expect(await prompted($, desk, kind)).toEqual([])
  }
})

test('A8: a main-loop compaction makes the notes due again, and no other does', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, [KEY]: THREE })
  await session($)
  expect(await prompted($, desk)).toEqual([block(THREE)])

  expect(await compacted($, { trigger: 'manual' })).toEqual(SUMMARY)
  expect(await prompted($, desk)).toEqual([block(THREE)])
  expect(await prompted($, desk)).toEqual([])

  expect(await compacted($, { agentId: 'agent-7' })).toEqual(SUMMARY)
  expect(await prompted($, desk)).toEqual([])

  expect(await compacted($, { trigger: 'precompute' })).toEqual(SUMMARY)
  expect(await prompted($, desk)).toEqual([])

  expect(await compacted($, { instructions: 'veto' })).toEqual(VETO)
  expect(await prompted($, desk)).toEqual([])
})

test('A9: notes are kept per project, and earlier shapes are read leniently', PLUGINS, async ($, on) => {
  const desk = open(on, {
    isOn: true,
    'notes:c:/work/project': [
      { text: NOTES[0], at: '2026-09-30' },
      42,
      NOTES[1],
      null,
      { at: '2026-09-30' },
      { text: 7 },
      ...NOTES.slice(2).map(text => ({ text, at: '2026-10-01' })),
      'A ninth note that does not fit.',
      'A tenth.',
    ],
  })
  await session($, 'C:\\Work\\Project\\')
  await $.command.run(run('place', 'side'))
  expect(await drawn($)).toMatchObject({ note: 'full', lines: [...rows(NOTES), FULL, HINT] })

  expect((await jot($, SUM, 8)).text).toBe('Noted (8 of 8).')
  const first = [...NOTES.slice(0, 7), SUM]
  expect(desk.world.store.get('notes:c:/work/project')).toEqual(first)

  await session($, '/work/other')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
  expect(await cmd($, 'clear')).toBe('Notebook emptied for this project.')
  expect(desk.world.store.get('notes:/work/other')).toEqual([])
  expect(desk.world.store.get('notes:c:/work/project')).toEqual(first)

  await session($, 'c:/work/project')
  expect(await drawn($)).toMatchObject({ note: 'full', lines: [...rows(first), FULL, HINT], marks: dim(8) })
  expect(await cmd($, 'drop 1')).toBe(`Dropped note 1: ${NOTES[0]}`)
  expect(desk.world.store.get('notes:c:/work/project')).toEqual(first.slice(1))
  expect([...desk.world.store.keys()].sort()).toEqual(['isOn', 'notes:/work/other', 'notes:c:/work/project'])
})

test('A10: show prints what Claude will be read, each note in full', PLUGINS, async ($, on) => {
  open(on)
  await start($)
  expect(await cmd($, 'show')).toBe('The notebook is empty for this project.')

  const long = LONG.slice(0, 200)
  await jot($, long)
  expect(long).toHaveLength(200)
  expect(await cmd($, 'show')).toBe(`1 note for this project:\n1. ${long}`)

  await jot($, NOTES[0])
  await jot($, NOTES[1])
  expect(await cmd($, 'SHOW')).toBe(`3 notes for this project:\n1. ${long}\n2. ${NOTES[0]}\n3. ${NOTES[1]}`)
})

test('A11: drop removes one note and renumbers the rest for the card and for Claude', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, [KEY]: THREE })
  await session($)
  await $.command.run(run('place', 'side'))
  expect(await prompted($, desk)).toEqual([block(THREE)])

  for (const typed of ['', 'x', '0', '9', '1.5', '-1']) {
    expect(await cmd($, `drop ${typed}`)).toBe(`There is no note "${typed}". /notebook-widget show lists them.`)
  }
  expect(await cmd($, `drop ${'Nine'.repeat(100)}`)).toBe(`There is no note "${'Nine'.repeat(5)}". /notebook-widget show lists them.`)
  expect(desk.world.writes).toEqual([])
  expect(await prompted($, desk)).toEqual([])

  expect(await cmd($, 'drop 2')).toBe(`Dropped note 2: ${THREE[1]}`)
  const left = THREE.filter((_, at) => at !== 1)
  expect(desk.world.store.get(KEY)).toEqual(left)
  expect(await drawn($)).toMatchObject({ note: '2 kept', lines: [...rows(left), HINT], marks: dim(2) })
  expect(await prompted($, desk)).toEqual([block(left)])
  expect(await prompted($, desk)).toEqual([])
})

test('A12: clear empties this project and a jot starts the count again', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, [KEY]: THREE })
  await session($)
  await $.command.run(run('place', 'side'))
  await jot($, SUM)
  expect(await drawn($)).toMatchObject({ note: '+1' })

  expect(await cmd($, 'clear')).toBe('Notebook emptied for this project.')
  expect(desk.world.store.get(KEY)).toEqual([])
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY, marks: [] })
  expect(await prompted($, desk)).toEqual([])

  expect((await jot($, NOTES[0])).text).toBe('Noted (1 of 8).')
  expect(await drawn($)).toMatchObject({ note: '+1', lines: [`1 ${NOTES[0]}`, HINT], marks: [green(1)] })
  expect(await prompted($, desk)).toEqual([block(NOTES.slice(0, 1))])
})

test('A13: never switched on, nothing is read, registered, attached or changed', PLUGINS, async ($, on) => {
  const desk = open(on, { [KEY]: THREE })
  await session($)
  await $.command.run(run('place', 'side'))

  expect(desk.tools).toEqual([])
  expect(await prompted($, desk, 'composer', ['The user has src/sum.js open.'])).toEqual(['The user has src/sum.js open.'])
  for (const verb of ['show', 'drop 1', 'clear']) expect(await cmd($, verb)).toBe(OFF)
  expect(await drawn($)).toBeUndefined()
  expect(desk.world.writes).toEqual([])
  expect(desk.world.store.get('isOn')).toBeUndefined()
  expect(desk.world.store.get(KEY)).toEqual(THREE)

  await $.command.run(run(NAME, 'on'))
  expect(await drawn($)).toMatchObject({ note: '3 kept', lines: [...rows(THREE), HINT] })
  expect(desk.tools).toEqual(['jot'])
  expect(await prompted($, desk)).toEqual([block(THREE)])
})

test('A14: switched off after a jot, the tool writes nothing and a switch-on brings the same notes back', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await jot($, SUM)
  expect(await cmd($, 'off')).toBe('Notebook off. The jot tool stays listed until the session ends and writes nothing.')

  const before = desk.world.writes.length
  const off = 'Notebook is off; nothing was written.'
  expect(await jot($, NOTES[0])).toEqual({ result: off, text: off, isError: true })
  expect(await prompted($, desk)).toEqual([])
  await compacted($)
  await turn($)
  expect(desk.world.contexts).toEqual([])
  expect(await drawn($)).toBeUndefined()
  expect(desk.world.writes.slice(before)).toEqual([])
  expect(desk.world.store.get(KEY)).toEqual([SUM])

  expect(await cmd($, 'on')).toBe('Notebook on; Claude can jot notes from the next prompt. /widgets places it.')
  expect(await drawn($)).toMatchObject({ note: '+1', lines: [`1 ${SUM}`, HINT], marks: [green(1)] })
  expect(desk.tools).toEqual(['jot'])
  expect(await prompted($, desk)).toEqual([block([SUM])])
})

test('A15: the busiest card fits every width and placement, and an unknown verb changes nothing', PLUGINS, async ($, on) => {
  const packed = NOTES.map(note => `${`${note} ${LONG}`.slice(0, 199)}.`)
  const desk = open(on, { isOn: true, [KEY]: packed.slice(0, 7) })
  await session($)
  await $.command.run(run('place', 'side'))
  await jot($, packed[7])
  await $.command.run(run('widen', `${NAME} 60`))

  for (const [columns, limit, wording] of [
    [20, 16, ['full, replacing', 'show: in full']],
    [39, 16, ['full, replacing', 'show: in full']],
    [40, 36, [FULL, HINT]],
    [60, 36, [FULL, HINT]],
  ] as const) {
    const card = await drawn($, columns)
    expect(card).toMatchObject({ note: '+1', width: columns, lines: [...rows(packed), ...wording], marks: [...dim(7), green(8)] })
    expect(card?.wraps).toEqual(Array.from({ length: 10 }, () => 'truncate-end'))
    for (const line of card?.lines.slice(8) ?? []) expect(line.length).toBeLessThanOrEqual(limit)
    expect('Notebook'.length + (card?.note.length ?? 0)).toBeLessThan(columns - 4)
  }

  await $.command.run(run(NAME, 'clear'))
  for (const [columns, limit] of [[20, 16], [39, 35], [40, 36], [60, 36]] as const) {
    for (const line of (await drawn($, columns))?.lines ?? []) expect(line.length).toBeLessThanOrEqual(limit)
  }
  await jot($, packed[7])

  for (const [place, component] of SITES) {
    await $.command.run(run('place', place))
    for (const [other, elsewhere] of SITES) {
      if (other === place) expect(await drawn($, 40, elsewhere)).toEqual(await drawn($, 40, component))
      else expect(await drawn($, 40, elsewhere)).toBeUndefined()
    }
  }
  expect(await drawn($, 40, 'Pane')).toBeUndefined()
  await $.command.run(run('place', 'side'))
  const before = { card: await drawn($), writes: desk.world.writes.length }

  for (const verb of ['note', 'note Remember the tests', 'jot', 'show all', 'clear now', 'on now', 'sideways']) expect(await cmd($, verb)).toBe(USAGE)
  expect(await drawn($)).toEqual(before.card)
  expect(desk.world.writes).toHaveLength(before.writes)
  expect(desk.world.store.get('isOn')).toBe(true)
})

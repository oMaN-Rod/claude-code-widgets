import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'

type Call = { tool: string; tool_use_id?: string; command?: string; file_path?: string; questions?: unknown; agentId?: string }
type Mark = { id: number; turn: number; kind: string; label: string; row: string; isNear: boolean; isGone: boolean }
type Trail = { marks: Mark[]; edited: string[]; mood: string; turn: number; last: number; waiting: number; said: string }
type Part = { type: string; text: string; props: Record<string, unknown> }
type Drawing = { find: (match: object) => Promise<Part | undefined>; findAll: (match: object) => Promise<Part[]>; press: (match: object) => Promise<unknown>; unmount: () => Promise<void> }
type Row = { label: string; fact: string; isButton: boolean; isDim: boolean }
type Card = { note: string; lines: string[]; rows: Row[]; fold: string | undefined; foot: string | undefined }

const NAME = 'landmarks-widget'
const USAGE = 'Usage: /landmarks-widget [on|off|list|go <n>|clear]'
const EMPTY = 'No landmarks yet. Prompts, first edits, red and green checks, commits and questions are listed here; press one to jump to it.'
const REST = { marks: [], edited: [], mood: 'none', turn: 0, last: 0, waiting: 0, said: '' }
const QUESTIONS = [
  {
    question: 'Which schema do we keep?',
    header: 'Schema',
    options: [
      { label: 'The new one', description: 'Drop the legacy columns' },
      { label: 'Both', description: 'Keep the legacy columns for one release' },
    ],
    multiSelect: false,
  },
]

// The test host of 2.1.289 gives a plugin's own $.ui.scroll nothing to land on: an on('ui.scroll') hook hears
// only the test's own call, and the plugin's call throws this. So every jump below is one the engine threw at.
// Not exercised in this file, and so not proved by it: the answer `At <n>: <line>`, its ` (nearest row)`,
// a `{ deny }` the engine chose, and a moved jump clearing `gone`. A7 to A9 hold only the thrown path.
const THROWN = 'no implementation for ui.scroll'
const CUT = ' did not move: no implementation f…'

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async $ => ({
      text: JSON.stringify((await $.state.get({ plugin: 'landmarks-widget', key: 'trail' } as const)).value ?? null),
    }))
  },
}

const WITH = { plugins: [LAYOUT, PEEK] }

const passed = (stdout: string): object => ({ result: { stdout, stderr: '', interrupted: false }, text: stdout })

const failed = (text: string): object => ({ result: text, isError: true, text })

const failing = (...ids: string[]): Record<string, object> => Object.fromEntries(ids.map(id => [id, failed('1 failing')]))

const real = (e: Call): object => {
  if (e.tool === 'Bash') return passed('')
  if (e.tool === 'Edit') {
    return {
      result: { filePath: e.file_path, oldString: 'a', newString: 'b', originalFile: 'a\n', structuredPatch: [], userModified: false, replaceAll: false },
      text: `The file ${e.file_path} has been updated successfully.`,
    }
  }
  if (e.tool === 'Write') {
    return { result: { type: 'create', filePath: e.file_path, content: 'hi\n', structuredPatch: [], originalFile: null }, text: `File created successfully at: ${e.file_path}` }
  }
  if (e.tool === 'AskUserQuestion') {
    return { result: { questions: e.questions, answers: { 'Which schema do we keep?': 'The new one' } }, text: 'User has answered your questions.' }
  }

  return { result: { type: 'text', file: { filePath: e.file_path, content: '', numLines: 0, startLine: 1, totalLines: 0 } }, text: '' }
}

const open = async ($: Engine, on: On, outcomes: Readonly<Record<string, object>> = {}): Promise<void> => {
  ground(on)
  on('tool.call', async (_$, e) => (outcomes[e.tool_use_id ?? ''] ?? real(e as Call)) as never)
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const say = async ($: Engine, args: string, isFullscreen = true): Promise<string> =>
  (await $.command.run({ ...run(NAME, args), presentation: { isFullscreen, columns: 160 } })).text ?? ''

const peek = async ($: Engine): Promise<Trail> => JSON.parse((await $.command.run(run('peek'))).text ?? 'null') as Trail

const prompt = async ($: Engine, text: string, turn: number): Promise<unknown> => $.turn.start({ text, turnId: `turn-${turn}` })

const call = async ($: Engine, input: Call): Promise<unknown> => $.tool.call(input as never)

const bash = async ($: Engine, id: string, command: string): Promise<unknown> => call($, { tool: 'Bash', tool_use_id: id, command })

const edit = async ($: Engine, id: string, path: string): Promise<unknown> => call($, { tool: 'Edit', tool_use_id: id, file_path: path })

const read = async ($: Engine, id: string): Promise<unknown> => call($, { tool: 'Read', tool_use_id: id, file_path: '/work/project/src/auth.ts' })

const mount = async ($: Engine, columns = 40, layout: object = { isFullscreen: true }): Promise<Drawing> =>
  (await $.ui.mount({ ...(target(NAME, 'Pane', columns) as object), viewport: { columns, rows: 40, ...layout } } as never)) as never as Drawing

const card = async (ui: Drawing): Promise<Card> => {
  const parts = await ui.findAll({})
  const lines = parts.filter(part => part.type === 'Button' || part.type === 'Text').map(part => part.text)
  const rows = parts.flatMap((part, at): Row[] => {
    if (!String(part.props.key).startsWith('row:')) return []
    const held = parts[at + 1]
    const fact = parts[at + 2]?.text ?? ''

    return [{ label: held?.text ?? '', fact: fact === 'near' || fact === 'gone' ? fact : '', isButton: held?.type === 'Button', isDim: held?.props.dimColor === true }]
  })

  const keyed = (key: string): string | undefined => parts.find(part => part.props.key === key)?.text

  return { note: lines[2] ?? '', lines: lines.slice(3), rows, fold: keyed('more'), foot: keyed('foot') }
}

const seen = async ($: Engine, columns = 40, layout?: object): Promise<Card> => {
  const ui = await mount($, columns, layout)
  const drawn = await card(ui)
  await ui.unmount()

  return drawn
}

const BEST = {
  c5: failed('FAIL src/auth.test.ts\n1 failing'),
  g12: passed('[main 9d8e7f6] Fix the token refresh\n 2 files changed, 9 insertions(+), 4 deletions(-)'),
}

const best = async ($: Engine): Promise<void> => {
  await prompt($, 'fix the login test', 1)
  await prompt($, 'why is it failing', 2)
  await prompt($, 'show me the plan first', 3)
  await prompt($, 'go ahead', 4)
  await bash($, 'c5', 'npm test -- auth')
  await prompt($, 'what do you think of the schema', 5)
  await prompt($, 'ask me before you change it', 6)
  await call($, { tool: 'AskUserQuestion', tool_use_id: 'q8', questions: QUESTIONS })
  await edit($, 'e9', '/work/project/db/schema.sql')
  await bash($, 'c10', 'npm test -- auth')
  await prompt($, 'commit that', 7)
  await bash($, 'g12', 'git commit -am "Fix the token refresh"')
  await edit($, 'e13', '/work/project/README.md')
  await prompt($, 'now update the docs', 8)
  await read($, 'r14')
}

test('A1: the empty card says what will appear, with no note and no foot, and list and go 1 say there is nothing yet', WITH, async ($, on) => {
  await open($, on)

  for (const [at, [site, component]] of SITES.entries()) {
    await $.command.run(run('place', site))
    const ui = (await $.ui.mount(target(NAME, component, at === 1 ? 20 : 40))) as never as Drawing
    const keyed = Object.fromEntries((await ui.findAll({})).map(part => [String(part.props.key), part.text]))
    expect(keyed.title).toBe('Landmarks')
    expect(keyed.note).toBe('')
    expect(keyed.body).toBe(EMPTY)
    expect('foot' in keyed).toBe(false)
    await ui.unmount()
  }
  expect(await say($, 'list')).toBe('No landmarks yet.')
  expect(await say($, 'go 1')).toBe('No landmarks yet.')
})

test('A2: a prompt is listed by its first line, takes the first main call of its turn as its row, and stops waiting when the turn ends', WITH, async ($, on) => {
  await open($, on)

  await prompt($, '  fix the\n login test ', 1)
  expect(await say($, 'list')).toBe('1  t1  you: fix the (no row)')
  expect((await seen($)).rows).toEqual([{ label: '1 t1 you: fix the', fact: '', isButton: false, isDim: true }])

  await read($, 'r1')
  expect((await peek($)).marks).toEqual([{ id: 1, turn: 1, kind: 'you', label: 'fix the', row: 'r1', isNear: true, isGone: false }])
  expect((await seen($)).rows).toEqual([{ label: '1 t1 you: fix the', fact: 'near', isButton: true, isDim: false }])
  await read($, 'r2')
  expect((await peek($)).marks[0]?.row).toBe('r1')

  await prompt($, '', 2)
  await read($, 'r3')
  expect(await say($, 'list')).toBe('1  t1  you: fix the (near)')
  expect((await peek($)).turn).toBe(2)

  await prompt($, 'explain it to me, no changes', 3)
  await prompt($, '', 4)
  await read($, 'r4')
  expect(await say($, 'list')).toBe('1  t1  you: fix the (near)\n2  t3  you: explain it to me, no changes (no row)')
  expect((await peek($)).waiting).toBe(0)
})

test('A3: an Edit and a Write list a file once, however its path is spelled, and not when the edit failed or a subagent made it', WITH, async ($, on) => {
  await open($, on, { e5: failed('String to replace not found in file.') })

  await edit($, 'e1', '/work/project/src/a.ts')
  await call($, { tool: 'Write', tool_use_id: 'w2', file_path: '/work/project/b.ts' })
  await edit($, 'e3', '/work/project/src/a.ts')
  await edit($, 'e4', 'C:\\Repo\\a.ts')
  await call($, { tool: 'Write', tool_use_id: 'w4', file_path: 'c:/repo/a.ts' })
  await edit($, 'e5', '/work/project/c.ts')
  await call($, { tool: 'Edit', tool_use_id: 'e6', file_path: '/work/project/d.ts', agentId: 'agent-1' })
  expect(await say($, 'list')).toBe('1  t0  edit: a.ts\n2  t0  edit: b.ts\n3  t0  edit: a.ts')
  expect((await peek($)).marks.map(mark => mark.row)).toEqual(['e1', 'w2', 'e4'])

  await edit($, 'e7', '/work/project/c.ts')
  expect((await say($, 'list')).split('\n')[3]).toBe('4  t0  edit: c.ts')
})

test('A4: checks add red and green only when the mood turns, by the regex of checks-widget', WITH, async ($, on) => {
  const words = ['test', 'tests', 'pytest', 'jest', 'vitest', 'tsc', 'lint', 'eslint', 'build', 'check', 'clippy']
  await open($, on, failing('x1', 'c1', 'c2', 'c5', ...words.flatMap((_, at) => (at % 2 === 0 ? [`w${at}`] : []))))

  await bash($, 'p1', 'bun run lint')
  await bash($, 'x1', 'echo hi')
  expect(await say($, 'list')).toBe('No landmarks yet.')

  await bash($, 'c1', 'npm test\necho done')
  await bash($, 'c2', 'npm test')
  await bash($, 'c3', 'npm test')
  await bash($, 'c4', 'npm test')
  await bash($, 'c5', 'npm test')
  expect(await say($, 'list')).toBe('1  t0  red: npm test\n2  t0  green: npm test\n3  t0  red: npm test')
  expect((await peek($)).marks.map(mark => mark.row)).toEqual(['c1', 'c3', 'c5'])

  await say($, 'clear')
  for (const [at, word] of words.entries()) await bash($, `w${at}`, `run ${word} --all`)
  const turns = words.map((word, at) => `${at + 1}  t0  ${at % 2 === 0 ? 'red' : 'green'}: run ${word} --all`).join('\n')
  expect(await say($, 'list')).toBe(turns)
  for (const [at, command] of ['run testing', 'rebuild', 'run checks'].entries()) await bash($, `n${at}`, command)
  expect(await say($, 'list')).toBe(turns)
})

test('A5: a commit is listed by its subject, after the check of the same call, and only when commit is the subcommand git ran', WITH, async ($, on) => {
  await open($, on, {
    g1: passed('[main 3f2a1c9] Fix the sum\n 1 file changed, 1 insertion(+), 1 deletion(-)'),
    g3: failed('nothing to commit, working tree clean'),
    c4: failed('1 failing'),
    g5: passed('> app@1.0.0 test\n> bun test\n\n 3 pass\n 0 fail\n[fix/login 9d8e7f6] Fix the token refresh\n 2 files changed'),
    g6: passed('3f2a1c9 commit one'),
  })

  await bash($, 'g1', 'git commit -m x')
  await bash($, 'g2', 'git commit -m x')
  await bash($, 'g3', 'git commit -m x')
  await bash($, 'c4', 'npm test')
  await bash($, 'g5', 'npm test && git commit -m x')
  await bash($, 'g6', 'git log | grep commit')
  await bash($, 'g7', 'git commit-graph write')
  await bash($, 'g8', 'git -C /work/project commit -m x')
  expect(await say($, 'list')).toBe(
    ['1  t0  commit: Fix the sum', '2  t0  commit', '3  t0  red: npm test', '4  t0  green: npm test && git commit -m x', '5  t0  commit: Fix the token refresh', '6  t0  commit'].join('\n'),
  )
  expect((await peek($)).marks.map(mark => mark.row)).toEqual(['g1', 'g2', 'c4', 'g5', 'g5', 'g8'])
})

test('A6: a question is listed on its row, a denied call is not a main call, and every call gets back what the engine answered', WITH, async ($, on) => {
  const denied = { deny: 'Blocked by the permission rules.' }
  const odd = passed('ok')
  await open($, on, { d1: denied, m1: odd, m2: odd })

  await prompt($, 'pick a schema', 1)
  expect(await bash($, 'd1', 'npm test')).toEqual(denied)
  expect((await peek($)).marks).toEqual([{ id: 1, turn: 1, kind: 'you', label: 'pick a schema', row: '', isNear: false, isGone: false }])

  const input = { tool: 'AskUserQuestion', tool_use_id: 'q1', questions: QUESTIONS }
  expect(await call($, input)).toEqual(real(input))
  expect(await say($, 'list')).toBe('1  t1  you: pick a schema (near)\n2  t1  asked: Which schema do we keep?')
  expect((await peek($)).marks.map(mark => mark.row)).toEqual(['q1', 'q1'])

  expect(await call($, { tool: 'Bash', tool_use_id: 'm1' })).toEqual(odd)
  expect(await call($, { tool: 'AskUserQuestion', tool_use_id: 'm2' })).toEqual(odd)
  expect(await edit($, 'e1', '/work/project/a.ts')).toEqual(real({ tool: 'Edit', file_path: '/work/project/a.ts' }))
  expect((await say($, 'list')).split('\n')).toHaveLength(3)
})

test('A7: a press on go:3 and go 3 each take the jump to the engine, which throws here, and put that answer in the foot row; the moved answer is not exercised', WITH, async ($, on) => {
  await open($, on, failing('c1'))
  await prompt($, 'fix the login test', 1)
  await edit($, 'e1', '/work/project/src/auth.ts')
  await bash($, 'c1', 'npm test')
  expect((await seen($)).foot).toBe('Press a line or go <n>')
  expect((await peek($)).said).toBe('')
  expect((await peek($)).marks.some(mark => mark.isGone)).toBe(false)

  const ui = await mount($)
  await ui.press({ key: 'go:3' })
  expect((await card(ui)).foot).toBe(`3${CUT}`)
  await ui.unmount()

  expect(await say($, 'go 1')).toBe(`1 did not move: ${THROWN}`)
  expect((await seen($)).foot).toBe(`1${CUT}`)
})

test('A8: a jump the engine throws at answers n did not move with its message, and draws the row dim, gone and still a Button; a chosen deny and the clearing of gone are not exercised', WITH, async ($, on) => {
  await open($, on, failing('c1'))
  await prompt($, 'fix the login test', 1)

  for (const layout of [{ isFullscreen: true }, {}]) {
    await say($, 'clear')
    await edit($, 'e1', '/work/project/src/auth.ts')
    await bash($, 'c1', 'npm test')
    const ui = await mount($, 40, layout)
    await ui.press({ key: 'go:2' })
    const drawn = await card(ui)
    expect(drawn.rows).toEqual([
      { label: '1 t1 edit: auth.ts', fact: '', isButton: true, isDim: false },
      { label: '2 t1 red: npm test', fact: 'gone', isButton: true, isDim: true },
    ])
    expect(drawn.foot).toBe(`2${CUT}`)
    await ui.unmount()
  }
  expect(await say($, 'go 1')).toBe(`1 did not move: ${THROWN}`)
  expect(await say($, 'list')).toBe('1  t1  edit: auth.ts (gone)\n2  t1  red: npm test (gone)')
})

test('A9: in the default layout the foot row says jumping needs fullscreen, and a jump the engine throws at says so and marks nothing gone; a chosen deny is not exercised', WITH, async ($, on) => {
  await open($, on, failing('c1'))
  await prompt($, 'fix the login test', 1)
  await edit($, 'e1', '/work/project/src/auth.ts')
  await bash($, 'c1', 'npm test')

  const ui = await mount($, 40, { isFullscreen: false })
  expect((await card(ui)).foot).toBe('Jumping needs the fullscreen layout')
  await ui.press({ key: 'go:3' })
  expect((await card(ui)).foot).toBe('Jumping needs the fullscreen layout')
  expect((await card(ui)).rows.map(row => row.fact)).toEqual(['near', '', ''])
  await ui.unmount()
  expect((await peek($)).said).toBe(`Jumping needs the fullscreen layout (${THROWN}).`)

  expect(await say($, 'go 2', false)).toBe(`Jumping needs the fullscreen layout (${THROWN}).`)
  expect((await peek($)).marks.some(mark => mark.isGone)).toBe(false)
  expect((await seen($, 20, { isFullscreen: false })).foot).toBe('Needs fullscreen')
})

test('A10: go names a prompt with no row, a number not held, and answers the usage for anything that is not one whole number above 0', WITH, async ($, on) => {
  await open($, on, failing('c1'))
  await prompt($, 'what does the login test check', 1)
  await prompt($, '', 2)
  await edit($, 'e1', '/work/project/src/auth.ts')
  await bash($, 'c1', 'npm test')

  expect(await say($, 'go 1')).toBe('Landmark 1 has no row: its turn made no tool call.')
  expect(await say($, 'go 99')).toBe('No landmark 99. The list holds 1 to 3.')
  expect(await say($, 'go 99999999999999999999')).toBe('No landmark 99999999999999999999. The list holds 1 to 3.')
  for (const args of ['go', 'go x', 'go 0', 'go 1.5', 'go -1', 'go 3 extra', 'what', 'list all', 'on now']) expect(await say($, args)).toBe(USAGE)
  for (const verb of ['on', 'off', 'list', 'go <n>', 'clear']) expect(USAGE).toContain(verb)
  expect((await peek($)).said).toBe('')
  expect((await peek($)).marks.some(mark => mark.isGone)).toBe(false)

  expect(await say($, 'GO 003')).toBe(`3 did not move: ${THROWN}`)
  expect(await say($, 'LIST')).toBe('1  t1  you: what does the login test check (no row)\n2  t2  edit: auth.ts\n3  t2  red: npm test (gone)')
})

test('A11: past eight landmarks the card keeps seven, events before prompts, under a row counting the rest', WITH, async ($, on) => {
  await open($, on, BEST)
  await best($)

  const drawn = await seen($)
  expect(drawn.note).toBe('14 landmarks')
  expect(drawn.lines).toEqual([
    '… 7 more in /landmarks-widget list',
    ' 5 t4 red: npm test -- auth',
    ' 8 t6 asked: Which schema do we kee…',
    ' 9 t6 edit: schema.sql',
    '10 t6 green: npm test -- auth',
    '12 t7 commit: Fix the token refresh',
    '13 t7 edit: README.md',
    '14 t8 you: now update the docs',
    'near',
    'Press a line or go <n>',
  ])
  expect(await say($, 'go 1')).toBe('Landmark 1 has no row: its turn made no tool call.')
  expect(await say($, 'go 4')).toBe(`4 did not move: ${THROWN}`)

  await say($, 'clear')
  for (let at = 1; at <= 8; at += 1) await edit($, `e${at}`, `/work/project/src/part${at}.ts`)
  const eight = await seen($)
  expect(eight.fold).toBeUndefined()
  expect(eight.rows.map(row => row.label)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(at => `${at} t8 edit: part${at}.ts`))

  await prompt($, 'one more', 9)
  await edit($, 'e9', '/work/project/src/part9.ts')
  const nine = await seen($)
  expect(nine.fold).toBe('… 3 more in /landmarks-widget list')
  expect(nine.rows.map(row => row.label)).toEqual([...[3, 4, 5, 6, 7, 8].map(at => ` ${at} t8 edit: part${at}.ts`), '10 t9 edit: part9.ts'])
  expect(await say($, 'go 1')).toBe(`1 did not move: ${THROWN}`)
})

test('A12: list gives every held landmark oldest first with its marks, and the 201st drops number 1', WITH, async ($, on) => {
  const rounds = Array.from({ length: 63 }, (_, at) => at)
  await open($, on, failing('c1', ...rounds.map(at => `f${at}`)))
  await prompt($, 'what does the login test check', 1)
  await prompt($, 'fix it', 2)
  await edit($, 'e1', '/work/project/src/auth.ts')
  await bash($, 'c1', 'npm test')
  await say($, 'go 2')
  await say($, 'go 4')
  expect(await say($, 'list')).toBe(
    ['1  t1  you: what does the login test check (no row)', '2  t2  you: fix it (near) (gone)', '3  t2  edit: auth.ts', '4  t2  red: npm test (gone)'].join('\n'),
  )

  for (const at of rounds) {
    await bash($, `g${at}`, 'npm test && git commit -qm wip')
    await bash($, `f${at}`, 'npm test')
  }
  expect((await say($, 'list')).split('\n').slice(4, 7)).toEqual(['5  t2  green: npm test && git commit -qm wip', '6  t2  commit', '7  t2  red: npm test'])
  for (let at = 194; at <= 200; at += 1) await edit($, `e${at}`, `/work/project/src/part${at}.ts`)
  expect((await say($, 'list')).split('\n')).toHaveLength(200)
  expect(await say($, 'go 1')).toBe('Landmark 1 has no row: its turn made no tool call.')

  await edit($, 'e201', '/work/project/src/part201.ts')
  const lines = (await say($, 'list')).split('\n')
  expect(lines).toHaveLength(200)
  expect(lines[0]).toBe('2  t2  you: fix it (near) (gone)')
  expect(lines[199]).toBe('201  t2  edit: part201.ts')
  expect(await say($, 'go 1')).toBe('No landmark 1. The list holds 2 to 201.')

  const narrow = await seen($, 20)
  expect(narrow.note).toBe('200')
  expect(narrow.fold).toBe('… 193 more')
  expect(narrow.rows.map(row => row.label)).toEqual([195, 196, 197, 198, 199, 200, 201].map(at => `${at} edit: part${String(at).charAt(0)}…`))
  expect((await seen($)).fold).toBe('… 193 more in /landmarks-widget list')
})

test('A13: clear empties the list, the edited files, the mood and the last answer, and keeps the turn count', WITH, async ($, on) => {
  await open($, on, failing('c1'))
  await prompt($, 'fix the login test', 1)
  await edit($, 'e1', '/work/project/src/auth.ts')
  await bash($, 'c1', 'npm test')
  await say($, 'go 3')

  expect(await say($, 'clear')).toBe('Landmarks cleared.')
  expect(await peek($)).toEqual({ ...REST, turn: 1 })
  expect((await seen($)).lines).toEqual([EMPTY])

  await bash($, 'c2', 'npm test')
  expect(await say($, 'list')).toBe('No landmarks yet.')
  await edit($, 'e2', '/work/project/src/auth.ts')
  await prompt($, 'and the docs', 2)
  expect(await say($, 'list')).toBe('1  t1  edit: auth.ts\n2  t2  you: and the docs (no row)')
})

test('A14: while off the verbs say so and nothing is collected, and switching off empties the trail', WITH, async ($, on) => {
  await open($, on)
  await prompt($, 'fix the login test', 1)
  await edit($, 'e1', '/work/project/src/auth.ts')
  expect((await peek($)).marks).toHaveLength(2)

  await say($, 'off')
  expect(await peek($)).toEqual(REST)
  for (const args of ['list', 'go 1', 'clear']) expect(await say($, args)).toBe('Landmarks is off.')
  await prompt($, 'now the docs', 2)
  await edit($, 'e2', '/work/project/README.md')
  await call($, { tool: 'AskUserQuestion', tool_use_id: 'q1', questions: QUESTIONS })
  expect(await peek($)).toEqual(REST)

  await say($, 'on')
  expect((await seen($)).lines).toEqual([EMPTY])
  await prompt($, 'and the changelog', 3)
  expect(await say($, 'list')).toBe('1  t1  you: and the changelog (no row)')
})

test('A15: at 20, 40 and 60 columns every row fits the card, a long line ends in … after its whole number, and a narrow card drops the turn and the facts', WITH, async ($, on) => {
  const cells = (text: string): number => [...text].reduce((sum, letter) => sum + ((letter.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1), 0)
  await open($, on, BEST)
  await best($)
  await prompt($, '日本語のテストを直してください、それからドキュメントも更新してください', 9)
  await read($, 'r15')
  await say($, 'go 5')
  await $.command.run(run('widen', `${NAME} 60`))

  const lines: string[] = []
  for (const [columns, inner] of [[20, 16], [40, 36], [60, 56]] as const) {
    const drawn = await seen($, columns, { isFullscreen: columns !== 40 })
    const isWide = columns >= 30
    expect(drawn.rows.map(row => row.label.slice(0, 3))).toEqual([' 5 ', ' 8 ', ' 9 ', '10 ', '12 ', '13 ', '15 '])
    for (const row of drawn.rows) {
      expect(cells(row.label) + (row.fact === '' ? 0 : row.fact.length + 1)).toBeLessThanOrEqual(inner)
      expect(/^[ \d]\d t\d+ /.test(row.label)).toBe(isWide)
    }
    expect(drawn.rows.map(row => row.fact)).toEqual(isWide ? ['gone', '', '', '', '', '', 'near'] : ['', '', '', '', '', '', ''])
    expect(drawn.note).toBe(isWide ? '15 landmarks' : '15')
    expect(drawn.fold).toBe(isWide ? '… 8 more in /landmarks-widget list' : '… 8 more')
    expect(cells(drawn.foot ?? '')).toBeLessThanOrEqual(inner)
    expect(drawn.rows.at(-1)?.label.endsWith('…')).toBe(true)
    if (columns === 20) lines.push(...drawn.lines)
  }

  expect(lines).toEqual([
    '… 8 more',
    ' 5 red: npm tes…',
    ' 8 asked: Which…',
    ' 9 edit: schema…',
    '10 green: npm t…',
    '12 commit: Fix …',
    '13 edit: README…',
    '15 you: 日本語…',
    '5 did not move:…',
  ])
  await say($, 'clear')
  await edit($, 'e1', '/work/project/src/auth.ts')
  expect((await seen($, 20)).foot).toBe('go <n> jumps')
  expect((await seen($, 60)).rows).toEqual([{ label: '1 t9 edit: auth.ts', fact: '', isButton: true, isDim: false }])
})

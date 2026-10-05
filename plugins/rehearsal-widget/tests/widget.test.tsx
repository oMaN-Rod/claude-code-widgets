import { expect, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

import { shapeOf } from '../hooks/register'
import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'

type Fields = Record<string, unknown>
type Stored = { key: string; tool: string; input: Fields; label: string; seenAt: number }
type Held = Stored & { isKept: boolean }
type Verdict = { decision: string; why: string }
type Cell<Value> = { value?: Value; version: number }
type Peek = {
  isOn: Cell<boolean>
  book: Cell<{ key: string; name: string; root: string; isDirty: boolean; calls: Held[] }>
  verdicts: Cell<Record<string, Verdict>>
  run: Cell<{ mode: string; isRehearsing: boolean; shown: string[] }>
}
type Rules = { deny?: Record<string, string>; ask?: Record<string, string>; allow?: Record<string, string>; slowMs?: number }
type Part = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
type Card = { isDrawn: boolean; note: string; lines: string[] }
type Host = {
  command: { run: (e: never) => Promise<{ text?: string }> }
  ui: { mount: (e: never) => Promise<{ drawn: () => Promise<unknown>; unmount: () => Promise<void> }> }
}

const NAME = 'rehearsal-widget'
const NOW = 1_700_000_000_000
const ROOT = '/work/project'
const LIST = 'calls:/work/project'
const WRITE = `store ${LIST}`
const TICK = 5000
const USAGE = 'Usage: /rehearsal-widget [on|off|show|forget <n>|clear]'
const OFF = 'Rehearsal is off.'
const FOOT = 'By the rules as they stand; PreToolUse hooks and the auto-mode classifier are not asked.'
const EMPTY = 'No calls seen in this project yet. Each kind Claude makes is kept and put to the permission check, unrun.'
const CAVEAT = ['By the rules now. Hooks are not', 'asked; a new kind of call may ask.']
const ALLOWED = [
  'git status',
  'git diff',
  'git log --oneline',
  'git add -A',
  'git branch',
  'git stash list',
  'git fetch',
  'git show HEAD',
  'git remote -v',
  'npm test',
  'npm run build',
  'npm run lint',
  'bun test',
  'bun run check',
  'ls -la',
  'pwd',
  'cat README.md',
  'node --version',
  'tsc --noEmit',
  'eslint src',
  'prettier --check src',
  'grep -rn TODO src',
  'wc -l README.md',
  'head -20 package.json',
  'which bun',
  'echo done',
  'mkdir -p dist',
  'date',
  'whoami',
  'df -h',
  'du -sh dist',
  'uname -a',
  'docker ps',
]
const STOPS: Rules = { deny: { 'rm -rf': '' }, ask: { 'bun install': '', 'git push': '', '/work/shared': '' } }

// The test host of 2.1.289 skips a hook beneath the widget that throws or answers a verdict it cannot read, and the
// kit's own allow answers instead, so no hook can make a query reject. The host does refuse a query for a tool with
// no name, which is how a stored call whose tool has gone is stood in for here.
const GONE: Stored = { key: 'mcp__github__create_issue', tool: '', input: {}, label: 'mcp__github__create_issue', seenAt: NOW - 90_000 }

const RULES: Plugin = {
  name: 'rules',
  register(on) {
    const desk = { deny: {} as Record<string, string>, ask: {} as Record<string, string>, allow: {} as Record<string, string>, slowMs: 0, queries: [] as unknown[] }
    on('tool.check', async ($, e) => {
      if (e.tool_use_id === undefined) desk.queries.push({ tool: e.tool, input: e.input })
      if (e.tool_use_id === undefined && desk.slowMs > 0) await $.clock.sleep(desk.slowMs)

      const text = JSON.stringify(e.input)
      for (const decision of ['deny', 'ask', 'allow'] as const) {
        const hit = Object.keys(desk[decision]).find(part => text.includes(part))
        if (hit !== undefined) return { decision, ...(desk[decision][hit] === '' ? {} : { rule: desk[decision][hit] }) }
      }

      return { decision: 'allow' as const }
    })
    on('command.run', { command: 'rules' }, async (_$, e) => {
      Object.assign(desk, { deny: {}, ask: {}, allow: {}, slowMs: 0 }, JSON.parse(e.args))

      return { text: 'set' }
    })
    on('command.run', { command: 'queries' }, async () => ({ text: JSON.stringify(desk.queries.splice(0)) }))
    on('command.run', { command: 'peek' }, async $ => ({
      text: JSON.stringify({
        isOn: await $.state.get({ plugin: 'rehearsal-widget', key: 'isOn' } as const),
        book: await $.state.get({ plugin: 'rehearsal-widget', key: 'book' } as const),
        verdicts: await $.state.get({ plugin: 'rehearsal-widget', key: 'verdicts' } as const),
        run: await $.state.get({ plugin: 'rehearsal-widget', key: 'run' } as const),
      }),
    }))
  },
}

const WITH = { plugins: [LAYOUT, RULES] }

const bash = (command: string, description = 'Run the command'): Fields => ({ command, description })

const stored = (tool: string, input: Fields, seenAt = NOW - 60_000, root = ROOT): Stored => ({ ...shapeOf(tool, input, root), tool, seenAt })

const full = (root = ROOT): Stored[] => [
  ...ALLOWED.map((command, at) => stored('Bash', bash(command), NOW - 600_000 + at * 1000, root)),
  stored('Read', { file_path: `${root}/src/sum.js` }, NOW - 500_000, root),
  stored('Edit', { file_path: `${root}/src/sum.js`, old_string: 'a - b', new_string: 'a + b' }, NOW - 499_000, root),
  stored('Grep', { pattern: 'sum\\(', path: `${root}/src`, output_mode: 'content' }, NOW - 498_000, root),
  stored('Bash', bash('rm -rf build'), NOW - 497_000, root),
  stored('Bash', bash('bun install'), NOW - 496_000, root),
  stored('Bash', bash('git push origin main'), NOW - 495_000, root),
  stored('Write', { file_path: root === ROOT ? '/work/shared/config.json' : 'C:\\Work\\shared\\config.json', content: '{}' }, NOW - 494_000, root),
]

const few = (): Stored[] => [stored('Bash', bash('bun install')), stored('Bash', bash('git push origin main')), stored('Bash', bash('npm test'))]

const said = async ($: Host, command: string, args = ''): Promise<string> => (await $.command.run(run(command, args) as never)).text ?? ''

const rule = ($: Host, rules: Rules): Promise<string> => said($, 'rules', JSON.stringify(rules))

const queries = async ($: Host): Promise<{ tool: string; input: Fields }[]> => JSON.parse(await said($, 'queries'))

const peek = async ($: Host): Promise<Peek> => JSON.parse(await said($, 'peek'))

const text = (node: unknown): string =>
  typeof node === 'string' ? node : typeof node === 'object' && node !== null ? ((node as Part).children ?? []).map(text).join('') : ''

const keyed = (node: unknown, key: string): Part | undefined => {
  if (typeof node !== 'object' || node === null) return undefined
  if ((node as Part).props?.key === key) return node as Part

  return ((node as Part).children ?? []).map(kid => keyed(kid, key)).find(found => found !== undefined)
}

const card = async ($: Host, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Card> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const tree = await ui.drawn()
  await ui.unmount()
  const body = keyed(tree, 'body')?.children?.[0] as Part | undefined

  return { isDrawn: keyed(tree, 'card') !== undefined, note: text(keyed(tree, 'note')), lines: (body?.children ?? []).map(text) }
}

const fits = (shown: Card, width: number): boolean =>
  shown.lines.every(line => [...line].length <= width - 4) && 'Rehearsal'.length + (shown.note === '' ? 0 : 1 + shown.note.length) <= width - 4

test('A1: an empty project shows the empty sentences with no note in all three placements and ticks ask nothing', WITH, async ($, on) => {
  const world = ground(on)

  await session($)
  await said($, NAME, 'on')
  for (const [site, component] of SITES) {
    await said($, 'place', site)
    const shown = await card($, 40, component)
    expect(shown.isDrawn).toBe(true)
    expect(shown.note).toBe('')
    expect(shown.lines).toEqual(['No calls seen in this project yet.', 'Each kind Claude makes is kept and', 'put to the permission check, unrun.'])
    expect(shown.lines.join(' ')).toBe(EMPTY)
  }

  await world.clock.advance(6 * TICK)
  expect(await queries($)).toEqual([])
})

test('A2: a real check resolves to what next gave and is collected with that verdict, a query is not, a repeat replaces the example', WITH, async ($, on) => {
  const world = ground(on)

  await session($)
  await said($, 'place', 'side')
  await said($, NAME, 'on')
  await rule($, { ask: { 'git push': 'Bash(git push:*)' } })

  const first = await $.tool.check({ tool: 'Bash', input: bash('git push origin main', 'Publish the branch'), tool_use_id: 'toolu_01' })
  expect(first).toEqual({ decision: 'ask', rule: 'Bash(git push:*)' })
  const one = await peek($)
  expect(one.book.value?.calls).toEqual([
    { key: 'Bash:git push origin', tool: 'Bash', input: { command: 'git push origin main', description: '' }, label: 'git push origin main', seenAt: NOW, isKept: true },
  ])
  expect(one.verdicts.value).toEqual({ 'Bash:git push origin': { decision: 'ask', why: 'Bash(git push:*)' } })

  expect(await $.tool.check({ tool: 'Bash', input: bash('npm test') })).toEqual({ decision: 'allow' })
  expect((await peek($)).book.value?.calls.length).toBe(1)

  await world.clock.advance(1000)
  await $.tool.check({ tool: 'Bash', input: bash('git push origin release'), tool_use_id: 'toolu_02' })
  const two = await peek($)
  expect(two.book.value?.calls.map(call => [call.key, call.label, call.seenAt])).toEqual([['Bash:git push origin', 'git push origin release', NOW + 1000]])
  expect((await card($)).lines).toEqual(['Would stop and ask: 1 of 1', '? git push origin release', 'None would run by the rules.'])
})

test('A3: shapeOf keys commands by their leading words, paths by where they sit and urls by host, and blanks every other string', WITH, async () => {
  const root = 'C:\\Work\\App'
  const key = (tool: string, input: unknown): string => shapeOf(tool, input, root).key

  expect(key('Bash', bash('git push --force'))).toBe('Bash:git push --force')
  expect(key('Bash', bash('git push origin main'))).toBe('Bash:git push origin')
  expect(shapeOf('Bash', bash('cd /c/x && bun test tests/a.test.ts'), root)).toEqual({
    key: 'Bash:bun test',
    label: 'cd /c/x && bun test tests/a.test.ts',
    input: { command: 'cd /c/x && bun test tests/a.test.ts', description: '' },
  })
  expect(key('Bash', bash('cd packages/app; bun test'))).toBe('Bash:bun test')
  expect(key('Bash', bash('npm test | tee out.log'))).toBe('Bash:npm test')
  expect(shapeOf('Bash', bash('git   status\n  --short'), root).label).toBe('git status --short')
  expect(key('PowerShell', bash('git commit -am "x"'))).toBe('PowerShell:git commit -am')

  expect(shapeOf('Write', { file_path: 'c:/work/app/src/a.ts', content: 'export {}' }, root)).toEqual({
    key: 'Write:in',
    label: 'Write src/a.ts',
    input: { file_path: 'c:/work/app/src/a.ts', content: '' },
  })
  expect(shapeOf('Write', { file_path: 'C:\\Work\\App\\src\\Sum.ts', content: '' }, root).label).toBe('Write src/Sum.ts')
  expect(key('Write', { file_path: 'src/a.ts', content: '' })).toBe('Write:in')
  expect(key('Write', { file_path: 'C:\\Work\\App\\.env', content: 'KEY=1' })).toBe('Write:dot')
  expect(key('Write', { file_path: 'c:/work/app/.github/a.yml', content: '' })).toBe('Write:dot')
  expect(shapeOf('Write', { file_path: 'C:\\Work\\Shared\\config.json', content: '{}' }, root)).toEqual({
    key: 'Write:out',
    label: 'Write ../Shared/config.json',
    input: { file_path: 'C:\\Work\\Shared\\config.json', content: '' },
  })
  expect(shapeOf('Write', { file_path: 'D:\\Temp\\notes.txt', content: '' }, root).label).toBe('Write D:/Temp/notes.txt')
  expect(shapeOf('Write', { file_path: '..\\shared\\config.json', content: '' }, root)).toEqual({
    key: 'Write:out',
    label: 'Write ../shared/config.json',
    input: { file_path: '..\\shared\\config.json', content: '' },
  })
  expect(key('Read', { file_path: 'C:\\Work\\Application\\a.ts' })).toBe('Read:out')
  expect(key('NotebookEdit', { notebook_path: 'c:/work/app/notes/plan.ipynb', new_source: 'x = 1' })).toBe('NotebookEdit:in')
  expect(shapeOf('Grep', { pattern: 'TODO', path: 'C:\\Work\\App\\src' }, root)).toEqual({ key: 'Grep:in', label: 'Grep src', input: { pattern: '', path: 'C:\\Work\\App\\src' } })

  expect(shapeOf('WebFetch', { url: 'https://example.com/docs?page=2', prompt: 'Summarize the page' }, root)).toEqual({
    key: 'WebFetch:example.com',
    label: 'WebFetch example.com',
    input: { url: 'https://example.com/docs?page=2', prompt: '' },
  })
  expect(shapeOf('mcp__github__create_issue', { title: 'Bug', labels: ['bug'] }, root)).toEqual({
    key: 'mcp__github__create_issue',
    label: 'mcp__github__create_issue',
    input: {},
  })
  for (const input of ['git status', null, undefined, ['git status'], { command: '' }, { url: 'not a url' }]) {
    expect(shapeOf('Bash', input, root)).toEqual({ key: 'Bash', label: 'Bash', input: {} })
  }

  expect(shapeOf('Edit', { file_path: 'c:/work/app/src/a.ts', old_string: 'a - b', new_string: 'a + b', replace_all: true }, root).input).toEqual({
    file_path: 'c:/work/app/src/a.ts',
    old_string: '',
    new_string: '',
    replace_all: true,
  })
  expect(shapeOf('Bash', { command: 'npm test', description: 'Run the tests', timeout: 120_000, run_in_background: false }, root).input).toEqual({
    command: 'npm test',
    description: '',
    timeout: 120_000,
    run_in_background: false,
  })
})

test('A4: refused, ask and would-run rows are drawn in order with the count in the note, four call rows at most, and the rule at 60 columns', WITH, async ($, on) => {
  const world = ground(on, { store: { isOn: true, [LIST]: full() } })

  await rule($, STOPS)
  await session($)
  await world.clock.settle()
  await said($, 'place', 'side')
  expect(await card($)).toEqual({
    isDrawn: true,
    note: '4 of 40',
    lines: [
      'Would be refused: 1 of 40',
      '✗ rm -rf build',
      'Would stop and ask: 3 of 40',
      '? bun install',
      '? git push origin main',
      '? Write ../shared/config.json',
      '36 would run by the rules.',
    ],
  })

  await rule($, { ask: { 'bun install': 'Bash(bun install:*)', 'git push': '', '/work/shared': '', 'git fetch': '', 'docker ps': '', 'rm -rf': '' } })
  await world.clock.advance(TICK)
  expect(await card($)).toEqual({
    isDrawn: true,
    note: '6 of 40',
    lines: ['Would stop and ask: 6 of 40', '? bun install', '? docker ps', '? git fetch', '? git push origin main', 'and 2 more', '34 would run by the rules.'],
  })

  await said($, 'widen', `${NAME} 60`)
  const wide = await card($, 90)
  expect(wide.lines[1]).toBe('? bun install · Bash(bun install:*)')
  expect(wide.lines[2]).toBe('? docker ps')
})

test('A5: when every verdict is allow the card says all clear with the two caveat lines and no call row', WITH, async ($, on) => {
  const world = ground(on, { store: { isOn: true, [LIST]: full() } })

  await session($)
  await world.clock.settle()
  await said($, 'place', 'side')
  const shown = await card($)
  expect(shown).toEqual({ isDrawn: true, note: 'all clear', lines: ['All 40 calls seen here would run.', ...CAVEAT] })
  expect(shown.lines.some(line => /^[✗?!] /.test(line))).toBe(false)

  await said($, NAME, 'clear')
  await $.tool.check({ tool: 'Bash', input: bash('npm test'), tool_use_id: 'toolu_01' })
  expect((await card($)).lines).toEqual(['All 1 call seen here would run.', ...CAVEAT])
})

test('A6: each tick asks once per held call with the stored input, a changed answer moves the card, an unchanged one writes no verdicts, a busy one asks nothing', WITH, async ($, on) => {
  const held = few()
  const world = ground(on, { store: { isOn: true, [LIST]: held } })

  await rule($, { ask: { 'bun install': '', 'git push': '' } })
  await session($)
  await world.clock.settle()
  await said($, 'place', 'side')
  await queries($)
  expect((await card($)).lines).toEqual(['Would stop and ask: 2 of 3', '? bun install', '? git push origin main', '1 would run by the rules.'])

  await world.clock.advance(TICK)
  expect(await queries($)).toEqual(held.map(({ tool, input }) => ({ tool, input })))

  const before = await peek($)
  await world.clock.advance(TICK)
  const after = await peek($)
  expect(await queries($)).toHaveLength(3)
  expect([after.verdicts.version, after.book.version]).toEqual([before.verdicts.version, before.book.version])

  await rule($, { ask: { 'git push': '' }, allow: { 'bun install': 'Bash(bun install:*)' } })
  await world.clock.advance(TICK)
  expect(await card($)).toEqual({ isDrawn: true, note: '1 of 3', lines: ['Would stop and ask: 1 of 3', '? git push origin main', '2 would run by the rules.'] })
  expect((await peek($)).verdicts.value?.['Bash:bun install']).toEqual({ decision: 'allow', why: 'Bash(bun install:*)' })

  await queries($)
  await rule($, { ask: { 'git push': '' }, slowMs: 12_000 })
  await world.clock.advance(TICK)
  expect(await queries($)).toHaveLength(1)
  expect((await peek($)).run.value?.isRehearsing).toBe(true)
  await world.clock.advance(TICK)
  expect(await queries($)).toEqual([])
})

test('A7: a classic event with a new permission mode passes through, rehearses once and rewords the card; PreToolUse changes nothing', WITH, async ($, on) => {
  const world = ground(on, { store: { isOn: true, [LIST]: few() } })
  on('classic.UserPromptSubmit', async () => ({ stopReason: 'kept' }))
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))
  const prompt = async (mode?: string): Promise<unknown> => {
    const answer = await $.classic.UserPromptSubmit({ prompt: 'Ship it', ...(mode === undefined ? {} : { permission_mode: mode }) })
    await world.clock.settle()

    return answer
  }

  await rule($, { ask: { 'bun install': '', 'git push': '' } })
  await session($)
  await world.clock.settle()
  await said($, 'place', 'side')
  await queries($)
  const dialog = { isDrawn: true, note: '2 of 3', lines: ['Would stop and ask: 2 of 3', '? bun install', '? git push origin main', '1 would run by the rules.'] }
  expect(await card($)).toEqual(dialog)

  expect(await prompt('auto')).toEqual({ stopReason: 'kept' })
  expect(await queries($)).toHaveLength(3)
  expect(await card($)).toEqual({
    isDrawn: true,
    note: 'auto',
    lines: ['Not settled by rules: 2 of 3', '? bun install', '? git push origin main', '1 would run by the rules.', 'auto mode decides these, no dialog.'],
  })
  await prompt('auto')
  expect(await queries($)).toEqual([])

  await prompt('bypassPermissions')
  const bypass = await card($)
  expect([bypass.note, bypass.lines[0], bypass.lines.at(-1)]).toEqual(['bypass', 'Not settled by rules: 2 of 3', 'bypass decides these, no dialog.'])
  await prompt('dontAsk')
  expect((await card($)).lines.at(-1)).toBe('dontAsk decides these, no dialog.')
  expect((await card($, 20)).note).toBe('noask')

  for (const mode of ['acceptEdits', 'plan', 'default']) {
    await prompt(mode)
    expect(await card($)).toEqual(dialog)
  }
  await prompt()
  expect((await peek($)).run.value?.mode).toBe('default')
  expect(await card($)).toEqual(dialog)

  await queries($)
  const ran = await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_01', command: 'npm test' })
  await world.clock.settle()
  expect(ran.text).toBe('ok')
  expect((await peek($)).run.value?.mode).toBe('default')
  expect(await queries($)).toEqual([])

  await rule($, {})
  await prompt('auto')
  expect(await card($)).toEqual({ isDrawn: true, note: 'auto', lines: ['All 3 calls seen here would run.', ...CAVEAT] })
})

test('A8: a query that rejects marks only its own call unchecked, every query rejecting is the error card, and real checks still pass through', WITH, async ($, on) => {
  const world = ground(on, { store: { isOn: true, [LIST]: [stored('Bash', bash('bun install')), GONE, stored('Bash', bash('npm test'))] } })

  await rule($, { ask: { 'bun install': '' } })
  await session($)
  await world.clock.settle()
  await said($, 'place', 'side')
  expect(await card($)).toEqual({
    isDrawn: true,
    note: '1 of 3',
    lines: ['Would stop and ask: 1 of 3', '? bun install', '1 call could not be checked', '! mcp__github__create_issue', '1 would run by the rules.'],
  })
  expect((await peek($)).verdicts.value).toEqual({
    'Bash:bun install': { decision: 'ask', why: '' },
    mcp__github__create_issue: { decision: 'unknown', why: '' },
    'Bash:npm test': { decision: 'allow', why: '' },
  })
  expect((await card($, 20)).lines).toEqual(['1 of 3 ask', '? bun install', '1 unchecked', '! mcp__github__…', '1 would run'])

  await rule($, {})
  await world.clock.advance(TICK)
  expect(await card($)).toEqual({ isDrawn: true, note: '', lines: ['1 call could not be checked', '! mcp__github__create_issue', '2 would run by the rules.'] })

  await said($, NAME, 'show')
  await said($, NAME, 'forget 2')
  await said($, NAME, 'forget 3')
  await world.clock.advance(TICK)
  expect(await card($)).toEqual({ isDrawn: true, note: 'no check', lines: ['The permission check did not answer.', 'Nothing is known about 1 call.'] })
  const narrow = await card($, 20)
  expect(narrow.note).toBe('none')
  expect(fits(narrow, 20)).toBe(true)

  await rule($, { deny: { 'rm -rf': 'Bash(rm:*)' } })
  expect(await $.tool.check({ tool: 'Bash', input: bash('rm -rf build'), tool_use_id: 'toolu_01' })).toEqual({ decision: 'deny', rule: 'Bash(rm:*)' })
  expect((await peek($)).verdicts.value?.mcp__github__create_issue).toEqual({ decision: 'unknown', why: '' })
})

test('A9: the list is written once at the end of a main-loop turn that collected a call, without isKept and without commands that look secret', WITH, async ($, on) => {
  const world = ground(on)
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))
  const done = (turnId: string, agentId?: string): Promise<unknown> =>
    $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId, reason: 'answer', ...(agentId === undefined ? {} : { agentId }) })
  const lists = (): number => world.writes.filter(write => write === WRITE).length

  await session($)
  await said($, 'place', 'side')
  await said($, NAME, 'on')
  await turn($)
  expect(lists()).toBe(1)
  expect(world.store.get(LIST)).toEqual([{ key: 'Bash:npm test', tool: 'Bash', input: { command: 'npm test' }, label: 'npm test', seenAt: NOW }])

  await done('turn-2')
  expect(lists()).toBe(1)

  const secrets = [
    'deploy --token abc',
    'git clone https://user:pw@host/repo.git',
    'aws s3 cp build s3://bucket/0123456789abcdef0123456789abcdef',
    `echo ${'word '.repeat(70).trim()}`,
  ]
  for (const [at, command] of secrets.entries()) await $.tool.check({ tool: 'Bash', input: bash(command), tool_use_id: `toolu_0${at}` })
  await $.tool.check({ tool: 'Bash', input: bash('git status'), tool_use_id: 'toolu_09' })
  await done('turn-3', 'agent-1')
  expect(lists()).toBe(1)

  const { book } = await peek($)
  expect(book.value?.calls.filter(call => !call.isKept).map(call => call.input.command)).toEqual([...secrets].reverse())
  expect((await card($)).lines[0]).toBe('All 6 calls seen here would run.')
  const rows = (await said($, NAME, 'show')).split('\n')
  for (const command of secrets.slice(0, 3)) expect(rows.some(row => row.endsWith(`run ${command} [this session only]`))).toBe(true)
  expect(rows.filter(row => row.endsWith('[this session only]'))).toHaveLength(4)

  await done('turn-3')
  expect(lists()).toBe(2)
  expect((world.store.get(LIST) as Stored[]).map(call => call.label)).toEqual(['git status', 'npm test'])
  expect(JSON.stringify(world.store.get(LIST))).not.toMatch(/isKept|token|user:pw|0123456789abcdef|word/)
})

test('A10: a stored list is rehearsed at session start, a 41st shape drops the least recently seen, and both spellings of a root share one key', WITH, async ($, on) => {
  const place = { root: 'C:\\Work\\App' }
  const list = 'calls:c:/work/app'
  const world = ground(on, { store: { isOn: true, [list]: full(place.root) }, answers: { 'session.root': () => place.root } })
  const done = (turnId: string): Promise<unknown> => $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId, reason: 'answer' })

  await rule($, { deny: { 'rm -rf': '' }, ask: { 'bun install': '', 'git push': '', shared: '' } })
  await session($, place.root)
  await world.clock.settle()
  await said($, 'place', 'side')
  expect(await queries($)).toHaveLength(40)
  expect(await card($)).toEqual({
    isDrawn: true,
    note: '4 of 40',
    lines: [
      'Would be refused: 1 of 40',
      '✗ rm -rf build',
      'Would stop and ask: 3 of 40',
      '? bun install',
      '? git push origin main',
      '? Write ../shared/config.json',
      '36 would run by the rules.',
    ],
  })

  await $.tool.check({ tool: 'Bash', input: bash('cargo build --release'), tool_use_id: 'toolu_01' })
  const keys = (await peek($)).book.value?.calls.map(call => call.key) ?? []
  expect(keys).toHaveLength(40)
  expect(keys).toContain('Bash:cargo build --release')
  expect(keys).not.toContain('Bash:git status')
  expect(keys).toContain('Bash:git diff')
  expect((await peek($)).verdicts.value?.['Bash:git status']).toBeUndefined()
  expect((await card($)).note).toBe('4 of 40')

  await done('turn-1')
  await said($, NAME, 'off')
  place.root = 'c:/work/app/'
  await said($, NAME, 'on')
  expect((await peek($)).book.value?.calls.map(call => call.key)).toContain('Bash:cargo build --release')
  expect((await card($)).note).toBe('4 of 40')
  await $.tool.check({ tool: 'Read', input: { file_path: 'c:/work/app/README.md' }, tool_use_id: 'toolu_02' })
  await done('turn-2')

  expect(world.writes.filter(write => write.startsWith('store calls:'))).toEqual([`store ${list}`, `store ${list}`])
  expect([...world.store.keys()].filter(key => key.startsWith('calls:'))).toEqual([list])
})

test('A11: show asks afresh, then prints the count line, the numbered rows in order with their reasons, and the closing line', WITH, async ($, on) => {
  const world = ground(on, { store: { isOn: true, [LIST]: [stored('Bash', bash('npm test')), stored('Bash', bash('bun install')), GONE, stored('Bash', bash('rm -rf build'))] } })
  on('classic.UserPromptSubmit', async () => ({}))

  await rule($, { deny: { 'rm -rf': 'Bash(rm:*)' }, ask: { 'bun install': '', deploy: '' }, allow: { 'npm test': 'Bash(npm test:*)' } })
  await session($)
  await world.clock.settle()
  await $.tool.check({ tool: 'Bash', input: bash('deploy --token abc'), tool_use_id: 'toolu_01' })
  await queries($)

  const rows = [
    '1. refuse rm -rf build (Bash(rm:*))',
    '2. ask bun install',
    '3. ask deploy --token abc [this session only]',
    '4. unchecked mcp__github__create_issue',
    '5. run npm test (Bash(npm test:*))',
    FOOT,
  ]
  expect((await said($, NAME, 'show')).split('\n')).toEqual([
    'Rehearsal in project, mode not seen yet: 2 would stop, 1 refused, 1 would run, 1 unchecked, of 5 seen here.',
    ...rows,
  ])
  expect((await queries($)).map(query => query.input.command)).toEqual(['deploy --token abc', 'npm test', 'bun install', 'rm -rf build'])
  expect((await peek($)).run.value?.shown).toEqual(['Bash:rm -rf build', 'Bash:bun install', 'Bash:deploy --token abc', 'mcp__github__create_issue', 'Bash:npm test'])

  await $.classic.UserPromptSubmit({ prompt: 'Ship it', permission_mode: 'auto' })
  await world.clock.settle()
  expect((await said($, NAME, 'show')).split('\n')).toEqual([
    'Rehearsal in project, auto mode: 2 not settled, 1 refused, 1 would run, 1 unchecked, of 5 seen here.',
    ...rows,
  ])
  await $.classic.UserPromptSubmit({ prompt: 'Ship it', permission_mode: 'default' })
  expect((await said($, NAME, 'show')).split('\n')[0]).toBe(
    'Rehearsal in project, default mode: 2 would stop, 1 refused, 1 would run, 1 unchecked, of 5 seen here.',
  )

  await said($, NAME, 'clear')
  expect(await said($, NAME, 'show')).toBe('Rehearsal in project: no calls seen here yet.')
})

test('A12: forget drops the numbered row of the latest show from the card and the store at once, and answers for rows that are not there', WITH, async ($, on) => {
  const world = ground(on, { store: { isOn: true, [LIST]: few() } })
  const missing = (row: number): string => `No row ${row}; /rehearsal-widget show lists them.`

  await rule($, { ask: { 'bun install': '', 'git push': '' } })
  await session($)
  await world.clock.settle()
  await said($, 'place', 'side')
  expect(await said($, NAME, 'forget 1')).toBe(missing(1))
  expect(await said($, NAME, 'forget')).toBe(USAGE)
  expect(await said($, NAME, 'forget x')).toBe(USAGE)
  expect(world.writes).toEqual([])

  await said($, NAME, 'show')
  expect(await said($, NAME, 'forget 2')).toBe('Forgot: git push origin main.')
  expect(world.writes).toEqual([WRITE])
  expect((world.store.get(LIST) as Stored[]).map(call => call.label)).toEqual(['bun install', 'npm test'])
  expect(await card($)).toEqual({ isDrawn: true, note: '1 of 2', lines: ['Would stop and ask: 1 of 2', '? bun install', '1 would run by the rules.'] })
  expect(await said($, NAME, 'forget 9')).toBe(missing(9))
  expect(await said($, NAME, 'forget 2')).toBe(missing(2))

  await $.tool.check({ tool: 'Bash', input: bash('npm test tests/a.test.js'), tool_use_id: 'toolu_01' })
  expect(await said($, NAME, 'forget 3')).toBe(missing(3))
  expect((await peek($)).book.value?.calls.map(call => call.label)).toEqual(['npm test tests/a.test.js', 'bun install'])
  expect(await said($, NAME, 'Forget 1')).toBe('Forgot: bun install.')
  expect((world.store.get(LIST) as Stored[]).map(call => call.label)).toEqual(['npm test tests/a.test.js'])
})

test('A13: clear deletes this project list and no other, empties the card and says how many calls it forgot', WITH, async ($, on) => {
  const other = [stored('Bash', bash('make test'), NOW - 60_000, '/work/other')]
  const world = ground(on, { store: { isOn: true, [LIST]: few(), 'calls:/work/other': other } })

  await session($)
  await world.clock.settle()
  await said($, 'place', 'side')
  expect(await said($, NAME, 'clear')).toBe('Rehearsal cleared: 3 calls forgotten for project.')
  expect(world.store.has(LIST)).toBe(false)
  expect(world.store.get('calls:/work/other')).toEqual(other)
  expect(world.writes).toEqual([WRITE])
  const shown = await card($)
  expect([shown.note, shown.lines.join(' ')]).toEqual(['', EMPTY])
  await queries($)
  await world.clock.advance(TICK)
  expect(await queries($)).toEqual([])
})

test('A14: while off the verbs answer that it is off and nothing is collected, asked or written; switching off stops the timer and writes no list', WITH, async ($, on) => {
  const world = ground(on, { store: { [LIST]: few() } })
  on('classic.UserPromptSubmit', async () => ({}))
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))

  await session($)
  await said($, 'place', 'side')
  for (const verb of ['show', 'forget 1', 'clear']) expect(await said($, NAME, verb)).toBe(OFF)
  await turn($)
  await $.classic.UserPromptSubmit({ prompt: 'Ship it', permission_mode: 'auto' })
  await world.clock.advance(6 * TICK)
  const idle = await peek($)
  expect(await queries($)).toEqual([])
  expect(world.writes).toEqual([])
  expect([idle.book.version, idle.verdicts.version, idle.run.version]).toEqual([0, 0, 0])
  expect(world.store.get(LIST)).toEqual(few())
  expect((await card($)).isDrawn).toBe(false)

  await said($, NAME, 'on')
  await $.tool.check({ tool: 'Bash', input: bash('git status'), tool_use_id: 'toolu_01' })
  await world.clock.advance(TICK)
  expect(await queries($)).toHaveLength(3 + 4)
  await rule($, { ask: { 'git status': '' }, slowMs: 12_000 })
  await world.clock.advance(TICK)
  expect(await queries($)).toHaveLength(1)
  await said($, NAME, 'off')
  await world.clock.advance(12 * TICK)
  const shut = await peek($)
  expect(await queries($)).toEqual([])
  expect(world.writes).toEqual(['store isOn', 'store isOn'])
  expect([shut.book.value?.calls, shut.verdicts.value, shut.run.value]).toEqual([[], {}, { mode: '', isRehearsing: false, shown: [] }])
})

test('A15: every state fits the border at 20, 40 and 60 columns with the narrow forms under 30, and unknown verbs answer the usage', WITH, async ($, on) => {
  const world = ground(on, { store: { [LIST]: full() } })
  on('classic.UserPromptSubmit', async () => ({}))
  const sizes = [
    [20, 20],
    [40, 40],
    [90, 60],
  ] as const
  const fitted = async (): Promise<boolean[]> => {
    const found: boolean[] = []
    for (const [columns, width] of sizes) found.push(fits(await card($, columns), width))

    return found
  }

  await rule($, STOPS)
  await session($)
  await said($, 'place', 'side')
  await said($, 'widen', `${NAME} 60`)
  for (const verb of ['rehearse', 'show all', 'forget 1 2', 'SHOW', 'forget 1', 'clear']) {
    expect(await said($, NAME, verb)).toBe(['SHOW', 'forget 1', 'clear'].includes(verb) ? OFF : USAGE)
  }
  expect((await peek($)).isOn.value ?? false).toBe(false)
  expect(world.writes).toEqual([])

  await said($, NAME, 'on')
  expect(await card($, 20)).toEqual({
    isDrawn: true,
    note: '4/40',
    lines: ['1 of 40 refused', '✗ rm -rf build', '3 of 40 ask', '? bun install', '? git push orig…', '? Write ../shar…', '36 would run'],
  })
  expect(await fitted()).toEqual([true, true, true])
  expect((await said($, NAME, 'SHOW')).split('\n')).toHaveLength(42)
  for (const verb of ['rehearse', 'show all', 'forget 1 2']) expect(await said($, NAME, verb)).toBe(USAGE)
  expect((await peek($)).book.value?.calls).toHaveLength(40)
  expect((await peek($)).isOn.value).toBe(true)

  await $.classic.UserPromptSubmit({ prompt: 'Ship it', permission_mode: 'auto' })
  await world.clock.settle()
  const auto = await card($, 20)
  expect([auto.note, auto.lines[2], auto.lines.at(-1)]).toEqual(['auto', '3 of 40 open', 'auto decides'])
  expect(await fitted()).toEqual([true, true, true])

  await $.classic.UserPromptSubmit({ prompt: 'Ship it', permission_mode: 'default' })
  await rule($, {})
  await world.clock.advance(TICK)
  expect((await card($, 20)).note).toBe('clear')
  expect(await fitted()).toEqual([true, true, true])

  await said($, NAME, 'clear')
  expect((await card($, 20)).note).toBe('')
  expect(await fitted()).toEqual([true, true, true])
})

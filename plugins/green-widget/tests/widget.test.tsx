import { expect, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { folder, hash } from '../hooks/lib'
import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Given } from './kit'

type Asked = { args: string[]; cwd?: string; env?: Record<string, string>; stdin?: string; timeoutMs?: number }
type Ref = { sha: string; tree: string; at: number; subject: string }
type Fail = 'reject' | { exitCode: number; stderr: string }
type Found = { text?: string } | undefined
type Card = { find: (query: { key: string }) => Promise<Found>; unmount: () => Promise<void> }
type Held = { key: string; command: string; greenAt: number; redAt: number; fileCount: number; files: { path: string }[]; isSeen: boolean }

const NAME = 'green-widget'
const NOW = 1_700_000_000_000
const SECOND = 1000
const MINUTE = 60_000
const TOP = '/work/project'
const OTHER = '/work/other'
const TREE_ONE = 'c0d29614a0270529cd38b4119d840ca60da0efa3'
const TREE_TWO = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const TREE_THREE = '9daeafb9864cf43055ae93beb0afd6c7d144bfa4'
const USAGE = 'Usage: /green-widget [on|off|tell|clear]'
const EMPTY = 'No green yet. The next passing test, lint or build is kept as a hidden git snapshot of the tree.'
const OUTSIDE = 'Not in a git repository. Nothing is kept here.'
const KEYS = ['1', '2', '3', 'since', 'ignored', 'file:1', 'file:2', 'more', 'fault', 'paused', 'empty']
const CRLF = "warning: in the working copy of 'src/parser.ts', LF will be replaced by CRLF the next time Git touches it\n"
const LOCKED =
  "fatal: Unable to create '/work/project/.git/worktrees/a-very-long-worktree-name-with-no-space-in-it/index.lock': File exists.\n\nAnother git process seems to be running in this repository.\n"
const SIX = [
  '31\t19\tsrc/lexer.ts',
  '-\t-\tassets/logo.png',
  '80\t12\tsrc/parser.ts',
  '5\t0\tdocs/read me.md',
  '3\t0\tsrc/a.ts',
  '1\t0\tsrc/b.ts',
]
const ONE = ['1\t1\tsrc/sum.js']

const wt = (top: string): string => hash(folder(top)).toString(36)
const cmd = (command: string): string => hash(command).toString(36)
const refOf = (top: string, command: string): string => `refs/widgets/green/${wt(top)}/${cmd(command)}`
const numstat = (rows: readonly string[]): string => rows.map(row => `${row}\0`).join('')
const flat = (text: string | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()
const passing = (): object => ({ result: { stdout: '12 pass\n0 fail', stderr: '', interrupted: false }, text: '12 pass\n0 fail' })
const failing = (): object => ({ result: { stdout: '', stderr: 'error: 1 failing', interrupted: false }, text: 'error: 1 failing', isError: true })

const bench = (on: On, given: Given & { top?: string; refs?: Record<string, Ref> } = {}) => {
  const asked: Asked[] = []
  const fills: string[] = []
  const refs = new Map<string, Ref>(Object.entries(given.refs ?? {}))
  const commits = new Map<string, Ref>()
  const repo = { top: given.top ?? TOP, tree: TREE_ONE, numstat: '', isFilled: true, fail: {} as Record<string, Fail>, answer: passing() }
  const ok = (stdout = '', stderr = '') => ({ exitCode: 0, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })
  const git = (e: { argv: readonly string[]; init?: Omit<Asked, 'args'> }) => {
    const args = e.argv.slice(2)
    const [verb = '', ...rest] = args
    asked.push({ args: [...args], ...e.init })
    expect(e.argv.slice(0, 2)).toEqual(['git', '--no-optional-locks'])

    const fail = repo.fail[verb]
    if (fail === 'reject') throw new Error(`git ${verb} was still running after ${e.init?.timeoutMs}ms`)
    if (fail !== undefined) return { ...ok('', fail.stderr), exitCode: fail.exitCode }
    if (verb === 'rev-parse') return repo.top === '' ? { ...ok('', 'fatal: not a git repository (or any of the parent directories): .git\n'), exitCode: 128 } : ok(`${repo.top}\n`)
    if (verb === 'for-each-ref') {
      const under = [...refs].filter(([ref]) => ref.startsWith(rest.at(-1) ?? ''))
      const isWhole = (rest[0] ?? '').includes('objectname')

      return ok(under.map(([ref, held]) => (isWhole ? `${[ref, held.sha, held.tree, held.at, held.subject].join('\0')}\n` : `${ref}\n`)).join(''))
    }
    if (verb === 'add') return ok('', CRLF)
    if (verb === 'write-tree') return ok(`${repo.tree}\n`)
    if (verb === 'commit-tree') {
      const sha = (commits.size + 1).toString(16).padStart(8, '3f2a1c9d').repeat(5)
      commits.set(sha, { sha, tree: rest[0] ?? '', at: Number(/^@(\d+) \+0000$/.exec(e.init?.env?.GIT_COMMITTER_DATE ?? '')?.[1]), subject: rest.at(-1) ?? '' })

      return ok(`${sha}\n`)
    }
    if (verb === 'update-ref' && rest[0] === '--stdin') {
      for (const row of (e.init?.stdin ?? '').split('\n')) if (row.startsWith('delete ')) refs.delete(row.slice(7))

      return ok()
    }
    if (verb === 'update-ref' && rest[0] === '-d') return void refs.delete(rest[1] ?? '') ?? ok()
    if (verb === 'update-ref') return void refs.set(rest[0] ?? '', commits.get(rest[1] ?? '') as Ref) ?? ok()
    if (verb === 'diff') return ok(repo.numstat)

    return ok()
  }
  const world = ground(on, { now: NOW, ...given, answers: { 'process.run': git as never } })
  const bottom = on as unknown as (event: string, hook: (_$: unknown, e: never) => unknown) => void
  bottom('tool.call', () => repo.answer)
  bottom('prompt.fill', (_$, e: { text: string }) => {
    fills.push(e.text)

    return { isFilled: repo.isFilled }
  })

  return { world, repo, refs, asked, fills, verbs: (): string[] => asked.map(call => call.args[0] ?? '') }
}

const say = async ($: unknown, args: string): Promise<string> =>
  ((await ($ as { command: { run: (e: object) => Promise<{ text?: string }> } }).command.run(run(NAME, args))).text ?? '')

const bash = async ($: unknown, command: string, more: object = {}): Promise<unknown> =>
  ($ as { tool: { call: (e: object) => Promise<unknown> } }).tool.call({ tool: 'Bash', tool_use_id: `use-${command}`, command, ...more })

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async ($, e) => {
      const held = {
        isOn: await $.state.get({ plugin: 'green-widget', key: 'isOn' } as never),
        tick: await $.state.get({ plugin: 'green-widget', key: 'tick' } as never),
        isPaused: await $.state.get({ plugin: 'green-widget', key: 'isPaused' } as never),
        fault: await $.state.get({ plugin: 'green-widget', key: 'fault' } as never),
        place: await $.state.get({ plugin: 'green-widget', key: 'place' } as never),
        runs: await $.state.get({ plugin: 'green-widget', key: 'runs' } as never),
      } as Record<string, { value: unknown }>

      return { text: JSON.stringify({ at: held[e.args]?.value }) }
    })
  },
}
const PLUGINS = { plugins: [LAYOUT, PEEK] }

const state = async <Value,>($: unknown, key: string): Promise<Value> =>
  (JSON.parse((await ($ as { command: { run: (e: object) => Promise<{ text?: string }> } }).command.run(run('peek', key))).text ?? '{}') as { at: Value }).at

const mount = async ($: unknown, columns = 40): Promise<Card> =>
  ($ as { ui: { mount: (e: never) => Promise<Card> } }).ui.mount(target(NAME, 'Pane', columns))

const read = async (ui: Card, key: string): Promise<string | undefined> => (await ui.find({ key }))?.text

const start = async ($: unknown): Promise<void> => {
  await session($)
  await ($ as { command: { run: (e: object) => Promise<unknown> } }).command.run(run('place', 'side'))
  await say($, 'on')
}

const widest = async (ui: Card): Promise<number> => {
  let most = 0
  for (const key of KEYS) {
    const text = await read(ui, `text:${key}`)
    if (text === undefined) continue

    const mark = await read(ui, `mark:${key}`)
    const fact = await read(ui, `fact:${key}`)
    const edge = (mark === undefined ? 0 : 2) + (fact === undefined ? 0 : 1 + [...fact].length)
    most = Math.max(most, ...text.split('\n').map(row => [...row].length + edge))
  }

  return most
}

test('A1: says what will appear when nothing is green, and that nothing is kept outside a repository', PLUGINS, async ($, on) => {
  const { repo, asked, verbs } = bench(on)

  await session($)
  await say($, 'on')
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    const ui = await $.ui.mount(target(NAME, component))
    expect(flat((await ui.find({ key: 'text:empty' }))?.text)).toBe(EMPTY)
    expect((await ui.find({ key: 'note' }))?.text ?? '').toBe('')
    await ui.unmount()
  }

  await say($, 'off')
  repo.top = ''
  asked.length = 0
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  const ui = await mount($)
  expect(flat(await read(ui, 'text:empty'))).toBe(OUTSIDE)
  expect((await read(ui, 'note')) ?? '').toBe('')

  await bash($, 'bun test')
  expect(verbs()).not.toContain('add')
  expect(await read(ui, 'text:1')).toBeUndefined()
  expect(await say($, 'clear')).toBe('Not in a git repository.')
  expect(verbs()).not.toContain('for-each-ref')
  await ui.unmount()
})

test('A2: counts plain check commands and nothing a shell would bend', PLUGINS, async ($, on) => {
  const { asked, verbs } = bench(on)
  await start($)

  const counted = [
    ['bun test', 'bun test'],
    ['  npm  run lint ', 'npm run lint'],
    ['CI=1 bun test', 'CI=1 bun test'],
    ['bun install && bun test', 'bun install && bun test'],
    ['bun test 2>&1', 'bun test'],
    ['python -m pytest', 'python -m pytest'],
  ] as const
  for (const [typed, named] of counted) {
    asked.length = 0
    await bash($, typed)
    expect(asked.find(call => call.args[0] === 'commit-tree')?.args.at(-1)).toBe(named)
  }

  asked.length = 0
  const ignored = [
    'bun test | tail -5',
    'bun test || true',
    'bun test; echo ok',
    'bun test > out.txt',
    'cd pkg && bun test',
    'cat test.txt',
    'git commit -m "fix test"',
    'ls tests',
    'echo $(bun test)',
    'bun test\nbun run lint',
    'bun install',
    'FOO=1 cat test.txt',
    'bun test &',
    'bun test `date`',
    'pushd pkg && bun test',
  ]
  for (const typed of ignored) await bash($, typed)
  expect(verbs()).toEqual([])
  expect((await state<Held[]>($, 'runs')).map(held => held.command).sort()).toEqual([...new Set(counted.map(([, named]) => named))].sort())
})

test('A3: a passing check keeps the tree as a hidden commit and hands the Bash result on untouched', PLUGINS, async ($, on) => {
  const { world, repo, refs, asked, verbs } = bench(on)
  await start($)
  asked.length = 0

  expect(await bash($, 'bun test')).toEqual(repo.answer)
  expect(verbs()).toEqual(['rev-parse', 'add', 'write-tree', 'commit-tree', 'update-ref'])

  const [, add, write, commit, move] = asked
  expect(add?.args).toEqual(['add', '-A'])
  expect(add?.timeoutMs).toBe(10_000)
  expect(add?.env?.GIT_INDEX_FILE).toMatch(new RegExp(`.+/index-${wt(TOP)}$`))
  expect(write?.env?.GIT_INDEX_FILE).toBe(add?.env?.GIT_INDEX_FILE)
  expect(commit?.args).toEqual(['commit-tree', TREE_ONE, '--no-gpg-sign', '-m', 'bun test'])
  expect(commit?.env).toEqual({
    GIT_AUTHOR_NAME: 'green-widget',
    GIT_COMMITTER_NAME: 'green-widget',
    GIT_AUTHOR_EMAIL: 'green-widget@localhost',
    GIT_COMMITTER_EMAIL: 'green-widget@localhost',
    GIT_AUTHOR_DATE: `@${NOW / 1000} +0000`,
    GIT_COMMITTER_DATE: `@${NOW / 1000} +0000`,
  })
  expect(move?.args).toEqual(['update-ref', refOf(TOP, 'bun test'), refs.get(refOf(TOP, 'bun test'))?.sha ?? ''])
  for (const call of [add, write, commit, move]) expect(call?.cwd).toBe(TOP)

  const ui = await mount($)
  expect(await read(ui, 'note')).toBe('all green')
  expect(await read(ui, 'mark:1')).toBe('✓')
  expect(await read(ui, 'text:1')).toBe('bun test')
  expect(await read(ui, 'fact:1')).toBe('0s ago')
  await world.clock.advance(14 * MINUTE)
  expect(await read(ui, 'fact:1')).toBe('14m 00s ago')
  await ui.unmount()
})

test('A4: a check going red states what changed since its green, once', PLUGINS, async ($, on) => {
  const { world, repo, asked } = bench(on)
  await start($)
  await bash($, 'bun test')
  await world.clock.advance(14 * MINUTE + 5 * SECOND)

  Object.assign(repo, { tree: TREE_TWO, numstat: numstat(SIX), answer: failing() })
  expect(await bash($, 'bun test')).toEqual(repo.answer)
  expect(asked.at(-1)?.args).toEqual(['diff', '--numstat', '--no-renames', '-z', TREE_ONE, TREE_TWO])

  const ui = await mount($)
  expect(await read(ui, 'note')).toBe('1 red')
  expect(await read(ui, 'mark:1')).toBe('✗')
  expect(await read(ui, 'text:1')).toBe('bun test')
  expect(await read(ui, 'fact:1')).toBe('green 14m 05s ago')
  expect(await read(ui, 'text:since')).toBe('since green: 6 files, +120 -31')
  expect(await read(ui, 'text:file:1')).toBe('  src/parser.ts')
  expect(await read(ui, 'fact:file:1')).toBe('+80 -12')
  expect(await read(ui, 'text:file:2')).toBe('  src/lexer.ts')
  expect(await read(ui, 'fact:file:2')).toBe('+31 -19')
  expect(await read(ui, 'text:more')).toBe('  … 4 more in tell')
  expect(world.toasts).toEqual(['bun test went red: 6 files, +120 -31 since green 14m 05s ago'])

  const [first] = await state<Held[]>($, 'runs')
  expect(first?.redAt).toBe(NOW + 14 * MINUTE + 5 * SECOND)
  expect(first?.files.map(file => file.path)).toEqual(['src/parser.ts', 'src/lexer.ts', 'docs/read me.md', 'src/a.ts', 'src/b.ts', 'assets/logo.png'])

  await world.clock.advance(MINUTE)
  Object.assign(repo, { tree: TREE_THREE, numstat: numstat(ONE) })
  await bash($, 'bun test')
  expect((await state<Held[]>($, 'runs'))[0]?.redAt).toBe(NOW + 15 * MINUTE + 5 * SECOND)
  expect(await read(ui, 'text:since')).toBe('since green: 1 file, +1 -1')
  expect(await read(ui, 'text:more')).toBeUndefined()
  expect(world.toasts).toHaveLength(1)
  await ui.unmount()
})

test('A5: red with the tree unchanged says so, a check never green is not compared, and a pass turns the row back', PLUGINS, async ($, on) => {
  const { world, repo, verbs } = bench(on)
  await start($)
  await bash($, 'bun test')
  await world.clock.advance(MINUTE)

  repo.answer = failing()
  await bash($, 'bun test')
  const ui = await mount($)
  expect(await read(ui, 'note')).toBe('1 red')
  expect(await read(ui, 'text:since')).toBe('since green: the tree is unchanged')
  expect(await read(ui, 'text:ignored')).toBe('  ignored files are not compared')
  expect(await read(ui, 'text:file:1')).toBeUndefined()
  expect(world.toasts).toEqual(['bun test went red with the tree unchanged since green'])

  repo.answer = passing()
  await bash($, 'bun test')
  expect(await read(ui, 'mark:1')).toBe('✓')
  expect(await read(ui, 'note')).toBe('all green')
  expect(await read(ui, 'text:since')).toBeUndefined()

  const adds = verbs().filter(verb => verb === 'add').length
  repo.answer = failing()
  await bash($, 'bun run build')
  expect(verbs().filter(verb => verb === 'add')).toHaveLength(adds)
  expect(await read(ui, 'mark:1')).toBe('✗')
  expect(await read(ui, 'text:1')).toBe('bun run build')
  expect(await read(ui, 'fact:1')).toBe('never green')
  expect(await read(ui, 'text:since')).toBeUndefined()
  expect(world.toasts).toHaveLength(1)
  await ui.unmount()
})

test('A6: the greens of this tree come back at session start, at on, and when the top level moves', PLUGINS, async ($, on) => {
  const quoted = `bun test --grep "a b" 'c d'`
  const { repo, asked } = bench(on, {
    store: { isOn: true },
    refs: {
      [refOf(TOP, 'bun run lint')]: { sha: 'a1'.repeat(20), tree: TREE_ONE, at: NOW / 1000 - 190, subject: 'bun run lint' },
      [refOf(TOP, quoted)]: { sha: 'b2'.repeat(20), tree: TREE_ONE, at: NOW / 1000 - 845, subject: quoted },
      [refOf(OTHER, 'cargo test')]: { sha: 'c3'.repeat(20), tree: TREE_TWO, at: NOW / 1000 - 60, subject: 'cargo test' },
    },
  })

  await session($)
  await $.command.run(run('place', 'side'))
  const ui = await mount($)
  const restored = async (): Promise<void> => {
    expect(await read(ui, 'text:1')).toBe('bun run lint')
    expect(await read(ui, 'fact:1')).toBe('3m 10s ago')
    expect(await read(ui, 'fact:2')).toBe('14m 05s ago')
    expect(await read(ui, 'text:3')).toBeUndefined()
    expect((await state<Held[]>($, 'runs')).map(held => held.command)).toEqual(['bun run lint', quoted])
  }
  await restored()
  expect(await read(ui, 'mark:1')).toBe('·')
  expect((await read(ui, 'note')) ?? '').toBe('')

  await say($, 'off')
  expect(await state<Held[]>($, 'runs')).toEqual([])
  await say($, 'on')
  await restored()
  const listed = asked.filter(call => call.args[0] === 'for-each-ref')
  expect(listed).toHaveLength(2)
  for (const call of listed) expect(call.args.at(-1)).toBe(`refs/widgets/green/${wt(TOP)}/`)
  expect(asked.some(call => call.args.some(arg => arg.includes(wt(OTHER))))).toBe(false)

  repo.top = OTHER
  await bash($, 'bun test')
  expect(asked.filter(call => call.args[0] === 'for-each-ref').at(-1)?.args.at(-1)).toBe(`refs/widgets/green/${wt(OTHER)}/`)
  expect((await state<Held[]>($, 'runs')).map(held => held.command)).toEqual(['bun test', 'cargo test'])
  expect(await read(ui, 'mark:1')).toBe('✓')
  expect(await read(ui, 'mark:2')).toBe('·')
  expect((await read(ui, 'note')) ?? '').toBe('')
  await ui.unmount()
})

test('A7: tell fills the prompt with what changed since green, or says why it has nothing to hand over', PLUGINS, async ($, on) => {
  const { world, repo, refs, fills } = bench(on)
  await start($)
  await bash($, 'bun test')
  await world.clock.advance(14 * MINUTE + 5 * SECOND)
  Object.assign(repo, { tree: TREE_TWO, numstat: numstat(SIX), answer: failing() })
  await bash($, 'bun test')
  await world.clock.advance(30 * SECOND)

  const sha = (refs.get(refOf(TOP, 'bun test'))?.sha ?? '').slice(0, 12)
  const wanted = [
    `\`bun test\` passed 14m 35s ago and fails now. The tree as it was when it passed is the git commit ${sha} (${refOf(TOP, 'bun test')}).`,
    [
      'At the failing run 30s ago, 6 files had changed since then, +120 -31:',
      'src/parser.ts +80 -12',
      'src/lexer.ts +31 -19',
      'docs/read me.md +5 -0',
      'src/a.ts +3 -0',
      'src/b.ts +1 -0',
      'assets/logo.png +0 -0',
    ].join('\n'),
    `Read a file's hunks with \`git diff ${sha} -- <path>\`. A file listed here that the diff does not show is new since green: read it whole. Ignored files are not in the snapshot.`,
    'Find which of these changes broke `bun test` before looking anywhere else.',
  ].join('\n\n')
  expect(sha).toHaveLength(12)
  expect(await say($, 'tell')).toBe('Filled the prompt with what changed since bun test was green.')
  expect(fills).toEqual([wanted])

  repo.isFilled = false
  expect(await say($, 'tell')).toBe(wanted)

  Object.assign(repo, { tree: TREE_THREE, numstat: numstat(Array.from({ length: 25 }, (_, at) => `${30 - at}\t0\tsrc/file-${at}.ts`)) })
  await bash($, 'bun test')
  const long = await say($, 'tell')
  expect(long).toContain('25 files had changed since then')
  expect(long.split('\n').filter(row => /^src\/file-\d+\.ts \+\d+ -0$/.test(row))).toHaveLength(20)
  expect(long).toContain('src/file-19.ts +11 -0\nand 5 more\n\n')

  repo.numstat = numstat(ONE)
  repo.tree = TREE_TWO
  await bash($, 'bun test')
  expect(await say($, 'tell')).toContain('At the failing run 0s ago, 1 file had changed since then, +1 -1:\nsrc/sum.js +1 -1\n\n')

  const filled = fills.length
  repo.answer = passing()
  await bash($, 'bun test')
  expect(await say($, 'tell')).toBe('Nothing is red.')
  repo.answer = failing()
  await bash($, 'bun run build')
  expect(await say($, 'tell')).toBe('bun run build has never been green here: nothing to compare.')
  await bash($, 'bun test')
  expect(await say($, 'tell')).toBe('Nothing in the snapshot changed since bun test was green. Ignored files are not compared.')
  expect(fills).toHaveLength(filled)
})

test('A8: clear deletes the snapshots of every tree, empties the index and the card, and lifts a pause', PLUGINS, async ($, on) => {
  const { repo, refs, asked, verbs } = bench(on, {
    refs: {
      [refOf(TOP, 'bun run lint')]: { sha: 'a1'.repeat(20), tree: TREE_ONE, at: NOW / 1000 - 190, subject: 'bun run lint' },
      [refOf(TOP, 'bun test')]: { sha: 'b2'.repeat(20), tree: TREE_ONE, at: NOW / 1000 - 845, subject: 'bun test' },
      [refOf(OTHER, 'cargo test')]: { sha: 'c3'.repeat(20), tree: TREE_TWO, at: NOW / 1000 - 60, subject: 'cargo test' },
    },
  })
  await start($)
  repo.fail = { add: 'reject' }
  await bash($, 'bun test')
  expect(await state<boolean>($, 'isPaused')).toBe(true)

  const ui = await mount($)
  expect(await read(ui, 'text:1')).toBe('bun run lint')
  asked.length = 0
  expect(await say($, 'clear')).toBe('Last green cleared: 3 snapshots deleted.')
  expect(asked.find(call => call.args[0] === 'for-each-ref')?.args).toEqual(['for-each-ref', '--format=%(refname)', 'refs/widgets/green/'])
  expect(asked.find(call => call.args[0] === 'update-ref')?.args).toEqual(['update-ref', '--stdin'])
  expect(asked.find(call => call.args[0] === 'update-ref')?.stdin).toBe(
    [refOf(TOP, 'bun run lint'), refOf(TOP, 'bun test'), refOf(OTHER, 'cargo test')].map(ref => `delete ${ref}\n`).join(''),
  )
  expect(asked.find(call => call.args[0] === 'read-tree')?.args).toEqual(['read-tree', '--empty'])
  expect(asked.find(call => call.args[0] === 'read-tree')?.env?.GIT_INDEX_FILE).toMatch(new RegExp(`.+/index-${wt(TOP)}$`))
  expect(refs.size).toBe(0)
  expect(flat(await read(ui, 'text:empty'))).toBe(EMPTY)
  expect((await read(ui, 'note')) ?? '').toBe('')
  expect(await state<boolean>($, 'isPaused')).toBe(false)

  repo.fail = {}
  await bash($, 'bun test')
  expect(verbs()).toContain('commit-tree')
  expect(await read(ui, 'note')).toBe('all green')
  await ui.unmount()
})

test('A9: a snapshot that fails records no green, says why, and never costs the Bash result', PLUGINS, async ($, on) => {
  const { world, repo, refs, asked, verbs } = bench(on)
  await start($)
  const ui = await mount($)

  repo.fail = { add: 'reject' }
  expect(await bash($, 'bun test')).toEqual(repo.answer)
  expect(verbs()).not.toContain('commit-tree')
  expect(refs.size).toBe(0)
  expect(await read(ui, 'note')).toBe('error')
  expect(await read(ui, 'text:1')).toBeUndefined()
  expect(await read(ui, 'text:fault')).toBe('No snapshot: git took over 10s.')
  expect(await read(ui, 'text:paused')).toBe('Paused until /green-widget clear.')

  asked.length = 0
  repo.fail = {}
  expect(await bash($, 'bun test')).toEqual(repo.answer)
  repo.answer = failing()
  expect(await bash($, 'bun run lint')).toEqual(repo.answer)
  expect(asked).toEqual([])
  expect(await state<Held[]>($, 'runs')).toEqual([])
  await say($, 'clear')

  repo.answer = passing()
  repo.fail = { add: { exitCode: 128, stderr: LOCKED } }
  expect(await bash($, 'bun test')).toEqual(repo.answer)
  const said = (await read(ui, 'text:fault')) ?? ''
  expect(said.startsWith('No snapshot: fatal: Unable to create')).toBe(true)
  expect(said.endsWith('…')).toBe(true)
  expect(said.split('\n')).toHaveLength(2)
  expect(said).not.toContain('Another git process')
  expect(await read(ui, 'text:paused')).toBeUndefined()
  expect(await read(ui, 'note')).toBe('error')
  expect(refs.size).toBe(0)

  repo.fail = { 'commit-tree': { exitCode: 128, stderr: 'fatal: unable to write commit object\n' } }
  await bash($, 'bun test')
  expect(await read(ui, 'text:fault')).toBe('No snapshot: fatal: unable to write\ncommit object')
  expect(refs.size).toBe(0)
  expect(await read(ui, 'text:1')).toBeUndefined()

  repo.fail = {}
  await bash($, 'bun test')
  expect(await read(ui, 'text:fault')).toBeUndefined()
  expect(await read(ui, 'note')).toBe('all green')
  expect(refs.size).toBe(1)

  await world.clock.advance(MINUTE)
  Object.assign(repo, { tree: TREE_TWO, answer: failing(), fail: { diff: { exitCode: 128, stderr: `fatal: bad object ${TREE_ONE}\n` } } })
  expect(await bash($, 'bun test')).toEqual(repo.answer)
  expect(await read(ui, 'mark:1')).toBe('✗')
  expect(await read(ui, 'fact:1')).toBe('green 1m 00s ago')
  expect(await read(ui, 'text:since')).toBeUndefined()
  expect(await read(ui, 'note')).toBe('1 red')
  expect(world.toasts).toEqual([])
  expect(await say($, 'tell')).toBe('bun test is red, but git could not compare the tree with its green. Run it again.')
  await ui.unmount()
})

test('A10: the ninth green replaces the oldest, and the card orders red with a green, red never green, then green', PLUGINS, async ($, on) => {
  const { world, repo, refs, asked } = bench(on)
  const names = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'].map(name => `bun test ${name}`)
  await start($)
  for (const name of names) {
    await bash($, name)
    await world.clock.advance(MINUTE)
  }
  expect(asked.filter(call => call.args[1] === '-d').map(call => call.args)).toEqual([['update-ref', '-d', refOf(TOP, 'bun test one')]])
  expect(refs.has(refOf(TOP, 'bun test one'))).toBe(false)
  expect(refs.size).toBe(8)
  expect((await state<Held[]>($, 'runs')).map(held => held.command)).toEqual(names.slice(1).reverse())

  await say($, 'clear')
  for (const name of ['bun test', 'bun run lint', 'bun run check', 'bunx tsc']) {
    await bash($, name)
    await world.clock.advance(MINUTE)
  }
  Object.assign(repo, { tree: TREE_TWO, numstat: numstat(SIX), answer: failing() })
  await bash($, 'bun test')
  await world.clock.advance(MINUTE)
  await bash($, 'bun run build')
  await world.clock.advance(MINUTE)
  Object.assign(repo, { tree: TREE_THREE, numstat: numstat(ONE) })
  await bash($, 'bun run lint')

  const ui = await mount($)
  expect(await read(ui, 'note')).toBe('3 red')
  expect([await read(ui, 'text:1'), await read(ui, 'text:2'), await read(ui, 'text:3')]).toEqual(['bun run lint', 'bun test', 'bun run build'])
  expect([await read(ui, 'fact:1'), await read(ui, 'fact:2'), await read(ui, 'fact:3')]).toEqual(['green 5m 00s ago', 'green 6m 00s ago', 'never green'])
  expect(await read(ui, 'text:since')).toBe('since green: 1 file, +1 -1')
  expect(await read(ui, 'text:file:1')).toBe('  src/sum.js')
  expect(await read(ui, 'text:file:2')).toBeUndefined()
  await ui.unmount()

  asked.length = 0
  repo.answer = passing()
  for (const name of ['bun run check a', 'bun run check b', 'bun run check c']) await bash($, name)
  expect((await state<Held[]>($, 'runs')).map(held => held.command)).toEqual([
    'bun run check c',
    'bun run check b',
    'bun run check a',
    'bun run lint',
    'bun run build',
    'bun test',
    'bunx tsc',
    'bun run check',
  ])
  await bash($, 'bun run check d')
  const kept = (await state<Held[]>($, 'runs')).map(held => held.command)
  expect(kept).toHaveLength(8)
  expect(kept).not.toContain('bun run build')
  expect(asked.some(call => call.args[1] === '-d')).toBe(false)
  expect(refs.size).toBe(8)

  repo.answer = failing()
  await bash($, 'bunx vitest run')
  expect(asked.filter(call => call.args[1] === '-d').map(call => call.args)).toEqual([['update-ref', '-d', refOf(TOP, 'bun test')]])
  expect((await state<Held[]>($, 'runs')).map(held => held.command)).toEqual(['bunx vitest run', 'bun run check d', ...kept.slice(1).filter(name => name !== 'bun test')])
})

test('A11: calls that were denied, backgrounded or made by an agent are not checks', PLUGINS, async ($, on) => {
  const { world, repo, asked } = bench(on)
  await start($)
  asked.length = 0

  repo.answer = { deny: 'The user does not want to run this.' }
  expect(await bash($, 'bun test')).toEqual(repo.answer)
  repo.answer = passing()
  await bash($, 'bun test', { run_in_background: true })
  await bash($, 'bun test', { agentId: 'agent-7' })
  repo.answer = { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bash_3' }, text: 'Command running in background with ID: bash_3' }
  expect(await bash($, 'bun test')).toEqual(repo.answer)

  expect(asked).toEqual([])
  expect(await state<Held[]>($, 'runs')).toEqual([])
  expect((await state<string | undefined>($, 'fault')) ?? '').toBe('')
  expect(world.toasts).toEqual([])
})

test('A12: off answers its verbs with one sentence, runs no git, and forgets what on collected', PLUGINS, async ($, on) => {
  const { world, repo, asked } = bench(on)

  await session($)
  expect(await say($, 'tell')).toBe('Last green is off.')
  expect(await say($, 'clear')).toBe('Last green is off.')
  await bash($, 'bun test')
  repo.answer = failing()
  await bash($, 'bun test')
  expect(asked).toEqual([])
  expect(world.writes).toEqual([])
  expect(world.toasts).toEqual([])
  expect(await state<Held[] | undefined>($, 'runs')).toBeUndefined()

  repo.answer = passing()
  await say($, 'on')
  await bash($, 'bun run lint')
  repo.fail = { add: 'reject' }
  await bash($, 'bun test')
  await world.clock.advance(MINUTE)
  expect(await state<number>($, 'tick')).toBe(2)
  expect(await state<boolean>($, 'isPaused')).toBe(true)
  expect(await state<Held[]>($, 'runs')).toHaveLength(1)

  asked.length = 0
  expect(await say($, 'off')).toBe('Last green off.')
  expect(await state<object>($, 'place')).toEqual({ top: '', key: '' })
  expect(await state<Held[]>($, 'runs')).toEqual([])
  expect((await state<string | undefined>($, 'fault')) ?? '').toBe('')
  expect(await state<boolean>($, 'isPaused')).toBe(false)
  await world.clock.advance(10 * MINUTE)
  expect(await state<number>($, 'tick')).toBe(2)
  expect(asked).toEqual([])
})

test('A13: every state fits the card at 20, 40 and 60 columns', PLUGINS, async ($, on) => {
  const { world, repo } = bench(on)
  const deep = ['310\t95\tpackages/compiler/src/frontend/parser.ts', '31\t19\tpackages/compiler/src/frontend/lexer.ts', ...SIX.slice(3)]
  const fitted = async (check: (ui: Card, columns: number) => Promise<void>): Promise<void> => {
    for (const columns of [20, 40, 60]) {
      await $.command.run(run('widen', `${NAME} ${columns}`))
      const ui = await mount($, columns)
      expect(await widest(ui)).toBeLessThanOrEqual(columns - 4)
      await check(ui, columns)
      await ui.unmount()
    }
  }

  await session($)
  await $.command.run(run('place', 'side'))
  repo.top = ''
  await say($, 'on')
  await fitted(async ui => expect(flat(await read(ui, 'text:empty'))).toBe(OUTSIDE))
  await say($, 'off')
  repo.top = TOP
  await say($, 'on')
  await fitted(async ui => expect(flat(await read(ui, 'text:empty'))).toBe(EMPTY))

  await bash($, 'bun test')
  await bash($, 'bun run lint --max-warnings 0 --cache --cache-location .cache/eslint packages')
  await world.clock.advance(14 * MINUTE + 5 * SECOND)
  await fitted(async (ui, columns) => {
    expect((await read(ui, 'note')) ?? '').toBe(columns < 30 ? '' : 'all green')
    expect(await read(ui, 'fact:1')).toBe(columns < 30 ? '14m' : '14m 05s ago')
  })

  Object.assign(repo, { tree: TREE_TWO, numstat: numstat(deep), answer: failing() })
  await bash($, 'bun run build --production --target node')
  await bash($, 'bun test')
  await fitted(async (ui, columns) => {
    expect(await read(ui, 'note')).toBe('2 red')
    expect(await read(ui, 'text:1')).toBe('bun test')
    expect(await read(ui, 'fact:1')).toBe(columns < 30 ? '14m' : 'green 14m 05s ago')
    expect(await read(ui, 'text:since')).toBe(columns < 30 ? '5 files +350\n-114' : 'since green: 5 files, +350 -114')
    expect(await read(ui, 'fact:file:1')).toBe('+310 -95')
    expect(await read(ui, 'text:file:1')).toBe(columns < 30 ? ' …er.ts' : columns < 60 ? '  …r/src/frontend/parser.ts' : '  packages/compiler/src/frontend/parser.ts')
    expect(await read(ui, 'text:more')).toBe(columns < 30 ? ' … 3 more' : '  … 3 more in tell')
    expect(await read(ui, 'fact:2')).toBe(columns < 30 ? 'never' : 'never green')
    expect((await read(ui, 'text:2'))?.endsWith('…')).toBe(columns < 60)
    expect((await read(ui, 'text:3'))?.endsWith('…')).toBe(true)
    expect(await read(ui, 'fact:3')).toBe(columns < 30 ? '14m' : '14m 05s ago')
  })

  repo.numstat = numstat(SIX)
  await bash($, 'bun test')
  await fitted(async (ui, columns) => expect(await read(ui, 'text:since')).toBe(columns < 30 ? '6 files +120 -31' : 'since green: 6 files, +120 -31'))

  repo.tree = TREE_ONE
  await bash($, 'bun test')
  await fitted(async (ui, columns) => {
    expect(await read(ui, 'text:since')).toBe(columns < 30 ? 'tree unchanged' : 'since green: the tree is unchanged')
    expect((await read(ui, 'text:ignored')) === undefined).toBe(columns < 30)
  })

  repo.fail = { add: { exitCode: 128, stderr: LOCKED } }
  await bash($, 'bun test')
  await fitted(async ui => {
    expect(await read(ui, 'note')).toBe('error')
    expect((await read(ui, 'text:fault'))?.split('\n')).toHaveLength(2)
    expect((await read(ui, 'text:fault'))?.endsWith('…')).toBe(true)
  })

  repo.fail = { add: 'reject' }
  await bash($, 'bun test')
  await fitted(async (ui, columns) => {
    expect(await read(ui, 'note')).toBe('error')
    expect(flat(await read(ui, 'text:fault'))).toBe('No snapshot: git took over 10s.')
    expect(await read(ui, 'text:paused')).toBe(columns < 30 ? 'Paused until\n/green-widget\nclear.' : 'Paused until /green-widget clear.')
  })
})

test('A14: verbs are matched without regard to case, and anything else is usage that changes nothing', PLUGINS, async ($, on) => {
  const { world, asked } = bench(on)

  await session($)
  for (const verb of ['tell', 'TELL', 'clear', 'Clear', 'restore', 'tell now', 'what']) await say($, verb)
  expect(world.store.get('isOn')).toBeUndefined()
  expect(await state<boolean | undefined>($, 'isOn')).not.toBe(true)
  expect(asked).toEqual([])

  await say($, 'on')
  expect(await say($, 'TELL')).toBe('Nothing is red.')
  await bash($, 'bun test')
  const before = JSON.stringify(await state<Held[]>($, 'runs'))
  const writes = world.writes.length
  for (const verb of ['restore', 'tell now', 'what']) expect(await say($, verb)).toBe(USAGE)
  expect(JSON.stringify(await state<Held[]>($, 'runs'))).toBe(before)
  expect(world.store.get('isOn')).toBe(true)
  expect(world.writes).toHaveLength(writes)
})

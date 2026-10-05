import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { FsEntry, On, ProcessRunInit, ProcessRunResult, PromptBox, PromptDecoration, PromptEditInput, PromptEditResult, SessionRepo } from 'claude-code'

import { LAYOUT, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Listed = ProcessRunResult | Error
type Desk = {
  world: Ground
  repo: SessionRepo | null
  listing: Listed
  runs: { argv: readonly string[]; init?: ProcessRunInit }[]
  tree: Record<string, FsEntry[]>
  lists: string[]
  box: PromptBox | Error
  reads: number
  fills: number
  cursor: number | undefined
  core: (e: PromptEditInput) => PromptEditResult
  results: object[]
}
type Drawn = { note: string; lines: string[]; sentence: string[]; wraps: unknown[] }
type Bottom = (event: string, hook: (_$: unknown, e: never) => unknown) => void

const NAME = 'squiggle-widget'
const ROOT = '/work/project'
const USAGE = 'Usage: /squiggle-widget [on|off|check [text]]'
const OFF = 'Squiggle is off.'
const EMPTY = ['Type a file name in your prompt: it', 'lights up if it exists.']
const READING = ['Reading the file list.']
const FAILED = ["Could not list this project's files.", 'Nothing is checked.']
const NO_NAME = 'No file name in that text.'
const LS_FILES = ['git', '--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard']
const WRITERS = ['Write', 'Edit', 'NotebookEdit', 'Bash', 'PowerShell']
const FILES = [
  'README.md',
  'package.json',
  'test.js',
  'src/x.ts',
  'src/db.ts',
  'src/format.js',
  'src/sum.js',
  'src/auth-middleware.ts',
  'src/hooks/register.tsx',
  'src/hooks/lib.ts',
  'plugins/a/register.tsx',
  'plugins/b/register.tsx',
  'docs/guide.md',
]
const REPO: SessionRepo = { root: ROOT, remote: 'git@github.com:acme/project.git', internal: false, name: null } as SessionRepo
const WROTE = { result: { type: 'create', filePath: `${ROOT}/notes/plan.md`, content: 'hi', structuredPatch: [], originalFile: null }, text: `File created successfully at: ${ROOT}/notes/plan.md`, ref: 7 }
const ERRORED = { isError: true, result: 'Error: EACCES: permission denied', text: 'Error: EACCES: permission denied', ref: 8 }
const DENIED = { deny: 'Writing outside the project is not allowed.' }
const SLOW_MS = 1500
const GREEN = { color: 'green' }
const RED = { color: 'red', underline: true }

const WATCH: Plugin = {
  name: 'stand-in-watch',
  tier: 'append',
  register(on) {
    on('state.set', async ($, e, next) => {
      await $.ui.toast(`set ${e.plugin}/${e.key} ${JSON.stringify(e.value).slice(0, 60)}`)

      return next(e)
    })
    on('process.run', async ($, e, next) => {
      if ((await $.store.get('isSlow')) === true) await $.clock.sleep(1500)

      return next(e)
    })
    on('state.get', async ($, e, next) => {
      const held = await next(e)
      if (e.plugin !== 'squiggle-widget' || (await $.store.get('isBroken')) !== true) return held
      if (e.key === 'index') return { ...held, value: { status: 'ready', source: 'git', count: 1, isPartial: false, isStale: false, builtAt: 99 } } as never

      return e.key === 'paths' ? ({ ...held, value: 7 } as never) : held
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, WATCH] }

const git = (paths: readonly string[], more: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  exitCode: 0,
  stdout: `${paths.join('\n')}\n`,
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
  ...more,
})

const file = (name: string): FsEntry => ({ name, kind: 'file', size: 12, mtimeMs: 1_700_000_000_000, isLink: false })

const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })

const spliced = (e: PromptEditInput): PromptEditResult => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length })

const open = (on: On, files: readonly string[] = FILES, store: Record<string, unknown> = {}): Desk => {
  const desk: Desk = {
    world: ground(on, {
      store,
      answers: {
        'session.repo': () => desk.repo,
        'process.run': (e: { argv: readonly string[]; init?: ProcessRunInit }) => {
          desk.runs.push(e)
          if (desk.listing instanceof Error) throw desk.listing

          return desk.listing
        },
        'fs.list': (e: { path: string }) => {
          const path = e.path.replaceAll('\\', '/').replace(/^[a-z]:/i, '')
          desk.lists.push(path)
          const entries = desk.tree[path]
          if (entries === undefined) throw new Error(`ENOENT: no such file or directory, scandir '${e.path}'`)

          return entries
        },
        'prompt.read': () => {
          desk.reads += 1
          if (desk.box instanceof Error) throw desk.box

          return desk.box
        },
      },
    }),
    repo: REPO,
    listing: git(files),
    runs: [],
    tree: {},
    lists: [],
    box: { text: '', cursor: 0 },
    reads: 0,
    fills: 0,
    cursor: undefined,
    core: spliced,
    results: [],
  }
  const bottom = on as unknown as Bottom
  bottom('prompt.fill', () => {
    desk.fills += 1

    return { isFilled: true }
  })
  on('prompt.edit', async (_$, e) => {
    const box = desk.core(e)

    return desk.cursor === undefined ? box : { ...box, cursor: desk.cursor }
  })
  on('tool.call', async () => (desk.results.shift() ?? { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }) as never)

  return desk
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const typed = async ($: Engine, desk: Desk, text: string, cursor = text.length): Promise<PromptEditResult> => {
  desk.cursor = cursor

  return ($ as never as { prompt: { edit: (e: PromptEditInput) => Promise<PromptEditResult> } }).prompt.edit({
    origin: { kind: 'composer' },
    text: '',
    cursor: 0,
    start: 0,
    end: 0,
    inputText: text,
  })
}

const paint = (text: string, word: string, style: object, from = 0): PromptDecoration => {
  const start = text.indexOf(word, from)

  return { start, end: start + word.length, ...style } as PromptDecoration
}

const call = async ($: Engine, tool: string, id: string): Promise<unknown> =>
  ($ as never as { tool: { call: (e: object) => Promise<unknown> } }).tool.call(
    tool === 'Bash' || tool === 'PowerShell'
      ? { tool, tool_use_id: id, command: 'mkdir notes' }
      : tool === 'Read'
        ? { tool, tool_use_id: id, file_path: `${ROOT}/README.md` }
        : { tool, tool_use_id: id, file_path: `${ROOT}/notes/plan.md`, content: 'hi', old_string: 'a', new_string: 'b', notebook_path: `${ROOT}/notes/plan.ipynb`, new_source: 'hi' },
  )

const end = async ($: Engine, turnId = 'turn-1'): Promise<unknown> =>
  $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId, reason: 'answer' } as never)

const card = async ($: Engine, columns = 40): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, 'Pane', columns))
  const box = await ui.find({ key: 'card' })
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const isEmpty = (await ui.find({ key: 'empty' })) !== undefined
  const texts = (await ui.findAll({ type: 'Text' })).slice(3)
  const lines: string[] = []
  for (let at = 0; at < 4; at += 1) {
    for (const key of [`row-${at}`, `near-${at}`]) {
      const line = (await ui.find({ key }))?.text
      if (line !== undefined) lines.push(line)
    }
  }
  for (const key of ['more', 'partial']) {
    const line = (await ui.find({ key }))?.text
    if (line !== undefined) lines.push(line)
  }
  await ui.unmount()
  if (box === undefined) return undefined

  return { note, lines, sentence: isEmpty ? texts.map(row => row.text) : [], wraps: texts.map(row => row.props.wrap) }
}

const settled = async (ready: () => boolean): Promise<void> => {
  for (let wait = 0; wait < 500 && !ready(); wait += 1) await new Promise(done => setTimeout(done, 1))
}

test('A1: a ready index with no path in the draft shows the empty text and the file count; before that, the working text', PLUGINS, async ($, on) => {
  const desk = open(on, FILES, { isSlow: true })

  await session($)
  await $.command.run(run('place', 'side'))
  const switching = $.command.run(run(NAME, 'on'))
  await settled(() => desk.world.toasts.some(toast => toast.startsWith('set squiggle-widget/index')))
  expect(await card($)).toMatchObject({ note: 'indexing', sentence: READING, lines: [] })
  expect((await card($, 20))?.note).toBe('listing')
  expect((await typed($, desk, 'open test.js now')).decorations).toBeUndefined()

  desk.world.store.delete('isSlow')
  await desk.world.clock.advance(SLOW_MS)
  await switching
  expect(await card($)).toMatchObject({ note: '13 files', sentence: EMPTY, lines: [] })
  expect(await card($, 20)).toMatchObject({ note: '13', sentence: ['Type a file name', 'in your prompt:', 'it lights up if', 'it exists.'] })
  await typed($, desk, 'please tidy the imports')
  expect(await card($)).toMatchObject({ note: '13 files', sentence: EMPTY })

  desk.listing = git(['README.md'])
  await cmd($, 'on')
  expect((await card($))?.note).toBe('1 file')
})

test('A2: path-shaped words are candidates, look-alikes are not, and only the first 8 are checked', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const paths = 'see src/x.ts x.ts ./x.ts src\\x.ts src/hooks ok'
  expect((await typed($, desk, paths, 0)).decorations).toEqual([
    paint(paths, 'src/x.ts', GREEN),
    paint(paths, 'x.ts', GREEN, 12),
    paint(paths, './x.ts', GREEN),
    paint(paths, 'src\\x.ts', GREEN),
    paint(paths, 'src/hooks', GREEN),
  ])
  expect((await card($))?.lines).toEqual(['✓ src/x.ts', '✓ src/x.ts', '✓ src/hooks'])

  const others = 'see https://a.b/x.ts 2.1.0 and/or src/*.ts ../x.ts /etc/x.ts C:\\x.ts formatjs format.jsx ok'
  expect((await typed($, desk, others, 0)).decorations).toBeUndefined()
  expect(await card($)).toMatchObject({ note: '13 files', sentence: EMPTY })
  expect(await cmd($, `check ${others}`)).toBe(`Squiggle: 13 files.\n${NO_NAME}`)

  const many = `see ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(at => `src/m${at}.ts`).join(' ')} ok`
  const marks = (await typed($, desk, many, 0)).decorations ?? []
  expect(marks).toHaveLength(8)
  expect(marks.at(-1)).toEqual(paint(many, 'src/m8.ts', RED))
  expect(await card($)).toMatchObject({ note: '8 missing', lines: ['✗ src/m1.ts', '✗ src/m2.ts', '✗ src/m3.ts', '✗ src/m4.ts', '+4 more'] })
  expect(await cmd($, `check ${many}`)).not.toContain('src/m9.ts')
})

test('A3: wrappers, punctuation and line numbers are stripped and only the path is painted', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const text = 'see (src/x.ts). "x.ts", @src/x.ts x.ts:42:7 end'
  expect((await typed($, desk, text, 0)).decorations).toEqual([
    paint(text, 'src/x.ts', GREEN),
    paint(text, 'x.ts', GREEN, text.indexOf('"x.ts"')),
    paint(text, 'src/x.ts', GREEN, text.indexOf('@')),
    paint(text, 'x.ts', GREEN, text.indexOf('x.ts:42')),
  ])
  expect(await cmd($, `check ${text}`)).toBe('Squiggle: 13 files.\n✓ src/x.ts\n✓ src/x.ts')
  expect(await cmd($, 'check `src/db.ts:9`, <README.md>; [docs/guide.md]!')).toBe('Squiggle: 13 files.\n✓ src/db.ts\n✓ README.md\n✓ docs/guide.md')
})

test('A4: found is an exact path, a path ending at a slash, a base name with one or several matches, or a folder; a case slip is missing', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(await cmd($, 'check src/db.ts hooks/lib.ts format.js register.tsx src/hooks readme.md ooks/lib.ts')).toBe(
    ['Squiggle: 13 files.', '✓ src/db.ts', '✓ src/hooks/lib.ts', '✓ src/format.js', '✓ register.tsx  3 files', '✓ src/hooks', '✗ readme.md  no such file, nearest: README.md'].join('\n'),
  )

  const text = 'see format.js register.tsx readme.md ok'
  expect((await typed($, desk, text, 0)).decorations).toEqual([paint(text, 'format.js', GREEN), paint(text, 'register.tsx', GREEN), paint(text, 'readme.md', RED)])
  expect(await card($)).toMatchObject({ note: '1 missing', lines: ['✗ readme.md', '  nearest README.md', '✓ src/format.js', '✓ register.tsx  3 files'] })
})

test('A5: the nearest name follows the distance, length, 4-character, tie-break and comparison rules', PLUGINS, async ($, on) => {
  const fillers = Array.from({ length: 2100 }, (_, at) => `gen/qq-${String(at).padStart(4, '0')}.json`)
  const desk = open(on, [...FILES, 'x/y/config.json', 'b/config.json', 'a/config.json', 'lib/config.json', ...fillers, 'etc/settings.json'])

  await start($)
  expect(await cmd($, 'check src/formt.js src/sun.js Node.js docs/nope.md confg.json setings.json')).toBe(
    ['Squiggle: 2,118 files.', '✗ src/formt.js  no such file, nearest: src/format.js', '✗ src/sun.js  no such file', '✗ docs/nope.md  no such file', '✗ confg.json  no such file, nearest: a/config.json'].join('\n'),
  )

  const text = 'see src/formt.js src/sun.js Node.js docs/nope.md ok'
  expect((await typed($, desk, text, 0)).decorations).toEqual([paint(text, 'src/formt.js', RED), paint(text, 'src/sun.js', RED), paint(text, 'docs/nope.md', RED)])
  expect((await card($))?.lines).toEqual(['✗ src/formt.js', '  nearest src/format.js', '✗ src/sun.js', '✗ docs/nope.md'])

  desk.listing = git(['etc/settings.json', ...fillers])
  await cmd($, 'on')
  expect(await cmd($, 'check setings.json')).toBe('Squiggle: 2,101 files.\n✗ setings.json  no such file, nearest: etc/settings.json')
})

test('A6: the answer of next(e) keeps its text, cursor and decorations, and the paint is added at offsets into that text', PLUGINS, async ($, on) => {
  const desk = open(on)
  const mine: PromptDecoration = { start: 0, end: 2, bold: true }
  desk.core = e => ({ ...spliced(e), text: `>> ${spliced(e).text}`, decorations: [mine] })

  await start($)
  const edited = await typed($, desk, 'fix src/formt.js and test.js now', 5)
  const text = '>> fix src/formt.js and test.js now'
  expect(edited).toEqual({ text, cursor: 5, decorations: [mine, paint(text, 'src/formt.js', RED), paint(text, 'test.js', GREEN)] })
  expect(edited.decorations?.[1]).toEqual({ start: 7, end: 19, color: 'red', underline: true })
  expect(edited.decorations?.[2]).toEqual({ start: 24, end: 31, color: 'green' })
})

test('A7: the word under the cursor is never missing, is green when found, and turns red once the cursor moves on', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect((await typed($, desk, 'open src/formt.js')).decorations).toBeUndefined()
  expect(await card($)).toMatchObject({ note: '13 files', sentence: EMPTY })
  expect((await typed($, desk, 'open src/formt.js', 5)).decorations).toBeUndefined()

  const found = 'open src/format.js'
  expect((await typed($, desk, found)).decorations).toEqual([paint(found, 'src/format.js', GREEN)])
  expect(await card($)).toMatchObject({ note: '1 found', lines: ['✓ src/format.js'] })

  const moved = 'open src/formt.js '
  expect((await typed($, desk, moved)).decorations).toEqual([paint(moved, 'src/formt.js', RED)])
  expect(await card($)).toMatchObject({ note: '1 missing', lines: ['✗ src/formt.js', '  nearest src/format.js'] })

  const twice = 'src/formt.js or src/formt.js'
  expect((await typed($, desk, twice)).decorations).toEqual([paint(twice, 'src/formt.js', RED)])
  expect((await card($))?.lines).toEqual(['✗ src/formt.js', '  nearest src/format.js'])
})

test('A8: the busiest card lists missing words first, then found, four words and a count of the rest', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, desk, 'see auth-midleware.ts and src/db.ts register.tsx src/formt.js docs/guide.md README.md ok')
  const wide = await card($)
  expect(wide).toMatchObject({
    note: '2 missing',
    lines: ['✗ auth-midleware.ts', '  nearest src/auth-middleware.ts', '✗ src/formt.js', '  nearest src/format.js', '✓ src/db.ts', '✓ register.tsx  3 files', '+2 more'],
  })

  const narrow = await card($, 20)
  expect(narrow).toMatchObject({
    note: '2 ✗',
    lines: ['✗ auth-midleware.ts', '  src/auth-middleware.ts', '✗ src/formt.js', '  src/format.js', '✓ src/db.ts', '✓ register.tsx  3 files', '+2 more'],
  })
  expect(narrow?.wraps).toEqual([
    ...[undefined, 'truncate-end', undefined, 'truncate-start'],
    ...[undefined, 'truncate-end', undefined, 'truncate-start'],
    ...[undefined, 'truncate-start'],
    ...[undefined, 'truncate-end', undefined],
    'truncate-end',
  ])

  await typed($, desk, 'see src/db.ts and README.md ok')
  expect(await card($)).toMatchObject({ note: '2 found', lines: ['✓ src/db.ts', '✓ README.md'] })
  expect((await card($, 20))?.note).toBe('2 found')
})

test('A9: an edit calls no process, file or prompt API, writes found only when a verdict changes, and survives a throw', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const calls = (): number[] => [desk.runs.length, desk.lists.length, desk.reads, desk.fills]
  const before = calls()
  const writes = (): string[] => desk.world.toasts.filter(toast => toast.startsWith('set squiggle-widget/'))
  const written = writes().length

  await typed($, desk, 'open src/formt.js and test.js ')
  expect(writes().slice(written)).toEqual([expect.stringMatching(/^set squiggle-widget\/found /)])
  await typed($, desk, 'open src/formt.js and test.js then ')
  await typed($, desk, 'open src/formt.js and test.js then run ')
  expect(writes()).toHaveLength(written + 1)
  await typed($, desk, 'open src/formt.js and then run ')
  expect(writes()).toHaveLength(written + 2)
  expect(calls()).toEqual(before)

  desk.world.store.set('isBroken', true)
  expect(await typed($, desk, 'open src/formt.js and test.js ', 3)).toEqual({ text: 'open src/formt.js and test.js ', cursor: 3 })
  desk.world.store.delete('isBroken')
  expect((await typed($, desk, 'open test.js ')).decorations).toEqual([paint('open test.js ', 'test.js', GREEN)])
  expect(calls()).toEqual(before)
})

test('A10: the index comes from git ls-files or a folder walk; a failed listing checks nothing and a partial one marks only found words', PLUGINS, async ($, on) => {
  const desk = open(on, FILES, { isOn: true })
  const text = 'see test.js and src/formt.js ok'

  await session($)
  await $.command.run(run('place', 'side'))
  expect(desk.runs).toEqual([{ argv: LS_FILES, init: { cwd: ROOT, timeoutMs: 3000 } }])
  await cmd($, 'on')
  expect(desk.runs).toEqual([
    { argv: LS_FILES, init: { cwd: ROOT, timeoutMs: 3000 } },
    { argv: LS_FILES, init: { cwd: ROOT, timeoutMs: 3000 } },
  ])
  expect(desk.lists).toEqual([])
  expect((await typed($, desk, text, 0)).decorations).toHaveLength(2)

  for (const failure of [git([], { exitCode: 128, stdout: '', stderr: 'fatal: detected dubious ownership in repository' }), new Error('process.run: timed out after 3000ms')]) {
    desk.listing = failure
    await cmd($, 'on')
    expect(await card($)).toMatchObject({ note: 'unchecked', sentence: FAILED, lines: [] })
    expect((await card($, 20))?.note).toBe('failed')
    expect((await typed($, desk, text, 0)).decorations).toBeUndefined()
    expect(await card($)).toMatchObject({ note: 'unchecked', sentence: FAILED, lines: [] })
  }

  const many = [...FILES, ...Array.from({ length: 9990 }, (_, at) => `gen/part-${at}.txt`)]
  for (const listing of [git(many), git(FILES, { stdout: `${FILES.join('\n')}\nsrc/cut-of`, isStdoutTruncated: true })]) {
    desk.listing = listing
    await cmd($, 'on')
    expect(await card($)).toMatchObject({ note: 'partial', sentence: EMPTY, lines: [] })
    expect((await typed($, desk, text, 0)).decorations).toEqual([paint(text, 'test.js', GREEN)])
    expect(await card($)).toMatchObject({ note: 'partial', lines: ['✓ test.js', 'Partial list: misses not marked.'] })
    expect(await card($, 20)).toMatchObject({ note: 'partial', lines: ['✓ test.js', 'Partial list.'] })
    expect((await card($, 20))?.wraps.at(-1)).toBe('truncate-end')
  }
  expect(await cmd($, 'check src/cut-of test.js')).toBe('Squiggle: 13 files.\n✓ test.js\nPartial list: misses not marked.')

  const runs = desk.runs.length
  desk.repo = null
  desk.tree = {
    [ROOT]: [file('README.md'), dir('src'), dir('.git'), dir('node_modules'), file('.env'), file('test.js')],
    [`${ROOT}/src`]: [file('x.ts'), dir('hooks'), dir('locked')],
    [`${ROOT}/src/hooks`]: [file('lib.ts')],
  }
  await cmd($, 'on')
  expect(desk.runs).toHaveLength(runs)
  expect(desk.lists).toEqual([ROOT, `${ROOT}/src`, `${ROOT}/src/hooks`, `${ROOT}/src/locked`])
  expect(await cmd($, 'check hooks/lib.ts x.ts .env src/formt.ts')).toBe('Squiggle: 4 files.\n✓ src/hooks/lib.ts\n✓ src/x.ts\n✗ src/formt.ts  no such file')

  desk.tree = { [ROOT]: [...Array.from({ length: 2001 }, (_, at) => file(`note-${at}.md`))] }
  await cmd($, 'on')
  expect(await card($)).toMatchObject({ note: 'partial', sentence: EMPTY })
  expect(await cmd($, 'check note-7.md note-2000.md')).toBe('Squiggle: 2,000 files.\n✓ note-7.md\nPartial list: misses not marked.')

  desk.tree = { [ROOT]: Array.from({ length: 201 }, (_, at) => dir(`pkg-${at}`)), ...Object.fromEntries(Array.from({ length: 201 }, (_, at) => [`${ROOT}/pkg-${at}`, [file('index.ts')]])) }
  desk.lists = []
  await cmd($, 'on')
  expect(desk.lists).toHaveLength(200)
  expect((await card($))?.note).toBe('partial')

  desk.tree = {}
  await cmd($, 'on')
  expect(await card($)).toMatchObject({ note: 'unchecked', sentence: FAILED })
})

test('A11: a writing tool that succeeded marks the index stale, and the turn end lists the files once and refills the card', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(desk.runs).toHaveLength(1)

  await call($, 'Read', 'turn-1-a')
  desk.results.push(DENIED, ERRORED)
  await call($, 'Write', 'turn-1-b')
  await call($, 'Write', 'turn-1-c')
  await end($)
  expect(desk.runs).toHaveLength(1)

  for (const [at, tool] of WRITERS.entries()) {
    const reads = desk.reads
    desk.listing = git([...FILES, `notes/plan-${at}.md`])
    desk.box = { text: `see notes/plan-${at}.md and src/formt.js ok`, cursor: 0 }
    if (tool === 'Write') desk.results.push(WROTE)
    await call($, tool, `turn-2-${at}`)
    await call($, tool, `turn-2-${at}-again`)
    expect(desk.runs).toHaveLength(1 + at)
    expect((await card($))?.lines).not.toContain(`✓ notes/plan-${at}.md`)

    await end($, `turn-2-${at}`)
    expect(desk.runs).toHaveLength(2 + at)
    expect(desk.reads).toBe(reads + 1)
    expect(await card($)).toMatchObject({ note: '1 missing', lines: ['✗ src/formt.js', '  nearest src/format.js', `✓ notes/plan-${at}.md`] })

    await end($, `turn-3-${at}`)
    expect(desk.runs).toHaveLength(2 + at)
  }

  desk.listing = new Error('process.run: timed out after 3000ms')
  await call($, 'Edit', 'turn-4-a')
  await end($, 'turn-4')
  expect(await card($)).toMatchObject({ note: 'unchecked', sentence: FAILED, lines: [] })
  expect((await typed($, desk, 'see test.js ok', 0)).decorations).toBeUndefined()
})

test('A12: switching on fills the card from the draft in the box, and starts with the empty card when the box cannot be read', PLUGINS, async ($, on) => {
  const desk = open(on)
  desk.box = { text: 'fix src/formt.js and test.js', cursor: 28 }

  await start($)
  expect(desk.reads).toBe(1)
  expect(await card($)).toMatchObject({ note: '1 missing', lines: ['✗ src/formt.js', '  nearest src/format.js', '✓ test.js'] })

  desk.box = { text: 'fix test.js and src/formt.js', cursor: 28 }
  await cmd($, 'off')
  await cmd($, 'on')
  expect(await card($)).toMatchObject({ note: '1 found', lines: ['✓ test.js'] })

  desk.box = new Error('prompt.read is not a function')
  await cmd($, 'off')
  expect(await cmd($, 'on')).toBe('Squiggle on; /widgets places it.')
  expect(await card($)).toMatchObject({ note: '13 files', sentence: EMPTY, lines: [] })
  expect(await cmd($, 'check')).toBe(`Squiggle: 13 files.\n${NO_NAME}`)
})

test('A13: a prompt from the composer, the bridge or the SDK empties the list and goes on unchanged', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  for (const kind of ['composer', 'bridge', 'sdk'] as const) {
    const text = `fix src/formt.js and test.js for ${kind} `
    await typed($, desk, text)
    expect((await card($))?.lines).toHaveLength(3)

    const sent = await $.prompt.submit({ text, wait: false, origin: { kind }, context: [`note for ${kind}`] } as never)
    expect(sent).toEqual({ text })
    expect(desk.world.contexts.at(-1)).toBe(`note for ${kind}`)
    expect(await card($)).toMatchObject({ note: '13 files', sentence: EMPTY, lines: [] })
  }
  expect(desk.world.contexts).toHaveLength(3)
})

test('A14: check answers the count and a line per word, judges the word under the cursor, rebuilds a stale index and leaves the box and card alone', PLUGINS, async ($, on) => {
  const desk = open(on)

  await session($)
  await $.command.run(run('place', 'side'))
  expect(await cmd($, 'check README.md')).toBe(OFF)
  expect(desk.runs).toEqual([])

  await cmd($, 'on')
  expect(await cmd($, 'check open README.md and REDME.md')).toBe('Squiggle: 13 files.\n✓ README.md\n✗ REDME.md  no such file, nearest: README.md')
  expect(await cmd($, 'check please tidy the imports')).toBe(`Squiggle: 13 files.\n${NO_NAME}`)
  const long = `src/${'deep/'.repeat(59)}q.ts`
  expect(long).toHaveLength(303)
  expect(await cmd($, `Check ${long}`)).toBe(`Squiggle: 13 files.\n✗ ${long}  no such file`)

  await typed($, desk, 'see src/db.ts ok')
  const shown = await card($)
  desk.box = { text: 'fix test.js and src/formt.js', cursor: 28 }
  expect(await cmd($, 'check')).toBe('Squiggle: 13 files.\n✓ test.js\n✗ src/formt.js  no such file, nearest: src/format.js')
  expect(await card($)).toEqual(shown)

  desk.results.push(WROTE)
  await call($, 'Write', 'turn-1-a')
  desk.listing = git([...FILES, 'notes/plan.md'])
  expect(await cmd($, 'check notes/plan.md and notes/plam.md')).toBe('Squiggle: 14 files.\n✓ notes/plan.md\n✗ notes/plam.md  no such file, nearest: notes/plan.md')
  expect(desk.runs).toHaveLength(2)
  await cmd($, 'check notes/plan.md')
  expect(desk.runs).toHaveLength(2)
  expect((await card($))?.lines).toEqual(shown?.lines)
  expect(desk.fills).toBe(0)

  expect(await cmd($, 'fix')).toBe(USAGE)
  expect(await cmd($, 'checks README.md')).toBe(USAGE)
  expect((await card($))?.lines).toEqual(shown?.lines)
})

test('A15: switching off resets the index, the paths and the list, and nothing runs or is painted while off', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await typed($, desk, 'see src/formt.js and test.js ok')
  const written = desk.world.toasts.length
  await cmd($, 'off')
  expect(desk.world.toasts.slice(written)).toEqual([
    'set squiggle-widget/isOn false',
    'set squiggle-widget/index {"status":"building","source":"git","count":0,"isPartial":fa',
    'set squiggle-widget/paths []',
    'set squiggle-widget/found []',
  ])
  expect(await card($)).toBeUndefined()

  const mine: PromptDecoration = { start: 0, end: 3, italic: true }
  desk.core = e => ({ ...spliced(e), decorations: [mine] })
  expect(await typed($, desk, 'see src/formt.js and test.js ok', 9)).toEqual({ text: 'see src/formt.js and test.js ok', cursor: 9, decorations: [mine] })

  const quiet = desk.world.toasts.length
  await session($)
  desk.results.push(WROTE)
  await call($, 'Write', 'turn-1-a')
  await call($, 'Bash', 'turn-1-b')
  await end($)
  await $.prompt.submit({ text: 'see test.js', wait: false, origin: { kind: 'composer' } } as never)
  expect(desk.runs).toHaveLength(1)
  expect(desk.lists).toEqual([])
  expect(desk.reads).toBe(1)
  expect(desk.world.toasts.slice(quiet)).toEqual([])

  desk.listing = git(['README.md'])
  desk.core = spliced
  await cmd($, 'on')
  expect((await typed($, desk, 'see test.js and README.md ok', 0)).decorations).toEqual([paint('see test.js and README.md ok', 'README.md', GREEN)])
})

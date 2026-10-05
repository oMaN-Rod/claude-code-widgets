import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { CollisionWatch } from '../types'
import { LAYOUT, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Stat = { kind: 'file' | 'dir'; mtimeMs: number }
type Entry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }
type Call = { tool: string; command?: string; file_path?: string; notebook_path?: string }
type Setup = { env?: Readonly<Record<string, string>>; cwd?: string; id?: string; entries?: Entry[] }
type Desk = Ground & {
  calls: string[]
  stats: Map<string, Stat>
  times: Map<string, number>
  id: string | null
  cwd: string
  reply: (e: Call) => unknown
}
type Shared = { id: string; cwd: string; at: number; files: Record<string, { path: string; at: number }> }

const NAME = 'collision-widget'
const SECOND = 1000
const MINUTE = 60_000
const HOUR = 3_600_000
const HOME = '/home/dev'
const DIR = `${HOME}/.claude/collision-widget`
const CWD = '/work/project'
const ALLOW = { decision: 'allow' }
const EMPTY = 'No shared files. A file appears here when another session edits one that this session edits.'
const NO_WRITE = 'Cannot write the shared folder. Others cannot see edits made here.'
const NO_HOME = 'No home folder found. Cannot watch other sessions.'

const PROBE: Plugin = {
  name: 'probe',
  register(on) {
    on('clock.now', async ($, e, next) => {
      $.ui.toast('clock.now')

      return next(e)
    })
    on('fs.read', async ($, e, next) => {
      $.ui.toast('fs.read')

      return next(e)
    })
    on('fs.write', async ($, e, next) => {
      $.ui.toast('fs.write')
      if ((await $.store.get('isDiskFull')) === true) return { deny: 'ENOSPC: no space left on device' }

      return next(e)
    })
    on('tool.check', async ($, e, next) =>
      (await $.store.get('isDenied')) === true ? { decision: 'deny', reason: 'Denied by a settings rule.' } : next(e),
    )
    on('command.run', { command: 'peek' }, async $ => ({
      text: JSON.stringify((await $.state.get({ plugin: 'collision-widget', key: 'watch' } as const)).value ?? null),
    }))
  },
}
const PLUGINS = { plugins: [LAYOUT, PROBE] }

const flat = (path: string): string => path.replaceAll('\\', '/').replace(/^[a-z]:/i, '')

const answered = (e: Call): Record<string, unknown> => {
  if (e.tool === 'Read') {
    return { result: { type: 'text', file: { filePath: e.file_path, content: 'export {}\n', numLines: 1, startLine: 1, totalLines: 1 } }, text: 'export {}\n', isReadOnly: true, ref: 1 }
  }
  if (e.tool === 'Bash') return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok', ref: 1 }
  const path = e.file_path ?? e.notebook_path

  return { result: { filePath: path, oldString: 'a', newString: 'b', originalFile: 'a\n', structuredPatch: [], userModified: false, replaceAll: false }, text: `The file ${path} has been updated.`, ref: 1 }
}

const open = async ($: Engine, on: On, setup: Setup = {}): Promise<Desk> => {
  const env = setup.env ?? { HOME }
  const local = { calls: [] as string[], stats: new Map<string, Stat>(), times: new Map<string, number>(), id: setup.id ?? 'session-1', cwd: setup.cwd ?? CWD, reply: answered }
  const world = ground(on, {
    answers: {
      'env.get': (e: { name: string }) => {
        desk.calls.push(`env.get ${e.name}`)

        return env[e.name]
      },
      'fs.list': (e: { path: string }) => {
        desk.calls.push(`fs.list ${e.path}`)
        const base = `${flat(e.path)}/`

        return [
          ...(setup.entries ?? []),
          ...[...world.files.entries()]
            .filter(([path]) => path.startsWith(base) && !path.slice(base.length).includes('/'))
            .map(([path, text]): Entry => ({ name: path.slice(base.length), kind: 'file', size: text.length, mtimeMs: desk.times.get(path) ?? world.clock.now(), isLink: false })),
        ]
      },
      'fs.stat': (e: { path: string }) => {
        desk.calls.push(`fs.stat ${flat(e.path)}`)
        const stat = desk.stats.get(flat(e.path))
        if (stat === undefined) throw new Error(`ENOENT: no such file or directory, stat '${e.path}'`)

        return { ...stat, size: 120, isLink: false }
      },
      'session.id': () => {
        desk.calls.push('session.id')
        if (desk.id === null) throw new Error('No session is bound yet.')

        return desk.id
      },
      'session.cwd': () => {
        desk.calls.push('session.cwd')

        return desk.cwd
      },
    },
  })
  const desk: Desk = Object.assign(local, world)
  ;(on as unknown as (event: string, hook: (_$: unknown, e: Call) => unknown) => void)('tool.call', async (_$, e) => desk.reply(e))

  await session($, desk.cwd)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))

  return desk
}

const inputOf = (tool: string, path: string): Record<string, unknown> =>
  tool === 'NotebookEdit'
    ? { notebook_path: path, new_source: 'plot(data)' }
    : tool === 'Write'
      ? { file_path: path, content: 'export {}\n' }
      : tool === 'MultiEdit'
        ? { file_path: path, edits: [{ old_string: 'a', new_string: 'b' }] }
        : tool === 'Read'
          ? { file_path: path }
          : { file_path: path, old_string: 'a', new_string: 'b' }

const check = ($: Engine, path: string, tool = 'Edit') => $.tool.check({ tool, input: inputOf(tool, path), tool_use_id: 'toolu_01' })

const call = ($: Engine, tool: string, input: Record<string, unknown>): Promise<unknown> => $.tool.call({ tool, tool_use_id: 'toolu_01', ...input } as never)

const edit = async ($: Engine, path: string, tool = 'Edit'): Promise<{ decision: string }> => {
  const verdict = await check($, path, tool)
  if (verdict.decision !== 'deny') await call($, tool, inputOf(tool, path))

  return verdict
}

const reread = ($: Engine, path: string): Promise<unknown> => call($, 'Read', inputOf('Read', path))

const bash = ($: Engine, command: string): Promise<unknown> => call($, 'Bash', { command, description: 'Run a command' })

const peek = async ($: Engine): Promise<CollisionWatch> => JSON.parse((await $.command.run(run('peek'))).text ?? 'null') as CollisionWatch

const share = (desk: Desk, id: string, cwd: string, files: Readonly<Record<string, number>>, file = `${DIR}/${id}.json`): string => {
  const text = JSON.stringify({ id, cwd, at: desk.clock.now(), files: Object.fromEntries(Object.entries(files).map(([path, at]) => [path.toLowerCase(), { path, at }])) })
  desk.files.set(file, text)

  return text
}

const sharedIn = (desk: Desk, file = `${DIR}/session-1.json`): Shared | undefined => {
  const text = desk.files.get(file)

  return text === undefined ? undefined : (JSON.parse(text) as Shared)
}

const keysIn = (desk: Desk, file = `${DIR}/session-1.json`): string[] => Object.keys(sharedIn(desk, file)?.files ?? {}).sort()

const fileWrites = (desk: Desk): string[] => desk.writes.filter(write => write.startsWith('file '))

const made = (desk: Desk): string[] => [...desk.calls, ...desk.toasts]

const statCalls = (desk: Desk): string[] => desk.calls.filter(one => one.startsWith('fs.stat ')).map(one => one.slice('fs.stat '.length))

const envCalls = (desk: Desk): string[] => desk.calls.filter(one => one.startsWith('env.get '))

const leaves = (node: unknown): string[] => {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(leaves)
  if (typeof node === 'object' && node !== null) return leaves((node as { children?: unknown }).children ?? [])

  return []
}

const card = async ($: Engine, columns = 40): Promise<{ note: string; lines: string[] }> => {
  const ui = await $.ui.mount(target(NAME, 'Pane', columns))
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const column = ((await ui.find({ key: 'body' }))?.children[0] as { children?: unknown[] } | undefined)?.children ?? []
  const lines = (column.flat(Infinity) as unknown[]).map(row => leaves(row).join(' ')).filter(line => line !== '')
  await ui.unmount()

  return { note, lines }
}

test('A1: the empty card, then nearby sessions and edited files are counted with their plurals', PLUGINS, async ($, on) => {
  const desk = await open($, on)

  const empty = await card($)
  expect(empty.note).toBe('idle')
  expect(empty.lines.join(' ')).toBe(EMPTY)

  share(desk, 'session-2', '/work/api', { '/work/api/src/server.ts': desk.clock.now() })
  expect(await check($, 'src/sum.js')).toEqual(ALLOW)
  expect(await card($)).toEqual({ note: 'idle', lines: ['No files edited', '1 other nearby'] })

  share(desk, 'session-3', '/work/web', { '/work/web/src/app.tsx': desk.clock.now() })
  expect(await check($, 'src/sum.js')).toEqual(ALLOW)
  expect(await card($)).toEqual({ note: 'idle', lines: ['No files edited', '2 others nearby'] })

  desk.files.delete(`${DIR}/session-2.json`)
  desk.files.delete(`${DIR}/session-3.json`)
  await desk.clock.advance(MINUTE)
  await edit($, 'src/sum.js')
  expect(sharedIn(desk)).toEqual({ id: 'session-1', cwd: CWD, at: desk.clock.now(), files: { '/work/project/src/sum.js': { path: '/work/project/src/sum.js', at: desk.clock.now() } } })
  expect(await card($)).toEqual({ note: 'clear', lines: ['1 file edited', 'No others nearby'] })

  await edit($, 'src/format.js')
  expect(await card($)).toEqual({ note: 'clear', lines: ['2 files edited', 'No others nearby'] })
})

test('A2: an edit of a file another session changed is denied, allowed after a read, and denied again after a newer change', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  share(desk, 'session-2', '/work/api', { '/work/project/src/sum.js': desk.clock.now() })
  await desk.clock.advance(90 * SECOND)

  expect(await check($, 'src/sum.js')).toEqual({
    decision: 'deny',
    reason:
      'collision-widget: sum.js was edited by another Claude Code session (in api) 1m 30s ago, after this session last read it. Read the file again, then repeat the edit, and tell the user that two sessions are working on this file.',
  })
  expect((await peek($)).mine).toEqual({})
  expect(await card($)).toEqual({ note: '1 met', lines: ['✕ sum.js api · stopped'] })

  await reread($, 'src/sum.js')
  expect(await check($, 'src/sum.js')).toEqual(ALLOW)
  expect(await card($)).toEqual({ note: '1 met', lines: ['✓ sum.js api · re-read'] })

  await desk.clock.advance(MINUTE)
  share(desk, 'session-2', '/work/api', { '/work/project/src/sum.js': desk.clock.now() })
  expect((await check($, 'src/sum.js')).decision).toBe('deny')
  expect(await card($)).toEqual({ note: '1 met', lines: ['✕ sum.js api · stopped'] })
})

test('A3: a deny beneath, a query, failed calls and a denied call pass untouched and record nothing', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  share(desk, 'session-2', '/work/api', { '/work/project/src/sum.js': desk.clock.now() })
  await edit($, 'src/format.js')
  await desk.clock.advance(MINUTE)
  desk.stats.set('/work/project/src/sum.js', { kind: 'file', mtimeMs: desk.clock.now() })
  const before = await peek($)
  const written = fileWrites(desk).length

  desk.store.set('isDenied', true)
  expect(await check($, 'src/sum.js')).toEqual({ decision: 'deny', reason: 'Denied by a settings rule.' })
  expect((await peek($)).meets).toEqual([])
  desk.store.delete('isDenied')

  const asked = made(desk).length
  expect(await $.tool.check({ tool: 'Edit', input: inputOf('Edit', 'src/sum.js') })).toEqual(ALLOW)
  expect(made(desk).length).toBe(asked)
  expect((await peek($)).meets).toEqual([])

  const failures: [tool: string, input: Record<string, unknown>, answer: Record<string, unknown>][] = [
    ['Edit', inputOf('Edit', 'src/index.js'), { result: 'String to replace not found in file.\nString: a', text: 'String to replace not found in file.\nString: a', isError: true, ref: 2 }],
    ['Write', inputOf('Write', 'src/new.js'), { result: 'File has not been read yet. Read it first before writing to it.', text: 'File has not been read yet. Read it first before writing to it.', isError: true, ref: 3 }],
    ['Bash', { command: 'sed -i s/1/0/ src/sum.js' }, { result: 'Error: Exit code 2\nsed: unterminated command', text: 'Error: Exit code 2\nsed: unterminated command', isError: true, ref: 4 }],
    ['Edit', inputOf('Edit', 'src/index.js'), { deny: 'Blocked by a PreToolUse hook.' }],
  ]
  for (const [tool, input, answer] of failures) {
    desk.reply = () => answer
    expect(await call($, tool, input)).toEqual(answer)
    expect(await peek($)).toEqual(before)
    expect(fileWrites(desk).length).toBe(written)
    expect(statCalls(desk)).toEqual([])
  }
})

test('A4: Write, NotebookEdit and MultiEdit are recorded and denied, and every spelling of a path gives one key', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  const tools: [tool: string, path: string, key: string][] = [
    ['Write', 'docs/guide.md', '/work/project/docs/guide.md'],
    ['NotebookEdit', 'notebooks/plot.ipynb', '/work/project/notebooks/plot.ipynb'],
    ['MultiEdit', 'src/index.js', '/work/project/src/index.js'],
  ]
  for (const [tool, path, key] of tools) {
    expect(await edit($, path, tool)).toEqual(ALLOW)
    expect((await peek($)).mine[key]).toEqual({ path: key, at: desk.clock.now() })
    expect(sharedIn(desk)?.files[key]).toEqual({ path: key, at: desk.clock.now() })
  }

  await desk.clock.advance(MINUTE)
  share(desk, 'session-2', '/work/api', Object.fromEntries(tools.map(([, , key]) => [key, desk.clock.now()])))
  for (const [tool, path] of tools) expect((await check($, path, tool)).decision).toBe('deny')

  await $.command.run(run(NAME, 'clear'))
  desk.files.delete(`${DIR}/session-2.json`)
  desk.cwd = 'C:\\Work\\App'
  for (const path of ['src/a.ts', 'C:\\Work\\App\\src\\a.ts', 'c:/work/app/src/./x/../a.ts', '/c/Work/App/src/a.ts']) {
    await edit($, path)
    expect(Object.keys((await peek($)).mine)).toEqual(['c:/work/app/src/a.ts'])
  }

  await $.command.run(run(NAME, 'clear'))
  desk.cwd = '/Work/App'
  for (const path of ['/Work/App/a.ts', '/work/app/a.ts']) {
    await edit($, path)
    expect(Object.keys((await peek($)).mine)).toEqual(['/work/app/a.ts'])
  }
})

test('A5: a command records only the files it changed, skips words that are not files, and makes at most 40 stat calls', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  await desk.clock.advance(MINUTE)
  desk.stats.set('/work/project/src/a.ts', { kind: 'file', mtimeMs: desk.clock.now() })
  const answer = answered({ tool: 'Bash' })
  const recorded = { '/work/project/src/a.ts': { path: '/work/project/src/a.ts', at: desk.clock.now() } }

  expect(await bash($, 'npm test -am "x" src/a.ts > out.log')).toEqual(answer)
  expect(statCalls(desk)).toEqual(['npm', 'test', '-am', 'x', 'src/a.ts', 'out.log'].map(word => `/work/project/${word}`))
  expect((await peek($)).mine).toEqual(recorded)
  expect(sharedIn(desk)?.files).toEqual(recorded)

  desk.stats.set('/work/project/docs', { kind: 'dir', mtimeMs: desk.clock.now() })
  desk.stats.delete('/work/project/src/a.ts')
  expect(await bash($, 'prettier --write docs')).toEqual(answer)
  expect(statCalls(desk)).toContain('/work/project/docs')
  expect((await peek($)).mine).toEqual(recorded)

  const asked = statCalls(desk).length
  desk.reply = () => ({ ...answer, isReadOnly: true })
  await bash($, 'cat src/a.ts')
  expect(statCalls(desk).length).toBe(asked)

  desk.reply = answered
  const held = Array.from({ length: 20 }, (_, at) => `/work/api/src/route-${at}.ts`)
  share(desk, 'session-2', '/work/api', Object.fromEntries(held.map(path => [path, desk.clock.now()])))
  await bash($, `echo ${Array.from({ length: 99 }, (_, at) => `word-${at}`).join(' ')}`)
  const stats = statCalls(desk).slice(asked)
  expect(stats.length).toBe(40)
  for (const path of held) expect(stats).toContain(path)
})

test('A6: a command that changed a file another session holds warns once, and a read settles it', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  share(desk, 'session-2', '/work/api', { '/work/project/src/sum.js': desk.clock.now(), '/work/project/src/format.js': desk.clock.now() })
  await desk.clock.advance(10 * SECOND)
  desk.stats.set('/work/project/src/sum.js', { kind: 'file', mtimeMs: desk.clock.now() })
  const answer = answered({ tool: 'Bash' })

  expect(await bash($, 'sed -i s/1/0/ src/sum.js')).toEqual({
    ...answer,
    context: [
      'collision-widget: this command changed sum.js, which another Claude Code session (in api) edited 10s ago. Read the file again before editing it further, and tell the user.',
    ],
  })
  expect(Object.keys((await peek($)).mine)).toEqual(['/work/project/src/sum.js'])
  expect(await card($)).toEqual({ note: '1 met', lines: ['! sum.js api · changed'] })

  await desk.clock.advance(5 * SECOND)
  desk.stats.set('/work/project/src/sum.js', { kind: 'file', mtimeMs: desk.clock.now() })
  expect(await bash($, 'sed -i s/2/0/ src/sum.js')).toEqual(answer)
  expect((await card($)).lines).toEqual(['! sum.js api · changed'])

  await reread($, 'src/sum.js')
  expect((await card($)).lines).toEqual(['✓ sum.js api · re-read'])
  expect(await check($, 'src/sum.js')).toEqual(ALLOW)

  await desk.clock.advance(5 * SECOND)
  desk.stats.delete('/work/project/src/sum.js')
  desk.stats.set('/work/project/src/format.js', { kind: 'file', mtimeMs: desk.clock.now() })
  expect(await bash($, 'npm run format')).toEqual({
    ...answer,
    context: [
      'collision-widget: this command changed format.js, which another Claude Code session (in api) edited 20s ago. Read the file again before editing it further, and tell the user.',
    ],
  })
  expect(Object.keys((await peek($)).mine).sort()).toEqual(['/work/project/src/format.js', '/work/project/src/sum.js'])
  expect(await card($)).toEqual({ note: '2 met', lines: ['! format.js api · changed', '✓ sum.js api · re-read'] })
})

test('A7: a change on disk within two seconds of the other session own edit is theirs, a later one is this command own', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  const theirs = desk.clock.now()
  share(desk, 'session-2', '/work/project', { '/work/project/a.test.ts': theirs })
  desk.stats.set('/work/project/a.test.ts', { kind: 'file', mtimeMs: theirs + 1500 })
  const answer = answered({ tool: 'Bash' })

  expect(await bash($, 'bun test a.test.ts')).toEqual(answer)
  expect(statCalls(desk)).toContain('/work/project/a.test.ts')
  expect((await peek($)).mine).toEqual({})
  expect((await peek($)).meets).toEqual([])
  expect(fileWrites(desk)).toEqual([])

  await desk.clock.advance(3 * SECOND)
  desk.stats.set('/work/project/a.test.ts', { kind: 'file', mtimeMs: theirs + 2500 })
  expect(await bash($, 'bun test a.test.ts')).toEqual({
    ...answer,
    context: [
      'collision-widget: this command changed a.test.ts, which another Claude Code session (in project) edited 3s ago. Read the file again before editing it further, and tell the user.',
    ],
  })
  expect((await peek($)).mine).toEqual({ '/work/project/a.test.ts': { path: '/work/project/a.test.ts', at: theirs + 2500 } })
  expect((await card($)).lines).toEqual(['! a.test.ts project · changed'])
})

test('A8: two sessions writing in turn keep every entry, because each writes only its own file', PLUGINS, async ($, on) => {
  const desk = await open($, on, { id: 'a' })
  const theirs: Record<string, number> = {}
  let last = ''
  for (const [at, path] of ['src/sum.js', 'src/format.js', 'src/index.js'].entries()) {
    await desk.clock.advance(MINUTE)
    theirs[`/work/api/src/route-${at}.ts`] = desk.clock.now()
    last = share(desk, 'b', '/work/api', theirs)
    expect(await edit($, path)).toEqual(ALLOW)
  }

  expect(keysIn(desk, `${DIR}/a.json`)).toEqual(['/work/project/src/format.js', '/work/project/src/index.js', '/work/project/src/sum.js'])
  expect(desk.files.get(`${DIR}/b.json`)).toBe(last)
  expect(keysIn(desk, `${DIR}/b.json`).length).toBe(3)
  expect([...new Set(fileWrites(desk))]).toEqual([`file ${DIR}/a.json`])
})

test('A9: the file keeps the 60 newest edits by time, drops what is older than 30 minutes, and seen keeps 200 reads', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  for (let at = 0; at <= 60; at += 1) {
    await desk.clock.advance(SECOND)
    await edit($, `src/file-${at}.ts`)
  }
  expect(keysIn(desk).length).toBe(60)
  expect(sharedIn(desk)?.files['/work/project/src/file-0.ts']).toBeUndefined()

  await desk.clock.advance(SECOND)
  await edit($, 'src/file-1.ts')
  const kept = sharedIn(desk)?.files ?? {}
  expect(Object.keys(kept).length).toBe(60)
  expect(kept['/work/project/src/file-1.ts']?.at).toBe(desk.clock.now())
  expect(kept['/work/project/src/file-2.ts']).toBeDefined()

  await desk.clock.advance(SECOND)
  await edit($, 'src/file-0.ts')
  const later = sharedIn(desk)?.files ?? {}
  expect(Object.keys(later).length).toBe(60)
  expect(later['/work/project/src/file-0.ts']?.at).toBe(desk.clock.now())
  expect(later['/work/project/src/file-1.ts']).toBeDefined()
  expect(later['/work/project/src/file-2.ts']).toBeUndefined()
  expect(later['/work/project/src/file-3.ts']).toBeDefined()

  await desk.clock.advance(31 * MINUTE)
  await edit($, 'src/late.ts')
  expect(keysIn(desk)).toEqual(['/work/project/src/late.ts'])

  share(desk, 'session-2', '/work/api', { '/work/project/src/old.ts': desk.clock.now() - 31 * MINUTE, '/work/project/src/new.ts': desk.clock.now() })
  expect(await check($, 'src/old.ts')).toEqual(ALLOW)
  expect((await check($, 'src/new.ts')).decision).toBe('deny')

  await $.command.run(run(NAME, 'clear'))
  for (let at = 0; at <= 200; at += 1) {
    await desk.clock.advance(1)
    await reread($, `src/read-${at}.ts`)
  }
  const { seen } = await peek($)
  expect(Object.keys(seen).length).toBe(200)
  expect(seen['/work/project/src/read-0.ts']).toBeUndefined()
  expect(seen['/work/project/src/read-1.ts']).toBeDefined()
  expect(seen['/work/project/src/read-200.ts']).toBe(desk.clock.now())
})

test('A10: the folder is under CLAUDE_CONFIG_DIR when set, never the plugin folder, and a session with no id does nothing', PLUGINS, async ($, on) => {
  const own = '/config/claude/collision-widget/session-1.json'
  const other = '/config/claude/collision-widget/session-2.json'
  const desk = await open($, on, { env: { CLAUDE_CONFIG_DIR: '/config/claude', HOME, USERPROFILE: 'C:\\Users\\dev' } })

  await edit($, 'src/sum.js')
  expect(fileWrites(desk)).toEqual([`file ${own}`])
  expect(keysIn(desk, own)).toEqual(['/work/project/src/sum.js'])
  expect(envCalls(desk)).toEqual(['env.get CLAUDE_CONFIG_DIR'])

  desk.id = null
  await desk.clock.advance(MINUTE)
  share(desk, 'session-2', '/work/api', { '/work/project/src/format.js': desk.clock.now() }, other)
  const before = await peek($)
  expect(await check($, 'src/format.js')).toEqual(ALLOW)
  await call($, 'Edit', inputOf('Edit', 'src/index.js'))
  desk.stats.set('/work/project/src/index.js', { kind: 'file', mtimeMs: desk.clock.now() })
  await bash($, 'sed -i s/1/0/ src/index.js')
  expect(await peek($)).toEqual(before)
  expect(fileWrites(desk)).toEqual([`file ${own}`])
  expect([...desk.files.keys()].sort()).toEqual([own, other])
})

test('A10: without CLAUDE_CONFIG_DIR and HOME the folder is under USERPROFILE plus .claude', PLUGINS, async ($, on) => {
  const desk = await open($, on, { env: { USERPROFILE: 'C:\\Users\\dev' } })

  await edit($, 'src/sum.js')
  expect((await peek($)).dir).toBe('C:/Users/dev/.claude/collision-widget')
  expect(fileWrites(desk)).toEqual(['file /Users/dev/.claude/collision-widget/session-1.json'])
  expect(envCalls(desk)).toEqual(['env.get CLAUDE_CONFIG_DIR', 'env.get HOME', 'env.get USERPROFILE'])
})

test('A11: the first write reuses a .json file older than 24 hours, and leaves the slot when another session takes it', PLUGINS, async ($, on) => {
  const slot = `${DIR}/old-session.json`
  const desk = await open($, on)
  share(desk, 'old-session', '/work/gone', { '/work/gone/a.ts': desk.clock.now() - 25 * HOUR })
  desk.times.set(slot, desk.clock.now() - 25 * HOUR)
  share(desk, 'recent-session', '/work/idle', {})
  desk.times.set(`${DIR}/recent-session.json`, desk.clock.now() - 2 * HOUR)

  await edit($, 'src/sum.js')
  expect(fileWrites(desk)).toEqual([`file ${slot}`])
  expect(sharedIn(desk, slot)?.id).toBe('session-1')
  expect(keysIn(desk, slot)).toEqual(['/work/project/src/sum.js'])
  expect(sharedIn(desk)).toBeUndefined()
  desk.times.delete(slot)

  await desk.clock.advance(MINUTE)
  const taken = share(desk, 'session-9', '/work/api', { '/work/api/src/server.ts': desk.clock.now() }, slot)
  await edit($, 'src/format.js')
  expect(fileWrites(desk)).toEqual([`file ${slot}`, `file ${DIR}/session-1.json`])
  expect(desk.files.get(slot)).toBe(taken)
  expect(keysIn(desk)).toEqual(['/work/project/src/format.js', '/work/project/src/sum.js'])
  expect((await peek($)).others).toBe(1)
})

test('A11: with no stale .json the first write is <id>.json; a directory, an old notes.txt and unreadable files are passed over', PLUGINS, async ($, on) => {
  const desk = await open($, on, { entries: [{ name: 'archive', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] })
  desk.files.set(`${DIR}/notes.txt`, 'left here by hand')
  desk.times.set(`${DIR}/notes.txt`, desk.clock.now() - 72 * HOUR)
  desk.files.set(`${DIR}/half-written.json`, '{"id":"session-7","cwd":"/work/web","at":17')
  desk.files.set(`${DIR}/other-tool.json`, '{"version":2,"entries":[]}')
  share(desk, 'session-2', '/work/api', { '/work/project/src/format.js': desk.clock.now() })

  await edit($, 'src/sum.js')
  expect(fileWrites(desk)).toEqual([`file ${DIR}/session-1.json`])
  expect(desk.files.get(`${DIR}/notes.txt`)).toBe('left here by hand')
  expect((await peek($)).others).toBe(1)
  expect((await check($, 'src/format.js')).decision).toBe('deny')
})

test('A12: a session whose id changes keeps its slot, its entries and its peace with its own earlier file', PLUGINS, async ($, on) => {
  const slot = `${DIR}/a.json`
  const desk = await open($, on, { id: 'a' })
  await edit($, 'src/sum.js')
  await desk.clock.advance(10 * SECOND)
  desk.stats.set('/work/project/src/format.js', { kind: 'file', mtimeMs: desk.clock.now() })
  await bash($, 'sed -i s/a/b/ src/format.js')
  expect(sharedIn(desk, slot)?.id).toBe('a')
  expect(keysIn(desk, slot)).toEqual(['/work/project/src/format.js', '/work/project/src/sum.js'])

  desk.id = 'b'
  await desk.clock.advance(MINUTE)
  expect(await check($, 'src/sum.js')).toEqual(ALLOW)
  expect(await check($, 'src/format.js')).toEqual(ALLOW)
  expect((await peek($)).others).toBe(0)
  expect((await card($)).lines).toEqual(['2 files edited', 'No others nearby'])

  await edit($, 'src/index.js')
  expect([...desk.files.keys()].filter(path => path.startsWith(DIR))).toEqual([slot])
  expect(sharedIn(desk, slot)?.id).toBe('b')
  expect(keysIn(desk, slot)).toEqual(['/work/project/src/format.js', '/work/project/src/index.js', '/work/project/src/sum.js'])

  expect((await $.command.run(run(NAME, 'clear'))).text).toBe('Collision cleared.')
  expect(sharedIn(desk, slot)).toEqual({ id: 'b', cwd: CWD, at: desk.clock.now(), files: {} })
  expect(await check($, 'src/sum.js')).toEqual(ALLOW)
  expect((await peek($)).meets).toEqual([])
})

test('A13: a write that fails shows blind and still denies, and the next write that lands clears it', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  desk.store.set('isDiskFull', true)
  await edit($, 'src/sum.js')
  expect(await card($)).toEqual({ note: 'blind', lines: ['Cannot write the shared folder.', 'Others cannot see edits made here.'] })
  expect((await card($, 20)).lines.join(' ')).toBe(NO_WRITE)
  expect(sharedIn(desk)).toBeUndefined()

  await desk.clock.advance(MINUTE)
  share(desk, 'session-2', '/work/api', { '/work/project/src/format.js': desk.clock.now() })
  expect((await check($, 'src/format.js')).decision).toBe('deny')
  expect(await card($)).toEqual({ note: 'blind', lines: ['✕ format.js api · stopped', 'Cannot write the shared folder.', 'Others cannot see edits made here.'] })

  desk.store.delete('isDiskFull')
  await edit($, 'src/index.js')
  expect(await card($)).toEqual({ note: '1 met', lines: ['✕ format.js api · stopped'] })
  expect(keysIn(desk)).toEqual(['/work/project/src/index.js', '/work/project/src/sum.js'])
})

test('A13: with no home folder the card says so, nothing on disk is touched and no verdict changes', PLUGINS, async ($, on) => {
  const desk = await open($, on, { env: {} })

  expect(await edit($, 'src/sum.js')).toEqual(ALLOW)
  await reread($, 'src/sum.js')
  await bash($, 'sed -i s/1/0/ src/sum.js')
  expect(await card($)).toEqual({ note: 'blind', lines: ['No home folder found. Cannot watch', 'other sessions.'] })
  expect((await card($, 20)).lines.join(' ')).toBe(NO_HOME)
  expect(made(desk).filter(one => one.startsWith('fs.'))).toEqual([])
  expect(envCalls(desk)).toEqual(['env.get CLAUDE_CONFIG_DIR', 'env.get HOME', 'env.get USERPROFILE'])
  expect(fileWrites(desk)).toEqual([])
})

test('A14: clear wipes what was collected and keeps the others; while off nothing is cleared, denied, read or recorded', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  await edit($, 'src/index.js')
  await reread($, 'src/format.js')
  await desk.clock.advance(MINUTE)
  share(desk, 'session-2', '/work/api', { '/work/project/src/sum.js': desk.clock.now() })
  expect((await check($, 'src/sum.js')).decision).toBe('deny')

  expect((await $.command.run(run(NAME, 'clear'))).text).toBe('Collision cleared.')
  const cleared = await peek($)
  expect({ mine: cleared.mine, seen: cleared.seen, meets: cleared.meets, others: cleared.others }).toEqual({ mine: {}, seen: {}, meets: [], others: 1 })
  expect(sharedIn(desk)).toEqual({ id: 'session-1', cwd: CWD, at: desk.clock.now(), files: {} })
  expect(await card($)).toEqual({ note: 'idle', lines: ['No files edited', '1 other nearby'] })

  await $.command.run(run(NAME, 'off'))
  const written = desk.writes.length
  expect((await $.command.run(run(NAME, 'clear'))).text).toBe('Collision is off.')
  expect(desk.writes.length).toBe(written)

  const asked = made(desk).length
  desk.stats.set('/work/project/src/sum.js', { kind: 'file', mtimeMs: desk.clock.now() })
  expect(await check($, 'src/sum.js')).toEqual(ALLOW)
  expect(await bash($, 'sed -i s/1/0/ src/sum.js')).toEqual(answered({ tool: 'Bash' }))
  expect(await call($, 'Edit', inputOf('Edit', 'src/sum.js'))).toEqual(answered({ tool: 'Edit', file_path: 'src/sum.js' }))
  expect(made(desk).length).toBe(asked)
  expect(desk.writes.length).toBe(written)
  expect(await peek($)).toEqual(cleared)
})

test('A15: six rows at most, one per file, readable at 20, 40 and 60 columns with every note whole', PLUGINS, async ($, on) => {
  const desk = await open($, on)
  const names = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'a-very-long-name.test.tsx']
  const notes: string[] = [(await card($, 20)).note]
  await desk.clock.advance(MINUTE)
  share(desk, 'session-2', '/work/payments-service', Object.fromEntries(names.map(name => [`/work/project/src/${name}`, desk.clock.now()])))
  for (const name of names) {
    await desk.clock.advance(SECOND)
    expect((await check($, `src/${name}`)).decision).toBe('deny')
  }
  expect((await peek($)).meets.map(meet => meet.path)).toEqual([...names].reverse().slice(0, 6).map(name => `src/${name}`))

  await check($, 'src/d.ts')
  expect((await peek($)).meets.map(meet => meet.path)).toEqual(['d.ts', 'a-very-long-name.test.tsx', 'f.ts', 'e.ts', 'c.ts', 'b.ts'].map(name => `src/${name}`))

  const narrow = await card($, 20)
  notes.push(narrow.note)
  expect(narrow.lines).toEqual(['✕ d.ts', '✕ …name.test.tsx', '✕ f.ts', '✕ e.ts', '✕ c.ts', '✕ b.ts', '✕ edit stopped'])

  await reread($, 'src/e.ts')
  await desk.clock.advance(MINUTE)
  share(desk, 'session-3', 'C:\\', { '/work/project/src/c.ts': desk.clock.now() })
  await desk.clock.advance(5 * SECOND)
  desk.stats.set('/work/project/src/c.ts', { kind: 'file', mtimeMs: desk.clock.now() })
  await bash($, 'sed -i s/1/0/ src/c.ts')
  const mixed = await card($, 20)
  expect(mixed.lines).toEqual(['! c.ts', '✕ d.ts', '✕ …name.test.tsx', '✕ f.ts', '✓ e.ts', '✕ b.ts', '✕ edit stopped', '! Bash changed', '✓ read again'])
  for (const line of mixed.lines) expect(line.length <= 16).toBe(true)

  for (const columns of [40, 60]) {
    const wide = await card($, columns)
    expect(wide.note).toBe('6 met')
    expect(wide.lines).toEqual([
      '! c.ts root · changed',
      '✕ d.ts payment… · stopped',
      '✕ …-name.test.tsx payment… · stopped',
      '✕ f.ts payment… · stopped',
      '✓ e.ts payment… · re-read',
      '✕ b.ts payment… · stopped',
    ])
    for (const line of wide.lines) expect(line.length <= 36).toBe(true)
  }

  share(desk, 'session-3', 'C:\\', { '/work/project/src/c.ts': desk.clock.now() })
  expect((await check($, 'src/c.ts')).reason).toBe(
    'collision-widget: c.ts was edited by another Claude Code session (in root) 0s ago, after this session last read it. Read the file again, then repeat the edit, and tell the user that two sessions are working on this file.',
  )

  await $.command.run(run(NAME, 'clear'))
  expect(await card($, 20)).toEqual({ note: 'idle', lines: ['No files edited', '2 others nearby'] })
  for (const name of ['x.ts', 'y.ts', 'z.ts']) await edit($, `lib/${name}`)
  const working = await card($, 20)
  expect(working).toEqual({ note: 'clear', lines: ['3 files edited', '2 others nearby'] })
  notes.push(working.note)

  desk.store.set('isDiskFull', true)
  await edit($, 'lib/w.ts')
  notes.push((await card($, 20)).note)
  expect(notes).toEqual(['idle', '6 met', 'clear', 'blind'])
  for (const note of notes) expect(note.length <= 5).toBe(true)
})

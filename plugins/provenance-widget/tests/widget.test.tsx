import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, PluginState, ProcessRunInit } from 'claude-code'

import type { ProvenanceCommit, ProvenanceMap, ProvenanceProject } from '../types'
import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type State = PluginState['provenance-widget']
type Asked = { argv: readonly string[]; init?: ProcessRunInit }
type Reply = string | number | 'reject'
type Entry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }
type Owner = { hash: string; at: number; summary: string; filename: string; lines: number }
type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] }
type Drawn = { width: unknown; note: string; lines: string[]; yellow: string[] }
type Peek = { reads: string[]; run: State['run'] | null; finding: State['finding']; repo: State['repo'] | null }
type Loose = { prompt: { submit: (e: object) => Promise<unknown> }; tool: { call: (e: object) => Promise<unknown> } }
type Rig = {
  world: Ground
  cwd: string
  env: Record<string, string>
  worktrees: Reply
  log: Reply
  isLogCut: boolean
  blame: Reply
  asked: Asked[]
  order: string[]
  dirs: Record<string, Entry[]>
  listed: string[]
  selection: { text: string } | undefined
  isCopied: boolean
  copied: string[]
  answer: object
}

const NAME = 'provenance-widget'
const USAGE = 'Usage: /provenance-widget [on|off|scan|look [<path>:<line>]|copy|clear]'
const OFF = 'Provenance is off.'
const NO_REPO = 'Not a git repository.'
const SELECT = 'Select a path:line first, or /provenance-widget look <path>:<line>.'
const NOTHING = 'Nothing to resume: look up a line first.'
const MOVED = 'Matched by subject and time: the commit was rewritten.'
const EMPTY_40 = ['No conversations traced yet.', '/provenance-widget scan reads this', "repository's saved sessions; commits", 'made from now on are recorded.']
const HINT_40 = ['Shown when Claude edits lines, or', '/provenance-widget look <path:line>']
const NOW = Date.UTC(2026, 8, 20, 12)
const SAID_AT = Date.UTC(2026, 8, 14, 9, 30)
const COMMIT_AT = SAID_AT + 600_000
const OLD_AT = Date.UTC(2025, 2, 2, 8)
const SECOND = 1000
const WIN = 'C:\\Work\\App'
const KEY = 'c:/work/app'
const CONFIG = 'C:\\Users\\Dev\\.claude'
const PROJECTS = 'C:/Users/Dev/.claude/projects'
const SID = '0f8c2d7e-5b1a-4c3e-9d2f-7a6b5c4d3e2f'
const RETRY = 'C:\\Work\\App\\src\\http\\retry.ts'
const SAID = 'never retry on a 401, it locks accounts'
const SUBJECT = 'Never retry on a 401'
const IDLE = { ask: null, pending: {}, isLooking: false }

const long = (short: string): string => short.padEnd(40, 'f')

const WORKTREES = `worktree C:/Work/App\nHEAD ${long('3f2a1c9')}\nbranch refs/heads/main\n\nworktree C:/Work/wt/fix\nHEAD ${long('9c41e07')}\nbranch refs/heads/fix\n\n`
const WORKTREE_ARGV = ['git', '--no-optional-locks', 'worktree', 'list', '--porcelain']
const LOG_ARGV = ['git', '--no-optional-locks', 'log', '--format=%H%x09%at%x09%s', '--max-count=20000', 'HEAD']
const RECORD: ProvenanceCommit = {
  short: 'a1b2c3d',
  subject: SUBJECT,
  at: COMMIT_AT,
  session: SID,
  asks: [{ text: SAID, at: SAID_AT, files: ['src/http/retry.ts', 'src/a.ts', 'docs/my notes.md'] }],
}
const LINES = Array.from({ length: 70 }, (_, index) => `  const step${index + 1} = retry(${index + 1})`)
const SOURCE = `${LINES.join('\n')}\n`
const EDITED = { result: { filePath: RETRY, oldString: 'a', newString: 'b', originalFile: SOURCE, structuredPatch: [], userModified: false, replaceAll: false }, text: `The file ${RETRY} has been updated.` }

// Records what the widget reads and can hold a blame open until `release`, then let it through or reject it: a git that answers late.
const WATCHER: Plugin = {
  name: 'watcher',
  register(on) {
    let gate: Promise<void> | undefined
    let release = (): void => undefined
    let isFailing = false
    let reads: string[] = []
    on('command.run', { command: 'watcher' }, async ($, e) => {
      if (e.args === 'hold' || e.args === 'hold-reject') {
        gate = new Promise<void>(done => void (release = done))
        isFailing = e.args === 'hold-reject'
      }
      if (e.args === 'release') {
        gate = undefined
        release()
      }
      if (e.args === 'reset') reads = []

      return {
        text: JSON.stringify({
          reads,
          run: (await $.state.get({ plugin: 'provenance-widget', key: 'run' } as const)).value ?? null,
          finding: (await $.state.get({ plugin: 'provenance-widget', key: 'finding' } as const)).value ?? null,
          repo: (await $.state.get({ plugin: 'provenance-widget', key: 'repo' } as const)).value ?? null,
        }),
      }
    })
    on('fs.read', async (_$, e, next) => {
      reads.push(e.path.replaceAll('\\', '/'))

      return next(e)
    })
    on('process.run', async (_$, e, next) => {
      const held = e.argv.includes('blame') ? gate : undefined
      if (held !== undefined) {
        const isRejected = isFailing
        await held
        if (isRejected) throw new Error('The command timed out after 2000 ms')
      }

      return next(e)
    })
  },
}

const LOADED = { plugins: [LAYOUT, WATCHER], timeoutMs: 20_000 }

const flatten = (path: string): string => path.replaceAll('\\', '/').replace(/^[a-z]:/i, '')

const replied = (reply: Reply, isCut: boolean) => {
  if (reply === 'reject') throw new Error('The command timed out')

  return {
    exitCode: typeof reply === 'number' ? reply : 0,
    stdout: typeof reply === 'number' ? '' : reply,
    stderr: typeof reply === 'number' ? 'fatal: not a git repository (or any of the parent directories): .git' : '',
    isStdoutTruncated: isCut,
    isStderrTruncated: false,
  }
}

const bench = (on: On, given: Partial<Pick<Rig, 'cwd' | 'env' | 'worktrees' | 'log' | 'blame'>> & { files?: Record<string, string> } = {}): Rig => {
  const rig: Rig = {
    world: ground(on, {
      now: NOW,
      files: given.files,
      answers: {
        'session.cwd': () => rig.cwd,
        'session.root': () => rig.cwd,
        'env.get': (e: { name: string }) => rig.env[e.name],
        'process.run': (e: Asked) => {
          const verb = e.argv[2] ?? ''
          rig.asked.push({ argv: e.argv, ...(e.init === undefined ? {} : { init: e.init }) })
          rig.order.push(`git ${verb}`)

          return replied(verb === 'worktree' ? rig.worktrees : verb === 'log' ? rig.log : rig.blame, verb === 'log' && rig.isLogCut)
        },
        'fs.list': (e: { path?: string }) => {
          const path = (e.path ?? '').replaceAll('\\', '/')
          rig.listed.push(path)
          const entries = rig.dirs[path]
          if (entries === undefined) throw new Error(`ENOENT: no such file or directory, scandir '${path}'`)

          return entries
        },
        'ui.selection': () => rig.selection,
        'ui.copy': (e: { text: string }) => {
          rig.copied.push(e.text)

          return rig.isCopied ? { isCopied: true } : { isCopied: false, reason: 'no clipboard' }
        },
      },
    }),
    cwd: given.cwd ?? WIN,
    env: given.env ?? { CLAUDE_CONFIG_DIR: CONFIG },
    worktrees: given.worktrees ?? WORKTREES,
    log: given.log ?? logged([['a1b2c3d', COMMIT_AT, SUBJECT], ['9c41e07', OLD_AT, 'Fix the retry loop']]),
    isLogCut: false,
    blame: given.blame ?? 128,
    asked: [],
    order: [],
    dirs: {},
    listed: [],
    selection: undefined,
    isCopied: true,
    copied: [],
    answer: EDITED,
  }
  on('tool.call', async () => {
    rig.order.push('next')

    return rig.answer as never
  })

  return rig
}

function logged(rows: readonly (readonly [string, number, string])[]): string {
  return rows.map(([short, at, subject]) => `${long(short)}\t${Math.floor(at / SECOND)}\t${subject}\n`).join('')
}

const porcelain = (owners: readonly Owner[], first: number): string => {
  const seen = new Set<string>()
  const rows = owners.flatMap(owner =>
    Array.from({ length: owner.lines }, (_, index) => {
      const isNew = !seen.has(owner.hash)
      seen.add(owner.hash)

      return { owner, isNew, count: index === 0 ? ` ${owner.lines}` : '' }
    }),
  )

  return `${rows
    .map(({ owner, isNew, count }, index) =>
      [
        `${owner.hash} ${first + index} ${first + index}${count}`,
        ...(isNew
          ? [
              `author ${/^0+$/.test(owner.hash) ? 'Not Committed Yet' : 'Dev Eloper'}`,
              'author-mail <dev@example.com>',
              `author-time ${owner.at}`,
              'author-tz +0200',
              'committer Dev Eloper',
              'committer-mail <dev@example.com>',
              `committer-time ${owner.at}`,
              'committer-tz +0200',
              `summary ${owner.summary}`,
              `filename ${owner.filename}`,
            ]
          : []),
        `\t  summary ${first + index}, filename and author-time are words in the code`,
      ].join('\n'),
    )
    .join('\n')}\n`
}

const owner = (short: string, lines: number, more: Partial<Owner> = {}): Owner => ({
  hash: long(short),
  at: Math.floor(COMMIT_AT / SECOND),
  summary: SUBJECT,
  filename: 'src/http/retry.ts',
  lines,
  ...more,
})

const row = (at: number, more: object): object => ({
  parentUuid: null,
  isSidechain: false,
  userType: 'external',
  cwd: WIN,
  sessionId: SID,
  version: '2.1.289',
  gitBranch: 'main',
  timestamp: new Date(at).toISOString(),
  ...more,
})

const typed = (text: string | object[], at: number, more: object = {}): object => row(at, { type: 'user', message: { role: 'user', content: text }, ...more })

const used = (id: string, name: string, input: object, at: number): object =>
  row(at, { type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'On it.' }, { type: 'tool_use', id, name, input }] } })

const gave = (id: string, content: string | object[], at: number, block: object = {}): object =>
  row(at, { type: 'user', message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content, ...block }] } })

const saved = (rows: readonly object[]): string => `${[{ type: 'summary', summary: 'Retry policy', leafUuid: 'b0b1' }, ...rows].map(line => JSON.stringify(line)).join('\n')}\n`

const put = (rig: Rig, dir: string, id: string, text: string, more: Partial<Entry> = {}): void => {
  const listed = (rig.dirs[PROJECTS] ??= [])
  if (!listed.some(entry => entry.name === dir)) listed.push({ name: dir, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
  ;(rig.dirs[`${PROJECTS}/${dir}`] ??= []).push({ name: `${id}.jsonl`, kind: 'file', size: text.length, mtimeMs: NOW, isLink: false, ...more })
  rig.world.files.set(flatten(`${PROJECTS}/${dir}/${id}.jsonl`), text)
}

const loose = ($: Engine): Loose => $ as never as Loose

const say = async ($: Engine, args: string): Promise<string> => (await $.command.run(run(NAME, args))).text ?? ''

const peek = async ($: Engine, verb = ''): Promise<Peek> => JSON.parse((await $.command.run(run('watcher', verb))).text ?? '{}')

const flat = (node: Node | string | undefined): string => (typeof node === 'string' ? node : (node?.children ?? []).map(flat).join(''))

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const box = await ui.find({ key: 'card' })
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const body = ((await ui.find({ key: 'provenance' }))?.children ?? []) as Node[]
  await ui.unmount()
  if (box === undefined) return undefined

  return { width: box.props.width, note, lines: body.map(flat), yellow: body.filter(line => line.props?.color === 'yellow').map(flat) }
}

const mapPath = (rig: Rig): string => [...rig.world.files.keys()].find(path => path.endsWith('/provenance.json')) ?? ''

const mapOf = (rig: Rig): ProvenanceMap => JSON.parse(rig.world.files.get(mapPath(rig)) ?? '{"projects":{}}')

const project = (commits: ProvenanceCommit[]): ProvenanceProject => ({ commits, sizes: {}, scannedAt: 0 })

// The map lives under the plugin's own root, which only the engine knows: the widget reads it when it finds a repository, and the test fills it in there.
const seed = async ($: Engine, rig: Rig, text: string): Promise<void> => {
  rig.world.files.set(mapPath(rig) || flatten((await peek($)).reads.find(path => path.endsWith('/provenance.json')) ?? ''), text)
  await say($, 'on')
}

const begin = async ($: Engine, rig: Rig, commits?: ProvenanceCommit[]): Promise<void> => {
  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  if (commits !== undefined) await seed($, rig, JSON.stringify({ projects: { [KEY]: project(commits) } }))
  rig.asked = []
  rig.order = []
}

const call = ($: Engine, rig: Rig, input: object, answer: object = EDITED): Promise<unknown> => {
  rig.answer = answer

  return loose($).tool.call({ tool_use_id: `toolu_${rig.order.length}`, ...input })
}

const edit = ($: Engine, rig: Rig, from: number, to: number, file = RETRY): Promise<unknown> =>
  call($, rig, { tool: 'Edit', file_path: file, old_string: LINES.slice(from - 1, to).join('\n'), new_string: '  retry()' })

const bash = ($: Engine, rig: Rig, command: string, stdout: string, tool = 'Bash'): Promise<unknown> =>
  call($, rig, { tool, command }, { result: { stdout, stderr: '', interrupted: false }, text: stdout })

const prompt = ($: Engine, text: string, kind = 'sdk'): Promise<unknown> => loose($).prompt.submit({ text, wait: false, origin: { kind } })

const blames = (rig: Rig): Asked[] => rig.asked.filter(asked => asked.argv[2] === 'blame')

const nexts = (rig: Rig): number => rig.order.filter(step => step === 'next').length

const blameOf = (first: number, last: number, path: string): Asked => ({
  argv: ['git', '--no-optional-locks', 'blame', '--porcelain', '-L', `${first},${last}`, '--', path],
  init: { cwd: KEY, timeoutMs: 2000 },
})

test('A1: an untraced repository shows the empty sentences in all three placements, and a folder without git says so', LOADED, async ($, on) => {
  const rig = bench(on)

  await session($, rig.cwd)
  await say($, 'on')
  expect(rig.asked[0]).toEqual({ argv: WORKTREE_ARGV, init: { cwd: WIN, timeoutMs: 5000 } })
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    const empty = await card($, 40, component)
    expect(empty?.note).toBe('')
    expect(empty?.lines).toEqual(EMPTY_40)
  }

  await say($, 'off')
  rig.worktrees = 128
  await say($, 'on')
  const bare = await card($, 40, 'PromptHint')
  expect(bare?.note).toBe('')
  expect(bare?.lines).toEqual([NO_REPO, 'Provenance needs git history.'])
  expect(await say($, 'scan')).toBe(NO_REPO)
  expect(await say($, 'look a.ts:1')).toBe(NO_REPO)
  expect(rig.world.writes.filter(write => write.startsWith('file'))).toEqual([])
})

test('A2: scan turns a saved session into one record per commit, each with the first prompt that edited its files', LOADED, async ($, on) => {
  const rig = bench(on, { log: logged([['a1b2c3d', COMMIT_AT, 'Add retry'], ['0123abc', COMMIT_AT + 900 * SECOND, 'Two'], ['77aa001', OLD_AT, 'Initial commit']]) })
  const second = 'Also back off between tries'
  const third = 'Now cap\n  the retries at   three'
  const text = saved([
    typed(SAID, SAID_AT),
    used('toolu_e1', 'Edit', { file_path: 'C:\\Work\\App\\src\\a.ts', old_string: 'retry()', new_string: 'never()' }, SAID_AT + 4 * SECOND),
    gave('toolu_e1', 'The file C:\\Work\\App\\src\\a.ts has been updated.', SAID_AT + 5 * SECOND),
    used('toolu_w1', 'Write', { file_path: 'src/b.ts', content: 'export const tries = 0\n' }, SAID_AT + 6 * SECOND),
    gave('toolu_w1', 'File created successfully at: src/b.ts', SAID_AT + 7 * SECOND),
    typed(second, SAID_AT + 60 * SECOND),
    used('toolu_e2', 'Edit', { file_path: 'C:\\Work\\App\\src\\a.ts', old_string: 'never()', new_string: 'never(401)' }, SAID_AT + 64 * SECOND),
    gave('toolu_e2', 'The file C:\\Work\\App\\src\\a.ts has been updated.', SAID_AT + 65 * SECOND),
    used('toolu_b1', 'Bash', { command: 'git add -A && git commit -m "Add retry"', description: 'Commit' }, COMMIT_AT - SECOND),
    gave('toolu_b1', '[main a1b2c3d] Add retry\n 2 files changed, 14 insertions(+), 1 deletion(-)\n create mode 100644 src/b.ts', COMMIT_AT),
    typed([{ type: 'text', text: third }], COMMIT_AT + 600 * SECOND),
    used('toolu_e3', 'Edit', { file_path: 'C:/Work/App/src/C.ts', old_string: '5', new_string: '3' }, COMMIT_AT + 604 * SECOND),
    gave('toolu_e3', 'The file C:/Work/App/src/C.ts has been updated.', COMMIT_AT + 605 * SECOND),
    used('toolu_p1', 'PowerShell', { command: 'git commit -am "Two"' }, COMMIT_AT + 899 * SECOND),
    gave('toolu_p1', [{ type: 'text', text: '[detached HEAD 0123abc] Two\r\n 1 file changed, 1 insertion(+), 1 deletion(-)\r\n' }], COMMIT_AT + 900 * SECOND),
  ])

  await begin($, rig)
  put(rig, 'C--Work-App', SID, text)
  expect(await say($, 'scan')).toBe('Read 1 saved session of App: 2 commits recorded. 2 of 3 commits trace to a conversation.')
  expect(rig.listed).toEqual([PROJECTS, `${PROJECTS}/C--Work-App`])
  expect(rig.asked.at(-1)).toEqual({ argv: LOG_ARGV, init: { cwd: KEY, timeoutMs: 5000 } })
  expect(mapOf(rig).projects[KEY]).toEqual({
    commits: [
      { short: 'a1b2c3d', subject: 'Add retry', at: COMMIT_AT, session: SID, asks: [{ text: SAID, at: SAID_AT, files: ['src/a.ts', 'src/b.ts'] }] },
      { short: '0123abc', subject: 'Two', at: COMMIT_AT + 900 * SECOND, session: SID, asks: [{ text: 'Now cap the retries at three', at: COMMIT_AT + 600 * SECOND, files: ['src/c.ts'] }] },
    ],
    sizes: { [SID]: text.length },
    scannedAt: NOW,
  })
  const rest = await card($)
  expect(rest?.note).toBe('2 of 3')
  expect(rest?.lines).toEqual(['2 of 3 commits trace to a', 'conversation.', ...HINT_40])

  rig.log = `${rig.log}${long('beef001')}\t${Math.floor(OLD_AT / SECOND)}\tA subject cut by the 4 MiB li`
  rig.isLogCut = true
  await say($, 'on')
  expect((await card($))?.note).toBe('2 of 3')

  rig.isLogCut = false
  rig.log = 128
  await say($, 'on')
  const blind = await card($)
  expect(blind?.note).toBe('')
  expect(blind?.lines).toEqual(['2 commits recorded.', ...HINT_40])
  expect((await card($, 20))?.lines).toEqual(['2 commits', 'recorded.', 'look <path:line>'])
})

test('A3: scan chooses only prompts a person typed and only commits that git reported', LOADED, async ($, on) => {
  const rig = bench(on)
  const lines = saved([
    typed('Add the parser', SAID_AT),
    typed('Caveat: the messages below were generated by the user while running local commands.', SAID_AT + SECOND, { isMeta: true }),
    typed('Explore the parser folder and report back', SAID_AT + 2 * SECOND, { isSidechain: true }),
    typed('<command-name>/provenance-widget</command-name>\n<command-args>on</command-args>', SAID_AT + 3 * SECOND),
    typed('<task-notification>\n<status>completed</status>\n</task-notification>', SAID_AT + 4 * SECOND, { origin: { kind: 'task-notification' } }),
    typed('The background build finished', SAID_AT + 5 * SECOND, { origin: { kind: 'task-notification' } }),
    typed([{ type: 'text', text: '[Request interrupted by user]' }], SAID_AT + 5 * SECOND),
    typed([{ type: 'text', text: '[Request interrupted by user for tool use]' }], SAID_AT + 5 * SECOND),
    typed('This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\n1. Primary Request and Intent: add the parser', SAID_AT + 5 * SECOND, {
      isVisibleInTranscriptOnly: true,
      isCompactSummary: true,
    }),
    used('toolu_r1', 'Read', { file_path: 'C:\\Work\\App\\src\\parse.ts' }, SAID_AT + 6 * SECOND),
    gave('toolu_r1', '1\texport const parse = () => 0', SAID_AT + 7 * SECOND),
    used('toolu_e1', 'Edit', { file_path: 'C:\\Work\\App\\src\\parse.ts', old_string: '0', new_string: '1' }, SAID_AT + 8 * SECOND),
    gave('toolu_e1', 'The file C:\\Work\\App\\src\\parse.ts has been updated.', SAID_AT + 9 * SECOND),
    used('toolu_b1', 'Bash', { command: 'git commit -am "Rejected by the hook"' }, SAID_AT + 10 * SECOND),
    gave('toolu_b1', '[main bad0001] Rejected by the hook\npre-commit hook failed', SAID_AT + 11 * SECOND, { is_error: true }),
    used('toolu_b2', 'Bash', { command: 'echo "[main bad0002] Only words"' }, SAID_AT + 12 * SECOND),
    gave('toolu_b2', '[main bad0002] Only words', SAID_AT + 13 * SECOND),
    used('toolu_b3', 'Bash', { command: 'git commit -am "Add the parser"' }, SAID_AT + 14 * SECOND),
    gave('toolu_b3', '[main a1b2c3d] Add the parser\n 1 file changed, 1 insertion(+), 1 deletion(-)', SAID_AT + 15 * SECOND),
  ])
  const broken = lines.replace('\n', '\n{"type":"user","message":{"role":"user","content":"A row cut in ha\n')
  const silent = saved([
    used('toolu_b9', 'Bash', { command: 'git commit --allow-empty -m "Start"' }, OLD_AT),
    gave('toolu_b9', '[main (root-commit) c0ffee1] Start', OLD_AT + SECOND),
  ])

  await begin($, rig)
  put(rig, 'C--Work-App', SID, broken)
  put(rig, 'C--Work-App', 'a-session-without-a-prompt', silent)
  expect(await say($, 'scan')).toBe('Read 2 saved sessions of App: 2 commits recorded. 1 of 2 commits trace to a conversation.')
  expect(mapOf(rig).projects[KEY]?.commits).toEqual([
    { short: 'c0ffee1', subject: 'Start', at: OLD_AT + SECOND, session: 'a-session-without-a-prompt', asks: [] },
    { short: 'a1b2c3d', subject: 'Add the parser', at: SAID_AT + 15 * SECOND, session: SID, asks: [{ text: 'Add the parser', at: SAID_AT, files: ['src/parse.ts'] }] },
  ])
})

test('A4: scan reads only this repository and its worktrees, within its byte limits, and never the same session twice', LOADED, async ($, on) => {
  const rig = bench(on, { log: logged([['aaaa001', NOW, 'One'], ['aaaa002', NOW, 'Two'], ['aaaa003', NOW, 'Three'], ['aaaa004', NOW, 'Four'], ['77aa001', OLD_AT, 'Initial commit']]) })
  const one = (short: string, subject: string, cwd: string): string =>
    saved([
      typed(`Please do ${subject}`, SAID_AT, { cwd }),
      used('toolu_b1', 'Bash', { command: `git commit --allow-empty -m "${subject}"` }, SAID_AT + SECOND),
      gave('toolu_b1', `[main ${short}] ${subject}`, SAID_AT + 2 * SECOND),
    ])
  const filler = saved([typed('Explain how the retry works', SAID_AT)])

  await begin($, rig)
  put(rig, 'C--Work-App', 'main-one', one('aaaa001', 'One', WIN))
  put(rig, 'C--Work-App-sub', 'main-sub', one('aaaa002', 'Two', 'C:\\Work\\App\\sub'))
  put(rig, 'C--Work-wt-fix', 'tree-one', one('aaaa003', 'Three', 'C:\\Work\\wt\\fix'))
  put(rig, 'C--Work-wt-fix-sub', 'tree-sub', one('aaaa004', 'Four', 'c:/work/wt/fix/sub'))
  put(rig, 'C--Work-App-old', 'old-one', one('bbbb001', 'Old', 'C:\\Work\\App-old'))
  put(rig, 'C--Other', 'other-one', one('bbbb002', 'Other', 'C:\\Other'))
  put(rig, 'C--Work-App', 'long-one', one('bbbb003', 'Long', WIN), { size: 3_600_000 })
  for (let index = 0; index < 13; index += 1) put(rig, 'C--Work-App', `filler-${index}`, filler, { size: 3_400_000, mtimeMs: NOW - (index + 1) * 60_000 })

  await peek($, 'reset')
  expect(await say($, 'scan')).toBe('Read 16 saved sessions of App: 4 commits recorded. 4 of 5 commits trace to a conversation. 1 too long to read.\n1 more to read: run scan again.')
  expect(rig.listed).toEqual([PROJECTS, ...['C--Work-App', 'C--Work-App-sub', 'C--Work-wt-fix', 'C--Work-wt-fix-sub', 'C--Work-App-old'].map(dir => `${PROJECTS}/${dir}`)])
  const first = (await peek($)).reads.filter(path => path.endsWith('.jsonl'))
  expect(first.length).toBe(17)
  expect(first.some(path => path.includes('long-one') || path.includes('other-one') || path.includes('filler-12'))).toBe(false)
  expect(mapOf(rig).projects[KEY]?.commits.map(commit => commit.short).sort()).toEqual(['aaaa001', 'aaaa002', 'aaaa003', 'aaaa004'])
  expect(Object.keys(mapOf(rig).projects[KEY]?.sizes ?? {}).length).toBe(17)

  await peek($, 'reset')
  expect(await say($, 'scan')).toBe('Read 1 saved session of App: 0 commits recorded. 4 of 5 commits trace to a conversation. 1 too long to read.')
  expect((await peek($)).reads.filter(path => path.endsWith('.jsonl'))).toEqual([`${PROJECTS}/C--Work-App/filler-12.jsonl`])

  rig.env = { HOME: '/home/dev', USERPROFILE: 'C:\\Users\\Dev' }
  rig.listed = []
  expect(await say($, 'scan')).toBe('Could not read /home/dev/.claude.')
  expect(rig.listed.map(path => path.replace(/^[a-z]:/i, ''))).toEqual(['/home/dev/.claude/projects'])
  rig.env = {}
  expect(await say($, 'scan')).toBe('Could not find where sessions are saved.')
})

test('A5: a live prompt, its edits and the commit that follows become one record, and every hook hands back what it was given', LOADED, async ($, on) => {
  const rig = bench(on, { cwd: '/work/project', worktrees: 'worktree /work/project\nHEAD 0000000000000000000000000000000000000000\nbranch refs/heads/main\n\n' })
  const said = 'Never retry on a 401. Write the policy and commit it.'
  const denied = { deny: 'Blocked by the project: generated files are read-only.' }
  const failed = { result: 'Error: String to replace not found in file.', isError: true, text: 'Error: String to replace not found in file.' }
  const first = '[main (root-commit) a1b2c3d] Add prov\n 2 files changed, 9 insertions(+)\n create mode 100644 src/a.ts\n create mode 100644 src/b.ts\n'
  const committed = { result: { stdout: first, stderr: '', interrupted: false }, text: first }

  await begin($, rig)
  expect(await prompt($, said)).toEqual({ text: said })
  expect(await call($, rig, { tool: 'Edit', file_path: '/work/project/src/a.ts', old_string: 'a', new_string: 'b' })).toEqual(EDITED)
  expect(await call($, rig, { tool: 'Write', file_path: 'src/b.ts', content: 'export const tries = 0\n' })).toEqual(EDITED)
  expect(await call($, rig, { tool: 'Edit', file_path: '/work/project/gen/c.ts', old_string: 'a', new_string: 'b' }, denied)).toEqual(denied)
  expect(await call($, rig, { tool: 'Edit', file_path: '/work/project/src/d.ts', old_string: 'a', new_string: 'b' }, failed)).toEqual(failed)
  expect(Object.keys((await peek($)).run?.pending ?? {})).toEqual(['/work/project/src/a.ts', '/work/project/src/b.ts'])
  expect(rig.asked).toEqual([])

  await rig.world.clock.advance(90 * SECOND)
  expect(await call($, rig, { tool: 'Bash', command: 'git add -A && git commit -m "Add prov"' }, committed)).toEqual(committed)
  expect(mapOf(rig).projects['/work/project']?.commits).toEqual([
    { short: 'a1b2c3d', subject: 'Add prov', at: NOW + 90 * SECOND, session: 'session-1', asks: [{ text: said, at: NOW, files: ['src/a.ts', 'src/b.ts'] }] },
  ])
  expect((await peek($)).run?.pending).toEqual({})
  expect(rig.asked).toEqual([{ argv: LOG_ARGV, init: { cwd: '/work/project', timeoutMs: 5000 } }])

  expect(await prompt($, 'A subagent finished', 'task-notification')).toEqual({ text: 'A subagent finished' })
  expect(await prompt($, 'A scheduled job ran', 'scheduled-trigger')).toEqual({ text: 'A scheduled job ran' })
  expect((await peek($)).run?.ask).toEqual({ text: said, at: NOW })

  await bash($, rig, 'git commit --allow-empty -m "Again"', '[main b2c3d4e] Again\n')
  expect(mapOf(rig).projects['/work/project']?.commits[1]).toEqual({ short: 'b2c3d4e', subject: 'Again', at: NOW + 90 * SECOND, session: 'session-1', asks: [] })
  expect(nexts(rig)).toBe(6)
})

test('A6: an Edit of traced lines runs one blame before the edit and shows the prompt that wrote them', LOADED, async ($, on) => {
  const checkedOut = 'C:\\Work\\App\\src\\http\\crlf.ts'
  const rig = bench(on, { files: { [RETRY]: SOURCE, [checkedOut]: SOURCE.replaceAll('\n', '\r\n') }, blame: porcelain([owner('a1b2c3d', 9), owner('9c41e07', 4, { at: Math.floor(OLD_AT / SECOND), summary: 'Fix the retry loop' }), owner('a1b2c3d', 5)], 41) })

  await begin($, rig, [RECORD])
  expect(await edit($, rig, 41, 58)).toEqual(EDITED)
  expect(blames(rig)).toEqual([blameOf(41, 58, 'C:/Work/App/src/http/retry.ts')])
  expect(rig.order).toEqual(['git blame', 'next'])

  const traced = await card($)
  expect(traced?.note).toBe('14 Sep 2026')
  expect(traced?.lines).toEqual([
    'src/http/retry.ts:41-58',
    'written after you said:',
    '"never retry on a 401, it locks',
    'accounts"',
    'a1b2c3d · 14 of 18 lines',
    '/provenance-widget copy resumes it',
  ])
  expect(traced?.yellow).toEqual(['"never retry on a 401, it locks', 'accounts"'])
  expect((await peek($)).finding).toEqual({
    kind: 'traced',
    path: 'C:/Work/App/src/http/retry.ts',
    first: 41,
    last: 58,
    hash: long('a1b2c3d'),
    lines: 14,
    of: 18,
    commitAt: COMMIT_AT,
    subject: SUBJECT,
    session: SID,
    ask: SAID,
    askAt: SAID_AT,
    isMoved: false,
  })

  expect(await edit($, rig, 41, 58, checkedOut)).toEqual(EDITED)
  expect(blames(rig)).toEqual([blameOf(41, 58, 'C:/Work/App/src/http/retry.ts'), blameOf(41, 58, 'C:/Work/App/src/http/crlf.ts')])
  expect((await peek($)).finding).toMatchObject({ kind: 'traced', path: 'C:/Work/App/src/http/crlf.ts', first: 41, last: 58 })
})

test('A7: the recorded commit wins the range, and a rewritten commit is matched by subject within 120 seconds', LOADED, async ($, on) => {
  const rig = bench(on)
  const recordedAt = Date.parse('2026-09-14T09:40:00.000Z')
  const seconds = Math.floor(recordedAt / SECOND)
  const moved = (after: number, summary = 'Fix the retry loop'): string => porcelain([owner('5eed123', 3, { at: seconds + after, summary })], 7)

  await begin($, rig, [RECORD, { short: 'feed123', subject: 'Fix the retry loop', at: recordedAt, session: 'an-older-session', asks: [{ text: 'fix the loop', at: recordedAt - 60 * SECOND, files: ['src/http/retry.ts'] }] }])
  rig.blame = porcelain([owner('9c41e07', 6, { summary: 'Reformat' }), owner('a1b2c3d', 8), owner('9c41e07', 4, { summary: 'Reformat' })], 41)
  expect(await say($, 'look src/http/retry.ts:41-58')).toContain('commit a1b2c3d (8 of 18 lines)')
  expect((await card($))?.lines[4]).toBe('a1b2c3d · 8 of 18 lines')

  rig.blame = moved(90)
  expect(await say($, 'look src/http/retry.ts:7-9')).toContain(MOVED)
  expect((await peek($)).finding).toMatchObject({ kind: 'traced', hash: long('5eed123'), session: 'an-older-session', ask: 'fix the loop', isMoved: true })

  rig.blame = moved(-120)
  expect((await say($, 'look src/http/retry.ts:7-9')).split('\n')[1]).toBe('You said, on 14 Sep 2026: "fix the loop"')

  rig.blame = moved(121)
  expect(await say($, 'look src/http/retry.ts:7-9')).toBe('src/http/retry.ts:7-9 · commit 5eed123 (3 of 3 lines), 14 Sep 2026\nNo conversation on record. Commit: Fix the retry loop')
  expect((await peek($)).finding).toMatchObject({ kind: 'untraced', isMoved: false })

  rig.blame = moved(90, 'Fix the retry loops')
  expect((await say($, 'look src/http/retry.ts:7-9')).split('\n')[1]).toBe('No conversation on record. Commit: Fix the retry loops')
})

test('A8: each kind of finding has its card and its answer, and the Edit goes through whatever blame says', LOADED, async ($, on) => {
  const other = 'C:\\Work\\App\\src\\other.ts'
  const rig = bench(on, { files: { [RETRY]: SOURCE, [other]: SOURCE } })

  await begin($, rig, [RECORD])
  rig.blame = porcelain([owner('a1b2c3d', 2, { filename: 'src/other.ts' })], 3)
  expect(await edit($, rig, 3, 4, other)).toEqual(EDITED)
  expect(nexts(rig)).toBe(1)
  const promptless = await card($)
  expect(promptless?.note).toBe('14 Sep 2026')
  expect(promptless?.lines).toEqual(['src/other.ts:3-4', 'A session wrote these lines, but its', 'prompt for this file was not found.', 'a1b2c3d · 2 of 2 lines', '/provenance-widget copy resumes it'])
  expect(promptless?.yellow).toEqual([])
  expect(await say($, 'look src/other.ts:3-4')).toBe(
    `src/other.ts:3-4 · commit a1b2c3d (2 of 2 lines), 14 Sep 2026\nSession ${SID} wrote these lines; its prompt for this file was not found.\nResume: claude --resume ${SID}`,
  )

  rig.blame = porcelain([owner('9c41e07', 14, { at: Math.floor(OLD_AT / SECOND), summary: 'Fix the retry loop' }), owner('77aa001', 4, { at: 1_600_000_000, summary: 'Initial commit' })], 41)
  expect(await edit($, rig, 41, 58)).toEqual(EDITED)
  expect(nexts(rig)).toBe(2)
  const untraced = await card($)
  expect(untraced?.note).toBe('no record')
  expect(untraced?.lines).toEqual(['src/http/retry.ts:41-58', 'No conversation on record.', '9c41e07 · 14 of 18 lines', '2 Mar 2025 · Fix the retry loop'])
  expect(await say($, 'look src/http/retry.ts:41-58')).toBe('src/http/retry.ts:41-58 · commit 9c41e07 (14 of 18 lines), 2 Mar 2025\nNo conversation on record. Commit: Fix the retry loop')

  rig.blame = porcelain([owner('0000000', 3, { hash: '0'.repeat(40), at: Math.floor(NOW / SECOND), summary: 'Version of src/http/retry.ts from src/http/retry.ts' })], 10)
  expect(await edit($, rig, 10, 12)).toEqual(EDITED)
  expect(nexts(rig)).toBe(3)
  const uncommitted = await card($)
  expect(uncommitted?.note).toBe('no record')
  expect(uncommitted?.lines).toEqual(['src/http/retry.ts:10-12', 'These lines are not committed yet.'])
  expect(await say($, 'look src/http/retry.ts:10-12')).toBe('src/http/retry.ts:10-12 is not committed yet.')

  rig.blame = 128
  expect(await edit($, rig, 20, 21)).toEqual(EDITED)
  expect(nexts(rig)).toBe(4)
  const unread = await card($)
  expect(unread?.note).toBe('no blame')
  expect(unread?.lines).toEqual(['src/http/retry.ts:20-21', 'git blame gave no answer here.'])
  expect(await say($, 'look src/http/retry.ts:20-21')).toBe('git blame gave no answer for src/http/retry.ts:20-21.')

  await say($, 'clear')
  await seed($, rig, JSON.stringify({ projects: { [KEY]: project([RECORD]) } }))
  await peek($, 'hold-reject')
  const late = edit($, rig, 30, 31)
  await rig.world.clock.advance(SECOND)
  expect((await peek($)).run?.isLooking).toBe(true)
  expect(nexts(rig)).toBe(4)
  await peek($, 'release')
  expect(await late).toEqual(EDITED)
  expect(nexts(rig)).toBe(5)
  expect((await peek($)).run?.isLooking).toBe(false)
  expect((await card($))?.lines).toEqual(['src/http/retry.ts:30-31', 'git blame gave no answer here.'])
})

test('A9: an Edit runs no blame when there is nothing to look up or a lookup is already running', LOADED, async ($, on) => {
  const outside = 'C:\\Elsewhere\\notes.ts'
  const rig = bench(on, { files: { [RETRY]: SOURCE, [outside]: SOURCE }, blame: porcelain([owner('a1b2c3d', 18)], 41) })

  await begin($, rig)
  await edit($, rig, 41, 58)
  expect(rig.order).toEqual(['next'])

  await seed($, rig, JSON.stringify({ projects: { [KEY]: project([RECORD]) } }))
  rig.asked = []
  await call($, rig, { tool: 'Edit', file_path: RETRY, old_string: 'a line that is not in the file', new_string: 'b' })
  await call($, rig, { tool: 'Edit', file_path: 'C:\\Work\\App\\src\\missing.ts', old_string: LINES[0], new_string: 'b' })
  await edit($, rig, 41, 58, outside)
  await call($, rig, { tool: 'Edit', file_path: RETRY, old_string: '', new_string: 'b' })
  expect(blames(rig)).toEqual([])

  await call($, rig, { tool: 'Edit', file_path: RETRY, old_string: `${LINES.slice(40, 58).join('\n')}\n`, new_string: '  retry()\n' })
  expect(blames(rig)).toEqual([blameOf(41, 58, 'C:/Work/App/src/http/retry.ts')])
  await edit($, rig, 41, 50)
  await call($, rig, { tool: 'Edit', file_path: 'src\\http\\retry.ts', old_string: LINES[40], new_string: 'b', replace_all: true })
  expect(blames(rig).length).toBe(1)

  await peek($, 'hold')
  const slow = edit($, rig, 5, 6)
  await rig.world.clock.advance(SECOND)
  expect((await peek($)).run?.isLooking).toBe(true)
  const before = nexts(rig)
  expect(await edit($, rig, 20, 21)).toEqual(EDITED)
  expect(nexts(rig)).toBe(before + 1)
  expect(blames(rig).length).toBe(1)
  await peek($, 'release')
  await slow
  expect(blames(rig).map(asked => asked.argv[5])).toEqual(['41,58', '5,6'])
  expect((await peek($)).run?.isLooking).toBe(false)
})

test('A10: look accepts relative, absolute and spaced paths in any case of verb, and refuses what is not a path:line here', LOADED, async ($, on) => {
  const rig = bench(on)
  const traced = (spot: string, lines: number): string =>
    `${spot} · commit a1b2c3d (${lines} of ${lines} lines), 14 Sep 2026\nYou said, on 14 Sep 2026: "${SAID}"\nResume: claude --resume ${SID}`

  await begin($, rig, [RECORD])
  rig.blame = porcelain([owner('a1b2c3d', 1, { filename: 'src/a.ts' })], 7)
  expect(await say($, 'look src/a.ts:7')).toBe(traced('src/a.ts:7', 1))
  expect(blames(rig).at(-1)).toEqual(blameOf(7, 7, 'C:/Work/App/src/a.ts'))
  expect(await say($, 'LOOK src/a.ts:7')).toBe(traced('src/a.ts:7', 1))
  expect(blames(rig).at(-1)).toEqual(blameOf(7, 7, 'C:/Work/App/src/a.ts'))

  rig.blame = porcelain([owner('a1b2c3d', 3, { filename: 'src/a.ts' })], 7)
  expect(await say($, 'look C:\\Work\\App\\src\\a.ts:7-9')).toBe(traced('src/a.ts:7-9', 3))
  expect(blames(rig).at(-1)).toEqual(blameOf(7, 9, 'C:/Work/App/src/a.ts'))

  rig.blame = porcelain([owner('a1b2c3d', 1, { filename: 'docs/my notes.md' })], 3)
  expect(await say($, 'look docs/my notes.md:3')).toBe(traced('docs/my notes.md:3', 1))
  expect(blames(rig).at(-1)).toEqual(blameOf(3, 3, 'C:/Work/App/docs/my notes.md'))

  rig.blame = porcelain([owner('5eed123', 1, { filename: 'src/a.ts', at: Math.floor(COMMIT_AT / SECOND) + 45 })], 7)
  expect(await say($, 'look src/a.ts:7')).toBe(`${traced('src/a.ts:7', 1).replace('a1b2c3d', '5eed123')}\n${MOVED}`)

  const asked = blames(rig).length
  expect(await say($, 'look ../other/x.ts:1')).toBe('../other/x.ts is outside this repository.')
  for (const args of ['look', 'look src/a.ts', 'look a.ts:0', 'look src/a.ts:9-7']) expect(await say($, args)).toBe(SELECT)
  expect(blames(rig).length).toBe(asked)
})

test('A11: bare look reads the selection once, and says what to select when it is not a path:line', LOADED, async ($, on) => {
  const rig = bench(on, { blame: porcelain([owner('a1b2c3d', 1, { filename: 'src/a.ts' })], 7) })

  await begin($, rig, [RECORD])
  rig.selection = { text: '  src/a.ts:7 \n' }
  expect((await say($, 'look')).split('\n')[0]).toBe('src/a.ts:7 · commit a1b2c3d (1 of 1 lines), 14 Sep 2026')
  expect(blames(rig)).toEqual([blameOf(7, 7, 'C:/Work/App/src/a.ts')])

  rig.selection = undefined
  expect(await say($, 'look')).toBe(SELECT)
  rig.selection = { text: 'hello' }
  expect(await say($, 'look')).toBe(SELECT)
  expect(blames(rig).length).toBe(1)
})

test('A12: copy hands over the resume command of a traced or promptless finding and nothing else', LOADED, async ($, on) => {
  const rig = bench(on)
  const resume = `claude --resume ${SID}`

  await begin($, rig, [RECORD])
  expect(await say($, 'copy')).toBe(NOTHING)

  rig.blame = porcelain([owner('a1b2c3d', 1, { filename: 'src/a.ts' })], 7)
  await say($, 'look src/a.ts:7')
  expect(await say($, 'COPY')).toBe(`Copied: ${resume}`)
  rig.isCopied = false
  expect(await say($, 'copy')).toBe(`Could not copy. Run: ${resume}`)

  rig.isCopied = true
  rig.blame = porcelain([owner('a1b2c3d', 1, { filename: 'src/unasked.ts' })], 7)
  await say($, 'look src/unasked.ts:7')
  expect((await peek($)).finding?.kind).toBe('promptless')
  expect(await say($, 'copy')).toBe(`Copied: ${resume}`)
  expect(rig.copied).toEqual([resume, resume, resume])

  rig.blame = porcelain([owner('9c41e07', 1, { filename: 'src/a.ts', summary: 'Reformat' })], 7)
  await say($, 'look src/a.ts:7')
  expect(await say($, 'copy')).toBe(NOTHING)
  expect(rig.copied.length).toBe(3)
})

test('A13: the map file is shared: clear takes one repository out, writes merge, the oldest record goes first', LOADED, async ($, on) => {
  const rig = bench(on, { blame: porcelain([owner('a1b2c3d', 1, { filename: 'src/a.ts' })], 7) })
  const theirs = project([{ ...RECORD, short: '0fedcba', session: 'their-session' }])
  const many = Array.from({ length: 2000 }, (_, index) => ({ short: (0x1000000 + index).toString(16), subject: `Commit ${index}`, at: OLD_AT + index * SECOND, session: 'an-old-session', asks: [] }))
  const again = { ...RECORD, short: 'beef002', subject: 'From another window', session: 'another-window' }

  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  await seed($, rig, JSON.stringify({ projects: { [KEY]: project([RECORD, { ...RECORD, short: 'b2c3d4e' }]), 'c:/work/else': theirs } }))
  await say($, 'look src/a.ts:7')
  expect((await card($))?.note).toBe('14 Sep 2026')
  expect(await say($, 'clear')).toBe('Provenance cleared: 2 commits forgotten for App.')
  expect(mapOf(rig)).toEqual({ projects: { 'c:/work/else': theirs } })
  expect((await peek($)).finding).toBe(null)
  expect((await card($))?.lines).toEqual(EMPTY_40)
  const written = rig.world.writes.length
  expect(await say($, 'clear')).toBe('Provenance cleared: 0 commits forgotten for App.')
  expect(rig.world.writes.length).toBe(written)

  await bash($, rig, 'git commit -am "Mine"', '[main aaaa001] Mine\n')
  rig.world.files.set(mapPath(rig), JSON.stringify({ projects: { ...mapOf(rig).projects, [KEY]: project([...(mapOf(rig).projects[KEY]?.commits ?? []), again]) } }))
  await bash($, rig, 'git commit -am "Mine too"', '[main aaaa002] Mine too\n')
  expect(mapOf(rig).projects[KEY]?.commits.map(commit => `${commit.session} ${commit.short}`).sort()).toEqual(['another-window beef002', 'session-1 aaaa001', 'session-1 aaaa002'])
  await bash($, rig, 'git commit --amend --no-edit', '[main aaaa002] Mine too, said twice\n')
  expect(mapOf(rig).projects[KEY]?.commits.find(commit => commit.short === 'aaaa002')?.subject).toBe('Mine too')
  expect(mapOf(rig).projects['c:/work/else']).toEqual(theirs)

  await seed($, rig, JSON.stringify({ projects: { [KEY]: project(many) } }))
  await bash($, rig, 'git commit -am "One more"', '[main cccc001] One more\n')
  const kept = mapOf(rig).projects[KEY]?.commits ?? []
  expect(kept.length).toBe(2000)
  expect(kept[0]?.subject).toBe('Commit 1')
  expect(kept.at(-1)).toEqual({ short: 'cccc001', subject: 'One more', at: NOW, session: 'session-1', asks: [] })

  await seed($, rig, '{"projects": {"c:/work/app": {"commits": [{"short": 7}, nul')
  expect((await card($))?.lines).toEqual(EMPTY_40)
  await bash($, rig, 'git commit -am "After the damage"', '[main dddd001] After the damage\n')
  expect(mapOf(rig)).toEqual({ projects: { [KEY]: project([{ short: 'dddd001', subject: 'After the damage', at: NOW, session: 'session-1', asks: [] }]) } })

  rig.log = 128
  await say($, 'on')
  const blind = await card($)
  expect(blind?.note).toBe('')
  expect(blind?.lines).toEqual(['1 commit recorded.', ...HINT_40])
  expect((await card($, 20))?.lines).toEqual(['1 commit', 'recorded.', 'look <path:line>'])
})

test('A14: while off every verb says so and nothing is read, run, written or held', LOADED, async ($, on) => {
  const rig = bench(on, { files: { [RETRY]: SOURCE } })

  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  for (const args of ['scan', 'look a.ts:1', 'copy', 'clear', 'SCAN']) expect(await say($, args)).toBe(OFF)
  await turn($)
  await prompt($, 'Never retry on a 401')
  await edit($, rig, 41, 58)
  await call($, rig, { tool: 'Write', file_path: 'C:\\Work\\App\\src\\b.ts', content: 'export const tries = 0\n' })
  await bash($, rig, 'git commit -am "Add retry"', '[main a1b2c3d] Add retry\n')
  const quiet = await peek($)
  expect(quiet.reads).toEqual([])
  expect(rig.asked).toEqual([])
  expect(rig.world.writes).toEqual([])
  expect([quiet.run, quiet.finding, quiet.repo]).toEqual([null, null, null])
  expect(rig.world.store.get('isOn')).toBe(undefined)
  expect(await card($)).toBeUndefined()

  await say($, 'on')
  await seed($, rig, JSON.stringify({ projects: { [KEY]: project([RECORD]) } }))
  const before = { writes: rig.world.writes.length, state: await peek($) }
  for (const args of ['provenance', 'scan now', 'copy 1', 'clear all']) expect(await say($, args)).toBe(USAGE)
  expect(rig.world.writes.length).toBe(before.writes)
  expect(await peek($)).toEqual(before.state)

  rig.blame = porcelain([owner('a1b2c3d', 18)], 41)
  await prompt($, 'Never retry on a 401')
  await edit($, rig, 41, 58)
  const busy = await peek($)
  expect(busy.finding?.kind).toBe('traced')
  expect(Object.keys(busy.run?.pending ?? {})).toEqual(['c:/work/app/src/http/retry.ts'])
  expect(await say($, 'off')).toBe('Provenance off.')
  const after = await peek($)
  expect(after.run).toEqual(IDLE)
  expect(after.finding).toBe(null)
  expect(mapOf(rig).projects[KEY]?.commits).toEqual([RECORD])
})

test('A15: every card keeps inside its border at 20, 40 and 60 columns, with the narrow forms under 30', LOADED, async ($, on) => {
  const other = 'C:\\Work\\App\\src\\other.ts'
  const deep = 'C:\\Work\\App\\packages\\transport\\src\\http\\retry.ts'
  const rig = bench(on, { worktrees: 128, files: { [RETRY]: SOURCE, [other]: SOURCE, [deep]: SOURCE } })
  const wordy = Array.from({ length: 60 }, (_, index) => `word${index}`).join('  \n')
  const collapsed = wordy.replace(/\s+/g, ' ')
  const fits = async (): Promise<Record<number, Drawn | undefined>> => {
    const drawn: Record<number, Drawn | undefined> = {}
    for (const columns of [20, 40, 60]) {
      const shown = await card($, columns)
      expect(shown?.width).toBe(columns)
      expect((shown?.lines ?? []).filter(line => line.length > columns - 4)).toEqual([])
      expect((shown?.lines ?? []).length).toBeGreaterThan(1)
      expect(shown?.note === '').toBe(columns === 20 || shown?.lines[0] === 'No conversations traced yet.' || shown?.lines[0] === NO_REPO)
      drawn[columns] = shown
    }

    return drawn
  }

  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  await $.command.run(run('widen', `${NAME} 60`))
  await say($, 'on')
  expect((await fits())[20]?.lines).toEqual(['Not a git', 'repository.', 'Provenance needs', 'git history.'])

  await prompt($, wordy)
  await call($, rig, { tool: 'Write', file_path: RETRY, content: SOURCE })
  await bash($, rig, 'git init -q', '')
  expect(rig.asked.filter(asked => asked.argv[2] === 'worktree').length).toBe(1)
  rig.worktrees = WORKTREES
  rig.log = logged([['a1b2c3d', NOW, 'Add the retry policy']])
  await bash($, rig, 'git add -A && git commit -m "Add the retry policy"', '[main (root-commit) a1b2c3d] Add the retry policy\n 1 file changed, 70 insertions(+)\n')
  expect(rig.asked.filter(asked => asked.argv[2] === 'worktree').length).toBe(2)
  const [kept] = mapOf(rig).projects[KEY]?.commits ?? []
  const stored = kept?.asks[0]?.text ?? ''
  expect(kept).toMatchObject({ short: 'a1b2c3d', subject: 'Add the retry policy', session: 'session-1', asks: [{ files: ['src/http/retry.ts'] }] })
  expect(stored.length).toBeLessThanOrEqual(240)
  expect(stored.length).toBeGreaterThan(230)
  expect(stored.endsWith('…')).toBe(true)
  expect(collapsed.startsWith(`${stored.slice(0, -1)} `)).toBe(true)

  const rest = await fits()
  expect(rest[20]?.lines).toEqual(['1 of 1 commits', 'traced.', 'look <path:line>'])
  expect(rest[40]?.lines).toEqual(['1 of 1 commits trace to a', 'conversation.', ...HINT_40])
  expect(rest[40]?.note).toBe('1 of 1')

  rig.blame = porcelain([owner('a1b2c3d', 14, { at: Math.floor(NOW / SECOND) }), owner('9c41e07', 4)], 41)
  await say($, 'look src/http/retry.ts:41-58')
  const wide = await fits()
  for (const columns of [20, 40, 60]) {
    expect(wide[columns]?.yellow.length).toBe(4)
    expect(wide[columns]?.yellow[0]?.startsWith('"word0 word1')).toBe(true)
    expect(wide[columns]?.yellow[3]?.endsWith('…"')).toBe(true)
  }
  expect(wide[20]?.lines.filter(line => !wide[20]?.yellow.includes(line))).toEqual(['…/retry.ts:41-58', 'after you said:', 'a1b2c3d · 14/18', '20 Sep 2026', 'copy resumes it'])
  expect(wide[60]?.lines.at(-1)).toBe('/provenance-widget copy resumes it')

  await say($, 'clear')
  await seed($, rig, JSON.stringify({ projects: { [KEY]: project([RECORD]) } }))
  rig.blame = porcelain([owner('a1b2c3d', 14), owner('9c41e07', 4)], 41)
  await say($, 'look src/http/retry.ts:41-58')
  expect((await fits())[20]?.lines).toEqual(['…/retry.ts:41-58', 'after you said:', '"never retry on', 'a 401, it locks', 'accounts"', 'a1b2c3d · 14/18', '14 Sep 2026', 'copy resumes it'])

  await say($, 'look packages/transport/src/http/retry.ts:41-58')
  const far = await fits()
  expect(far[20]?.lines[0]).toBe('…/retry.ts:41-58')
  expect(far[40]?.lines[0]).toBe('…s/transport/src/http/retry.ts:41-58')
  expect(far[60]?.lines[0]).toBe('packages/transport/src/http/retry.ts:41-58')

  rig.blame = porcelain([owner('a1b2c3d', 14, { filename: 'src/other.ts' }), owner('9c41e07', 4)], 41)
  await say($, 'look src/other.ts:41-58')
  expect((await fits())[20]?.lines).toEqual(['src/other.ts:41-58'.slice(-15).padStart(16, '…'), 'A session wrote', 'these lines, but', 'its prompt for', 'this file was', 'not found.', 'a1b2c3d · 14/18', '14 Sep 2026', 'copy resumes it'])

  rig.blame = porcelain([owner('9c41e07', 14, { at: Math.floor(OLD_AT / SECOND), summary: 'Fix the retry loop when the server answers slowly' }), owner('77aa001', 4, { at: 1_600_000_000, summary: 'Initial commit' })], 41)
  await say($, 'look src/http/retry.ts:41-58')
  const untraced = await fits()
  expect(untraced[20]?.lines).toEqual(['…/retry.ts:41-58', 'No conversation', 'on record.', '9c41e07 · 14/18', '2 Mar 2025 · Fi…'])
  expect(untraced[40]?.lines.at(-1)).toBe('2 Mar 2025 · Fix the retry loop whe…')

  rig.blame = porcelain([owner('0000000', 18, { hash: '0'.repeat(40) })], 41)
  await say($, 'look src/http/retry.ts:41-58')
  expect((await fits())[20]?.lines).toEqual(['…/retry.ts:41-58', 'These lines are', 'not committed', 'yet.'])

  rig.blame = 'reject'
  await say($, 'look src/http/retry.ts:41-58')
  expect((await fits())[20]?.lines).toEqual(['…/retry.ts:41-58', 'git blame gave', 'no answer here.'])

  await say($, 'clear')
  expect((await fits())[20]?.lines).toEqual(['No conversations', 'traced yet.', 'scan reads this', "repository's", 'saved sessions;', 'commits made', 'from now on are', 'recorded.'])
})

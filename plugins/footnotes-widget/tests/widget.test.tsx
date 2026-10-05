import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Ran = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
type Run = { argv: readonly string[]; init?: { cwd?: string; timeoutMs?: number } }
type Mark = { text: string; color: unknown }
type Drawn = { note: string; width: unknown; lines: string[]; wraps: unknown[]; dims: unknown[]; marks: Mark[]; button: unknown }
type Desk = {
  world: Ground
  calls: string[]
  runs: Run[]
  fills: { text: string; mode: string }[]
  occurs: Set<string>
  place: { cwd: string; root: string | null }
  git: { ls?: Ran | 'reject'; grep?: Ran | 'reject' }
  box: { answer: 'take' | 'refuse' | 'throw' }
}

const NAME = 'footnotes-widget'
const ROOT = '/work/project'
const USAGE = 'Usage: /footnotes-widget [on|off|show|clear]'
const OFF = 'Footnotes is off.'
const UNCHECKED = 'No reply checked yet.'
const EMPTY = [UNCHECKED, "File and symbol names in Claude's", 'replies are checked here.']
const NOTHING = 'Nothing to check in the last reply.'
const OPENING = 'Check these references from your last reply against the repository and correct what was wrong:'
const LS_FILES = ['git', '--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard']
const GREP = ['git', '--no-optional-locks', 'grep', '-I', '-w', '-F', '-o', '-h', '--untracked']
const GIT = { cwd: ROOT, timeoutMs: 3000 }
const GREEN = { text: '✓', color: 'green' }
const RED = { text: '✗', color: 'red' }
const YELLOW = { text: '?', color: 'yellow' }
const PLUGINS = { plugins: [LAYOUT] }

const SUM = `${['export const sum = list => {', '  let total = 0', '  for (const item of list) total += item', '', '  return total', '}', 'export default sum'].join('\n')}\n`
const LOGIN = `${[
  "import { Router } from 'express'",
  '',
  'export const login = Router()',
  ...Array.from({ length: 57 }, (_, at) => `login.post('/step-${at + 1}', (req, res) => res.json({ step: ${at + 1}, user: req.body.user }))`),
  'export default login',
].join('\n')}\n`
const FILES = {
  [`${ROOT}/README.md`]: '# Project\n\nAdds numbers and logs people in.\n',
  [`${ROOT}/package.json`]: '{\n  "name": "project",\n  "version": "1.0.0"\n}\n',
  [`${ROOT}/notes.txt`]: 'retry the login\nask about tokens\nship on friday',
  [`${ROOT}/src/sum.js`]: SUM,
  [`${ROOT}/src/index.ts`]: "export { sum } from './sum.js'\nexport { login } from './routes/login'\n",
  [`${ROOT}/src/routes/login.ts`]: LOGIN,
  [`${ROOT}/test/index.ts`]: "import '../src/index'\n",
  [`${ROOT}/packages/api/src/server.ts`]: "import { login } from '../../../src/routes/login'\n",
}

const A3_REPLY = 'The session is refreshed at `src/routes/login.ts:88`, where `refreshSession()` swaps the token before the redirect.'
const EIGHT = [
  '`src/routes/login.ts:88`',
  '`src/sum.js:40-52`',
  '`refreshSession()`',
  '`src/retry.ts`',
  '`user_id`',
  '`validateRefreshTokensAgainstSessionStore`',
  '`docs/auth.md:12`',
  '`gone.ts:9`',
]
const TWELVE = [
  '`src/sum.js`',
  '`src/sum.js:3`',
  '`src/routes/login.ts`',
  '`src/routes/login.ts:61`',
  '`README.md`',
  '`README.md:1`',
  '`sum()`',
  '`MAX_RETRIES`',
  '`UserService`',
  '`user.id`',
  '`package.json`',
  '`src/index.ts`',
]
const BUSY = `The login flow touches ${TWELVE.join(', ')}. What breaks it: ${EIGHT.join(', ')}.`
const EIGHT_NAMES = ['login.ts:88', 'sum.js:40-52', 'refreshSession()', 'retry.ts', 'user_id', 'validateRefreshTokensAgainstSessionStore', 'auth.md:12', 'gone.ts:9']
const EIGHT_FULL = [
  '- src/routes/login.ts:88: file has 61 lines',
  '- src/sum.js:40-52: file has 7 lines',
  '- refreshSession(): not found in this repository',
  '- src/retry.ts: not on disk',
  '- user_id: not found in this repository',
  '- validateRefreshTokensAgainstSessionStore: not found in this repository',
  '- docs/auth.md:12: not on disk',
  '- gone.ts:9: not on disk',
]

const ran = (exitCode: number, stdout = '', isStdoutTruncated = false): Ran => ({ exitCode, stdout, stderr: '', isStdoutTruncated, isStderrTruncated: false })

const open = (on: On, given: { store?: Record<string, unknown>; files?: Record<string, string>; root?: string | null } = {}): Desk => {
  const calls: string[] = []
  const runs: Run[] = []
  const fills: { text: string; mode: string }[] = []
  const occurs = new Set(['sum', 'total', 'login', 'user', 'MAX_RETRIES', 'UserService', 'getUser'])
  const place = { cwd: ROOT, root: given.root === undefined ? ROOT : given.root }
  const git: Desk['git'] = {}
  const box: Desk['box'] = { answer: 'take' }
  const world: Ground = ground(on, {
    store: given.store,
    files: given.files ?? FILES,
    answers: {
      'session.cwd': () => {
        calls.push('session.cwd')

        return place.cwd
      },
      'session.repo': () => {
        calls.push('session.repo')

        return place.root === null ? null : { root: place.root, remote: null, internal: false, name: null }
      },
      'process.run': (e: Run) => {
        runs.push({ argv: [...e.argv], init: e.init })
        const answer = e.argv[2] === 'ls-files' ? git.ls : git.grep
        if (answer === 'reject') throw new Error('git timed out after 3000 ms')
        if (answer !== undefined) return answer
        if (e.argv[2] === 'ls-files') {
          const tracked = [...world.files.keys()].filter(path => path.startsWith(`${place.root}/`)).map(path => path.slice(`${place.root}/`.length))

          return ran(0, `${tracked.sort().join('\n')}\n`)
        }

        const hits = e.argv.filter((part, at) => e.argv[at - 1] === '-e' && occurs.has(part))

        return hits.length === 0 ? ran(1) : ran(0, `${hits.flatMap(part => [part, part]).join('\r\n')}\r\n`)
      },
    },
  })
  const exists = world.files.has.bind(world.files)
  const reads = world.files.get.bind(world.files)
  Object.defineProperty(world.files, 'has', {
    value: (path: string) => {
      calls.push('fs.exists')

      return exists(path)
    },
  })
  Object.defineProperty(world.files, 'get', {
    value: (path: string) => {
      calls.push('fs.read')

      return reads(path)
    },
  })
  on('prompt.fill', (_$, e) => {
    if (box.answer === 'throw') throw new Error('the prompt box is gone')
    if (box.answer === 'refuse') return { isFilled: false }
    fills.push({ text: e.text, mode: e.mode })

    return { isFilled: true }
  })

  return { world, calls, runs, fills, occurs, place, git, box }
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const ended = ($: Engine, answer: string, extra: Record<string, unknown> = {}): Promise<unknown> =>
  $.turn.complete({ answer, durationMs: 4200, isAborted: false, turnId: 'turn-1', reason: 'answer', ...extra } as never)

const subcommands = (desk: Desk): (string | undefined)[] => desk.runs.map(({ argv }) => argv[2])

const drawn = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const card = await ui.find({ key: 'card' })
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const texts = (await ui.findAll({ type: 'Text' })).slice(3)
  const button = await ui.find({ type: 'Button' })
  await ui.unmount()
  if (card === undefined) return undefined

  const marks = texts.filter(row => row.props.color !== undefined)
  const rows = texts.filter(row => row.props.color === undefined)

  return {
    note,
    width: card.props.width,
    lines: rows.map(row => row.text),
    wraps: rows.map(row => row.props.wrap),
    dims: rows.map(row => row.props.dimColor),
    marks: marks.map(mark => ({ text: mark.text, color: mark.props.color })),
    button: button?.props.label,
  }
}

const press = async ($: Engine): Promise<void> => {
  const ui = await $.ui.mount(target(NAME, 'Pane'))
  await ui.press({ key: 'ask' })
  await ui.unmount()
}

test('A1: the empty card says what will be checked, with no note and no button, switched on or restored', PLUGINS, async ($, on) => {
  const desk = open(on, { store: { isOn: true } })
  await session($)
  await $.command.run(run('place', 'side'))

  const empty = { note: '', width: 40, lines: EMPTY, wraps: [undefined, undefined, undefined], dims: [true, true, true], marks: [], button: undefined }
  expect(await drawn($)).toEqual(empty)
  expect(desk.world.writes).toEqual([])

  expect(await cmd($, 'off')).toBe('Footnotes off.')
  expect(await cmd($, 'on')).toBe('Footnotes on; /widgets places it.')
  expect(await drawn($)).toEqual(empty)
  expect((await drawn($, 20))?.lines).toEqual(['No reply checked', 'yet.', 'File and symbol', 'names in', "Claude's replies", 'are checked', 'here.'])
})

test('A2: a reply whose path, cited line and call all hold costs one green row and no listing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const reply = 'The bug was in `src/sum.js`: the loop at `src/sum.js:3` skipped the first item, so `sum()` came out short.'
  expect(await ended($, reply)).toEqual({ text: reply })
  expect(await drawn($)).toEqual({
    note: '3/3 found',
    width: 40,
    lines: ['✓ 3 named, 3 found'],
    wraps: ['truncate-end'],
    dims: [undefined],
    marks: [GREEN],
    button: undefined,
  })
  expect(subcommands(desk)).toEqual(['grep'])
  expect(desk.world.writes).toEqual(['store isOn'])
})

test('A3: a line past the end is a red row, a symbol that occurs nowhere a yellow one, and the last line of a file is found', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  await ended($, A3_REPLY)
  expect(await drawn($)).toEqual({
    note: '0/2 found',
    width: 40,
    lines: ['✗ login.ts:88: file has 61 lines', '? refreshSession(): not in this repo'],
    wraps: ['truncate-end', 'truncate-end'],
    dims: [undefined, undefined],
    marks: [RED, YELLOW],
    button: 'Ask Claude to check these',
  })

  await ended($, 'The handler ends at `src/routes/login.ts:61` and `sum()` is exported from `src/sum.js:7`; the last note is `notes.txt:3`.')
  expect(await drawn($)).toMatchObject({ note: '4/4 found', lines: ['✓ 4 named, 4 found'], button: undefined })

  const reads = desk.calls.filter(call => call === 'fs.read').length
  await ended($, 'See `notes.txt:4`, `src/routes/login.ts:50-70`, `src/routes/login.ts:10-61`, `src/routes/login.ts:61:99` and `src/sum.js:8:1`.')
  expect(await drawn($)).toMatchObject({
    note: '2/5 found',
    lines: ['✗ notes.txt:4: file has 3 lines', '✗ login.ts:50-70: file has 61 lines', '✗ sum.js:8:1: file has 7 lines'],
    marks: [RED, RED, RED],
  })
  expect(desk.calls.filter(call => call === 'fs.read')).toHaveLength(reads + 3)

  desk.world.files.delete(`${ROOT}/src/index.ts`)
  desk.git.ls = ran(0, 'README.md\nsrc/index.ts\nsrc/sum.js\n')
  await ended($, 'The export is at `src/index.ts:400`.')
  expect(await drawn($)).toMatchObject({ note: '1/1 found', lines: ['✓ 1 named, 1 found'] })
})

test('A4: a path the listing lacks is a yellow proposal, a red row once a line is cited, and a bare file name is left out', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  await ended($, 'Move the loop to `src/retry.ts`, as `src/retry.ts:3` does on `Node.js`, and drop `gone.ts:9`.')
  expect(await drawn($)).toEqual({
    note: '0/3 found',
    width: 40,
    lines: ['? retry.ts: not on disk', '✗ retry.ts:3: not on disk', '✗ gone.ts:9: not on disk'],
    wraps: ['truncate-end', 'truncate-end', 'truncate-end'],
    dims: [undefined, undefined, undefined],
    marks: [YELLOW, RED, RED],
    button: 'Ask Claude to check these',
  })
  expect(subcommands(desk)).toEqual(['ls-files'])
})

test('A5: a path resolves in the session folder, then at the repository root, then by a unique suffix in one listing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  await ended($, 'The loop is in `src/sum.js`.')
  expect(await drawn($)).toMatchObject({ note: '1/1 found' })

  desk.place.cwd = `${ROOT}/packages/api`
  await ended($, 'The server in `src/server.ts` imports the loop from `src/sum.js`.')
  expect(await drawn($)).toMatchObject({ note: '2/2 found', lines: ['✓ 2 named, 2 found'] })
  expect(desk.runs).toEqual([])

  desk.place.cwd = ROOT
  await ended($, 'The route is `routes/login.ts`; `login.ts:88` is past its end, `index.ts:4` could be either file and `../shared/x.ts:2` is outside.')
  expect(await drawn($)).toMatchObject({ note: '1/2 found', lines: ['✗ login.ts:88: file has 61 lines'], marks: [RED] })
  expect(await cmd($, 'show')).toBe('2 named, 1 found:\n✓ routes/login.ts\n✗ login.ts:88: file has 61 lines')
  expect(desk.runs).toEqual([{ argv: LS_FILES, init: GIT }])

  await ended($, 'Windows spells it `src\\sum.js` and a shell `./src/sum.js`.')
  expect(await cmd($, 'show')).toBe('2 named, 2 found:\n✓ src\\sum.js\n✓ ./src/sum.js')
  expect(desk.runs).toHaveLength(1)
})

test('A6: fenced code, commands, URLs, folders and branch names are not references; repeats count once and 20 is the most', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  await ended(
    $,
    [
      'Run this first:',
      '```sh',
      'cat `src/sum.js:99` # refreshSession()',
      '```',
      'Then `npm`, `README`, `--force`, `git status`, `v1.2`, `https://a.dev/x.html`, `C:\\app\\x.ts`, `@scope/pkg/index.js`, `src/routes` and `origin/main` need no check.',
    ].join('\n'),
  )
  expect(await drawn($)).toMatchObject({ note: '', lines: [NOTHING], dims: [true], button: undefined })
  expect(desk.runs).toEqual([])
  expect(desk.calls.filter(call => call.startsWith('fs.'))).toEqual([])

  await ended($, 'The fix is in `src/sum.js`. Check `src/sum.js` with:\n  ```sh\nwc -l `src/sum.js:99`\nrefreshSession()')
  expect(await drawn($)).toMatchObject({ note: '1/1 found', lines: ['✓ 1 named, 1 found'] })

  for (let at = 1; at <= 20; at += 1) desk.world.files.set(`${ROOT}/src/gen/model${at}.ts`, 'export {}\n')
  await ended($, `Generated: ${Array.from({ length: 25 }, (_, at) => `\`src/gen/model${at + 1}.ts:1\``).join(', ')}.`)
  expect(await drawn($)).toMatchObject({ note: '20/20 found', lines: ['✓ 20 named, 20 found'] })
  expect(desk.runs).toEqual([])
})

test('A7: constants, members, calls and class names are searched once, each distinct part once, without this', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  await ended(
    $,
    '`MAX_RETRIES` caps the loop; `user.id` and `user.email` come from `getUser(id, true)` in `UserService`, and `this.refreshSession()` runs after. Neither `this` nor `ab()` matters.',
  )
  expect(desk.runs).toEqual([
    { argv: [...GREP, '-e', 'MAX_RETRIES', '-e', 'user', '-e', 'id', '-e', 'email', '-e', 'getUser', '-e', 'UserService', '-e', 'refreshSession'], init: GIT },
  ])
  expect(await drawn($)).toMatchObject({ note: '5/6 found', lines: ['? this.refreshSes…: not in this repo'], marks: [YELLOW] })
  expect(await cmd($, 'show')).toBe(
    '6 named, 5 found:\n✓ MAX_RETRIES\n✓ user.id\n✓ user.email\n✓ getUser(id, true)\n✓ UserService\n? this.refreshSession(): not found in this repository',
  )
})

test('A8: without a repository or with a failed search symbols are left out and the card says so; paths still resolve on disk', PLUGINS, async ($, on) => {
  const desk = open(on, { root: null })
  await start($)

  const reply = 'The loop in `src/sum.js` backs `sum()`; `src/nope.ts:3` and `nope.ts` would hold the retry.'
  await ended($, reply)
  expect(await drawn($)).toEqual({
    note: '1/1 found',
    width: 40,
    lines: ['✓ 1 named, 1 found', 'Symbols not checked: no repository'],
    wraps: ['truncate-end', 'truncate-end'],
    dims: [undefined, true],
    marks: [GREEN],
    button: undefined,
  })
  expect(desk.runs).toEqual([])

  await ended($, 'Only `sum()` changed.')
  expect(await drawn($)).toMatchObject({ note: '', lines: [NOTHING, 'Symbols not checked: no repository'], dims: [true, true] })
  expect(await drawn($, 20)).toMatchObject({ note: '', lines: ['Nothing to check', 'in the last', 'reply.', 'No symbol check'], dims: [true, true, true, true] })

  desk.place.root = ROOT
  for (const grep of [ran(2), ran(0, 'sum\n', true), 'reject'] as const) {
    desk.git.grep = grep
    await ended($, reply)
    expect(await drawn($)).toMatchObject({
      note: '1/2 found',
      lines: ['✗ nope.ts:3: not on disk', 'Symbols not checked: git failed'],
      button: 'Ask Claude to check these',
    })
  }

  await ended($, 'The loop is in `src/sum.js`.')
  expect(await drawn($)).toMatchObject({ note: '1/1 found', lines: ['✓ 1 named, 1 found'] })

  desk.git.grep = undefined
  for (const ls of [ran(128), ran(0, 'src/sum.js\n', true), 'reject'] as const) {
    desk.git.ls = ls
    expect(await ended($, reply)).toEqual({ text: reply })
    expect(await cmd($, 'show')).toBe('2 named, 2 found:\n✓ src/sum.js\n✓ sum()')
  }
})

test('A9: a subagent turn, an aborted one, a failed one and a blank answer leave the card alone; a reply naming nothing says so', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await ended($, A3_REPLY)
  const before = await drawn($)
  const calls = desk.calls.length
  const runs = desk.runs.length

  const reply = 'Everything is in `src/sum.js`.'
  expect(await ended($, reply, { agentId: 'agent-7' })).toEqual({ text: reply })
  await ended($, reply, { isAborted: true })
  await ended($, reply, { reason: 'error' })
  await ended($, '  \n\t ')
  expect(await drawn($)).toEqual(before)
  expect(desk.calls).toHaveLength(calls)
  expect(desk.runs).toHaveLength(runs)

  await ended($, 'Nothing changed; the tests already pass.')
  expect(await drawn($)).toEqual({ note: '', width: 40, lines: [NOTHING], wraps: [undefined], dims: [true], marks: [], button: undefined })
})

test('A10: the button appends a correction request naming every failure, and a refused fill changes nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await ended($, BUSY)

  await press($)
  expect(desk.fills).toEqual([{ text: [OPENING, ...EIGHT_FULL].join('\n'), mode: 'append' }])

  const before = await drawn($)
  const shown = await cmd($, 'show')
  for (const answer of ['throw', 'refuse'] as const) {
    desk.box.answer = answer
    await press($)
    expect(desk.fills).toHaveLength(1)
    expect(await drawn($)).toEqual(before)
    expect(await cmd($, 'show')).toBe(shown)
  }
})

test('A11: show lists the last check in full, tokens as written, and says when nothing was checked', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(await cmd($, 'show')).toBe(UNCHECKED)

  await ended($, 'Nothing changed; the tests already pass.')
  expect(await cmd($, 'show')).toBe(NOTHING)

  await ended($, A3_REPLY)
  expect(await cmd($, 'show')).toBe('2 named, 0 found:\n✗ src/routes/login.ts:88: file has 61 lines\n? refreshSession(): not found in this repository')

  desk.place.root = null
  await ended($, A3_REPLY)
  expect(await cmd($, 'show')).toBe('1 named, 0 found:\n✗ src/routes/login.ts:88: file has 61 lines\nSymbols not checked: no repository')

  await ended($, 'Only `refreshSession()` changed.')
  expect(await cmd($, 'show')).toBe(`${NOTHING}\nSymbols not checked: no repository`)
})

test('A12: clear forgets the last check, an unknown verb changes nothing and verbs ignore case', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await ended($, A3_REPLY)
  const before = await drawn($)

  expect(await cmd($, 'check')).toBe(USAGE)
  expect(await cmd($, 'show all')).toBe(USAGE)
  expect(await drawn($)).toEqual(before)
  expect(desk.world.store.get('isOn')).toBe(true)

  expect(await cmd($, '  SHOW ')).toBe('2 named, 0 found:\n✗ src/routes/login.ts:88: file has 61 lines\n? refreshSession(): not found in this repository')

  expect(await cmd($, 'Clear')).toBe('Footnotes cleared.')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY, button: undefined })
  expect(await cmd($, 'show')).toBe(UNCHECKED)
  expect(desk.world.writes).toEqual(['store isOn'])
})

test('A13: while off a reply full of references is passed on unread and show and clear leave the switch off', PLUGINS, async ($, on) => {
  const desk = open(on)
  await session($)
  await $.command.run(run('place', 'side'))

  expect(await ended($, BUSY)).toEqual({ text: BUSY })
  expect(desk.calls).toEqual([])
  expect(desk.runs).toEqual([])
  expect(desk.world.writes).toEqual([])

  expect(await cmd($, 'show')).toBe(OFF)
  expect(await cmd($, 'clear')).toBe(OFF)
  expect(await drawn($)).toBeUndefined()
  expect(desk.world.writes).toEqual([])

  expect(await cmd($, 'on')).toBe('Footnotes on; /widgets places it.')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
})

test('A14: off hides the card and stops the checking; on again shows the last check as it was', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await ended($, A3_REPLY)
  const before = await drawn($)
  expect(before).toMatchObject({ note: '0/2 found', button: 'Ask Claude to check these' })

  await cmd($, 'off')
  expect(await drawn($)).toBeUndefined()
  const calls = desk.calls.length
  await ended($, 'The loop is in `src/sum.js`.')
  expect(desk.calls).toHaveLength(calls)
  expect(desk.world.writes).toEqual(['store isOn', 'store isOn'])

  await cmd($, 'on')
  expect(await drawn($)).toEqual(before)
})

test('A15: 8 failures draw 5 one-line rows and a count of the rest, short under 40 columns and long from there, in every placement', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await ended($, BUSY)

  const short = {
    note: '12/20',
    lines: [...EIGHT_NAMES.slice(0, 5).map((name, at) => `${at < 2 ? '✗' : '?'} ${name}`), '+3 more'],
    wraps: Array.from({ length: 6 }, () => 'truncate-end'),
    dims: [undefined, undefined, undefined, undefined, undefined, true],
    marks: [RED, RED, YELLOW, YELLOW, YELLOW],
    button: 'Ask Claude',
  }
  expect(await drawn($, 20)).toEqual({ ...short, width: 20 })
  expect(await drawn($, 39)).toEqual({ ...short, width: 39 })

  const long = {
    ...short,
    note: '12/20 found',
    lines: ['✗ login.ts:88: file has 61 lines', '✗ sum.js:40-52: file has 7 lines', '? refreshSession(): not in this repo', '? retry.ts: not on disk', '? user_id: not in this repo', '+3 more'],
    button: 'Ask Claude to check these',
  }
  const forty = await drawn($, 40)
  expect(forty).toEqual({ ...long, width: 40 })
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    expect(await drawn($, 40, component)).toEqual(forty)
  }
  await $.command.run(run('place', 'side'))

  await ended($, 'The guard is `validateRefreshTokensAgainstSessionStore`, next to `sum()`.')
  expect(await drawn($, 40)).toMatchObject({ note: '1/2 found', lines: ['? validateRefresh…: not in this repo'] })
  for (const line of (await drawn($, 40))?.lines ?? []) expect(line.length).toBeLessThanOrEqual(36)

  desk.git.grep = ran(2)
  await ended($, BUSY)
  expect(await drawn($, 20)).toMatchObject({ note: '8/13', lines: ['✗ login.ts:88', '✗ sum.js:40-52', '? retry.ts', '✗ auth.md:12', '✗ gone.ts:9', 'No symbol check'], button: 'Ask Claude' })
  expect(await drawn($, 40)).toMatchObject({ note: '8/13 found', lines: [...long.lines.slice(0, 2), long.lines[3], '✗ auth.md:12: not on disk', '✗ gone.ts:9: not on disk', 'Symbols not checked: git failed'] })

  desk.git.grep = undefined
  await ended($, 'The loop is in `src/sum.js` and `sum()` calls it.')
  expect(await drawn($, 20)).toMatchObject({ note: '2/2', lines: ['✓ all found'], wraps: ['truncate-end'], marks: [GREEN], button: undefined })

  await ended($, BUSY)
  await $.command.run(run('widen', `${NAME} 60`))
  expect(await drawn($, 60)).toEqual({ ...long, width: 60 })
  await ended($, 'The guard is `validateRefreshTokensAgainstSessionStore`.')
  expect((await drawn($, 60))?.lines).toEqual(['? validateRefreshTokensAgainstSession…: not in this repo'])
})

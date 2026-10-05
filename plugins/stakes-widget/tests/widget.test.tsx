import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, ToolCheckResult } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type Reply = string | number | 'slow' | 'huge'
type Probe = { argv: readonly string[]; init?: { timeoutMs?: number } }
type Notice = { tool_use_id: string; text: string | undefined }
type Plan = { verdict?: ToolCheckResult; fail?: string }
type Desk = { world: Ground; git: Record<string, Reply>; probes: Probe[]; notices: Notice[] }
type Drawn = { note: string; lines: string[]; wraps: unknown[]; width: unknown }

const NAME = 'stakes-widget'
const USAGE = 'Usage: /stakes-widget [on|off|clear]'
const ASK: ToolCheckResult = { decision: 'ask', reason: 'This command needs approval', rule: 'Bash(git:*)', hook: 'PreToolUse' }
const EMPTY: Drawn['lines'] = ['No destructive command asked yet.', 'When Claude asks to run one, what a', 'yes would lose shows in the dialog.']
const MARKS = ['!', '·', '?']
const NOT_PLAIN = 'Could not measure: not a plain command'
const FORM = 'Could not measure: unrecognised form'
const NO_ANSWER = 'Could not measure: git could not answer'
const STATUS = 'status --porcelain'
const DIRTY = ' M src/sum.js\nM  src/app.js\n D docs/old.md\nMM README.md\n?? notes.txt\n?? tmp/\n'
const NUL = '\0'
const TOP = 'rev-parse --show-toplevel'
const BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
const NO_FILES = 'Could not measure: git sees no files there'
const NESTED = 'Could not measure: holds another repository'
const MOVED = '/w/repo/packages/a'

const BENEATH: Plugin = {
  name: 'stand-in-beneath',
  tier: 'append',
  register(on) {
    on('tool.check', async ($, e, next) => {
      const plan = (await $.store.get('plan')) as Plan | undefined
      await $.store.set('seen', [...(((await $.store.get('seen')) ?? []) as unknown[]), e])
      if (plan?.fail !== undefined) throw new Error(plan.fail)

      return plan?.verdict ?? next(e)
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, BENEATH] }

const files = (count: number): string => Array.from({ length: count }, (_, at) => `build/file-${at}.js${NUL}`).join('')

const staged = (count: number): string => Array.from({ length: count }, (_, at) => `100644 ${BLOB} 0\tbuild/file-${at}.js${NUL}`).join('')

const rm = (paths: string) => ({
  others: `ls-files -z --others -- ${paths}`,
  modified: `ls-files -z -m -- ${paths}`,
  tracked: `ls-files -z -s -- ${paths}`,
  match: `ls-files -z --cached --others --error-unmatch -- ${paths}`,
})

const lay = (desk: Desk, paths: string, others: Reply, modified: Reply, tracked: Reply, match: Reply = files(1)): void => {
  const keys = rm(paths)
  desk.git[keys.others] = others
  desk.git[keys.modified] = modified
  desk.git[keys.tracked] = tracked
  desk.git[keys.match] = match
}

const open = (on: On, git: Record<string, Reply> = {}, given: { store?: Record<string, unknown>; isRefused?: boolean } = {}): Desk => {
  const probes: Probe[] = []
  const notices: Notice[] = []
  const world = ground(on, {
    store: { plan: { verdict: ASK }, ...given.store },
    answers: {
      'process.run': (e: Probe) => {
        probes.push(e)
        const reply = git[e.argv.slice(2).join(' ')] ?? 1
        if (reply === 'slow') throw new Error('The command timed out after 1000 ms')

        return {
          exitCode: typeof reply === 'number' ? reply : 0,
          stdout: typeof reply === 'number' ? '' : reply === 'huge' ? files(50) : reply,
          stderr: typeof reply === 'number' ? 'fatal: not a git repository' : '',
          isStdoutTruncated: reply === 'huge',
          isStderrTruncated: false,
        }
      },
      'ui.notice': (e: Notice) => {
        notices.push(e)
        if (given.isRefused === true) throw new Error(`no open call ${e.tool_use_id}`)
      },
    },
  })

  return { world, git, probes, notices }
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const ask = ($: Engine, command: string, id = 'toolu_01'): Promise<ToolCheckResult> =>
  $.tool.check({ tool: 'Bash', input: { command, description: 'Run a command' }, tool_use_id: id })

const said = async ($: Engine, desk: Desk, command: string): Promise<string | undefined> => {
  const before = desk.notices.length
  await ask($, command)

  return desk.notices.length === before ? undefined : desk.notices.at(-1)?.text
}

const asked = (desk: Desk): string[] => desk.probes.map(probe => probe.argv.slice(2).join(' '))

const drawn = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const width = (await ui.find({ key: 'card' }))?.props.width
  const rows = (await ui.findAll({ type: 'Text' })).slice(3).filter(row => !MARKS.includes(row.text))
  await ui.unmount()

  return { note, width, lines: rows.map(row => row.text), wraps: rows.map(row => row.props.wrap) }
}

test('A1: the empty card says what will appear, before and after a harmless ask and after a restore', PLUGINS, async ($, on) => {
  const desk = open(on, {}, { store: { isOn: true } })
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))

  await session($)
  await $.command.run(run('place', 'side'))
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })

  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })

  await turn($)
  expect(await ask($, 'npm test')).toEqual(ASK)
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
  expect(desk.probes).toEqual([])
  expect(desk.notices).toEqual([])
})

test('A2: git reset --hard counts changed files and dropped commits', PLUGINS, async ($, on) => {
  const desk = open(on, {
    [STATUS]: DIRTY,
    'rev-list --count HEAD~3..HEAD': '3\n',
    'rev-list --count HEAD~3..HEAD --not --remotes': '2\n',
  })
  await start($)

  await ask($, 'git reset --hard HEAD~3', 'toolu_reset')
  expect(desk.notices).toEqual([{ tool_use_id: 'toolu_reset', text: 'Loses changes in 4 files and 3 commits (2 on no remote)' }])
  expect(await drawn($)).toMatchObject({
    note: 'loss',
    lines: ['git reset --hard HEAD~3', 'Loses changes in 4 files and 3', 'commits (2 on no remote)'],
  })

  desk.probes.length = 0
  expect(await said($, desk, 'git reset --hard')).toBe('Loses changes in 4 files')
  expect(asked(desk)).toEqual([STATUS])

  desk.git['rev-list --count HEAD~3..HEAD --not --remotes'] = '0\n'
  desk.git[STATUS] = '?? notes.txt\n'
  expect(await said($, desk, 'git reset --hard HEAD~3')).toBe('Loses 3 commits (all on a remote)')

  desk.git[STATUS] = ' M src/sum.js\n'
  desk.git['rev-list --count HEAD~3..HEAD'] = '0\n'
  expect(await said($, desk, 'git reset --hard HEAD~3')).toBe('Loses changes in 1 file')

  desk.git[STATUS] = '?? notes.txt\n'
  expect(await said($, desk, 'git reset --hard HEAD~3')).toBe('Nothing lost: no commits dropped and the tree is clean')
  expect((await drawn($)).note).toBe('safe')

  desk.probes.length = 0
  expect(await said($, desk, 'git reset --hard --quiet')).toBe(FORM)
  expect(await said($, desk, 'git reset HEAD~3 --hard')).toBe(FORM)
  expect(await said($, desk, 'git reset HEAD~1')).toBeUndefined()
  expect(await said($, desk, 'git reset --soft HEAD~1')).toBeUndefined()
  expect(desk.probes).toEqual([])
})

test('A3: git clean counts what a dry run would remove', PLUGINS, async ($, on) => {
  const removed = Array.from({ length: 9 }, (_, at) => `Would remove scratch-${at}.log\n`).join('')
  const desk = open(on, { 'clean -n -fdx': `${removed}Would skip repository vendor/lib\n`, 'clean -n -f -- build': '', 'clean -n -fd': removed })
  await start($)

  expect(await said($, desk, 'git clean -fdx')).toBe('Deletes 9 untracked paths, none recoverable')
  expect(asked(desk)).toEqual(['clean -n -fdx'])
  expect((await drawn($)).note).toBe('loss')

  expect(await said($, desk, 'git clean -f -- build')).toBe('Nothing lost: nothing to clean')
  expect((await drawn($)).note).toBe('safe')

  expect(await said($, desk, 'git clean -fd -q')).toBe('Deletes 9 untracked paths, none recoverable')
  expect(asked(desk).at(-1)).toBe('clean -n -fd')

  desk.probes.length = 0
  expect(await said($, desk, 'git clean -n')).toBeUndefined()
  expect(await said($, desk, 'git clean -d')).toBeUndefined()
  expect(await said($, desk, 'git clean -fdn')).toBeUndefined()
  expect(await said($, desk, 'git clean -f build')).toBe(FORM)
  expect(await said($, desk, 'git clean -f -e keep')).toBe(FORM)
  expect(desk.probes).toEqual([])
})

test('A4: git checkout and git restore count files with unstaged changes', PLUGINS, async ($, on) => {
  const changed = 'src/sum.js\nsrc/app.js\nsrc/lib/fold.js\na.js\n'
  const desk = open(on, { 'diff --name-only -- src a.js': changed, 'diff --name-only -- .': changed, 'diff --name-only -- src': '' })
  await start($)

  expect(await said($, desk, 'git checkout -- src a.js')).toBe('Loses unstaged changes in 4 files')
  expect(await said($, desk, 'git checkout .')).toBe('Loses unstaged changes in 4 files')
  expect(await said($, desk, 'git restore src')).toBe('Nothing lost: no unstaged changes there')
  expect(await said($, desk, 'git restore -- src')).toBe('Nothing lost: no unstaged changes there')
  expect(asked(desk)).toEqual(['diff --name-only -- src a.js', 'diff --name-only -- .', 'diff --name-only -- src', 'diff --name-only -- src'])

  desk.probes.length = 0
  expect(await said($, desk, 'git checkout main')).toBeUndefined()
  expect(await said($, desk, 'git checkout -b fix/sum')).toBeUndefined()
  expect(await said($, desk, 'git restore --staged src')).toBe(FORM)
  expect(await said($, desk, 'git checkout HEAD~1 -- src')).toBe(FORM)
  expect(await said($, desk, 'git restore')).toBe(FORM)
  expect(desk.probes).toEqual([])
})

test('A5: a forced push counts what it would overwrite as of the last fetch', PLUGINS, async ($, on) => {
  const desk = open(on, {
    'rev-parse --abbrev-ref @{upstream}': 'origin/main\n',
    'rev-list --count HEAD..origin/main': '2\n',
    'rev-list --count main..origin/main': '1\n',
  })
  await start($)

  for (const command of ['git push --force', 'git push -f', 'git push --force-with-lease']) {
    desk.probes.length = 0
    expect(await said($, desk, command)).toBe('Overwrites 2 commits on origin/main, as of last fetch')
    expect(asked(desk)).toEqual(['rev-parse --abbrev-ref @{upstream}', 'rev-list --count HEAD..origin/main'])
  }

  desk.probes.length = 0
  expect(await said($, desk, 'git push -f origin main')).toBe('Overwrites 1 commit on origin/main, as of last fetch')
  expect(asked(desk)).toEqual(['rev-list --count main..origin/main'])

  desk.git['rev-list --count HEAD..origin/main'] = '0\n'
  expect(await said($, desk, 'git push --force')).toBe('Nothing lost: origin/main has nothing new, as of last fetch')
  expect((await drawn($)).note).toBe('safe')

  desk.probes.length = 0
  desk.git['rev-parse --abbrev-ref @{upstream}'] = 128
  expect(await said($, desk, 'git push --force')).toBe(NO_ANSWER)
  expect(asked(desk)).toEqual(['rev-parse --abbrev-ref @{upstream}'])

  desk.probes.length = 0
  expect(await said($, desk, 'git push')).toBeUndefined()
  expect(await said($, desk, 'git push origin main')).toBeUndefined()
  expect(await said($, desk, 'git push -f origin')).toBe(FORM)
  expect(await said($, desk, 'git push origin +main')).toBe(FORM)
  expect(await said($, desk, 'git push -f --tags')).toBe(FORM)
  for (const branch of ['HEAD', '@', 'HEAD~1', 'main^', 'head']) expect(await said($, desk, `git push -f origin ${branch}`)).toBe(FORM)
  expect(desk.probes).toEqual([])
  expect(desk.notices.length).toBeGreaterThan(0)
})

test('A6: rm counts files not in git, unstaged changes and the total', PLUGINS, async ($, on) => {
  const desk = open(on)
  const both = rm('build tmp')
  lay(desk, 'build tmp', files(9), files(2), staged(203))
  await start($)

  expect(await said($, desk, 'rm -rf build tmp')).toBe('Loses 9 files not in git and unstaged changes in 2 files; deletes 212 in all')
  expect(asked(desk)).toEqual([both.others, both.modified, both.tracked, both.match])
  expect((await drawn($)).note).toBe('loss')

  lay(desk, 'build tmp', files(9), '', staged(203))
  expect(await said($, desk, 'rm -rf build tmp')).toBe('Loses 9 files not in git; deletes 212 in all')

  lay(desk, 'build tmp', '', files(2), staged(203))
  expect(await said($, desk, 'rm -r -f -- build tmp')).toBe('Loses unstaged changes in 2 files; deletes 203 in all')

  lay(desk, 'build tmp', '', '', staged(203))
  expect(await said($, desk, 'rm -rf build tmp')).toBe('Nothing lost: all 203 files are in git, unchanged')
  expect((await drawn($)).note).toBe('safe')

  lay(desk, 'build tmp', '', '', staged(1))
  expect(await said($, desk, 'rm -rf build tmp')).toBe('Nothing lost: the 1 file is in git, unchanged')

  lay(desk, 'build tmp', '', '', `100644 ${BLOB} 1\tbuild/a.js${NUL}100644 ${BLOB} 2\tbuild/a.js${NUL}100644 ${BLOB} 3\tbuild/a.js${NUL}`)
  expect(await said($, desk, 'rm -rf build tmp')).toBe('Nothing lost: the 1 file is in git, unchanged')

  lay(desk, 'SRC', '', '', '', 1)
  lay(desk, 'nested/extra.txt', '', '', '', 1)
  lay(desk, 'vendor/lib', '', '', '', 1)
  lay(desk, 'SRC build', files(3), '', staged(4), 1)
  for (const command of ['rm -rf SRC', 'rm -rf nested/extra.txt', 'rm -rf vendor/lib', 'rm -rf SRC build']) {
    expect(await said($, desk, command)).toBe(NO_FILES)
    expect((await drawn($)).note).toBe('unmeasured')
  }

  lay(desk, 'build', files(3), '', staged(4))
  expect(await said($, desk, 'rm build')).toBe('Loses 3 files not in git; deletes 7 in all')

  const outside = rm('outside')
  desk.probes.length = 0
  expect(await said($, desk, 'rm -rf /tmp/outside')).toBe(NO_ANSWER)
  expect(await said($, desk, 'rm -rf outside')).toBe(NO_ANSWER)
  expect(asked(desk)).toEqual([TOP, outside.others, outside.modified, outside.tracked, outside.match])

  for (const top of ['C:/Users/me/repo', '/home/me/repo']) {
    const lower = top.replace('/Users/', '/users/')
    const other = top.startsWith('C:') ? '/c/Users/me/repo' : top
    const below = rm(`${top}/build`)
    desk.git[TOP] = `${top}\n`
    for (const path of [top, `${top}/`, `${top}/.`, other, lower, `${top}-old/build`, `${top}/..`, `${top}/build/..`, '/tmp/outside', '/', '/c', 'C:', 'C:build']) {
      lay(desk, path, '', '', staged(203))
      desk.probes.length = 0
      expect(await said($, desk, `rm -rf ${path}`)).toBe(FORM)
      expect(asked(desk).filter(probe => probe !== TOP)).toEqual([])
    }
    lay(desk, `${top}/build`, files(3), '', staged(4))
    for (const path of [`${top}/build`, `${other}/build/`, `${lower}/./build`]) {
      desk.probes.length = 0
      expect(await said($, desk, `rm -rf ${path}`)).toBe('Loses 3 files not in git; deletes 7 in all')
      expect(asked(desk)).toEqual([TOP, below.others, below.modified, below.tracked, below.match])
    }
    expect(await said($, desk, `rm -rf build ${top}`)).toBe(FORM)
  }

  desk.git[TOP] = 'C:/w/repo\n'
  lay(desk, 'C:/w/repo/src', '', '', staged(4))
  desk.probes.length = 0
  expect(await said($, desk, 'rm -rf /c/w/repo/src')).toBe('Nothing lost: all 4 files are in git, unchanged')
  expect(asked(desk)).toEqual([TOP, ...Object.values(rm('C:/w/repo/src'))])
  expect(desk.probes.some(probe => probe.argv.some(word => word.includes('/c/')))).toBe(false)

  lay(desk, 'docs C:/w/repo/src/lib', files(2), '', staged(4))
  expect(await said($, desk, 'rm -rf docs /C/W/Repo/src/lib')).toBe('Loses 2 files not in git; deletes 6 in all')

  desk.git[TOP] = '\n'
  expect(await said($, desk, 'rm -rf /home/me/repo/build')).toBe(FORM)
  desk.git[TOP] = 'huge'
  expect(await said($, desk, 'rm -rf /home/me/repo/build')).toBe('Could not measure: too many files to count')
  desk.git[TOP] = 'slow'
  expect(await said($, desk, 'rm -rf /home/me/repo/build')).toBe('Could not measure: took too long')
  delete desk.git[TOP]

  desk.probes.length = 0
  expect(await said($, desk, 'rm -i x')).toBe(FORM)
  expect(await said($, desk, 'rm -rf')).toBe(FORM)
  for (const path of ['.git', './.git/', '.git/refs/heads', 'sub/.git', '.GIT', '.', './', '..', '../..', '/', 'src/..', './src/../', 'src/../lib', 'a/b/../../..']) {
    lay(desk, path, '', '', path.includes('git') ? '' : staged(203))
    expect(await said($, desk, `rm -rf ${path}`)).toBe(FORM)
  }
  expect(await said($, desk, 'rm -rf build .git')).toBe(FORM)
  expect(await said($, desk, 'rm -rf -- build .')).toBe(FORM)
  expect(desk.probes).toEqual([])
  expect(desk.notices.some(notice => notice.text?.startsWith('Nothing lost') === true && notice.text.includes('no files there'))).toBe(false)

  lay(desk, '.gitignore', '', '', `100644 ${BLOB} 0\t.gitignore${NUL}`)
  expect(await said($, desk, 'rm .gitignore')).toBe('Nothing lost: the 1 file is in git, unchanged')
})

test('A7: a command that is not plain is not measured and runs no probe', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  for (const command of ['rm -rf $OUT/*', 'cd build && rm -rf x', 'rm -rf "my dir"', 'rm -rf ~/x', 'sudo rm -rf x', 'git status | xargs rm', 'grep rm notes.txt']) {
    expect(await said($, desk, command)).toBe(NOT_PLAIN)
    expect((await drawn($)).note).toBe('unmeasured')
  }
  expect(await said($, desk, 'git rm notes.txt')).toBe(FORM)
  expect(await said($, desk, 'git -C sub reset --hard')).toBe(FORM)
  expect(await said($, desk, 'git -C "my dir" reset --hard')).toBe(NOT_PLAIN)
  expect(desk.probes).toEqual([])
})

test('A8: a probe that fails, hangs or overflows is never a clean bill', PLUGINS, async ($, on) => {
  const desk = open(on, { [STATUS]: '', 'rev-list --count main..HEAD': '0\n' })
  await start($)

  lay(desk, 'build', '', 128, staged(3))
  expect(await said($, desk, 'rm -rf build')).toBe(NO_ANSWER)

  lay(desk, 'build', '', '', staged(3), 128)
  expect(await said($, desk, 'rm -rf build')).toBe(NO_ANSWER)

  lay(desk, 'build', '', 'slow', staged(3))
  expect(await said($, desk, 'rm -rf build')).toBe('Could not measure: took too long')

  lay(desk, 'build', '', '', staged(3), 'slow')
  expect(await said($, desk, 'rm -rf build')).toBe('Could not measure: took too long')

  lay(desk, 'build', '', '', 'huge')
  expect(await said($, desk, 'rm -rf build')).toBe('Could not measure: too many files to count')

  lay(desk, 'build', '', '', staged(3), 'huge')
  expect(await said($, desk, 'rm -rf build')).toBe('Could not measure: too many files to count')

  lay(desk, 'build', 'huge', '', '', 1)
  expect(await said($, desk, 'rm -rf build')).toBe('Could not measure: too many files to count')

  lay(desk, 'build', '', 'slow', '', 1)
  expect(await said($, desk, 'rm -rf build')).toBe('Could not measure: took too long')

  lay(desk, 'nested', `nested/${NUL}`, '', '')
  expect(await said($, desk, 'rm -rf nested')).toBe(NESTED)

  lay(desk, 'build nested', `build/a.log${NUL}nested/${NUL}`, '', staged(3))
  expect(await said($, desk, 'rm -rf build nested')).toBe(NESTED)

  lay(desk, 'sm', '', '', `160000 ${BLOB} 0\tsm${NUL}`)
  expect(await said($, desk, 'rm -rf sm')).toBe(NESTED)

  lay(desk, 'nested gone', `nested/${NUL}`, '', '', 1)
  expect(await said($, desk, 'rm -rf nested gone')).toBe(NO_FILES)

  desk.git['rev-list --count main..HEAD --not --remotes'] = 'slow'
  expect(await said($, desk, 'git reset --hard main')).toBe('Could not measure: took too long')

  desk.git['rev-list --count main..HEAD --not --remotes'] = 'warning: refname is ambiguous\n'
  expect(await said($, desk, 'git reset --hard main')).toBe(NO_ANSWER)

  expect(await said($, desk, 'git clean -f')).toBe(NO_ANSWER)
  expect(await said($, desk, 'git checkout .')).toBe(NO_ANSWER)
  expect(desk.notices.some(notice => notice.text?.startsWith('Nothing lost') === true || notice.text?.startsWith('Loses') === true)).toBe(false)
  expect((await drawn($)).note).toBe('unmeasured')
})

test('A9: the check passes through untouched, whatever the measuring does', PLUGINS, async ($, on) => {
  const desk = open(on, { [STATUS]: DIRTY, 'clean -n -fdx': 'Would remove a.log\n', 'diff --name-only -- .': '', 'rev-parse --abbrev-ref @{upstream}': 'slow' }, { isRefused: true })
  await start($)

  const commands = ['git reset --hard', 'git clean -fdx', 'git checkout .', 'git push --force', 'rm -rf build tmp', 'rm -rf $OUT/*', 'rm -i x', 'git checkout main']
  for (const [at, command] of commands.entries()) {
    desk.world.store.delete('seen')
    expect(await ask($, command, `toolu_${at}`)).toEqual(ASK)
    expect(desk.world.store.get('seen')).toEqual([{ tool: 'Bash', input: { command, description: 'Run a command' }, tool_use_id: `toolu_${at}` }])
  }
  expect(desk.notices).toHaveLength(7)
  expect(await drawn($)).toMatchObject({ note: 'unmeasured', lines: ['rm -i x', FORM, '? rm -rf $OUT/*', '? rm -rf build tmp', '? git push --force', '· git checkout .'] })

  const before = { probes: desk.probes.length, notices: desk.notices.length, card: await drawn($) }
  desk.world.store.set('plan', { fail: 'the rules could not be read' })
  expect(await ask($, 'git reset --hard')).toEqual({ decision: 'allow' })
  expect(desk.probes).toHaveLength(before.probes)
  expect(desk.notices).toHaveLength(before.notices)
  expect(await drawn($)).toEqual(before.card)
})

test('A10: an allowed or denied call and a query are not measured', PLUGINS, async ($, on) => {
  const desk = open(on, { [STATUS]: DIRTY })
  await start($)

  for (const verdict of [{ decision: 'allow' }, { decision: 'deny', reason: 'Blocked by a rule', rule: 'Bash(git reset:*)' }] as const) {
    desk.world.store.set('plan', { verdict })
    expect(await ask($, 'git reset --hard')).toEqual(verdict)
  }
  desk.world.store.set('plan', { verdict: ASK })
  expect(await $.tool.check({ tool: 'Bash', input: { command: 'git reset --hard' } })).toEqual(ASK)
  expect(await $.tool.check({ tool: 'Bash', input: {}, tool_use_id: 'toolu_02' })).toEqual(ASK)

  expect(desk.probes).toEqual([])
  expect(desk.notices).toEqual([])
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
})

test('A11: every probe is a read-only git argv with a one second bound', PLUGINS, async ($, on) => {
  const desk = open(on, { 'rev-parse --abbrev-ref @{upstream}': 'origin/main\n' })
  on('classic.CwdChanged', async () => ({ stopReason: 'kept' }))
  await start($)

  for (const command of ['git reset --hard origin/main', 'git clean -fd -- build tmp', 'git checkout -- src a.js', 'git push --force', 'git push -f origin main', 'rm -rf build tmp/cache']) {
    await ask($, command)
  }
  expect(desk.probes.map(probe => probe.argv.slice(2))).toEqual([
    ['status', '--porcelain'],
    ['rev-list', '--count', 'origin/main..HEAD'],
    ['rev-list', '--count', 'origin/main..HEAD', '--not', '--remotes'],
    ['clean', '-n', '-fd', '--', 'build', 'tmp'],
    ['diff', '--name-only', '--', 'src', 'a.js'],
    ['rev-parse', '--abbrev-ref', '@{upstream}'],
    ['rev-list', '--count', 'HEAD..origin/main'],
    ['rev-list', '--count', 'main..origin/main'],
    ['ls-files', '-z', '--others', '--', 'build', 'tmp/cache'],
    ['ls-files', '-z', '-m', '--', 'build', 'tmp/cache'],
    ['ls-files', '-z', '-s', '--', 'build', 'tmp/cache'],
    ['ls-files', '-z', '--cached', '--others', '--error-unmatch', '--', 'build', 'tmp/cache'],
  ])
  for (const probe of desk.probes) {
    expect(probe.argv.slice(0, 2)).toEqual(['git', '--no-optional-locks'])
    expect(probe.init).toEqual({ timeoutMs: 1000 })
    expect(probe.argv.some(word => word === 'fetch' || word.includes(' '))).toBe(false)
  }

  const moves = async (): Promise<unknown[]> => {
    desk.probes.length = 0
    await ask($, 'rm -rf dist')
    await ask($, 'git checkout .')
    await ask($, 'rm -rf /w/repo/dist')
    expect(desk.probes).toHaveLength(6)

    return [...new Set(desk.probes.map(probe => JSON.stringify(probe.init)))].map(init => JSON.parse(init))
  }
  const move = { old_cwd: '/w/repo', new_cwd: MOVED }

  expect(await $.classic.CwdChanged(move)).toEqual({ stopReason: 'kept' })
  expect(await moves()).toEqual([{ timeoutMs: 1000, cwd: MOVED }])
  await $.command.run(run(NAME, 'clear'))
  expect(await moves()).toEqual([{ timeoutMs: 1000, cwd: MOVED }])

  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  expect(await moves()).toEqual([{ timeoutMs: 1000 }])

  await $.classic.CwdChanged(move)
  await $.command.run(run(NAME))
  expect(await $.classic.CwdChanged({ old_cwd: MOVED, new_cwd: '/w/repo/packages/b' })).toEqual({ stopReason: 'kept' })
  await $.command.run(run(NAME))
  expect(await moves()).toEqual([{ timeoutMs: 1000 }])

  const before = { probes: desk.probes.length, notices: desk.notices.length }
  desk.world.store.delete('seen')
  expect(await $.tool.check({ tool: 'PowerShell', input: { command: 'rm -rf x' }, tool_use_id: 'toolu_ps' })).toEqual(ASK)
  expect(desk.world.store.get('seen')).toHaveLength(1)
  expect(desk.probes).toHaveLength(before.probes)
  expect(desk.notices).toHaveLength(before.notices)
})

test('A12: the card keeps the latest verdict in full and four earlier rows', PLUGINS, async ($, on) => {
  const long = `rm -rf ${'deep/'.repeat(58)}end`
  const desk = open(on, { [STATUS]: DIRTY, 'diff --name-only -- .': '', 'clean -n -fdx': 'Would remove a.log\n' })
  await start($)

  expect(long).toHaveLength(300)
  for (const command of ['git clean -fdx', 'rm -rf $OUT/*', 'git checkout .', long, 'sudo rm -rf x', 'git reset --hard']) await ask($, command)

  const card = await drawn($)
  expect(card.note).toBe('loss')
  expect(card.lines).toEqual(['git reset --hard', 'Loses changes in 4 files', '? sudo rm -rf x', `? ${long.slice(0, 80)}`, '· git checkout .', '? rm -rf $OUT/*'])
  expect(card.wraps).toEqual(['truncate-end', undefined, 'truncate-end', 'truncate-end', 'truncate-end', 'truncate-end'])

  const ui = await $.ui.mount(target(NAME, 'Pane'))
  expect((await ui.findAll({ text: /^[!·?]$/ })).map(mark => [mark.text, mark.props.color, mark.props.dimColor])).toEqual([
    ['?', 'yellow', false],
    ['?', 'yellow', false],
    ['·', undefined, true],
    ['?', 'yellow', false],
  ])
  await ui.unmount()

  await ask($, 'git clean -fdx')
  const next = await drawn($)
  expect(next.lines.slice(-4)).toEqual(['! git reset --hard', '? sudo rm -rf x', `? ${long.slice(0, 80)}`, '· git checkout .'])
  expect(desk.notices).toHaveLength(7)
})

test('A13: clear empties the card, only while on, and an unknown verb changes nothing', PLUGINS, async ($, on) => {
  const desk = open(on, { [STATUS]: DIRTY })
  await start($)
  await ask($, 'git reset --hard')
  const card = await drawn($)

  expect((await $.command.run(run(NAME, 'sideways'))).text).toBe(USAGE)
  expect(desk.world.store.get('isOn')).toBe(true)
  expect(await drawn($)).toEqual(card)

  await $.command.run(run(NAME, 'off'))
  const before = desk.world.writes.length
  expect((await $.command.run(run(NAME, 'clear'))).text).toBe('Stakes is off.')
  expect(desk.world.writes).toHaveLength(before)
  expect(desk.world.store.get('isOn')).toBe(false)

  await $.command.run(run(NAME, 'on'))
  expect(await drawn($)).toEqual(card)
  expect((await $.command.run(run(NAME, 'clear'))).text).toBe('Stakes cleared.')
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
  expect(desk.world.store.get('isOn')).toBe(true)
})

test('A14: while off the check is handed straight on', PLUGINS, async ($, on) => {
  const desk = open(on, { [STATUS]: DIRTY })
  await session($)
  await $.command.run(run('place', 'side'))

  expect(await ask($, 'git reset --hard')).toEqual(ASK)
  expect(desk.world.store.get('seen')).toEqual([{ tool: 'Bash', input: { command: 'git reset --hard', description: 'Run a command' }, tool_use_id: 'toolu_01' }])
  expect(desk.probes).toEqual([])
  expect(desk.notices).toEqual([])
  expect(desk.world.writes.filter(write => write !== 'store seen')).toEqual([])

  await $.command.run(run(NAME, 'on'))
  expect(await drawn($)).toMatchObject({ note: '', lines: EMPTY })
})

test('A15: every state fits at 20, 40 and 60 columns and in every placement', PLUGINS, async ($, on) => {
  const desk = open(on, {
    [STATUS]: DIRTY,
    'rev-list --count HEAD~3..HEAD': '3\n',
    'rev-list --count HEAD~3..HEAD --not --remotes': '2\n',
    'diff --name-only -- .': '',
  })
  lay(desk, 'build tmp', files(9), '', staged(203))
  await start($)
  await $.command.run(run('widen', `${NAME} 60`))

  const fits = async (commands: number, note: string): Promise<void> => {
    for (const columns of [20, 40, 60]) {
      const card = await drawn($, columns)
      expect(card.width).toBe(columns)
      expect(card.note).toBe(columns === 20 && note === 'unmeasured' ? 'unmeasur…' : note)
      expect('Stakes'.length + card.note.length).toBeLessThan(columns - 4)
      for (const [at, line] of card.lines.entries()) {
        const isCommand = commands > 0 && (at === 0 || at > card.lines.length - commands)
        expect(card.wraps[at]).toBe(isCommand ? 'truncate-end' : undefined)
        if (!isCommand) expect(line.length).toBeLessThanOrEqual(columns - 4)
      }
    }
    for (const [place] of SITES) {
      await $.command.run(run('place', place))
      for (const [other, component] of SITES) {
        const ui = await $.ui.mount(target(NAME, component))
        expect((await ui.find({ key: 'card' })) !== undefined).toBe(other === place)
        await ui.unmount()
        if (other === place) expect(await drawn($, 40, component)).toEqual(await drawn($, 40, SITES.find(([site]) => site === place)?.[1]))
      }
    }
    await $.command.run(run('place', 'side'))
  }

  await fits(0, '')
  expect((await drawn($, 20)).lines).toEqual(['No destructive', 'command asked', 'yet.', 'When Claude asks', 'to run one, what', 'a yes would lose', 'shows in the', 'dialog.'])

  await ask($, 'git clean -fdx')
  await fits(1, 'unmeasured')
  expect((await drawn($, 20)).lines).toEqual(['git clean -fdx', 'Could not', 'measure: git', 'could not answer'])

  await ask($, 'git checkout .')
  await fits(2, 'safe')
  await ask($, 'rm -r build tmp')
  await ask($, 'git reset --hard HEAD~3')
  await ask($, 'git reset --hard HEAD~3')
  await fits(5, 'loss')
  expect((await drawn($, 20)).lines).toEqual([
    'git reset --hard HEAD~3',
    'Loses changes in',
    '4 files and 3',
    'commits (2 on no',
    'remote)',
    '! git reset --hard HEAD~3',
    '! rm -r build tmp',
    '· git checkout .',
    '? git clean -fdx',
  ])
  expect(desk.notices).toHaveLength(5)

  desk.git['rev-list --count feature/a-long-branch-name..origin/feature/a-long-branch-name'] = '2\n'
  await ask($, 'git push -f origin feature/a-long-branch-name')
  await fits(5, 'loss')
  expect((await drawn($, 20)).lines.slice(0, 7)).toEqual([
    'git push -f origin feature/a-long-branch-name',
    'Overwrites 2',
    'commits on',
    'origin/feature/a',
    '-long-branch-nam',
    'e, as of last',
    'fetch',
  ])
})

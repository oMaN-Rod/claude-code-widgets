import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { FsStat, On, UiCopyResult } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'
import type { LoupeFinding } from '../types'

type Component = (typeof SITES)[number][1]
type Selection = { text: string; requestId?: string }
type Run = { argv: string[]; init?: { cwd?: string; timeoutMs?: number } }
type Out = { exitCode?: number; stdout?: string; isStdoutTruncated?: boolean } | Error
type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
type Card = { note: string; head: string; rows: string[]; dim: string[]; red: string[]; button: string | undefined; lines: string[]; swatch: Drawn | undefined }
type Peeked = { seen: Selection; isBusy: boolean; finding: LoupeFinding } & Record<string, unknown>
type Desk = {
  world: Ground
  runs: Run[]
  stats: string[]
  copies: { text: string; surface?: string }[]
  calls: unknown[]
  at: {
    selection: Selection | 'reject' | undefined
    isRepo: boolean
    root: string
    cwd: string
    stats: Record<string, Partial<FsStat>>
    git: Record<string, (args: string[]) => Out>
    copy: UiCopyResult | Error
  }
}

const NAME = 'loupe-widget'
const USAGE = 'Usage: /loupe-widget [on|off|look [text]|copy]'
const OFF = 'Loupe is off.'
const REST = ['Select anything in the transcript', 'with the mouse and this card says', 'what it is: a commit, a path, a', 'symbol, a timestamp or a colour.']
const WINDOWED = ['Needs the fullscreen layout to see a', 'selection (/tui fullscreen).', '/loupe-widget look <text> works', 'anywhere.']
const UNSEEN = 'No selection can be seen outside the fullscreen layout. Try /loupe-widget look <text>.'
const ROOT = '/work/project'
const GIT = { cwd: ROOT, timeoutMs: 2000 }
const SHA = 'a3f9c1e7c0de4b5a6f7e8d9c8b7a01f2e3d4c5b6'
const COMMITTED = 1_759_612_800
const NOW = COMMITTED * 1000 + 51 * 3_600_000
const YEAR = 365.25 * 86_400
const SHOWN = `a3f9c1e\0Fix retry backoff\0Ada Lovelace\0${COMMITTED}\0\n`
const DEFINITION = 'hooks/lib.ts:4:export const fit = (wanted: number, columns: number): number => Math.min(wanted, Math.max(MIN_CARD, columns))'
const USERS = ['activity', 'aside', 'badges', 'board', 'changes', 'checks', 'clocks', 'commits', 'context', 'critic', 'diff']
const MENTIONS = [
  DEFINITION,
  ...USERS.flatMap((widget, at) => [
    `plugins/${widget}-widget/hooks/register.tsx:5:import { fit, plural } from './lib'`,
    `plugins/${widget}-widget/hooks/register.tsx:112:  const width = fit((await $.state.get(widths)).value?.['${widget}-widget'] ?? CARD_COLUMNS, columns)`,
    `plugins/${widget}-widget/hooks/register.tsx:118:  const inner = isOpen ? fit(60, columns) - 4 : width - 4`,
    ...(at < 3 ? [`plugins/${widget}-widget/hooks/register.tsx:140:    return held.isWide ? fit(WIDE_COLUMNS, columns) : width`] : []),
  ]),
]
const PROSE = ['README.md:31:Cards fit the pane they are placed in.', 'docs/layout.md:9:The widths fit between 20 and 60 columns.']
const DEEP = 'factory/floor/plugins/loupe-widget/tests/widget.test.tsx'
const LONG = 'factory/floor/plugins/loupe-widget/tests/fixtures/selection/widget.test.tsx'
const FILES = {
  [`${ROOT}/src/sum.js`]: 'export const sum = list => list.reduce((total, item) => total + item, 0)\n',
  [`${ROOT}/src`]: '',
  [`${ROOT}/dist/bundle.js`]: '',
  [`${ROOT}/packages/api/lib/money.js`]: '',
  [`${ROOT}/link.txt`]: '',
  [`${ROOT}/gone.txt`]: '',
  [`${ROOT}/old.txt`]: '',
  [`${ROOT}/--output=x`]: '',
  [`${ROOT}/${DEEP}`]: '',
  [`${ROOT}/${LONG}`]: '',
  '/etc/hosts': '',
}

const WATCH: Plugin = {
  name: 'stand-in-watch',
  tier: 'append',
  register(on) {
    on('ui.selection', async ($, e, next) => {
      await $.ui.toast('read selection')

      return next(e)
    })
    on('fs.exists', async ($, e, next) => {
      await $.ui.toast('fs call')

      return next(e)
    })
    on('fs.stat', async ($, e, next) => {
      await $.ui.toast('fs call')

      return next(e)
    })
    on('state.set', async ($, e, next) => {
      const set = e as { plugin?: string; key?: string }
      if (set.plugin === 'loupe-widget' && set.key === 'look') await $.ui.toast('wrote look')

      return next(e)
    })
    on('command.run', { command: 'peek' }, async ($, e) => ({
      text: JSON.stringify(
        e.args === 'calls'
          ? ((await $.state.get({ plugin: 'loupe-widget', key: 'calls' } as const)).value ?? {})
          : ((await $.state.get({ plugin: 'loupe-widget', key: 'look' } as const)).value ?? null),
      ),
    }))
  },
}

const SLOW: Plugin = {
  name: 'stand-in-slow-git',
  tier: 'append',
  register(on) {
    on('process.run', async ($, e, next) => {
      await new Promise<void>(done => {
        $.clock.after(1000, done)
      })

      return next(e)
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, WATCH], timeoutMs: 30_000 }
const SLOWED = { plugins: [LAYOUT, WATCH, SLOW], timeoutMs: 30_000 }

const flat = (path: string): string => path.replaceAll('\\', '/').replace(/^[a-z]:/i, '')

const pick = (text: string, requestId?: string): Selection => (requestId === undefined ? { text } : { text, requestId })

const grepped = (lines: readonly string[]): Out => ({ stdout: `${lines.join('\n')}\n` })

const open = (on: On, given: { store?: Record<string, unknown>; isBare?: boolean; isRepo?: boolean } = {}): Desk => {
  const desk: Desk = {
    world: undefined as never,
    runs: [],
    stats: [],
    copies: [],
    calls: [],
    at: {
      selection: undefined,
      isRepo: given.isRepo ?? true,
      root: ROOT,
      cwd: ROOT,
      stats: {
        [ROOT]: { kind: 'dir', realPath: ROOT },
        [`${ROOT}/src/sum.js`]: { size: 212, realPath: `${ROOT}/src/sum.js` },
      },
      git: {
        'rev-parse': args => (SHA.startsWith((args.at(-1) ?? '').replace('^{commit}', '').toLowerCase()) ? { stdout: `${SHA}\n` } : { exitCode: 1 }),
        show: () => ({ stdout: `${SHOWN}\n 3 files changed, 41 insertions(+), 7 deletions(-)\n` }),
        log: args => ({ stdout: args.at(-1) === 'src/sum.js' ? '3f2a1c9\0Fix the off-by-one in sum\n' : '' }),
        grep: args => (args.at(-1) === 'fit' ? grepped(MENTIONS) : { exitCode: 1 }),
      },
      copy: { isCopied: true },
    },
  }
  desk.world = ground(on, {
    now: NOW,
    store: given.store ?? {},
    files: FILES,
    answers: {
      ...(given.isBare
        ? {}
        : {
            'ui.selection': () => {
              if (desk.at.selection === 'reject') throw new Error('no selection on this surface')

              return desk.at.selection
            },
          }),
      'session.root': () => desk.at.root,
      'session.cwd': () => desk.at.cwd,
      'session.repo': () => (desk.at.isRepo ? { root: desk.at.root, remote: 'git@github.com:acme/project.git', internal: false, name: null } : null),
      'process.run': (e: Run) => {
        desk.runs.push(e)
        const args = e.argv.slice(2)
        const out = (desk.at.git[args[0] ?? ''] ?? (() => ({ exitCode: 1 })))(args)
        if (out instanceof Error) throw out

        return { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...out }
      },
      'fs.stat': (e: { path: string }) => {
        const path = flat(e.path)
        desk.stats.push(path)
        const stat = desk.at.stats[path]
        if (stat === undefined) throw new Error(`no such file: ${e.path}`)

        return { kind: 'file', size: 0, mtimeMs: 0, isLink: false, ...stat }
      },
      'ui.copy': (e: { text: string; surface?: string }) => {
        desk.copies.push(e)
        if (desk.at.copy instanceof Error) throw desk.at.copy

        return desk.at.copy
      },
    } as never,
  })
  on('tool.call', async (_$, e) => {
    desk.calls.push(e)

    return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' } as never
  })

  return desk
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string, isFullscreen = true): Promise<string | undefined> =>
  (await $.command.run({ ...run(NAME, args), presentation: { isFullscreen, columns: 160 } })).text

const peek = async ($: Engine, key: 'look' | 'calls'): Promise<Peeked> => JSON.parse((await $.command.run(run('peek', key))).text ?? 'null')

const tally = (desk: Desk, word: string): number => desk.world.toasts.filter(toast => toast === word).length

const args = (desk: Desk): string[][] => desk.runs.map(ran => ran.argv.slice(2))

const every = (node: unknown): Drawn[] => (typeof node === 'object' && node !== null ? [node as Drawn, ...((node as Drawn).children ?? []).flatMap(every)] : [])

const shown = (node: unknown): string =>
  typeof node === 'string' || typeof node === 'number' ? String(node) : typeof node === 'object' && node !== null ? ((node as Drawn).children ?? []).map(shown).join('') : ''

const read = (tree: unknown): Card | undefined => {
  const nodes = every(tree)
  if (!nodes.some(node => node.props?.key === 'card')) return undefined

  const body = every(nodes.find(node => node.props?.key === 'body'))
  const texts = body.filter(node => node.type === 'Text' && node.props?.wrap === 'truncate-end')
  const button = body.find(node => node.type === 'Button')

  return {
    note: shown(nodes.find(node => node.props?.key === 'note')),
    head: shown(texts.find(node => node.props?.bold === true)),
    rows: texts.filter(node => node.props?.bold !== true && node.props?.dimColor !== true).map(shown),
    dim: texts.filter(node => node.props?.dimColor === true).map(shown),
    red: texts.filter(node => node.props?.color === 'red').map(shown),
    button: button === undefined ? undefined : String(button.props?.label),
    lines: body.filter(node => texts.includes(node) || node === button).map(node => (node === button ? String(node.props?.label) : shown(node))),
    swatch: every(body.find(node => node.props?.key === 'swatch'))[1],
  }
}

const card = async ($: Engine, columns = 40, component: Component = 'Pane', surface = 'terminal', isFullscreen: boolean | undefined = true): Promise<Card | undefined> => {
  const { viewport, ...rest } = target(NAME, component, columns, surface) as { viewport: object }
  const ui = await $.ui.mount((isFullscreen === undefined ? rest : { ...rest, viewport: { ...viewport, isFullscreen } }) as never)
  const seen = read(await ui.drawn())
  await ui.unmount()

  return seen
}

const faces = async ($: Engine): Promise<(Card | undefined)[]> => {
  const narrow = [await card($, 20), await card($, 40)]
  await $.command.run(run('widen', `${NAME} 60`))
  const wide = await card($, 90)
  await $.command.run(run('widen', `${NAME} 40`))

  return [...narrow, wide]
}

const select = async ($: Engine, desk: Desk, text: string, requestId?: string): Promise<Card | undefined> => {
  desk.at.selection = pick(text, requestId)
  await desk.world.clock.advance(300)

  return card($)
}

const clean = (desk: Desk): void => {
  expect([...desk.world.store.keys()].filter(key => key !== 'isOn')).toEqual([])
  expect(desk.world.writes.filter(write => write !== 'store isOn')).toEqual([])
}

test('A1: the rest card says what to select, names the look verb outside fullscreen, survives an unanswered selection and reads nothing when restored off', PLUGINS, async ($, on) => {
  const desk = open(on, { isBare: true })

  await session($)
  await $.command.run(run('place', 'side'))
  await desk.world.clock.advance(3000)
  expect(tally(desk, 'read selection')).toBe(0)
  expect(await card($)).toBeUndefined()

  await $.command.run(run(NAME, 'on'))
  expect(await card($)).toMatchObject({ note: '', head: '', rows: REST, dim: [], button: undefined })
  expect((await card($, 40, 'Pane', 'terminal', false))?.rows).toEqual(WINDOWED)
  expect((await card($, 40, 'Pane', 'terminal', undefined))?.rows).toEqual(REST)

  await desk.world.clock.advance(900)
  expect(tally(desk, 'read selection')).toBe(3)
  expect((await card($))?.rows).toEqual(REST)
  expect(await peek($, 'look')).toBeNull()
  expect(desk.world.toasts.filter(toast => toast !== 'read selection')).toEqual([])
  clean(desk)
})

test('A2: the selection is read every 300 ms, an unchanged one costs nothing, no read is made during a lookup and off stops the reads', SLOWED, async ($, on) => {
  const desk = open(on)

  await start($)
  desk.at.selection = pick('fit')
  await desk.world.clock.advance(300)
  expect(tally(desk, 'read selection')).toBe(1)
  expect(await card($)).toMatchObject({ note: '', head: 'fit', lines: ['fit', 'looking…'], dim: ['looking…'], button: undefined })
  expect((await card($, 20))?.lines).toEqual(['fit', 'looking…'])

  await desk.world.clock.advance(600)
  expect(tally(desk, 'read selection')).toBe(1)
  expect(desk.runs).toEqual([])

  await desk.world.clock.advance(400)
  expect(tally(desk, 'read selection')).toBe(1)
  expect(await card($)).toMatchObject({ note: 'symbol', head: 'fit', button: 'copy hooks/lib.ts:4' })

  const before = { runs: desk.runs.length, fs: tally(desk, 'fs call'), sets: tally(desk, 'wrote look') }
  await desk.world.clock.advance(900)
  expect(tally(desk, 'read selection')).toBe(4)
  expect({ runs: desk.runs.length, fs: tally(desk, 'fs call'), sets: tally(desk, 'wrote look') }).toEqual(before)

  desk.at.selection = pick('plural')
  await desk.world.clock.advance(300)
  expect((await card($))?.lines).toEqual(['plural', 'looking…'])
  await cmd($, 'off')
  await desk.world.clock.advance(3000)
  expect(tally(desk, 'read selection')).toBe(5)
  expect(await peek($, 'look')).toMatchObject({ isBusy: false, head: '', finding: null })
  clean(desk)
})

test('A3: a hash git verifies shows its subject, author, age and files, and one git refuses goes on to the later kinds', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(await select($, desk, 'a3f9c1e')).toMatchObject({
    note: 'commit',
    head: 'a3f9c1e',
    rows: ['Fix retry backoff', 'Ada Lovelace · 2d 3h ago · 3 files'],
    button: 'copy a3f9c1e7c0de4…c8b7a01f2e3d4c5b6',
  })
  expect(desk.runs).toEqual([
    { argv: ['git', '--no-optional-locks', 'rev-parse', '--verify', '--quiet', 'a3f9c1e^{commit}'], init: GIT },
    { argv: ['git', '--no-optional-locks', 'show', '--shortstat', '--format=%h%x00%s%x00%an%x00%ct%x00', SHA], init: GIT },
  ])
  expect((await peek($, 'look')).finding.copy).toBe(SHA)
  expect((await card($, 20))?.lines).toEqual(['a3f9c1e', 'Fix retry backo…', '2d 3h ago', 'copy'])

  desk.at.git.show = () => ({ stdout: SHOWN })
  expect((await select($, desk, SHA))?.rows).toEqual(['Fix retry backoff', 'Ada Lovelace · 2d 3h ago'])

  desk.at.git.show = () => ({ stdout: `${SHOWN.replace(String(COMMITTED), String(COMMITTED + 400_000))}\n 1 file changed, 2 insertions(+)\n` })
  expect((await select($, desk, 'A3F9C1E7C0'))?.rows).toEqual(['Fix retry backoff', 'Ada Lovelace · 0s ago · 1 file'])

  const refused = await select($, desk, 'deadbeef')
  expect(refused).toMatchObject({ note: 'symbol', head: 'deadbeef', rows: ['no mention in tracked files'] })
  expect(args(desk).slice(-2).map(ran => ran[0])).toEqual(['rev-parse', 'grep'])

  desk.at.git['rev-parse'] = () => ({ stdout: `${ROOT}/.git\n` })
  expect(await select($, desk, 'cafe1234')).toMatchObject({ note: 'symbol', head: 'cafe1234' })
  expect(args(desk).some(ran => ran[0] === 'show' && ran.at(-1) !== SHA)).toBe(false)
  clean(desk)
})

test('A4: a path under the root or the cwd shows its kind, size, age and last commit, and copies the path from the root', PLUGINS, async ($, on) => {
  const desk = open(on)
  const aged = (ms: number): number => desk.world.clock.now() + 300 - ms

  await start($)
  desk.at.stats[`${ROOT}/src/sum.js`] = { size: 212, mtimeMs: aged(242_000), realPath: `${ROOT}/src/sum.js` }
  expect(await select($, desk, 'src/sum.js:4')).toMatchObject({
    note: 'path',
    head: 'src/sum.js:4',
    rows: ['file · 212 B · changed 4m 02s ago', '3f2a1c9 Fix the off-by-one in sum'],
    button: 'copy src/sum.js',
  })
  expect(desk.runs).toEqual([{ argv: ['git', '--no-optional-locks', 'log', '-1', '--format=%h%x00%s', '--', 'src/sum.js'], init: GIT }])
  expect(desk.stats).toEqual([`${ROOT}/src/sum.js`])
  expect((await peek($, 'look')).finding.copy).toBe('src/sum.js')
  expect((await card($, 20))?.lines).toEqual(['src/sum.js:4', 'file · 212 B', '3f2a1c9 Fix the…', 'copy'])
  expect((await select($, desk, 'src\\sum.js:4:12'))?.button).toBe('copy src/sum.js')

  desk.at.cwd = `${ROOT}/packages/api`
  desk.at.stats[`${ROOT}/packages/api/lib/money.js`] = { size: 4100, mtimeMs: aged(3 * 3_600_000), realPath: `${ROOT}/packages/api/lib/money.js` }
  expect(await select($, desk, 'lib/money.js')).toMatchObject({ rows: ['file · 4.1 kB · changed 3h 00m ago'], button: 'copy packages/api/lib/money.js' })
  expect(args(desk).at(-1)).toEqual(['log', '-1', '--format=%h%x00%s', '--', 'packages/api/lib/money.js'])
  desk.at.cwd = ROOT

  desk.at.stats[`${ROOT}/src/sum.js`] = { size: 212, mtimeMs: aged(242_000), realPath: `${ROOT}/src/sum.js` }
  expect(await select($, desk, `${ROOT}/src/sum.js:4`)).toMatchObject({ note: 'path', rows: ['file · 212 B · changed 4m 02s ago', '3f2a1c9 Fix the off-by-one in sum'], button: 'copy src/sum.js' })

  desk.at.stats[`${ROOT}/src`] = { kind: 'dir', size: 4096, mtimeMs: aged(90_000), realPath: `${ROOT}/src` }
  expect(await select($, desk, 'src/')).toMatchObject({ head: 'src/', rows: ['dir · changed 1m 30s ago'], button: 'copy src' })
  expect((await card($, 20))?.lines).toEqual(['src/', 'dir', 'copy'])

  desk.at.stats[`${ROOT}/dist/bundle.js`] = { size: 3_000_000, mtimeMs: 0, realPath: `${ROOT}/dist/bundle.js` }
  expect(await select($, desk, 'dist/bundle.js')).toMatchObject({ rows: ['file · 3.0 MB'], button: 'copy dist/bundle.js' })

  desk.at.stats[`${ROOT}/src/sum.js`] = { size: 212, mtimeMs: aged(-60_000), realPath: `${ROOT}/src/sum.js` }
  expect((await select($, desk, './src/sum.js'))?.rows).toEqual(['file · 212 B · changed 0s ago', '3f2a1c9 Fix the off-by-one in sum'])
  clean(desk)
})

test('A5: a path that lands outside the root says only that, a missing path says missing, and a bare word is not a path', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  desk.at.stats[`${ROOT}/link.txt`] = { size: 220, mtimeMs: NOW, isLink: true, realPath: '/etc/hosts' }
  expect(await select($, desk, 'link.txt')).toMatchObject({ note: 'path', head: 'link.txt', lines: ['link.txt', 'exists, outside the session root'], button: undefined })
  expect((await card($, 20))?.lines).toEqual(['link.txt', 'exists, outside'])
  expect((await peek($, 'look')).finding.copy).toBe('')

  desk.at.stats[`${ROOT}/old.txt`] = { size: 220, mtimeMs: NOW, isLink: true, realPath: '/work/project-old/notes.txt' }
  expect((await select($, desk, 'old.txt'))?.lines).toEqual(['old.txt', 'exists, outside the session root'])

  desk.at.stats[`${ROOT}/gone.txt`] = { kind: 'other', isLink: true }
  expect((await select($, desk, 'gone.txt'))?.lines).toEqual(['gone.txt', 'exists, outside the session root'])
  expect(desk.runs).toEqual([])

  desk.at.stats[ROOT] = { kind: 'dir', realPath: '/private/work/project' }
  desk.at.stats[`${ROOT}/src/sum.js`] = { size: 212, mtimeMs: 0, realPath: '/private/work/project/src/sum.js' }
  expect(await select($, desk, 'src/sum.js')).toMatchObject({ rows: ['file · 212 B', '3f2a1c9 Fix the off-by-one in sum'], button: 'copy src/sum.js' })

  expect(await select($, desk, 'no/such/file.ts')).toMatchObject({ note: 'path', lines: ['no/such/file.ts', 'missing'], button: undefined })

  desk.at.stats['/etc/hosts'] = { size: 220, mtimeMs: NOW, realPath: '/etc/hosts' }
  expect((await select($, desk, '/etc/hosts'))?.lines).toEqual(['/etc/hosts', 'exists, outside the session root'])
  const probed = { fs: tally(desk, 'fs call'), runs: desk.runs.length }
  for (const share of ['\\\\build-01\\drop\\out.log', '//build-01/drop/out.log', '\\\\?\\UNC\\build-01\\drop\\out.log:12']) {
    expect(await select($, desk, share)).toMatchObject({ note: 'path', lines: [share, 'missing'], button: undefined })
  }
  expect({ fs: tally(desk, 'fs call'), runs: desk.runs.length }).toEqual(probed)
  expect(await select($, desk, 'nosuchword')).toMatchObject({ note: 'symbol', rows: ['no mention in tracked files'] })
  clean(desk)
})

test('A6: a name shows its first definition, that line and its mentions, and a short or dotted word is text', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(await select($, desk, 'fit', 'row-1')).toMatchObject({
    note: 'symbol',
    head: 'fit',
    rows: ['hooks/lib.ts:4', 'export const fit = (wanted: number,…', '37 mentions in 12 files'],
    button: 'copy hooks/lib.ts:4',
  })
  expect(desk.runs).toEqual([{ argv: ['git', '--no-optional-locks', 'grep', '-n', '-I', '-w', '-F', '-e', 'fit'], init: GIT }])
  expect((await card($, 20))?.lines).toEqual(['fit', 'hooks/lib.ts:4', 'export const fi…', '37× in 12 files', 'copy'])

  desk.at.git.grep = () => grepped([...MENTIONS, 'scripts/layout.py:12:def fit(wanted, columns):', 'site/fit.js:1:function* fit(wanted, columns) {'])
  expect((await select($, desk, 'fit', 'row-2'))?.rows).toEqual(['hooks/lib.ts:4 (+2)', 'export const fit = (wanted: number,…', '39 mentions in 14 files'])

  desk.at.git.grep = () => grepped([DEFINITION, 'hooks/lib.test.ts:9:const fitted = fit(60, 28)'])
  expect((await select($, desk, 'fit', 'row-3'))?.rows[0]).toBe('hooks/lib.ts:4')

  desk.at.git.grep = () => grepped(PROSE)
  expect(await select($, desk, 'fit', 'row-4')).toMatchObject({ rows: ['no definition found', '2 mentions in 2 files'], button: 'copy fit' })
  expect((await card($, 20))?.lines).toEqual(['fit', 'no definition', '2× in 2 files', 'copy'])

  desk.at.git.grep = () => grepped([PROSE[0] ?? ''])
  expect((await select($, desk, 'fit', 'row-5'))?.rows).toEqual(['no definition found', '1 mention in 1 file'])
  expect((await card($, 20))?.rows).toEqual(['no definition', '1× in 1 file'])

  desk.at.git.grep = () => ({ exitCode: 1 })
  expect(await select($, desk, 'fit', 'row-6')).toMatchObject({ rows: ['no mention in tracked files'], button: 'copy fit' })
  expect((await peek($, 'look')).finding.copy).toBe('fit')

  desk.at.git.grep = () => ({ stdout: `${MENTIONS.join('\n')}\nplugins/diff-widget/hooks/regis`, isStdoutTruncated: true })
  expect((await select($, desk, 'fit', 'row-7'))?.rows).toEqual(['hooks/lib.ts:4', 'export const fit = (wanted: number,…', 'many mentions'])

  desk.at.git.grep = () => grepped([`dist/bundle.min.js:1:var a=1;function fit(n,t){return Math.min(n,Math.max(20,t))}${';a+=fit(a,40)'.repeat(4000)}`])
  expect((await select($, desk, 'fit', 'row-8'))?.rows[0]).toBe('dist/bundle.min.js:1')
  expect((await peek($, 'look')).finding.rows[1]).toHaveLength(200)

  const ran = desk.runs.length
  expect(await select($, desk, 'ab')).toMatchObject({ note: 'text', head: 'ab', rows: ['2 characters, 1 line'], button: undefined })
  expect(await select($, desk, 'a.b')).toMatchObject({ note: 'text', head: 'a.b', rows: ['3 characters, 1 line'] })
  expect(desk.runs).toHaveLength(ran)
  clean(desk)
})

test('A7: a timestamp in seconds or milliseconds shows its UTC date and how long ago or ahead, inside the range only', PLUGINS, async ($, on) => {
  const desk = open(on, { isRepo: false })

  await start($)
  expect(await cmd($, `look ${NOW / 1000}`)).toBe(`${NOW / 1000}: time · 2025-10-07 00:20:00 UTC · 0s ago`)

  const seconds = await select($, desk, String(COMMITTED))
  expect(seconds).toMatchObject({ note: 'time', head: '1759612800', rows: ['2025-10-04 21:20:00 UTC', '2d 3h ago'], button: 'copy 2025-10-04T21:20:00Z' })
  expect((await card($, 20))?.lines).toEqual(['1759612800', '2025-10-04 21:20', '2d 3h ago', 'copy'])
  expect(await select($, desk, `${COMMITTED}000`)).toMatchObject({ note: 'time', head: '1759612800000', rows: ['2025-10-04 21:20:00 UTC', '2d 3h ago'], button: 'copy 2025-10-04T21:20:00Z' })

  expect((await select($, desk, String(NOW / 1000 + 5400)))?.rows).toEqual(['2025-10-07 01:50:00 UTC', 'in 1h 29m'])
  expect((await select($, desk, String(Math.floor(NOW / 1000 + 9 * YEAR))))?.note).toBe('time')

  for (const text of ['0999999999', '0999999999999', String(Math.floor(NOW / 1000 + 11 * YEAR)), `${Math.floor(NOW / 1000 + 11 * YEAR)}000`]) {
    expect(await select($, desk, text)).toMatchObject({ note: 'text', head: text, button: undefined })
  }
  expect(desk.runs).toEqual([])
  clean(desk)
})

test('A8: a colour shows a swatch as wide as the card, its rgb form and a button that copies it, on the terminal and the desktop', PLUGINS, async ($, on) => {
  const desk = open(on, { isRepo: false })

  await start($)
  const wide = await select($, desk, '#FF8800')
  expect(wide).toMatchObject({ note: 'colour', head: '#FF8800', rows: ['rgb(255, 136, 0)'], button: 'copy rgb(255, 136, 0)' })
  expect(wide?.swatch).toMatchObject({ type: 'Raster', props: { key: 'loupe-swatch', columns: 36, rows: 1 } })
  expect(await peek($, 'look')).toMatchObject({ finding: { colour: 0xff8800, copy: 'rgb(255, 136, 0)' } })

  const tight = await card($, 20)
  expect(tight?.lines).toEqual(['#FF8800', '255 136 0', 'copy'])
  expect(tight?.swatch?.props).toMatchObject({ columns: 16, rows: 1 })

  for (const columns of [20, 40]) {
    const desktop = await card($, columns, 'Pane', 'desktop')
    expect(desktop?.lines).toEqual(['#FF8800', columns === 20 ? '255 136 0' : 'rgb(255, 136, 0)', columns === 20 ? 'copy' : 'copy rgb(255, 136, 0)'])
    expect(desktop?.swatch?.type).toBe('Text')
  }
  expect(desk.runs).toEqual([])
  expect(tally(desk, 'fs call')).toBe(0)
  clean(desk)
})

test('A9: several lines, a very long line and bare punctuation are counted as text with no lookup, and wrapping marks are stripped', PLUGINS, async ($, on) => {
  const desk = open(on, { isRepo: false })
  const token = 'sha512-Zm9vYmFyYmF6cXV4'.repeat(9).slice(0, 201)

  await start($)
  expect(await select($, desk, 'AssertionError: 5 !== 6\n  1 failing')).toMatchObject({
    note: 'text',
    head: 'AssertionError: 5 !== 6 1 failing',
    rows: ['34 characters, 2 lines'],
    button: undefined,
  })
  expect((await card($, 20))?.lines).toEqual(['Assertio…failing', '34 in 2 lines'])

  const long = await select($, desk, token)
  expect(long).toMatchObject({ note: 'text', rows: ['201 characters, 1 line'], button: undefined })
  expect(long?.head).toBe(`${token.slice(0, 18)}…${token.slice(-17)}`)
  expect(await select($, desk, '!!!')).toMatchObject({ note: 'text', head: '!!!', rows: ['3 characters, 1 line'], button: undefined })
  expect(desk.runs).toEqual([])
  expect(tally(desk, 'fs call')).toBe(0)
  expect(await cmd($, 'copy')).toBe('Nothing to copy.')

  desk.at.selection = pick(' \n\t ')
  await desk.world.clock.advance(300)
  expect(await card($)).toMatchObject({ note: '', rows: REST })
  expect(await cmd($, 'look')).toBe('Nothing is selected.')

  expect(await select($, desk, ' `fit()`, ')).toMatchObject({ note: 'symbol', head: 'fit', rows: ['not a git repository'] })
  clean(desk)
})

test('A10: a selection in a recorded tool row names the tool and its age, only the newest 200 calls are kept and every call passes through', PLUGINS, async ($, on) => {
  const desk = open(on, { isRepo: false })
  const query = { tool: 'mcp__db__run_query_now', tool_use_id: 'toolu_01Hq', sql: 'select count(*) from orders' }

  await start($)
  await turn($)
  expect(desk.calls).toEqual([
    { tool: 'Bash', tool_use_id: 'turn-1-a', command: 'npm test' },
    { tool: 'Edit', tool_use_id: 'turn-1-b', file_path: '/work/project/src/sum.js', old_string: 'a', new_string: 'b' },
  ])

  await desk.world.clock.advance(11_700)
  expect(await select($, desk, '#FF8800', 'turn-1-a')).toMatchObject({ dim: ['from Bash, 12s ago'], lines: ['#FF8800', 'rgb(255, 136, 0)', 'from Bash, 12s ago', 'copy rgb(255, 136, 0)'] })
  expect((await card($, 20))?.dim).toEqual(['from Bash'])
  expect(await cmd($, 'look')).toBe('#FF8800: colour · rgb(255, 136, 0) · from Bash, 12s ago')

  await $.tool.call(query as never)
  expect(desk.calls.at(-1)).toEqual(query)
  expect((await select($, desk, '#FF8800', 'toolu_01Hq'))?.dim).toEqual(['from run_query_, 0s ago'])
  expect((await select($, desk, '#FF8800'))?.dim).toEqual([])
  expect((await select($, desk, '#FF8800', 'toolu_unknown'))?.dim).toEqual([])
  expect((await select($, desk, '#FF8800', 'constructor'))?.dim).toEqual([])

  for (let at = 0; at < 200; at += 1) await $.tool.call({ tool: 'Read', tool_use_id: `toolu_read_${at}`, file_path: `${ROOT}/src/sum.js` } as never)
  const kept = Object.keys(await peek($, 'calls'))
  expect(kept).toHaveLength(200)
  expect(kept.slice(0, 2)).toEqual(['toolu_read_0', 'toolu_read_1'])
  expect(kept.at(-1)).toBe('toolu_read_199')
  expect(desk.calls).toHaveLength(203)
  clean(desk)
})

test('A11: the card returns to rest when the selection goes, a typed finding stays until the next selection, and a late answer is dropped', SLOWED, async ($, on) => {
  const desk = open(on)

  await start($)
  expect((await select($, desk, 'retryBackoff'))?.lines).toEqual(['retryBackoff', 'looking…'])
  desk.at.selection = undefined
  await cmd($, 'off')
  await cmd($, 'on')
  expect(await cmd($, 'look #00ff00')).toBe('#00ff00: colour · rgb(0, 255, 0)')
  await desk.world.clock.advance(1500)
  expect(await card($)).toMatchObject({ note: 'colour', head: '#00ff00' })

  await select($, desk, 'fit')
  await desk.world.clock.advance(1200)
  expect(await card($)).toMatchObject({ note: 'symbol', head: 'fit' })

  desk.at.selection = undefined
  await desk.world.clock.advance(300)
  expect(await card($)).toMatchObject({ note: '', rows: REST, button: undefined })

  expect(await cmd($, 'look #FF8800')).toBe('#FF8800: colour · rgb(255, 136, 0)')
  await desk.world.clock.advance(900)
  expect(await card($)).toMatchObject({ note: 'colour', head: '#FF8800' })
  desk.at.selection = 'reject'
  await desk.world.clock.advance(600)
  expect(await card($)).toMatchObject({ note: 'colour', head: '#FF8800' })
  expect((await peek($, 'look')).finding.from).toBe('typed')

  await select($, desk, 'src/sum.js')
  await desk.world.clock.advance(1200)
  expect(await card($)).toMatchObject({ note: 'path', head: 'src/sum.js' })
  expect((await peek($, 'look')).finding.from).toBe('selection')
  desk.at.selection = 'reject'
  await desk.world.clock.advance(300)
  expect((await card($))?.rows).toEqual(REST)

  expect(await select($, desk, 'retryBackoff')).toMatchObject({ note: '', lines: ['retryBackoff', 'looking…'] })
  expect(await cmd($, 'look #00ff00')).toBe('#00ff00: colour · rgb(0, 255, 0)')
  expect(await card($)).toMatchObject({ note: 'colour', head: '#00ff00' })
  await desk.world.clock.advance(1500)
  expect(await card($)).toMatchObject({ note: 'colour', head: '#00ff00', rows: ['rgb(0, 255, 0)'] })
  expect(await peek($, 'look')).toMatchObject({ isBusy: false, seen: { text: 'retryBackoff', requestId: '' }, finding: { from: 'typed', kind: 'colour' } })
  expect(desk.world.toasts.filter(toast => !['read selection', 'fs call', 'wrote look'].includes(toast))).toEqual([])
  clean(desk)
})

test('A12: look takes a typed text in its own case or the selection, answers one line, and an unknown verb answers the usage', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  desk.at.git.grep = args => grepped(args.at(-1) === 'Fit' ? ['src/Fit.ts:3:export class Fit {', 'src/index.ts:1:import { Fit } from "./Fit"'] : MENTIONS)
  expect(await cmd($, 'look Fit')).toBe('Fit: symbol · src/Fit.ts:3 · export class Fit { · 2 mentions in 2 files')
  expect(args(desk).at(-1)).toEqual(['grep', '-n', '-I', '-w', '-F', '-e', 'Fit'])
  expect(await card($)).toMatchObject({ note: 'symbol', head: 'Fit', button: 'copy src/Fit.ts:3' })
  expect((await peek($, 'look')).finding.from).toBe('typed')
  expect(await cmd($, 'LOOK x')).toBe('x: text · 1 character, 1 line')
  expect(await cmd($, 'Look   #FF8800')).toBe('#FF8800: colour · rgb(255, 136, 0)')

  expect(await cmd($, 'look')).toBe('Nothing is selected.')
  expect(await cmd($, 'look', false)).toBe(UNSEEN)
  expect(await card($, 40, 'Pane', 'terminal', false)).toMatchObject({ note: 'colour', head: '#FF8800' })

  desk.at.selection = pick('fit', 'row-1')
  const answer = await cmd($, 'look')
  expect(answer).toBe(`fit: symbol · hooks/lib.ts:4 · ${DEFINITION.slice('hooks/lib.ts:4:'.length)} · 37 mentions in 12 files`)
  expect((await peek($, 'look')).seen).toEqual({ text: '', requestId: '' })
  const first = await card($)
  await desk.world.clock.advance(300)
  expect(await card($)).toEqual(first)
  expect(await peek($, 'look')).toMatchObject({ isBusy: false, seen: { text: 'fit', requestId: 'row-1' } })

  expect(await cmd($, `look ${'npm ERR! code ELIFECYCLE '.repeat(20)}`)).toBe('npm ERR! code ELIFECYCLE npm E…YCLE npm ERR! code ELIFECYCLE: text · 499 characters, 1 line')

  for (const typed of ['what', 'copy that', 'on now', 'looking']) expect(await cmd($, typed)).toBe(USAGE)
  expect(desk.world.store.get('isOn')).toBe(true)
  clean(desk)
})

test('A13: the button and the copy verb copy the finding and say so, or say why not', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(await cmd($, 'copy')).toBe('Nothing to copy.')
  await select($, desk, 'fit')
  const ui = await $.ui.mount(target(NAME, 'Pane'))
  await ui.press({ key: 'copy' })
  expect(desk.copies).toEqual([{ text: 'hooks/lib.ts:4', surface: 'terminal' }])
  expect(desk.world.toasts.at(-1)).toBe('Copied hooks/lib.ts:4')

  desk.at.copy = { isCopied: false, reason: 'no-clipboard' }
  await ui.press({ key: 'copy' })
  expect(desk.world.toasts.at(-1)).toBe('Could not copy: no-clipboard')
  await ui.unmount()

  expect(await cmd($, 'copy')).toBe('Could not copy: no-clipboard')
  desk.at.copy = new Error('the clipboard tool exited 1')
  expect(await cmd($, 'copy')).toMatch(/^Could not copy: \S/)
  desk.at.copy = { isCopied: true }
  expect(await cmd($, 'COPY')).toBe('Copied hooks/lib.ts:4.')
  expect(desk.copies.at(-1)?.text).toBe('hooks/lib.ts:4')

  desk.at.stats[`${ROOT}/${LONG}`] = { size: 900, mtimeMs: 0, realPath: `${ROOT}/${LONG}` }
  await select($, desk, LONG)
  expect(await cmd($, 'copy')).toBe(`Copied ${LONG.slice(0, 30)}…${LONG.slice(-29)}.`)
  expect(desk.copies.at(-1)?.text).toBe(LONG)
  await select($, desk, SHA)
  expect(await cmd($, 'copy')).toBe(`Copied ${SHA}.`)
  expect(desk.copies.at(-1)?.text).toBe(SHA)

  expect((await select($, desk, 'scratch'))?.lines).toEqual(['scratch', 'no mention in tracked files', 'copy scratch'])
  expect(await cmd($, 'copy')).toBe('Copied scratch.')
  expect(desk.copies.at(-1)?.text).toBe('scratch')

  await select($, desk, '!!!')
  expect(await cmd($, 'copy')).toBe('Nothing to copy.')
  clean(desk)
})

test('A14: a failed lookup says so in red and the next one works, no repository means no git call, and a leading dash never reaches git as an option', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  desk.at.git.grep = () => new Error('git timed out after 2000 ms')
  expect(await select($, desk, 'fit', 'turn-1-a')).toMatchObject({ note: 'text', head: 'fit', lines: ['fit', 'Lookup failed.'], red: ['Lookup failed.'], button: undefined })
  expect(await peek($, 'look')).toMatchObject({ isBusy: false, finding: { isFailed: true, kind: 'text', copy: '' } })
  expect(await cmd($, 'look fit')).toBe('fit: text · Lookup failed.')
  desk.at.git.grep = () => grepped(MENTIONS)
  expect(await select($, desk, 'fit', 'row-2')).toMatchObject({ note: 'symbol', red: [], button: 'copy hooks/lib.ts:4' })

  desk.at.stats[`${ROOT}/--output=x`] = { size: 12, mtimeMs: 0, realPath: `${ROOT}/--output=x` }
  expect(await select($, desk, '--output=x')).toMatchObject({ note: 'path', rows: ['file · 12 B'] })
  expect(await select($, desk, '-rf')).toMatchObject({ note: 'text', head: '-rf' })
  for (const ran of args(desk)) {
    const dashed = ran.findIndex((arg, at) => at > 0 && arg.startsWith('-') && !['-1', '-n', '-I', '-w', '-F', '-e', '--', '--verify', '--quiet', '--shortstat'].includes(arg) && !arg.startsWith('--format='))
    expect(dashed < 0 || ran[dashed - 1] === '--' || ran[dashed - 1] === '-e').toBe(true)
  }

  desk.at.isRepo = false
  const ran = desk.runs.length
  expect(await select($, desk, 'a3f9c1e')).toMatchObject({ note: 'symbol', head: 'a3f9c1e', rows: ['not a git repository'], button: 'copy a3f9c1e' })
  expect(await select($, desk, 'fit', 'row-3')).toMatchObject({ note: 'symbol', rows: ['not a git repository'], button: 'copy fit' })
  expect((await card($, 20))?.lines).toEqual(['fit', 'not a git repo', 'copy'])
  expect(await cmd($, 'copy')).toBe('Copied fit.')
  expect(await select($, desk, 'src/sum.js')).toMatchObject({ note: 'path', rows: ['file · 212 B'], button: 'copy src/sum.js' })
  expect((await select($, desk, String(COMMITTED)))?.note).toBe('time')
  expect((await select($, desk, '#FF8800'))?.note).toBe('colour')
  expect(desk.runs).toHaveLength(ran)
  clean(desk)
})

test('A15: every state fits 20, 40 and 60 columns, the best moment is the same in all placements, and off answers that it is off and records nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  const opened = { tool: 'Read', tool_use_id: 'toolu_01Read', file_path: `${ROOT}/hooks/lib.ts` }
  const fits = async (): Promise<(Card | undefined)[]> => {
    const drawn = await faces($)
    for (const [at, inner] of [16, 36, 56].entries()) {
      expect(drawn[at]?.lines.filter(line => [...line].length > inner)).toEqual([])
      expect([...(drawn[at]?.note ?? '')].length).toBeLessThanOrEqual(inner - 6)
    }

    return drawn
  }

  await session($)
  await $.command.run(run('place', 'side'))
  expect(await cmd($, 'look fit')).toBe(OFF)
  expect(await cmd($, 'look')).toBe(OFF)
  expect(await cmd($, 'copy')).toBe(OFF)
  await $.tool.call(opened as never)
  expect(await peek($, 'calls')).toEqual({})
  expect(await peek($, 'look')).toBeNull()
  expect(tally(desk, 'read selection') + tally(desk, 'fs call') + desk.runs.length + desk.copies.length).toBe(0)

  await $.command.run(run(NAME, 'on'))
  await fits()
  expect((await card($, 20, 'Pane', 'terminal', false))?.rows.filter(row => row.length > 16)).toEqual([])

  await $.tool.call(opened as never)
  await desk.world.clock.set(desk.world.clock.now() + 241_700)
  const [tight, wide, wider] = [await select($, desk, 'fit', 'toolu_01Read'), ...(await fits())].slice(1)
  expect(wide?.lines).toEqual(['fit', 'hooks/lib.ts:4', 'export const fit = (wanted: number,…', '37 mentions in 12 files', 'from Read, 4m 02s ago', 'copy hooks/lib.ts:4'])
  expect(wide?.note).toBe('symbol')
  expect(tight?.lines).toEqual(['fit', 'hooks/lib.ts:4', 'export const fi…', '37× in 12 files', 'from Read', 'copy'])
  expect(wider?.lines[2]).toBe('export const fit = (wanted: number, columns: number): n…')
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    expect(await card($, 40, component)).toEqual(wide)
  }
  await $.command.run(run('place', 'side'))

  desk.at.stats[`${ROOT}/${DEEP}`] = { size: 31_400, mtimeMs: NOW - 86_400_000, realPath: `${ROOT}/${DEEP}` }
  desk.at.git.log = () => ({ stdout: '4138f10\0Add the loupe widget and every acceptance test the spec lists for it\n' })
  await select($, desk, `${DEEP}:120:7`)
  const [, deep] = await fits()
  expect(deep?.head).toBe('factory/floor/plug…et.test.tsx:120:7')
  expect(deep?.button).toBe('copy factory/floor…s/widget.test.tsx')
  expect(deep?.rows).toEqual(['file · 31.4 kB · changed 1d 0h ago', '4138f10 Add the loupe widget and ev…'])

  desk.at.git.grep = () => grepped([`${DEEP}:88:const fits = async (): Promise<(Card | undefined)[]> => {`])
  await select($, desk, 'fits', 'toolu_01Read')
  const [, located] = await fits()
  expect(located?.rows[0]).toBe('factory/floor/plug…idget.test.tsx:88')

  for (const text of [SHA, '#FF8800', String(COMMITTED), 'link.txt', 'no/such/file.ts', 'AssertionError: 5 !== 6\n  1 failing', 'nosuchword']) {
    await select($, desk, text, 'toolu_01Read')
    await fits()
  }
  desk.at.git.grep = () => new Error('git timed out after 2000 ms')
  await select($, desk, 'fit', 'row-9')
  await fits()

  const { ticket } = await peek($, 'look')
  expect(await cmd($, 'off')).toBe('Loupe off.')
  expect(await peek($, 'look')).toEqual({ seen: { text: '', requestId: '' }, ticket, isBusy: false, head: '', finding: null })
  expect(await peek($, 'calls')).toEqual({})
  await $.tool.call(opened as never)
  expect(await peek($, 'calls')).toEqual({})
  expect(await cmd($, 'look fit')).toBe(OFF)
  expect(desk.world.store.get('isOn')).toBe(false)
  clean(desk)
})

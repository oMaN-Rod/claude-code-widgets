import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Entry = PluginState['stakes-widget']['log'][number]
type Found = Pick<Entry, 'line' | 'kind'>
type Fault = { reason: string }
type Ran = { exitCode: number; stdout: string }
type Words = { options: string[]; loose: string[]; named: string[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const USAGE = 'Usage: /stakes-widget [on|off|clear]'
const TITLE = 'Stakes'
const MAX_LOG = 5
const MAX_COMMAND = 80
const PROBE_MS = 1000
const CANDIDATE = /(^|[\s;&|(])(rm|git\s+(reset|clean|checkout|restore|push))(\s|$)/
const OPTIONED = /(^|[\s;&|(])git\s+-.*\s(reset|clean|checkout|restore|push)(\s|$)/
const PLAIN = /^[A-Za-z0-9 ._/@^~:=,+-]*$/
const ROOTED = /^(\/|[A-Za-z]:)/
const FORCES = ['-f', '--force', '--force-with-lease']
const NOT_PLAIN = 'not a plain command'
const FORM = 'unrecognised form'
const NO_ANSWER = 'git could not answer'
const NO_FILES = 'git sees no files there'
const NESTED = 'holds another repository'
const SUBMODULE = '160000 '
const MARKS = { loss: { mark: '!', color: 'red' }, safe: { mark: '·', color: undefined }, unmeasured: { mark: '?', color: 'yellow' } } as const
const EMPTY = ['No destructive command asked yet.', 'When Claude asks to run one, what a yes would lose shows in the dialog.']
const NONE: Entry[] = []
const NOWHERE = ''
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'stakes-widget', key: 'isOn' } as const, false)
const log = atom({ plugin: 'stakes-widget', key: 'log' } as const, NONE)
const cwd = atom({ plugin: 'stakes-widget', key: 'cwd' } as const, undefined as string | undefined)

const unmeasured = (reason: string): Found => ({ kind: 'unmeasured', line: `Could not measure: ${reason}` })

const safe = (what: string): Found => ({ kind: 'safe', line: `Nothing lost: ${what}` })

const loss = (line: string): Found => ({ kind: 'loss', line })

const listed = (text: string, separator: string): string[] => text.split(separator).filter(item => item !== '')

const chopped = (word: string, columns: number): string[] =>
  Array.from({ length: Math.ceil(word.length / columns) }, (_, at) => word.slice(at * columns, (at + 1) * columns))

const wrapped = (text: string, columns: number): string[] =>
  text
    .split(' ')
    .flatMap(word => chopped(word, columns))
    .reduce<string[]>((rows, word) => {
      const last = rows.at(-1)

      return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
    }, [])

const whole = (text: string): number | undefined => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined)

const sort = (rest: readonly string[]): Words => {
  const cut = rest.indexOf('--')
  const head = cut === -1 ? rest : rest.slice(0, cut)

  return {
    options: head.filter(word => word.startsWith('-')),
    loose: head.filter(word => !word.startsWith('-')),
    named: cut === -1 ? [] : rest.slice(cut + 1),
  }
}

const isForcing = (word: string): boolean => word.startsWith('--force') || word.startsWith('+') || /^-[A-Za-z]*f/.test(word)

const isMoving = (branch: string): boolean => /^(head|@)$/i.test(branch) || /[\^~]/.test(branch)

const pieces = (path: string): string[] =>
  path
    .replace(/^\/([A-Za-z])(?=\/|$)/, '$1:')
    .split('/')
    .filter(part => part !== '' && part !== '.')

const steps = (path: string): string[] => pieces(path.toLowerCase())

const holdsRepository = (path: string): boolean => {
  const parts = steps(path)

  return parts.length === 0 || parts.includes('..') || parts.includes('.git')
}

const isBelow = (path: string, top: string): boolean => {
  const parts = steps(path)
  const root = steps(top)

  return root.length > 0 && parts.length > root.length && root.every((part, at) => parts[at] === part)
}

const rebased = (path: string, top: string): string => [top.replace(/\/+$/, ''), ...pieces(path).slice(steps(top).length)].join('/')

const ran = async ($: EngineInterface, args: readonly string[]): Promise<Ran | Fault> => {
  const folder = await read($, cwd)

  try {
    const done = await $.process.run(['git', '--no-optional-locks', ...args], {
      timeoutMs: PROBE_MS,
      ...(folder === undefined || folder === NOWHERE ? {} : { cwd: folder }),
    })

    return done.isStdoutTruncated ? { reason: 'too many files to count' } : done
  } catch {
    return { reason: 'took too long' }
  }
}

const probe = async ($: EngineInterface, args: readonly string[]): Promise<string | Fault> => {
  const done = await ran($, args)
  if ('reason' in done) return done

  return done.exitCode === 0 ? done.stdout : { reason: NO_ANSWER }
}

const together = async ($: EngineInterface, asks: readonly (readonly string[])[]): Promise<string[] | Fault> => {
  const answers = await Promise.all(asks.map(args => probe($, args)))

  return answers.find((answer): answer is Fault => typeof answer !== 'string') ?? answers.filter(answer => typeof answer === 'string')
}

const reset = async ($: EngineInterface, rest: readonly string[]): Promise<Found | undefined> => {
  if (!rest.includes('--hard')) return undefined

  const ref = rest[1]
  if (rest[0] !== '--hard' || rest.length > 2 || ref?.startsWith('-') === true) return unmeasured(FORM)

  const answers = await together($, [
    ['status', '--porcelain'],
    ...(ref === undefined
      ? []
      : [
          ['rev-list', '--count', `${ref}..HEAD`],
          ['rev-list', '--count', `${ref}..HEAD`, '--not', '--remotes'],
        ]),
  ])
  if (!Array.isArray(answers)) return unmeasured(answers.reason)

  const files = listed(answers[0] ?? '', '\n').filter(row => !row.startsWith('??')).length
  const commits = ref === undefined ? 0 : whole(answers[1] ?? '')
  const stray = ref === undefined ? 0 : whole(answers[2] ?? '')
  if (commits === undefined || stray === undefined) return unmeasured(NO_ANSWER)
  if (files === 0 && commits === 0) return safe('no commits dropped and the tree is clean')

  return loss(
    `Loses ${[
      ...(files === 0 ? [] : [`changes in ${plural(files, 'file')}`]),
      ...(commits === 0 ? [] : [`${plural(commits, 'commit')} (${stray === 0 ? 'all on a remote' : `${stray} on no remote`})`]),
    ].join(' and ')}`,
  )
}

const clean = async ($: EngineInterface, rest: readonly string[]): Promise<Found | undefined> => {
  const { options, loose, named } = sort(rest)
  if (loose.length > 0 || options.some(word => !/^-[fdxXqn]+$/.test(word))) return unmeasured(FORM)

  const flags = options.join('')
  if (!flags.includes('f') || flags.includes('n')) return undefined

  const loud = options.map(word => word.replaceAll('q', '')).filter(word => word !== '-')
  const answers = await together($, [['clean', '-n', ...loud, ...(named.length === 0 ? [] : ['--', ...named])]])
  if (!Array.isArray(answers)) return unmeasured(answers.reason)

  const paths = listed(answers[0] ?? '', '\n').filter(row => row.startsWith('Would remove ')).length

  return paths === 0 ? safe('nothing to clean') : loss(`Deletes ${plural(paths, 'untracked path')}, none recoverable`)
}

const revert = async ($: EngineInterface, verb: string, rest: readonly string[]): Promise<Found | undefined> => {
  const { options, loose, named } = sort(rest)
  const isDot = verb === 'checkout' && rest.length === 1 && rest[0] === '.'
  if (verb === 'checkout' && !isDot && !rest.includes('--')) return undefined

  const paths = verb === 'checkout' && !isDot ? named : [...loose, ...named]
  if (options.length > 0 || paths.length === 0 || (verb === 'checkout' && !isDot && loose.length > 0)) return unmeasured(FORM)

  const answers = await together($, [['diff', '--name-only', '--', ...paths]])
  if (!Array.isArray(answers)) return unmeasured(answers.reason)

  const files = listed(answers[0] ?? '', '\n').length

  return files === 0 ? safe('no unstaged changes there') : loss(`Loses unstaged changes in ${plural(files, 'file')}`)
}

const push = async ($: EngineInterface, rest: readonly string[]): Promise<Found | undefined> => {
  if (!rest.some(isForcing)) return undefined

  const options = rest.filter(word => word.startsWith('-'))
  const [remote, branch, ...more] = rest.filter(word => !word.startsWith('-'))
  const isNamed =
    remote !== undefined &&
    branch !== undefined &&
    more.length === 0 &&
    !`${remote}${branch}`.includes('+') &&
    !`${remote}${branch}`.includes(':') &&
    !isMoving(branch)
  if (options.some(word => !FORCES.includes(word)) || (remote !== undefined && !isNamed)) return unmeasured(FORM)

  const upstream = isNamed ? [`${remote}/${branch}`] : await together($, [['rev-parse', '--abbrev-ref', '@{upstream}']])
  if (!Array.isArray(upstream)) return unmeasured(upstream.reason)

  const target = (upstream[0] ?? '').trim()
  if (target === '') return unmeasured(NO_ANSWER)

  const answers = await together($, [['rev-list', '--count', `${isNamed ? branch : 'HEAD'}..${target}`]])
  if (!Array.isArray(answers)) return unmeasured(answers.reason)

  const commits = whole(answers[0] ?? '')
  if (commits === undefined) return unmeasured(NO_ANSWER)

  return commits === 0
    ? safe(`${target} has nothing new, as of last fetch`)
    : loss(`Overwrites ${plural(commits, 'commit')} on ${target}, as of last fetch`)
}

const remove = async ($: EngineInterface, rest: readonly string[]): Promise<Found> => {
  const { options, loose, named } = sort(rest)
  const given = [...loose, ...named]
  if (given.length === 0 || given.some(holdsRepository) || options.some(word => !/^-[rRfv]+$/.test(word))) return unmeasured(FORM)

  const rooted = given.filter(path => ROOTED.test(path))
  const tops = rooted.length === 0 ? [] : await together($, [['rev-parse', '--show-toplevel']])
  if (!Array.isArray(tops)) return unmeasured(tops.reason)

  const top = (tops[0] ?? '').trim()
  if (rooted.some(path => !isBelow(path, top))) return unmeasured(FORM)

  const paths = given.map(path => (ROOTED.test(path) ? rebased(path, top) : path))
  const [answers, match] = await Promise.all([
    together($, [
      ['ls-files', '-z', '--others', '--', ...paths],
      ['ls-files', '-z', '-m', '--', ...paths],
      ['ls-files', '-z', '-s', '--', ...paths],
    ]),
    ran($, ['ls-files', '-z', '--cached', '--others', '--error-unmatch', '--', ...paths]),
  ])
  if (!Array.isArray(answers)) return unmeasured(answers.reason)
  if ('reason' in match) return unmeasured(match.reason)
  if (match.exitCode === 1) return unmeasured(NO_FILES)
  if (match.exitCode !== 0) return unmeasured(NO_ANSWER)

  const [others = [], modified = [], staged = []] = answers.map(answer => listed(answer, '\0'))
  if (others.some(path => path.endsWith('/')) || staged.some(row => row.startsWith(SUBMODULE))) return unmeasured(NESTED)

  const strays = others.length
  const changed = modified.length
  const tracked = new Set(staged.map(row => row.slice(row.indexOf('\t') + 1))).size
  if (strays === 0 && changed === 0) return safe(tracked === 1 ? 'the 1 file is in git, unchanged' : `all ${tracked} files are in git, unchanged`)

  return loss(
    `Loses ${[
      ...(strays === 0 ? [] : [`${plural(strays, 'file')} not in git`]),
      ...(changed === 0 ? [] : [`unstaged changes in ${plural(changed, 'file')}`]),
    ].join(' and ')}; deletes ${strays + tracked} in all`,
  )
}

const measure = async ($: EngineInterface, command: string): Promise<Found | undefined> => {
  if (!CANDIDATE.test(command) && !OPTIONED.test(command)) return undefined

  const [tool, verb = '', ...rest] = command.split(/ +/)
  const isPlain = PLAIN.test(command) && !command.split(/ +/).some(word => word.startsWith('~'))
  if (!isPlain || (tool !== 'git' && tool !== 'rm')) return unmeasured(NOT_PLAIN)
  if (tool === 'rm') return remove($, verb === '' ? rest : [verb, ...rest])
  if (verb === 'reset') return reset($, rest)
  if (verb === 'clean') return clean($, rest)
  if (verb === 'checkout' || verb === 'restore') return revert($, verb, rest)
  if (verb === 'push') return push($, rest)

  return unmeasured(FORM)
}

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['stakes-widget'] ?? CARD_COLUMNS, columns)
  const [latest, ...earlier] = await read($, log)
  const inner = width - CARD_FRAME
  const room = inner - TITLE.length - 1
  const note = latest?.kind ?? ''

  return $.widgets.card({
    beneath,
    width,
    title: TITLE,
    note: note.length > room ? `${note.slice(0, room - 1)}…` : note,
    body: (
      <Box flexDirection="column">
        {latest === undefined && EMPTY.flatMap(sentence => wrapped(sentence, inner)).map(row => <Text dimColor>{row}</Text>)}
        {latest !== undefined && <Text wrap="truncate-end">{latest.command}</Text>}
        {latest !== undefined && wrapped(latest.line, inner).map(row => <Text color={MARKS[latest.kind].color}>{row}</Text>)}
        {earlier.map(entry => (
          <Text wrap="truncate-end">
            <Text color={MARKS[entry.kind].color} dimColor={entry.kind === 'safe'}>
              {MARKS[entry.kind].mark}
            </Text>{' '}
            {entry.command}
          </Text>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'stakes-widget',
      description: 'Toggle the Stakes card',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'stakes-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'clear') {
      if (!(await read($, isOn))) return { text: 'Stakes is off.' }
      await update($, log, () => [])

      return { text: 'Stakes cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, cwd, () => NOWHERE)

    return { text: isShown ? 'Stakes on; /widgets places it.' : 'Stakes off.' }
  })

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const verdict = await next(e)
    const command = (e.input as { command?: unknown } | null)?.command
    if (e.tool_use_id === undefined || verdict.decision !== 'ask' || typeof command !== 'string') return verdict

    const found = await measure($, command.trim())
    if (found === undefined) return verdict

    try {
      await $.ui.notice(e.tool_use_id, found.line)
    } catch {
      // A call that is not open refuses the line; the verdict still stands.
    }
    await update($, log, held => [{ command: command.trim().slice(0, MAX_COMMAND), ...found }, ...(held ?? [])].slice(0, MAX_LOG))

    return verdict
  })

  on('classic.CwdChanged', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    if (typeof e.new_cwd === 'string') await update($, cwd, () => e.new_cwd)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

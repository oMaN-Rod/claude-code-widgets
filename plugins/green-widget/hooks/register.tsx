import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, ProcessRunInit, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, folder, hash, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Place = PluginState['green-widget']['place']
type Run = PluginState['green-widget']['runs'][number]
type Changed = Run['files'][number]
type Told = { code: number; out: string; said: string }
type Line = { key: string; mark: string; text: string; fact: string; isDim: boolean }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const WIDE_COLUMNS = 30
const TOAST_COLUMNS = 40
const TICK_MS = 30_000
const GIT_MS = 5_000
const SNAP_MS = 10_000
const MAX_RUNS = 8
const MAX_ROWS = 3
const MAX_SHOWN = 2
const MAX_HELD = 20
const MAX_FAULT_ROWS = 2
const SHA_LETTERS = 12
const UNANSWERED = -1
const STALLED = -2
const REFS = 'refs/widgets/green/'
const REF_FORMAT = '--format=%(refname)%00%(objectname)%00%(tree)%00%(committerdate:unix)%00%(contents:subject)'
const USAGE = 'Usage: /green-widget [on|off|tell|clear]'
const VERBS = ['', 'on', 'off', 'tell', 'clear']
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const PLAIN = ['cat', 'ls', 'echo', 'grep', 'rg', 'find', 'git', 'head', 'tail', 'sed', 'awk', 'rm', 'cp', 'mv', 'mkdir', 'touch', 'which']
const MOVES = ['cd', 'pushd', 'popd']
const ASSIGNED = /^[A-Za-z_]\w*=/
const SHELLED = /[|;`<>&]|\$\(/
const OBJECT = /^[0-9a-f]{40,64}$/
const NUMSTAT = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/
const SLOW = 'git took over 10s.'
const EMPTY = 'No green yet. The next passing test, lint or build is kept as a hidden git snapshot of the tree.'
const OUTSIDE = 'Not in a git repository. Nothing is kept here.'
const PAUSED = 'Paused until /green-widget clear.'
const IDENTITY = {
  GIT_AUTHOR_NAME: 'green-widget',
  GIT_COMMITTER_NAME: 'green-widget',
  GIT_AUTHOR_EMAIL: 'green-widget@localhost',
  GIT_COMMITTER_EMAIL: 'green-widget@localhost',
}
const NOWHERE: Place = { top: '', key: '' }
const CALM = { redAt: 0, fileCount: 0, added: 0, removed: 0, files: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'green-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'green-widget', key: 'tick' } as const, 0)
const isPaused = atom({ plugin: 'green-widget', key: 'isPaused' } as const, false)
const fault = atom({ plugin: 'green-widget', key: 'fault' } as const, '')
const where = atom({ plugin: 'green-widget', key: 'place' } as const, NOWHERE)
const runs = atom({ plugin: 'green-widget', key: 'runs' } as const, [])

let timer: Timer | undefined

const cut = (text: string, room: number): string => {
  const letters = [...text]

  return letters.length <= room ? text : `${letters.slice(0, Math.max(0, room - 1)).join('')}…`
}

const tailed = (text: string, room: number): string => {
  const letters = [...text]

  return letters.length <= room ? text : `…${letters.slice(letters.length - Math.max(0, room - 1)).join('')}`
}

const wrapped = (text: string, room: number): string[] => {
  const rows: string[] = []
  let row = ''
  for (const word of text.split(' ').map(each => cut(each, room))) {
    if (row !== '' && [...row].length + 1 + [...word].length > room) {
      rows.push(row)
      row = word
    } else row = row === '' ? word : `${row} ${word}`
  }

  return [...rows, row]
}

const clamped = (rows: readonly string[], room: number): string[] => {
  if (rows.length <= MAX_FAULT_ROWS) return [...rows]

  const last = [...(rows[MAX_FAULT_ROWS - 1] ?? '')].slice(0, room - 1).join('')

  return [...rows.slice(0, MAX_FAULT_ROWS - 1), `${last}…`]
}

const delta = (added: number, removed: number): string => `+${added} -${removed}`

const verb = (segment: string): string[] => {
  const words = segment.split(' ')
  const first = words.findIndex(word => !ASSIGNED.test(word))

  return first === -1 ? [] : words.slice(first, first + 3)
}

const isCheck = (segment: string): boolean => {
  const told = verb(segment)

  return !PLAIN.includes(told[0] ?? '') && told.some(word => CHECKS.test(word))
}

const counted = (command: string): string | null => {
  if (command.includes('\n')) return null

  const segments = command
    .trim()
    .replace(/\s+/g, ' ')
    .split('&&')
    .map(segment => segment.trim().replace(/ 2>&1$/, ''))
  if (segments.some(segment => segment === '' || SHELLED.test(segment) || MOVES.includes(verb(segment)[0] ?? ''))) return null

  return segments.some(isCheck) ? segments.join(' && ') : null
}

const tallied = (out: string): Changed[] =>
  out
    .split('\0')
    .flatMap(row => {
      const found = NUMSTAT.exec(row)

      return found === null ? [] : [{ path: found[3] ?? '', added: Number(found[1]) || 0, removed: Number(found[2]) || 0 }]
    })
    .sort((one, other) => other.added + other.removed - (one.added + one.removed))

const ordered = (held: readonly Run[]): Run[] => [
  ...held.filter(run => run.redAt > 0 && run.greenAt > 0).sort((one, other) => other.redAt - one.redAt),
  ...held.filter(run => run.redAt > 0 && run.greenAt === 0).sort((one, other) => other.redAt - one.redAt),
  ...held.filter(run => run.redAt === 0).sort((one, other) => other.greenAt - one.greenAt),
]

const spare = (held: readonly Run[]): Run | undefined => {
  if (held.length <= MAX_RUNS) return undefined

  const rest = held.slice(1)

  return rest.filter(run => run.greenAt === 0).at(-1) ?? rest.reduce((oldest, run) => (run.greenAt < oldest.greenAt ? run : oldest))
}

const age = (ms: number, isWide: boolean): string => (isWide ? `${span(ms)} ago` : (span(ms).split(' ')[0] ?? ''))

const plain = (key: string, rows: readonly string[], pad = '', isDim = false): Line => ({
  key,
  mark: '',
  text: rows.map(row => `${pad}${row}`).join('\n'),
  fact: '',
  isDim,
})

const sentence = (key: string, text: string, room: number, pad = '', isDim = false): Line => plain(key, wrapped(text, room - pad.length), pad, isDim)

const rowed = (run: Run, at: number, now: number, isWide: boolean, inner: number): Line => {
  const green = age(now - run.greenAt, isWide)
  const fact = run.redAt === 0 ? green : run.greenAt === 0 ? (isWide ? 'never green' : 'never') : isWide ? `green ${green}` : green

  return {
    key: String(at + 1),
    mark: run.redAt > 0 ? '✗' : run.isSeen ? '✓' : '·',
    text: cut(run.command, Math.max(1, inner - 3 - fact.length)),
    fact,
    isDim: false,
  }
}

const since = (run: Run | undefined, isWide: boolean, inner: number): Line[] => {
  if (run === undefined || run.redAt === 0 || run.greenAt === 0 || run.fileCount < 0) return []

  const pad = isWide ? '  ' : ' '
  if (run.fileCount === 0) {
    return isWide
      ? [sentence('since', 'since green: the tree is unchanged', inner), sentence('ignored', 'ignored files are not compared', inner, pad, true)]
      : [sentence('since', 'tree unchanged', inner)]
  }

  const files = plural(run.fileCount, 'file')
  const folded = run.fileCount - Math.min(MAX_SHOWN, run.files.length)

  return [
    sentence('since', isWide ? `since green: ${files}, ${delta(run.added, run.removed)}` : `${files} ${delta(run.added, run.removed)}`, inner),
    ...run.files.slice(0, MAX_SHOWN).map((file, at) => {
      const fact = delta(file.added, file.removed)

      return { key: `file:${at + 1}`, mark: '', text: `${pad}${tailed(file.path, Math.max(1, inner - pad.length - 1 - fact.length))}`, fact, isDim: false }
    }),
    ...(folded > 0 ? [sentence('more', `… ${folded} more${isWide ? ' in tell' : ''}`, inner, pad, true)] : []),
  ]
}

const written = (held: readonly Run[], place: Place, said: string, isStopped: boolean, now: number, isWide: boolean, inner: number): Line[] => {
  if (place.top === '') return [sentence('empty', OUTSIDE, inner, '', true)]
  if (held.length === 0 && said === '') return [sentence('empty', EMPTY, inner, '', true)]

  const [first, ...rest] = held.slice(0, MAX_ROWS).map((run, at) => rowed(run, at, now, isWide, inner))

  return [
    ...(first === undefined ? [] : [first, ...since(held[0], isWide, inner), ...rest]),
    ...(said === '' ? [] : [plain('fault', clamped(wrapped(`No snapshot: ${said}`, inner), inner))]),
    ...(isStopped ? [sentence('paused', PAUSED, inner)] : []),
  ]
}

const git = async ($: EngineInterface, args: readonly string[], init: ProcessRunInit): Promise<Told> => {
  try {
    const { exitCode, stdout, stderr } = await $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs: GIT_MS, ...init })

    return { code: exitCode, out: stdout, said: stderr.trim().split('\n')[0]?.trim() || `git ${args[0]} failed.` }
  } catch {
    return { code: UNANSWERED, out: '', said: 'git did not answer.' }
  }
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, tick, count => ((count ?? 0) + 1) % 1_000_000)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const look = async ($: EngineInterface): Promise<Place> => {
  const rooted = await git($, ['rev-parse', '--show-toplevel'], { cwd: await $.session.cwd() })
  const top = rooted.code === 0 ? rooted.out.trim() : ''
  const held = await read($, where)
  if (held.top === top) return held

  const place = { top, key: top === '' ? '' : hash(folder(top)).toString(36) }
  const listed = top === '' ? '' : (await git($, ['for-each-ref', REF_FORMAT, `${REFS}${place.key}/`], { cwd: top })).out
  const restored = listed
    .split('\n')
    .map(row => row.split('\0'))
    .filter(fields => fields.length === 5)
    .map(([ref = '', sha = '', tree = '', date = '', command = '']) => ({
      ...CALM,
      key: ref.slice(ref.lastIndexOf('/') + 1),
      command,
      greenAt: Number(date) * 1000,
      sha,
      tree,
      isSeen: false,
    }))
    .sort((one, other) => other.greenAt - one.greenAt)
    .slice(0, MAX_RUNS)
  await update($, where, () => place)
  await update($, runs, () => restored)

  return place
}

const stored = async ($: EngineInterface, place: Place, run: Run): Promise<void> => {
  const gone = spare(await update($, runs, held => [run, ...(held ?? []).filter(other => other.key !== run.key)]))
  if (gone === undefined) return

  if (gone.greenAt > 0) await git($, ['update-ref', '-d', `${REFS}${place.key}/${gone.key}`], { cwd: place.top })
  await update($, runs, held => (held ?? []).filter(other => other.key !== gone.key))
}

const snapped = async ($: EngineInterface, place: Place): Promise<Told> => {
  const env = { GIT_INDEX_FILE: `${$.plugin.root}/index-${place.key}` }
  const added = await git($, ['add', '-A'], { cwd: place.top, env, timeoutMs: SNAP_MS })
  if (added.code === UNANSWERED) return { code: STALLED, out: '', said: SLOW }
  if (added.code !== 0) return added

  const made = await git($, ['write-tree'], { cwd: place.top, env })
  const tree = made.out.trim()

  return made.code === 0 && !OBJECT.test(tree) ? { code: 1, out: '', said: 'git wrote no tree.' } : { ...made, out: tree }
}

const committed = async ($: EngineInterface, place: Place, tree: string, command: string, ref: string, at: number): Promise<Told> => {
  const date = `@${Math.floor(at / 1000)} +0000`
  const made = await git($, ['commit-tree', tree, '--no-gpg-sign', '-m', command], {
    cwd: place.top,
    env: { ...IDENTITY, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
  const sha = made.out.trim()
  if (made.code !== 0) return made
  if (!OBJECT.test(sha)) return { code: 1, out: '', said: 'git wrote no commit.' }

  const moved = await git($, ['update-ref', ref, sha], { cwd: place.top })

  return moved.code === 0 ? { ...made, out: sha } : moved
}

const compared = async ($: EngineInterface, place: Place, held: Run, tree: string, at: number): Promise<Run> => {
  const red = { ...held, ...CALM, redAt: at, isSeen: true }
  if (tree === held.tree) return red

  const told = await git($, ['diff', '--numstat', '--no-renames', '-z', held.tree, tree], { cwd: place.top })
  if (told.code !== 0) return { ...red, fileCount: -1 }

  const files = tallied(told.out)

  return {
    ...red,
    fileCount: files.length,
    added: files.reduce((sum, file) => sum + file.added, 0),
    removed: files.reduce((sum, file) => sum + file.removed, 0),
    files: files.slice(0, MAX_HELD),
  }
}

const judged = async ($: EngineInterface, command: string, isPassed: boolean): Promise<void> => {
  const place = await look($)
  if (place.top === '') return

  const key = hash(command).toString(36)
  const held = (await read($, runs)).find(run => run.key === key)
  const at = await $.clock.now()
  if (!isPassed && (held === undefined || held.greenAt === 0)) {
    await stored($, place, { ...CALM, key, command, greenAt: 0, sha: '', tree: '', redAt: at, isSeen: true })

    return
  }

  const shot = await snapped($, place)
  const made = shot.code === 0 && isPassed ? await committed($, place, shot.out, command, `${REFS}${place.key}/${key}`, at) : shot
  await update($, fault, () => (made.code === 0 ? '' : made.said))
  await update($, isPaused, () => made.code === STALLED)

  if (!isPassed && held !== undefined) {
    const red = shot.code === 0 ? await compared($, place, held, shot.out, at) : { ...held, ...CALM, redAt: at, fileCount: -1, isSeen: true }
    await stored($, place, red)
    if (held.redAt > 0 || red.fileCount < 0) return

    const name = cut(command, TOAST_COLUMNS)
    $.ui.toast(
      red.fileCount === 0
        ? `${name} went red with the tree unchanged since green`
        : `${name} went red: ${plural(red.fileCount, 'file')}, ${delta(red.added, red.removed)} since green ${span(at - held.greenAt)} ago`,
    )
  } else if (made.code === 0) {
    await stored($, place, { ...CALM, key, command, greenAt: Math.floor(at / 1000) * 1000, sha: made.out, tree: shot.out, isSeen: true })
  } else if (held !== undefined && held.greenAt > 0) {
    await stored($, place, { ...held, ...CALM, isSeen: true })
  } else {
    await update($, runs, list => (list ?? []).filter(other => other.key !== key))
  }
}

const handed = async ($: EngineInterface): Promise<string> => {
  const [run] = ordered(await read($, runs))
  if (run === undefined || run.redAt === 0) return 'Nothing is red.'
  if (run.greenAt === 0) return `${run.command} has never been green here: nothing to compare.`
  if (run.fileCount === 0) return `Nothing in the snapshot changed since ${run.command} was green. Ignored files are not compared.`
  if (run.fileCount < 0) return `${run.command} is red, but git could not compare the tree with its green. Run it again.`

  const now = await $.clock.now()
  const { key } = await read($, where)
  const sha = run.sha.slice(0, SHA_LETTERS)
  const folded = run.fileCount - run.files.length
  const text = [
    `\`${run.command}\` passed ${span(now - run.greenAt)} ago and fails now. The tree as it was when it passed is the git commit ${sha} (${REFS}${key}/${run.key}).`,
    [
      `At the failing run ${span(now - run.redAt)} ago, ${plural(run.fileCount, 'file')} had changed since then, ${delta(run.added, run.removed)}:`,
      ...run.files.map(file => `${file.path} ${delta(file.added, file.removed)}`),
      ...(folded > 0 ? [`and ${folded} more`] : []),
    ].join('\n'),
    `Read a file's hunks with \`git diff ${sha} -- <path>\`. A file listed here that the diff does not show is new since green: read it whole. Ignored files are not in the snapshot.`,
    `Find which of these changes broke \`${run.command}\` before looking anywhere else.`,
  ].join('\n\n')

  try {
    return (await $.prompt.fill({ text })).isFilled ? `Filled the prompt with what changed since ${run.command} was green.` : text
  } catch {
    return text
  }
}

const rested = async ($: EngineInterface): Promise<void> => {
  await update($, runs, () => [])
  await update($, fault, () => '')
  await update($, isPaused, () => false)
}

const wiped = async ($: EngineInterface): Promise<string> => {
  const place = await look($)
  if (place.top === '') return 'Not in a git repository.'

  const found = await git($, ['for-each-ref', '--format=%(refname)', REFS], { cwd: place.top })
  const refs = found.out.split('\n').filter(ref => ref.startsWith(REFS))
  const dropped =
    found.code !== 0 || refs.length === 0
      ? found
      : await git($, ['update-ref', '--stdin'], { cwd: place.top, stdin: refs.map(ref => `delete ${ref}\n`).join('') })
  if (dropped.code !== 0) return `Last green not cleared: ${dropped.said}`

  await git($, ['read-tree', '--empty'], { cwd: place.top, env: { GIT_INDEX_FILE: `${$.plugin.root}/index-${place.key}` } })
  await rested($)

  return `Last green cleared: ${plural(refs.length, 'snapshot')} deleted.`
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

  await read($, tick)
  const width = fit((await $.state.get(widths)).value?.['green-widget'] ?? CARD_COLUMNS, columns)
  const isWide = width >= WIDE_COLUMNS
  const held = ordered(await read($, runs))
  const said = await read($, fault)
  const reds = held.filter(run => run.redAt > 0).length
  const isAllSeen = isWide && held.length > 0 && held.every(run => run.isSeen)
  const note = said !== '' ? 'error' : reds > 0 ? `${reds} red` : isAllSeen ? 'all green' : undefined
  const lines = written(held, await read($, where), said, await read($, isPaused), await $.clock.now(), isWide, width - CARD_FRAME)

  return $.widgets.card({
    beneath,
    width,
    title: 'Last green',
    ...(note === undefined ? {} : { note }),
    body: (
      <Box flexDirection="column">
        {lines.map(line => (
          <Box key={`row:${line.key}`} columnGap={1}>
            {line.mark !== '' && (
              <Box key={`mark:${line.key}`} flexShrink={0}>
                <Text {...(line.mark === '·' ? { dimColor: true } : { color: line.mark === '✗' ? 'red' : 'green' })}>{line.mark}</Text>
              </Box>
            )}
            <Box key={`text:${line.key}`} flexGrow={1}>
              <Text dimColor={line.isDim}>{line.text}</Text>
            </Box>
            {line.fact !== '' && (
              <Box key={`fact:${line.key}`} flexShrink={0}>
                <Text dimColor>{line.fact}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'green-widget',
      description: 'Toggle the Last green card, tell Claude what changed since green or clear the snapshots',
      argumentHint: '[on|off|tell|clear]',
    })
    if ((await $.store.get('isOn')) === true) {
      await update($, isOn, () => true)
      await look($)
    }
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'green-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (!VERBS.includes(arg)) return { text: USAGE }

    if (arg === 'tell' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: 'Last green is off.' }

      return { text: arg === 'tell' ? await handed($) : await wiped($) }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await look($)
    else {
      await update($, where, () => NOWHERE)
      await rested($)
    }
    await sync($)

    return { text: isShown ? 'Last green on; /widgets places it.' : 'Last green off.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const ran = await next(e)
    try {
      const command = counted(e.command)
      const isAside = e.agentId !== undefined || e.run_in_background === true || ran.deny !== undefined
      const isBehind = ran.isError !== true && ran.result?.backgroundTaskId !== undefined
      if (command !== null && !isAside && !isBehind && !(await read($, isPaused))) await judged($, command, ran.isError !== true)
    } catch {
      // The Bash result is handed on whatever became of the snapshot.
    }

    return ran
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

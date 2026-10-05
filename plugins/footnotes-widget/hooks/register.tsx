import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderNode, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, folder, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>
type Verdict = 'found' | 'missing' | 'short'
type Unchecked = '' | 'no repository' | 'git failed'
type Ref = { token: string; name: string; kind: 'path' | 'symbol'; verdict: Verdict; lines: number; isHard: boolean }
type Last = { refs: Ref[]; unchecked: Unchecked }
type Cited =
  | { kind: 'path'; token: string; name: string; path: string; line: number | undefined }
  | { kind: 'symbol'; token: string; name: string; parts: string[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LONG_COLUMNS = 36
const MAX_REFS = 20
const MAX_ROWS = 5
const SLOT = 'footnotes-widget:ask'
const GIT_MS = 3000
const USAGE = 'Usage: /footnotes-widget [on|off|show|clear]'
const OFF = 'Footnotes is off.'
const UNCHECKED = 'No reply checked yet.'
const NOTHING = 'Nothing to check in the last reply.'
const EMPTY = [UNCHECKED, "File and symbol names in Claude's replies are checked here."] as const
const OPENING = 'Check these references from your last reply against the repository and correct what was wrong:'
const SPAN = /`([^`]+)`/g
const PATH = /^([A-Za-z0-9_./\\-]+?)(?::(\d+)(?:([-:])(\d+))?)?$/
const EXTENSION =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|py|rs|go|java|kt|rb|php|c|h|cpp|hpp|cs|swift|css|scss|html|vue|svelte|yml|yaml|toml|sh|sql|txt)$/
const SYMBOL = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/
const SHAPED = /[._]|[a-z][A-Z]/
const LS_FILES = ['git', '--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard'] as const
const GREP = ['git', '--no-optional-locks', 'grep', '-I', '-w', '-F', '-o', '-h', '--untracked'] as const
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'footnotes-widget', key: 'isOn' } as const, false)
const last = atom({ plugin: 'footnotes-widget', key: 'last' } as const, null as Last | null)

const cite = (token: string): Cited | undefined => {
  const [, written = '', first, range, second] = PATH.exec(token) ?? []
  if (written !== '' && !token.startsWith('-') && EXTENSION.test(written)) {
    const path = written.replaceAll('\\', '/').replace(/^\.\//, '')

    return {
      kind: 'path',
      token,
      name: `${path.split('/').at(-1)}${token.slice(written.length)}`,
      path,
      line: first === undefined ? undefined : Number(range === '-' ? second : first),
    }
  }

  const isCall = token.endsWith(')') && token.includes('(')
  const bare = isCall ? token.slice(0, token.indexOf('(')) : token
  if (!SYMBOL.test(bare) || bare.length < 3 || !(isCall || SHAPED.test(bare))) return undefined

  const parts = bare.split('.').filter(part => part !== 'this' && part !== 'self')

  return parts.length === 0 ? undefined : { kind: 'symbol', token, name: isCall ? `${bare}()` : bare, parts }
}

const cited = (answer: string): Cited[] => {
  const prose: string[] = []
  let isFenced = false
  for (const line of answer.split('\n')) {
    if (line.trim().startsWith('```')) isFenced = !isFenced
    else if (!isFenced) prose.push(line)
  }
  const tokens = prose.flatMap(line => [...line.matchAll(SPAN)].map(found => (found[1] ?? '').trim()))

  return [...new Set(tokens)].flatMap(token => cite(token) ?? []).slice(0, MAX_REFS)
}

const wrapped = (sentence: string, columns: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const held = rows.at(-1)

    return held !== undefined && held.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${held} ${word}`] : [...rows, word]
  }, [])

const counted = (text: string): number => (text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0))

const failed = (refs: readonly Ref[]): Ref[] => refs.filter(ref => ref.verdict !== 'found')

const reason = ({ kind, verdict, lines }: Ref, isFull: boolean): string => {
  if (verdict === 'short') return `file has ${plural(lines, 'line')}`
  if (kind === 'path') return 'not on disk'

  return isFull ? 'not found in this repository' : 'not in this repo'
}

const check = async ($: EngineInterface, answer: string): Promise<Last> => {
  const named = cited(answer)
  const cwd = await $.session.cwd()
  const repo = await $.session.repo()
  const counts = new Map<string, number>()
  const parts = [...new Set(named.flatMap(ref => (ref.kind === 'symbol' ? ref.parts : [])))]
  const refs: Ref[] = []
  let entries: string[] | undefined
  let isListed = false
  let occurring = new Set<string>()
  let unchecked: Unchecked = ''

  if (parts.length > 0 && repo === null) unchecked = 'no repository'
  if (parts.length > 0 && repo !== null) {
    try {
      const ran = await $.process.run([...GREP, ...parts.flatMap(part => ['-e', part])], { cwd: repo.root, timeoutMs: GIT_MS })
      if (ran.isStdoutTruncated || (ran.exitCode !== 0 && ran.exitCode !== 1)) unchecked = 'git failed'
      else if (ran.exitCode === 0) occurring = new Set(ran.stdout.split('\n').map(line => line.trim()))
    } catch {
      unchecked = 'git failed'
    }
  }

  for (const ref of named) {
    const { token, name } = ref
    if (ref.kind === 'symbol') {
      if (unchecked === '') {
        const verdict = ref.parts.some(part => occurring.has(part)) ? 'found' : 'missing'
        refs.push({ token, name, kind: 'symbol', verdict, lines: 0, isHard: false })
      }
      continue
    }

    const { path, line } = ref
    let file: string | undefined
    if (path.startsWith('/')) {
      if (await $.fs.exists(path)) file = path
    } else if (await $.fs.exists(`${cwd}/${path}`)) file = `${cwd}/${path}`
    else if (path.split('/').includes('..') || repo === null) file = undefined
    else if (folder(repo.root) !== folder(cwd) && (await $.fs.exists(`${repo.root}/${path}`))) file = `${repo.root}/${path}`
    else {
      if (!isListed) {
        isListed = true
        try {
          const ran = await $.process.run(LS_FILES, { cwd: repo.root, timeoutMs: GIT_MS })
          if (ran.exitCode === 0 && !ran.isStdoutTruncated) entries = ran.stdout.split('\n').map(row => row.replace(/\r$/, ''))
        } catch {
          continue
        }
      }
      if (entries === undefined) continue

      const matches = entries.filter(entry => entry === path || entry.endsWith(`/${path}`))
      if (matches.length === 1) file = `${repo.root}/${matches[0]}`
      else if (matches.length === 0 && (path.includes('/') || line !== undefined)) {
        refs.push({ token, name, kind: 'path', verdict: 'missing', lines: 0, isHard: line !== undefined })
      }
    }
    if (file === undefined) continue

    let lines = line === undefined ? Number.POSITIVE_INFINITY : counts.get(folder(file))
    if (lines === undefined) {
      try {
        lines = counted(await $.fs.read(file))
      } catch {
        lines = Number.POSITIVE_INFINITY
      }
      counts.set(folder(file), lines)
    }
    const isShort = line !== undefined && line > lines
    refs.push({ token, name, kind: 'path', verdict: isShort ? 'short' : 'found', lines: isShort ? lines : 0, isHard: isShort })
  }

  return { refs, unchecked }
}

const seat = (node: RenderNode, button: RenderElement): RenderNode => {
  if (typeof node !== 'object') return node
  const { props, children } = node as { props?: { key?: unknown }; children?: RenderNode[] }
  if (props?.key === SLOT) return button

  return children === undefined ? node : ({ ...node, children: children.map(child => seat(child, button)) } as RenderElement)
}

const ask = async ($: EngineInterface): Promise<void> => {
  const failures = failed((await read($, last))?.refs ?? [])
  if (failures.length === 0) return

  try {
    await $.prompt.fill({ text: [OPENING, ...failures.map(ref => `- ${ref.token}: ${reason(ref, true)}`)].join('\n'), mode: 'append' })
  } catch {
    return
  }
}

const show = async (
  $: EngineInterface,
  { Box, Text, Button }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['footnotes-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const isLong = inner >= LONG_COLUMNS
  const held = await read($, last)
  const refs = held?.refs ?? []
  const failures = failed(refs)
  const found = refs.length - failures.length
  const rows = failures.slice(0, MAX_ROWS).map(ref => {
    const why = reason(ref, false)
    const room = inner - 4 - why.length

    return { ref, text: !isLong ? ref.name : `${ref.name.length > room ? `${ref.name.slice(0, Math.max(0, room - 1))}…` : ref.name}: ${why}` }
  })

  const card = await $.widgets.card({
    beneath,
    width,
    title: 'Footnotes',
    note: refs.length === 0 ? '' : isLong ? `${found}/${refs.length} found` : `${found}/${refs.length}`,
    body: (
      <Box flexDirection="column">
        {(held === null ? EMPTY : refs.length === 0 ? [NOTHING] : [])
          .flatMap(sentence => wrapped(sentence, inner))
          .map(row => (
            <Text dimColor>{row}</Text>
          ))}
        {refs.length > 0 && failures.length === 0 && (
          <Text key="all" wrap="truncate-end">
            <Text color="green">✓</Text> {isLong ? `${refs.length} named, ${found} found` : 'all found'}
          </Text>
        )}
        {rows.map(({ ref, text }, at) => (
          <Text key={`row-${at + 1}`} wrap="truncate-end">
            <Text color={ref.isHard ? 'red' : 'yellow'}>{ref.isHard ? '✗' : '?'}</Text> {text}
          </Text>
        ))}
        {failures.length > MAX_ROWS && (
          <Text key="more" dimColor wrap="truncate-end">
            {`+${failures.length - MAX_ROWS} more`}
          </Text>
        )}
        {failures.length > 0 && <Box key={SLOT} />}
        {held !== null && held.unchecked !== '' && (
          <Text key="unchecked" dimColor wrap="truncate-end">
            {isLong ? `Symbols not checked: ${held.unchecked}` : 'No symbol check'}
          </Text>
        )}
      </Box>
    ),
  })
  if (failures.length === 0) return card

  return seat(card, <Button key="ask" label={isLong ? 'Ask Claude to check these' : 'Ask Claude'} onPress={() => ask($)} />) as RenderElement
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'footnotes-widget',
      description: "Toggle the check of file and symbol names in Claude's replies",
      argumentHint: '[on|off|show|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'footnotes-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'show' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }

      if (arg === 'clear') {
        await update($, last, () => null)

        return { text: 'Footnotes cleared.' }
      }

      const held = await read($, last)
      if (held === null) return { text: UNCHECKED }

      const { refs, unchecked } = held
      const skipped = unchecked === '' ? [] : [`Symbols not checked: ${unchecked}`]
      if (refs.length === 0) return { text: [NOTHING, ...skipped].join('\n') }

      return {
        text: [
          `${refs.length} named, ${refs.length - failed(refs).length} found:`,
          ...refs.map(ref => (ref.verdict === 'found' ? `✓ ${ref.token}` : `${ref.isHard ? '✗' : '?'} ${ref.token}: ${reason(ref, true)}`)),
          ...skipped,
        ].join('\n'),
      }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Footnotes on; /widgets places it.' : 'Footnotes off.' }
  })

  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    if (!(await read($, isOn)) || e.agentId !== undefined || e.isAborted || e.reason !== 'answer' || e.answer.trim() === '') return ended

    try {
      const checked = await check($, e.answer)
      await update($, last, () => checked)
    } catch {
      return ended
    }

    return ended
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

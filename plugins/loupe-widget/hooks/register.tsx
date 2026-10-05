import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, ProcessRunResult, Register, RenderElement, RenderNode, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { LoupeFinding } from '../types'
import { fit, folder, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>
type Found = Pick<LoupeFinding, 'kind' | 'rows' | 'tight'> & Partial<Pick<LoupeFinding, 'head' | 'copy' | 'colour'>>
type Subject = { head: string; text: string; characters: number; lines: number; isPlain: boolean }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const USAGE = 'Usage: /loupe-widget [on|off|look [text]|copy]'
const OFF = 'Loupe is off.'
const REST = 'Select anything in the transcript with the mouse and this card says what it is: a commit, a path, a symbol, a timestamp or a colour.'
const WINDOWED = 'Needs the fullscreen layout to see a selection (/tui fullscreen). /loupe-widget look <text> works anywhere.'
const NOTHING = 'Nothing is selected.'
const UNSEEN = 'No selection can be seen outside the fullscreen layout. Try /loupe-widget look <text>.'
const FAILED = 'Lookup failed.'
const EDGES = /^[`'"()[\]{}<>,;]+|[`'"()[\]{}<>,;.:]+$/g
const KEYWORDS = 'function|class|interface|type|enum|const|let|var|def|fn|func|struct|trait|module'
const BLANK = { seen: { text: '', requestId: '' }, ticket: 0, isBusy: false, head: '', finding: null }
const POLL_MS = 300
const GIT_MS = 2000
const WIDE = 24
const SWATCH_ROWS = 2
const SEAT = 'copy-seat'
const CALLS_MAX = 200
const TOOL_MAX = 10
const TEXT_MAX = 200
const PATH_MAX = 260
const SAID_MAX = 60
const FIRST_MS = 1_000_000_000_000
const DECADE_MS = 10 * 365.25 * 86_400_000
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'loupe-widget', key: 'isOn' } as const, false)
const look = atom({ plugin: 'loupe-widget', key: 'look' } as const, BLANK)
const calls = atom({ plugin: 'loupe-widget', key: 'calls' } as const, {})

let timer: Timer | undefined

const cut = (text: string, room: number): string => {
  if (text.length <= room) return text

  return room < 1 ? '' : `${text.slice(0, room - 1)}…`
}

const middle = (text: string, room: number): string => {
  if (text.length <= room) return text
  if (room < 1) return ''

  return `${text.slice(0, Math.ceil((room - 1) / 2))}…${text.slice(text.length - Math.floor((room - 1) / 2))}`
}

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

const bare = (text: string): string => {
  const next = text.replace(EDGES, '').trim()

  return next === text ? text : bare(next)
}

const subjectOf = (raw: string): Subject => {
  const whole = raw.trim()
  const stripped = whole.includes('\n') || whole.length > TEXT_MAX || !/[\p{L}\p{N}]/u.test(whole) ? '' : bare(whole)
  const text = stripped === '' ? whole : stripped

  return {
    head: middle(text.replace(/\s+/g, ' '), TEXT_MAX),
    text,
    characters: [...text.replace(/[\r\n]/g, '')].length,
    lines: text.split('\n').length,
    isPlain: stripped !== '',
  }
}

const counted = (subject: Subject): Found => ({
  kind: 'text',
  rows: [`${plural(subject.characters, 'character')}, ${plural(subject.lines, 'line')}`],
  tight: [`${subject.characters} in ${plural(subject.lines, 'line')}`],
})

const sized = (bytes: number): string => {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 999_950) return `${(bytes / 1000).toFixed(1)} kB`
  if (bytes < 999_950_000) return `${(bytes / 1_000_000).toFixed(1)} MB`

  return `${(bytes / 1_000_000_000).toFixed(1)} GB`
}

const isWithin = (path: string, base: string): boolean => folder(path) === folder(base) || folder(path).startsWith(`${folder(base)}/`)

const asColour = (text: string): Found | undefined => {
  if (!/^#[0-9a-f]{6}$/i.test(text)) return undefined

  const colour = Number.parseInt(text.slice(1), 16)
  const parts = [colour >> 16, (colour >> 8) & 255, colour & 255]
  const wide = `rgb(${parts.join(', ')})`

  return { kind: 'colour', rows: [wide], tight: [parts.join(' ')], copy: wide, colour }
}

const asTime = (text: string, now: number): Found | undefined => {
  if (!/^\d{10}$|^\d{13}$/.test(text)) return undefined

  const at = Number(text) * (text.length === 10 ? 1000 : 1)
  if (at < FIRST_MS || at > now + DECADE_MS) return undefined

  const stamp = new Date(at).toISOString()
  const day = stamp.slice(0, 10)
  const ahead = Math.round((at - now) / 1000) * 1000
  const age = ahead > 0 ? `in ${span(ahead)}` : `${span(-ahead)} ago`

  return {
    kind: 'time',
    rows: [`${day} ${stamp.slice(11, 19)} UTC`, age],
    tight: [`${day} ${stamp.slice(11, 16)}`, age],
    copy: `${stamp.slice(0, 19)}Z`,
  }
}

const git = ($: EngineInterface, root: string, ...args: string[]): Promise<ProcessRunResult> =>
  $.process.run(['git', '--no-optional-locks', ...args], { cwd: root, timeoutMs: GIT_MS })

const asCommit = async ($: EngineInterface, text: string, root: string, now: number): Promise<Found | undefined> => {
  if (!/^[0-9a-f]{7,40}$/i.test(text)) return undefined

  const parsed = await git($, root, 'rev-parse', '--verify', '--quiet', `${text}^{commit}`)
  const sha = parsed.stdout.trim()
  if (parsed.exitCode !== 0 || !/^[0-9a-f]{40}$/i.test(sha)) return undefined

  const shown = await git($, root, 'show', '--shortstat', '--format=%h%x00%s%x00%an%x00%ct%x00', sha)
  const [head = '', subject = '', author = '', at = '', stat = ''] = shown.stdout.split('\u0000')
  if (shown.exitCode !== 0 || head === '' || !/^\d+$/.test(at)) throw new Error('git show answered nothing to read')

  const age = `${span(now - Number(at) * 1000)} ago`
  const files = /(\d+) files? changed/.exec(stat)?.[1]

  return {
    kind: 'commit',
    head,
    rows: [cut(subject, TEXT_MAX), [author, age, ...(files === undefined ? [] : [plural(Number(files), 'file')])].join(' · ')],
    tight: [cut(subject, TEXT_MAX), age],
    copy: sha,
  }
}

const rootOf = async ($: EngineInterface, root: string, real: string): Promise<string | undefined> => {
  if (isWithin(real, root)) return root

  const landed = (await $.fs.stat(root, { resolve: true })).realPath

  return landed !== undefined && isWithin(real, landed) ? landed : undefined
}

const asPath = async ($: EngineInterface, text: string, root: string, isRepo: boolean, now: number): Promise<Found | undefined> => {
  const rest = text.replace(/:\d+(?::\d+)?$/, '').replaceAll('\\', '/')
  if (text.length > PATH_MAX || /\s/.test(text) || rest === '') return undefined
  if (rest.startsWith('//')) return { kind: 'path', rows: ['missing'], tight: ['missing'] }

  const cwd = await $.session.cwd()
  const under = (base: string): string => `${base.replace(/[\\/]+$/, '')}/${rest}`
  const tried = /^(?:[a-z]:)?\//i.test(rest) ? [rest] : folder(cwd) === folder(root) ? [under(root)] : [under(root), under(cwd)]
  const [first = rest, second] = tried
  const found = (await $.fs.exists(first)) ? first : second !== undefined && (await $.fs.exists(second)) ? second : undefined
  if (found === undefined) return /[\\/]/.test(text) ? { kind: 'path', rows: ['missing'], tight: ['missing'] } : undefined

  const stat = await $.fs.stat(found, { resolve: true })
  const real = stat.realPath
  const home = real === undefined ? undefined : await rootOf($, root, real)
  if (real === undefined || home === undefined) return { kind: 'path', rows: ['exists, outside the session root'], tight: ['exists, outside'] }

  const from = real.replaceAll('\\', '/').replace(/\/+$/, '').slice(folder(home).length + 1) || '.'
  const tight = stat.kind === 'file' ? `file · ${sized(stat.size)}` : stat.kind
  const wide = stat.mtimeMs > 0 ? `${tight} · changed ${span(now - stat.mtimeMs)} ago` : tight
  const logged = isRepo ? await git($, root, 'log', '-1', '--format=%h%x00%s', '--', from) : undefined
  const [hash = '', subject = ''] = logged?.exitCode === 0 ? logged.stdout.trim().split('\u0000') : []
  const last = hash === '' ? [] : [cut(`${hash} ${subject}`, TEXT_MAX)]

  return { kind: 'path', rows: [wide, ...last], tight: [tight, ...last], copy: from }
}

const asSymbol = async ($: EngineInterface, name: string, root: string, isRepo: boolean): Promise<Found | undefined> => {
  if (!/^[A-Za-z_$][\w$]{2,63}$/.test(name)) return undefined
  if (!isRepo) return { kind: 'symbol', rows: ['not a git repository'], tight: ['not a git repo'], copy: name }

  const grep = await git($, root, 'grep', '-n', '-I', '-w', '-F', '-e', name)
  if (grep.exitCode === 1) return { kind: 'symbol', rows: ['no mention in tracked files'], tight: ['no mention'], copy: name }
  if (grep.exitCode !== 0) throw new Error('git grep failed')

  const declared = new RegExp(`(?:^|[^\\w$])(?:${KEYWORDS})(?:\\s+\\*?|\\*)\\s*${name.replaceAll('$', '\\$')}(?![\\w$])`)
  const hits = grep.stdout.split('\n').flatMap(line => {
    const [, path, row, said] = /^(.*?):(\d+):(.*)$/.exec(line) ?? []

    return path === undefined || row === undefined || said === undefined ? [] : [{ path, row, said }]
  })
  const files = plural(new Set(hits.map(hit => hit.path)).size, 'file')
  const wide = grep.isStdoutTruncated ? 'many mentions' : `${plural(hits.length, 'mention')} in ${files}`
  const tight = grep.isStdoutTruncated ? 'many mentions' : `${hits.length}× in ${files}`
  const defined = hits.filter(hit => declared.test(hit.said))
  const [first] = defined
  if (first === undefined) return { kind: 'symbol', rows: ['no definition found', wide], tight: ['no definition', tight], copy: name }

  const where = `${first.path}:${first.row}`
  const line = cut(first.said.trim(), TEXT_MAX)

  return {
    kind: 'symbol',
    rows: [defined.length > 1 ? `${where} (+${defined.length - 1})` : where, line, wide],
    tight: [where, line, tight],
    copy: where,
  }
}

const sourceOf = async ($: EngineInterface, requestId: string, now: number): Promise<string> => {
  const recorded = await read($, calls)
  const call = Object.hasOwn(recorded, requestId) ? recorded[requestId] : undefined
  if (call === undefined) return ''

  const tool = call.tool.startsWith('mcp__') ? call.tool.split('__').slice(2).join('__') || call.tool : call.tool

  return `from ${tool.slice(0, TOOL_MAX)}, ${span(now - call.at)} ago`
}

const identify = async ($: EngineInterface, subject: Subject, now: number): Promise<Found> => {
  const colour = subject.isPlain ? asColour(subject.text) : undefined
  if (!subject.isPlain || colour !== undefined) return colour ?? counted(subject)

  const root = await $.session.root()
  const isRepo = (await $.session.repo()) !== null

  return (
    (isRepo ? await asCommit($, subject.text, root, now) : undefined) ??
    asTime(subject.text, now) ??
    (await asPath($, subject.text, root, isRepo, now)) ??
    (await asSymbol($, subject.text, root, isRepo)) ??
    counted(subject)
  )
}

const resolve = async ($: EngineInterface, subject: Subject, requestId: string, from: LoupeFinding['from']): Promise<LoupeFinding> => {
  const base = { from, head: subject.head, source: '', copy: '', colour: null, isFailed: false }
  try {
    const now = await $.clock.now()

    return { ...base, source: await sourceOf($, requestId, now), ...(await identify($, subject, now)) }
  } catch {
    return { ...base, kind: 'text', rows: [FAILED], tight: [FAILED], isFailed: true }
  }
}

const examine = async ($: EngineInterface, raw: string, requestId: string, from: LoupeFinding['from']): Promise<LoupeFinding> => {
  const subject = subjectOf(raw)
  const { ticket } = await update($, look, kept => ({ ...(kept ?? BLANK), ticket: (kept ?? BLANK).ticket + 1, isBusy: true, head: subject.head }))
  const finding = await resolve($, subject, requestId, from)
  if ((await read($, look)).ticket === ticket && (await read($, isOn))) await update($, look, kept => ({ ...(kept ?? BLANK), isBusy: false, finding }))

  return finding
}

const glimpse = async ($: EngineInterface): Promise<{ text: string; requestId: string } | undefined> => {
  try {
    const selection = await $.ui.selection()

    return typeof selection?.text === 'string' && selection.text.trim() !== '' ? { text: selection.text, requestId: selection.requestId ?? '' } : undefined
  } catch {
    return undefined
  }
}

const poll = async ($: EngineInterface): Promise<void> => {
  if (!(await read($, isOn)) || (await read($, look)).isBusy) return

  const picked = await glimpse($)
  const held = await read($, look)
  if (!(await read($, isOn)) || held.isBusy) return
  if (picked === undefined) {
    if (held.seen.text !== '' || held.finding?.from === 'selection') {
      await update($, look, kept => ({ ...(kept ?? BLANK), seen: BLANK.seen, finding: kept?.finding?.from === 'typed' ? kept.finding : null }))
    }

    return
  }
  if (picked.text === held.seen.text && picked.requestId === held.seen.requestId) return

  await update($, look, kept => ({ ...(kept ?? BLANK), seen: picked }))
  await examine($, picked.text, picked.requestId, 'selection')
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(POLL_MS, () => {
      void poll($).catch(() => undefined)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const lineOf = (finding: LoupeFinding): string =>
  [`${middle(finding.head, SAID_MAX)}: ${finding.kind}`, ...finding.rows, finding.source].filter(part => part !== '').join(' · ')

const clip = async ($: EngineInterface, text: string, surface: RenderSurface | undefined): Promise<string> => {
  try {
    const done = await $.ui.copy({ text, ...(surface === undefined ? {} : { surface }) })

    return done.isCopied ? `Copied ${middle(text, SAID_MAX)}` : `Could not copy: ${done.reason}`
  } catch (error) {
    return `Could not copy: ${error instanceof Error ? error.message : String(error)}`
  }
}

const pressCopy = async ($: EngineInterface, text: string, surface: RenderSurface): Promise<void> => {
  await $.ui.toast(await clip($, text, surface))
}

const seat = (node: RenderNode, button: RenderElement): RenderNode => {
  if (typeof node !== 'object') return node

  const { props, children } = node as { props?: { key?: unknown }; children?: RenderNode[] }
  if (props?.key === SEAT) return button

  return children === undefined ? node : ({ ...node, children: children.map(child => seat(child, button)) } as RenderElement)
}

const show = async (
  $: EngineInterface,
  { Box, Text, Button }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
  surface: RenderSurface,
  isFullscreen: boolean | undefined,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['loupe-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const isWide = inner >= WIDE
  const held = await read($, look)
  const { finding } = held

  if (held.isBusy && finding?.head !== held.head) {
    return $.widgets.card({
      beneath,
      width,
      title: 'Loupe',
      body: (
        <Box key="working" flexDirection="column">
          <Text key="head" bold wrap="truncate-end">
            {middle(held.head, inner)}
          </Text>
          <Text key="looking" dimColor wrap="truncate-end">
            looking…
          </Text>
        </Box>
      ),
    })
  }

  if (finding === null) {
    return $.widgets.card({
      beneath,
      width,
      title: 'Loupe',
      body: (
        <Box key="rest" flexDirection="column">
          {wrapped(isFullscreen === false ? WINDOWED : REST, inner).map((line, at) => (
            <Text key={`say-${at}`} wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Box>
      ),
    })
  }

  const { copy, colour } = finding
  const isLocated = finding.kind === 'symbol' && copy !== '' && copy !== finding.head
  const source = isWide ? finding.source : finding.source.slice(0, Math.max(0, finding.source.lastIndexOf(', ')))
  const swatch = colour === null ? undefined : await $.widgets.picture({ surface, key: 'loupe-swatch', columns: inner * 2, rows: SWATCH_ROWS, fill: colour, marks: [] })

  const card = await $.widgets.card({
    beneath,
    width,
    title: 'Loupe',
    note: finding.kind,
    body: (
      <Box key="finding" flexDirection="column">
        <Text key="head" bold wrap="truncate-end">
          {middle(finding.head, inner)}
        </Text>
        {swatch !== undefined && (
          <Box key="swatch" width={inner}>
            {swatch}
          </Box>
        )}
        {(isWide ? finding.rows : finding.tight).map((row, at) => (
          <Text key={`row-${at}`} wrap="truncate-end" color={finding.isFailed ? 'red' : undefined}>
            {isLocated && at === 0 ? middle(row, inner) : cut(row, inner)}
          </Text>
        ))}
        {source !== '' && (
          <Text key="source" dimColor wrap="truncate-end">
            {cut(source, inner)}
          </Text>
        )}
        {copy !== '' && <Box key={SEAT} />}
      </Box>
    ),
  })
  if (copy === '') return card

  return seat(card, <Button plain key="copy" label={isWide ? middle(`copy ${copy}`, inner) : 'copy'} onPress={press => pressCopy($, copy, press.surface)} />) as RenderElement
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'loupe-widget',
      description: 'Toggle the Loupe card, or look up a text',
      argumentHint: '[on|off|look [text]|copy]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'loupe-widget' }, async ($, e) => {
    const typed = e.args.trim()
    const verb = (typed.split(/\s/)[0] ?? '').toLowerCase()
    const rest = typed.slice(verb.length).trim()

    if (verb === 'look' || (verb === 'copy' && rest === '')) {
      if (!(await read($, isOn))) return { text: OFF }
      if (verb === 'copy') {
        const value = (await read($, look)).finding?.copy ?? ''
        const said = value === '' ? 'Nothing to copy.' : await clip($, value, undefined)

        return { text: said.startsWith('Copied ') ? `${said}.` : said }
      }

      const picked = rest === '' ? await glimpse($) : { text: rest, requestId: '' }
      if (picked === undefined) return { text: e.presentation.isFullscreen === false ? UNSEEN : NOTHING }

      return { text: lineOf(await examine($, picked.text, picked.requestId, rest === '' ? 'selection' : 'typed')) }
    }

    const arg = typed.toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) {
      await update($, look, kept => ({ ...BLANK, ticket: (kept ?? BLANK).ticket }))
      await update($, calls, () => ({}))
    }
    await sync($)

    return { text: isShown ? 'Loupe on; /widgets places it.' : 'Loupe off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) {
      const at = await $.clock.now()
      await update($, calls, kept => Object.fromEntries([...Object.entries(kept ?? {}), [e.tool_use_id, { tool: e.tool, at }] as const].slice(-CALLS_MAX)))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns, e.surface, e.viewport?.isFullscreen),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns, e.surface, e.viewport?.isFullscreen),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80, e.surface, e.viewport?.isFullscreen),
  )
}

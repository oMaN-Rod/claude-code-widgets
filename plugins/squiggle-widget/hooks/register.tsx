import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, FsEntry, PluginState, PromptBox, PromptDecoration, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Index = PluginState['squiggle-widget']['index']
type Verdict = PluginState['squiggle-widget']['found'][number]
type Listing = { source: Index['source']; paths: string[]; isPartial: boolean }
type Spot = { start: number; end: number; word: string }
type Sight = { verdicts: Verdict[]; marks: PromptDecoration[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LABEL_COLUMNS = 30
const FRAME_COLUMNS = 4
const TITLE = 'Squiggle'
const USAGE = 'Usage: /squiggle-widget [on|off|check [text]]'
const OFF = 'Squiggle is off.'
const EMPTY = 'Type a file name in your prompt: it lights up if it exists.'
const READING = 'Reading the file list.'
const FAILED = "Could not list this project's files. Nothing is checked."
const PARTIAL = 'Partial list: misses not marked.'
const PARTIAL_BRIEF = 'Partial list.'
const NO_NAME = 'No file name in that text.'
const LS_FILES = ['git', '--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard']
const WRITERS: readonly string[] = ['Write', 'Edit', 'NotebookEdit', 'Bash', 'PowerShell']
const LIST_MS = 3000
const PATHS = 10_000
const WALK_FILES = 2000
const WALK_FOLDERS = 200
const CHECKED = 8
const SHOWN = 4
const NEAR = 2
const STEM = 4
const COMPARISONS = 2000
const JUDGED = 500
const NOWHERE = -1
const LEAD = /^[@(["'`<]+/
const TAIL = /[)\]"'`>,;:!?.]+$/
const LINE = /:\d+(?::\d+)?$/
const BARRED = /:\/\/|[*?{$]|(?:^|\/)\.\.(?:\/|$)/
const ROOTED = /^(?:\/|~|www\.|[a-z]:)/i
const UNBUILT: Index = { status: 'building', source: 'git', count: 0, isPartial: false, isStale: false, builtAt: 0 }
const BLANK: PromptBox = { text: '', cursor: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'squiggle-widget', key: 'isOn' } as const, false)
const index = atom({ plugin: 'squiggle-widget', key: 'index' } as const, UNBUILT)
const paths = atom({ plugin: 'squiggle-widget', key: 'paths' } as const, [])
const found = atom({ plugin: 'squiggle-widget', key: 'found' } as const, [])
const lookup = {
  tag: NOWHERE,
  folders: new Set<string>(),
  extensions: new Set<string>(),
  names: new Map<string, string[]>(),
  lowered: new Map<string, string[]>(),
  judged: new Map<string, Verdict | null>(),
}

const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')

  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

const stemOf = (name: string): number => {
  const dot = name.lastIndexOf('.')

  return dot > 0 ? dot : name.length
}

const filed = (held: Map<string, string[]>, name: string, path: string): void => {
  const known = held.get(name)
  if (known === undefined) held.set(name, [path])
  else known.push(path)
}

const learn = (listed: readonly string[], tag: number): void => {
  for (const held of [lookup.folders, lookup.extensions, lookup.names, lookup.lowered, lookup.judged]) held.clear()
  const named = (path: string): string => {
    const name = baseOf(path)
    filed(lookup.names, name, path)
    filed(lookup.lowered, name.toLowerCase(), path)

    return name
  }
  const seen = new Set<string>()

  for (const path of listed) {
    const extension = extensionOf(named(path))
    if (extension !== '') lookup.extensions.add(extension)
    for (let cut = path.lastIndexOf('/'); cut > 0; cut = path.lastIndexOf('/', cut - 1)) {
      const parent = path.slice(0, cut)
      if (seen.has(parent)) break
      seen.add(parent)
      lookup.folders.add(named(parent))
    }
  }
  lookup.tag = tag
}

const distance = (one: string, other: string): number => {
  let row = Array.from({ length: other.length + 1 }, (_, at) => at)
  for (let i = 1; i <= one.length; i += 1) {
    const next = [i]
    for (let j = 1; j <= other.length; j += 1) {
      next[j] = Math.min((next[j - 1] ?? 0) + 1, (row[j] ?? 0) + 1, (row[j - 1] ?? 0) + (one[i - 1] === other[j - 1] ? 0 : 1))
    }
    row = next
  }

  return row[other.length] ?? 0
}

const nearest = (word: string): string => {
  const name = baseOf(word).toLowerCase()
  let best = ''
  let least = NEAR
  let compared = 0

  for (const [other, held] of lookup.lowered) {
    if (Math.abs(other.length - name.length) > NEAR) continue
    if (compared === COMPARISONS) break
    compared += 1
    const far = distance(name, other)
    if (far > least || (far > 0 && Math.min(stemOf(name), stemOf(other)) < STEM)) continue
    for (const path of held) {
      if (best === '' || far < least || path.length < best.length || (path.length === best.length && path < best)) best = path
      least = far
    }
  }

  return best
}

const judge = (word: string): Verdict | null => {
  const known = lookup.judged.get(word)
  if (known !== undefined) return known

  const matches = (lookup.names.get(baseOf(word)) ?? []).filter(path => path === word || path.endsWith(`/${word}`))
  const [only = ''] = matches
  const near = matches.length === 0 ? nearest(word) : ''
  const verdict: Verdict | null =
    matches.length > 0
      ? { word, verdict: 'found', to: matches.length === 1 ? only : '', matches: matches.length }
      : near === '' && !word.includes('/')
        ? null
        : { word, verdict: 'missing', to: near, matches: 0 }
  if (lookup.judged.size >= JUDGED) lookup.judged.clear()
  lookup.judged.set(word, verdict)

  return verdict
}

const spot = (text: string): Spot[] => {
  const spots: Spot[] = []
  const words = new Set<string>()

  for (const token of text.matchAll(/\S+/g)) {
    const lead = LEAD.exec(token[0])?.[0].length ?? 0
    const bare = token[0].slice(lead).replace(TAIL, '').replace(LINE, '').replace(TAIL, '')
    const flat = bare.replaceAll('\\', '/')
    const word = flat.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '')
    if (word === '' || BARRED.test(flat) || ROOTED.test(flat)) continue

    const slash = word.indexOf('/')
    if (slash < 0 ? !lookup.extensions.has(extensionOf(word)) : !lookup.folders.has(word.slice(0, slash))) continue
    if (!words.has(word) && words.size === CHECKED) continue
    words.add(word)
    spots.push({ start: token.index + lead, end: token.index + lead + bare.length, word })
  }

  return spots
}

const scan = (text: string, cursor: number, isPartial: boolean): Sight => {
  const verdicts = new Map<string, Verdict>()
  const marks: PromptDecoration[] = []

  for (const { start, end, word } of spot(text)) {
    const verdict = judge(word)
    if (verdict === null) continue
    if (verdict.verdict === 'missing' && (isPartial || (start <= cursor && cursor <= end))) continue
    marks.push(verdict.verdict === 'found' ? { start, end, color: 'green' } : { start, end, color: 'red', underline: true })
    if (!verdicts.has(word)) verdicts.set(word, verdict)
  }

  return { verdicts: [...verdicts.values()], marks }
}

const wrapped = (sentence: string, columns: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const last = rows.at(-1)

    return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
  }, [])

const tally = (count: number): string => plural(count, 'file').replace(/\B(?=(\d{3})+\b)/g, ',')

const lineOf = ({ word, verdict, to, matches }: Verdict): string => {
  if (verdict === 'missing') return `✗ ${word}  no such file${to === '' ? '' : `, nearest: ${to}`}`

  return matches > 1 ? `✓ ${word}  ${plural(matches, 'file')}` : `✓ ${to}`
}

const noteOf = (held: Index, verdicts: readonly Verdict[], room: number): string => {
  const missing = verdicts.filter(row => row.verdict === 'missing').length
  const [full, brief] =
    held.status === 'building'
      ? ['indexing', 'listing']
      : held.status === 'failed'
        ? ['unchecked', 'failed']
        : held.isPartial
          ? ['partial', 'partial']
          : missing > 0
            ? [`${missing} missing`, `${missing} ✗`]
            : verdicts.length > 0
              ? [`${verdicts.length} found`, `${verdicts.length} found`]
              : [tally(held.count), tally(held.count).split(' ')[0] ?? '']

  return full.length <= room ? full : brief
}

const draft = async ($: EngineInterface): Promise<PromptBox> => {
  try {
    const box: PromptBox | undefined = await $.prompt.read()

    return typeof box?.text === 'string' ? box : BLANK
  } catch {
    return BLANK
  }
}

const opened = async ($: EngineInterface, path: string): Promise<FsEntry[] | null> => {
  try {
    return await $.fs.list(path)
  } catch {
    return null
  }
}

const walk = async ($: EngineInterface): Promise<Listing | null> => {
  const root = (await $.session.cwd()).replaceAll('\\', '/').replace(/\/+$/, '')
  const queue = ['']
  const listed: string[] = []
  let folders = 0

  for (let inside = queue.shift(); inside !== undefined; inside = queue.shift()) {
    if (folders === WALK_FOLDERS) return { source: 'folder', paths: listed, isPartial: true }
    folders += 1
    const entries = await opened($, inside === '' ? root : `${root}/${inside}`)
    if (entries === null && inside === '') return null

    for (const entry of entries ?? []) {
      const name = baseOf(entry.name.replaceAll('\\', '/'))
      if (name === '' || name.startsWith('.') || name === 'node_modules') continue
      const path = inside === '' ? name : `${inside}/${name}`
      if (entry.kind === 'dir') queue.push(path)
      else if (listed.length === WALK_FILES) return { source: 'folder', paths: listed, isPartial: true }
      else listed.push(path)
    }
  }

  return { source: 'folder', paths: listed, isPartial: false }
}

const list = async ($: EngineInterface): Promise<Listing | null> => {
  try {
    const repo = await $.session.repo()
    if (repo === null) return await walk($)

    const ran = await $.process.run(LS_FILES, { cwd: repo.root, timeoutMs: LIST_MS })
    if (ran.exitCode !== 0) return null
    const lines = ran.stdout.split('\n')
    const whole = (ran.isStdoutTruncated ? lines.slice(0, -1) : lines).map(line => line.trim()).filter(line => line !== '')

    return { source: 'git', paths: whole.slice(0, PATHS), isPartial: ran.isStdoutTruncated || whole.length > PATHS }
  } catch {
    return null
  }
}

const build = async ($: EngineInterface): Promise<void> => {
  const before = await read($, index)
  if (before.status !== 'ready') await update($, index, () => ({ ...UNBUILT, builtAt: before.builtAt }))
  const listed = await list($)
  if (!(await read($, isOn))) return

  const builtAt = Math.max(await $.clock.now(), before.builtAt + 1)
  if (listed === null) {
    await update($, paths, () => [])
    await update($, found, () => [])
    await update($, index, () => ({ ...UNBUILT, status: 'failed' as const, builtAt }))

    return
  }
  await update($, paths, () => listed.paths)
  await update($, index, () => ({ status: 'ready' as const, source: listed.source, count: listed.paths.length, isPartial: listed.isPartial, isStale: false, builtAt }))
}

const ready = async ($: EngineInterface): Promise<Index> => {
  const held = await read($, index)
  if (held.status === 'ready' && lookup.tag !== held.builtAt) learn(await read($, paths), held.builtAt)

  return held
}

const keep = async ($: EngineInterface, verdicts: Verdict[]): Promise<void> => {
  if (JSON.stringify(await read($, found)) !== JSON.stringify(verdicts)) await update($, found, () => verdicts)
}

const refill = async ($: EngineInterface): Promise<void> => {
  const held = await ready($)
  if (held.status !== 'ready') return

  const box = await draft($)
  await keep($, scan(box.text, box.cursor, held.isPartial).verdicts)
}

const reset = async ($: EngineInterface): Promise<void> => {
  await update($, index, () => UNBUILT)
  await update($, paths, () => [])
  await update($, found, () => [])
  learn([], NOWHERE)
}

const check = async ($: EngineInterface, text: string): Promise<string> => {
  const before = await read($, index)
  if (before.isStale || before.status === 'failed') await build($)
  const held = await ready($)
  if (held.status !== 'ready') return held.status === 'building' ? READING : FAILED

  const lines = scan(text === '' ? (await draft($)).text : text, NOWHERE, held.isPartial).verdicts.map(lineOf)

  return [`${TITLE}: ${tally(held.count)}.`, ...(lines.length === 0 ? [NO_NAME] : lines), ...(held.isPartial ? [PARTIAL] : [])].join('\n')
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

  const width = fit((await $.state.get(widths)).value?.['squiggle-widget'] ?? CARD_COLUMNS, columns)
  const held = await read($, index)
  const verdicts = held.status === 'ready' ? await read($, found) : []
  const rows = [...verdicts.filter(row => row.verdict === 'missing'), ...verdicts.filter(row => row.verdict === 'found')]
  const sentence = held.status === 'building' ? READING : held.status === 'failed' ? FAILED : EMPTY

  return $.widgets.card({
    beneath,
    width,
    title: TITLE,
    note: noteOf(held, verdicts, width - FRAME_COLUMNS - TITLE.length - 1),
    body:
      rows.length === 0 ? (
        <Box key="empty" flexDirection="column">
          {wrapped(sentence, width - FRAME_COLUMNS).map(row => (
            <Text key={row} dimColor wrap="truncate-end">
              {row}
            </Text>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column">
          {rows.slice(0, SHOWN).map((row, at) => (
            <Box key={row.word} flexDirection="column">
              <Box key={`row-${at}`}>
                <Box flexShrink={0}>
                  <Text color={row.verdict === 'missing' ? 'red' : 'green'}>{row.verdict === 'missing' ? '✗ ' : '✓ '}</Text>
                </Box>
                {row.verdict === 'found' && row.matches === 1 ? (
                  <Text wrap="truncate-start">{row.to}</Text>
                ) : (
                  <Text wrap="truncate-end">{row.word}</Text>
                )}
                {row.matches > 1 && (
                  <Box flexShrink={0}>
                    <Text dimColor>{`  ${plural(row.matches, 'file')}`}</Text>
                  </Box>
                )}
              </Box>
              {row.verdict === 'missing' && row.to !== '' && (
                <Box key={`near-${at}`}>
                  <Box flexShrink={0}>
                    <Text dimColor>{width < LABEL_COLUMNS ? '  ' : '  nearest '}</Text>
                  </Box>
                  <Text dimColor wrap="truncate-start">
                    {row.to}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
          {rows.length > SHOWN && (
            <Box key="more">
              <Text dimColor wrap="truncate-end">{`+${rows.length - SHOWN} more`}</Text>
            </Box>
          )}
          {held.isPartial && (
            <Box key="partial">
              <Text dimColor wrap="truncate-end">{width - FRAME_COLUMNS < PARTIAL.length ? PARTIAL_BRIEF : PARTIAL}</Text>
            </Box>
          )}
        </Box>
      ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'squiggle-widget',
      description: 'Toggle the Squiggle card, or check a text for file names',
      argumentHint: '[on|off|check [text]]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if (await read($, isOn)) {
      await build($)
      await refill($)
    }

    return next(e)
  })

  on('command.run', { command: 'squiggle-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (/^check(?:\s|$)/.test(arg)) return { text: (await read($, isOn)) ? await check($, e.args.trim().slice('check'.length).trim()) : OFF }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) {
      await build($)
      await refill($)
    } else {
      await reset($)
    }

    return { text: isShown ? 'Squiggle on; /widgets places it.' : 'Squiggle off.' }
  })

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    if (!(await read($, isOn))) return r

    try {
      const held = await ready($)
      if (held.status !== 'ready') return r

      const { verdicts, marks } = scan(r.text, r.cursor, held.isPartial)
      await keep($, verdicts)

      return marks.length === 0 ? r : { ...r, decorations: [...(r.decorations ?? []), ...marks] }
    } catch {
      return r
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (['composer', 'bridge', 'sdk'].includes(e.origin.kind) && (await read($, isOn))) await keep($, [])

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!WRITERS.includes(e.tool) || ran.deny !== undefined || ran.isError === true || !(await read($, isOn))) return ran
    if (!(await read($, index)).isStale) await update($, index, held => ({ ...(held ?? UNBUILT), isStale: true }))

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if ((await read($, isOn)) && (await read($, index)).isStale) {
      await build($)
      await refill($)
    }

    return done
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

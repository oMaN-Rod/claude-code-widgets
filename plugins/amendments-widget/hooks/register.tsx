import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, PromptComposeInput, PromptComposeResult, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Held = PluginState['amendments-widget']['held']
type Report = PluginState['amendments-widget']['report']
type Row = Report['rows'][number]
type Texts = Readonly<Record<string, string>>
type Shot = { version: string; at: number; texts: Record<string, string> }
type Book = { now: Shot; before: Shot | null; loose: string[] }
type Shelf = { last: string; books: Record<string, Book> }
type Edit = { mark: ' ' | '-' | '+'; text: string }
type Line = { key: string; text: string; isDim: boolean }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const WIDE_COLUMNS = 30
const MAX_ROWS = 6
const MAX_BOOKS = 4
const MAX_CELLS = 250_000
const MAX_LINES = 200
const CONTEXT = 2
const FILE = 'amendments.json'
const USAGE = 'Usage: /amendments-widget [on|off|show [n]|clear]'
const VERBS = ['', 'on', 'off', 'show', 'clear']
const WHOLE = /^0*([1-9]\d{0,5})$/
const SECONDS = /^\d+s$/
const OPENERS = ['intro', 'lean_body', 'bare']
const EMPTY = 'No baseline yet. After your next turn what Claude Code tells Claude is saved, and each update is compared with it.'
const AGAIN = '/amendments-widget clear starts again.'
const FAULTS = { read: 'The snapshot file could not be read.', write: 'The snapshot file could not be written.' } as const
const NOTES = { none: undefined, new: 'new', baseline: 'baseline', same: 'unchanged', changed: undefined, fault: 'error' } as const
const COMPARED = 'Compared: shared sections and built-in tool descriptions as the engine wrote them, against the version last run here.'
const CLEARED = 'Amendments cleared. A new baseline is taken at your next turn.'
const REST_HELD: Held = { key: '', texts: {} }
const REST_REPORT: Report = { kind: 'none', version: '', since: '', age: '', sections: 0, tools: 0, rows: [], fault: '' }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'amendments-widget', key: 'isOn' } as const, false)
const held = atom({ plugin: 'amendments-widget', key: 'held' } as const, REST_HELD)
const report = atom({ plugin: 'amendments-widget', key: 'report' } as const, REST_REPORT)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isShot = (value: unknown): value is Shot =>
  isRecord(value) &&
  typeof value.version === 'string' &&
  typeof value.at === 'number' &&
  isRecord(value.texts) &&
  Object.values(value.texts).every(text => typeof text === 'string')

const isBook = (value: unknown): value is Book =>
  isRecord(value) &&
  isShot(value.now) &&
  (value.before === null || isShot(value.before)) &&
  Array.isArray(value.loose) &&
  value.loose.every(id => typeof id === 'string')

const isShelf = (value: unknown): value is Shelf =>
  isRecord(value) && typeof value.last === 'string' && isRecord(value.books) && Object.values(value.books).every(isBook)

const cut = (text: string, room: number): string => {
  const letters = [...text]

  return letters.length <= room ? text : `${letters.slice(0, Math.max(0, room - 1)).join('')}…`
}

const isSection = (id: string): boolean => id.startsWith('s/')

const labelled = (id: string): string => (isSection(id) ? id.slice(2) : `${id.slice(2)} tool`)

const counted = (texts: Texts): string =>
  `${plural(Object.keys(texts).filter(isSection).length, 'section')}, ${plural(Object.keys(texts).filter(id => !isSection(id)).length, 'tool')}`

const lines = (text: string | undefined): string[] => (text === undefined || text === '' ? [] : text.split('\n'))

const marked = (texts: readonly string[], mark: Edit['mark']): Edit[] => texts.map(text => ({ mark, text }))

const middle = (old: readonly string[], fresh: readonly string[]): Edit[] => {
  if (old.length * fresh.length > MAX_CELLS) return [...marked(old, '-'), ...marked(fresh, '+')]

  const wide = fresh.length + 1
  const table = new Uint16Array((old.length + 1) * wide)
  for (let row = old.length - 1; row >= 0; row -= 1) {
    for (let column = fresh.length - 1; column >= 0; column -= 1) {
      table[row * wide + column] =
        old[row] === fresh[column]
          ? (table[(row + 1) * wide + column + 1] ?? 0) + 1
          : Math.max(table[(row + 1) * wide + column] ?? 0, table[row * wide + column + 1] ?? 0)
    }
  }

  const edits: Edit[] = []
  let row = 0
  let column = 0
  while (row < old.length && column < fresh.length) {
    if (old[row] === fresh[column]) {
      edits.push({ mark: ' ', text: old[row] ?? '' })
      row += 1
      column += 1
    } else if ((table[(row + 1) * wide + column] ?? 0) >= (table[row * wide + column + 1] ?? 0)) {
      edits.push({ mark: '-', text: old[row] ?? '' })
      row += 1
    } else {
      edits.push({ mark: '+', text: fresh[column] ?? '' })
      column += 1
    }
  }

  return [...edits, ...marked(old.slice(row), '-'), ...marked(fresh.slice(column), '+')]
}

const diff = (before: readonly string[], after: readonly string[]): Edit[] => {
  const short = Math.min(before.length, after.length)
  let head = 0
  while (head < short && before[head] === after[head]) head += 1
  let tail = 0
  while (tail < short - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1

  return [
    ...marked(before.slice(0, head), ' '),
    ...middle(before.slice(head, before.length - tail), after.slice(head, after.length - tail)),
    ...marked(before.slice(before.length - tail), ' '),
  ]
}

const tally = (edits: readonly Edit[]): string =>
  `+${edits.filter(edit => edit.mark === '+').length} -${edits.filter(edit => edit.mark === '-').length}`

const excerpt = (edits: readonly Edit[]): string[] => {
  const isShown = edits.map((_, at) => edits.slice(Math.max(0, at - CONTEXT), at + CONTEXT + 1).some(edit => edit.mark !== ' '))
  const printed: string[] = []
  edits.forEach((edit, at) => {
    if (isShown[at] !== true) return
    if (printed.length > 0 && isShown[at - 1] !== true) printed.push('…')
    printed.push(`${edit.mark} ${edit.text}`)
  })

  return printed
}

const fact = (id: string, before: string | undefined, now: string | undefined): string => {
  if (before === now) return ''
  if (before === undefined || now === undefined) return isSection(id) ? (before === undefined ? 'new' : 'dropped') : ''

  return tally(diff(lines(before), lines(now)))
}

const amended = (book: Book): Row[] => {
  const before = book.before?.texts
  if (before === undefined) return []

  return [...new Set([...Object.keys(book.now.texts), ...Object.keys(before)])]
    .filter(id => !book.loose.includes(id))
    .sort()
    .map(id => ({ id, label: labelled(id), fact: fact(id, before[id], book.now.texts[id]) }))
    .filter(row => row.fact !== '')
}

const reported = (book: Book | undefined, at: number, running: string): Report => {
  if (book === undefined) return REST_REPORT
  if (running !== '' && running !== book.now.version) return { ...REST_REPORT, kind: 'new', version: running, since: book.now.version }

  const keys = Object.keys(book.now.texts)
  const sections = keys.filter(isSection).length
  const based = { ...REST_REPORT, version: book.now.version, sections, tools: keys.length - sections }
  if (book.before === null) return { ...based, kind: 'baseline' }

  const rows = amended(book)

  return { ...based, kind: rows.length === 0 ? 'same' : 'changed', since: book.before.version, age: span(at - book.now.at), rows }
}

const merged = (book: Book | undefined, texts: Texts, version: string, at: number): Book | undefined => {
  if (book === undefined) return { now: { version, at, texts: { ...texts } }, before: null, loose: [] }

  const isSided = Object.keys(texts).some(isSection)
  if (book.now.version !== version) {
    return isSided
      ? { now: { version, at, texts: { ...texts } }, before: book.now, loose: book.loose.filter(id => id in texts || id in book.now.texts) }
      : undefined
  }

  const kept = { ...book.now.texts }
  const loose = new Set(book.loose)
  for (const [id, text] of Object.entries(texts)) {
    if (kept[id] === undefined && !isSection(id)) kept[id] = text
    else if (kept[id] !== text) loose.add(id)
  }
  if (isSided) for (const id of Object.keys(kept)) if (isSection(id) && texts[id] === undefined) loose.add(id)

  return { now: { ...book.now, texts: kept }, before: book.before, loose: [...loose] }
}

const pruned = (books: Record<string, Book>): Record<string, Book> =>
  Object.keys(books).length <= MAX_BOOKS
    ? books
    : Object.fromEntries(
        Object.entries(books)
          .sort(([, one], [, other]) => other.now.at - one.now.at)
          .slice(0, MAX_BOOKS),
      )

const keyed = (e: PromptComposeInput): string => [e.promptModel, [...e.traits].sort().join('+'), e.outputStyle?.name ?? ''].join('|')

const sectioned = (answer: PromptComposeResult): Record<string, string> | undefined =>
  OPENERS.includes(answer.sections[0]?.id ?? '')
    ? Object.fromEntries(
        answer.sections
          .filter(section => section.scope === 'shared' && !section.id.includes(':') && typeof section.text === 'string')
          .map(section => [`s/${section.id}`, section.text]),
      )
    : undefined

const own = <Answer,>(trace: readonly { plugin: string; returned: Answer | undefined }[] | undefined, answer: Answer): Answer => {
  const links: readonly { plugin: string; returned: Answer | undefined }[] = Array.isArray(trace) ? trace : []

  return links.find(link => link.plugin === 'engine')?.returned ?? answer
}

const wrapped = (text: string, room: number): string => {
  const rows: string[] = []
  let row: string[] = []
  for (const word of text.split(' ')) {
    let letters = [...word]
    if (row.length > 0 && row.length + 1 + letters.length <= room) {
      row = [...row, ' ', ...letters]
      continue
    }
    if (row.length > 0) rows.push(row.join(''))
    while (letters.length > room) {
      rows.push(letters.slice(0, room).join(''))
      letters = letters.slice(room)
    }
    row = letters
  }

  return [...rows, row.join('')].join('\n')
}

const versions = (before: string, now: string, room: number): string => {
  const spaced = `${before} → ${now}`
  if (spaced.length <= room) return spaced

  const left = room - now.length - 1
  const half = Math.floor((room - 1) / 2)

  return left >= 2 ? `${cut(before, left)}→${now}` : `${cut(before, half)}→${cut(now, room - 1 - Math.min(half, before.length))}`
}

const line = (key: string, text: string, isDim = false): Line => ({ key, text, isDim })

const written = ({ kind, version, since, age, sections, tools, rows, fault }: Report, isWide: boolean, inner: number): Line[] => {
  const count = line('count', `${plural(sections, 'section')}, ${plural(tools, 'tool')}`)
  if (kind === 'none') return [line('empty', EMPTY, true)]
  if (kind === 'fault') return [line('said', FAULTS[fault === 'write' ? 'write' : 'read']), line('next', isWide ? AGAIN : 'clear starts again.')]
  if (kind === 'new') return [line('said', `${version} is new here (was ${since}).`), line('next', 'Compared after your next turn.')]
  if (kind === 'baseline') return [count, line('said', `Baseline taken at ${version}. The next update is compared with it.`)]
  if (kind === 'same') return [count, line('said', `No change since ${since}.`), line('age', SECONDS.test(age) ? `${version} here since just now` : `${version} here for ${age}`, true)]

  const folded = rows.length - MAX_ROWS

  return [
    ...(folded > 0 ? [line('more', cut(isWide ? `… ${folded} more in show` : `… ${folded} more`, inner), true)] : []),
    line('versions', versions(since, version, inner), true),
    line('hint', isWide ? 'show <n>: before and after' : 'show <n>', true),
  ]
}

const opened = async ($: EngineInterface): Promise<Shelf | null> => {
  const path = `${$.plugin.root}/${FILE}`
  if (!(await $.fs.exists(path))) return { last: '', books: {} }

  try {
    const parsed: unknown = JSON.parse(await $.fs.read(path))

    return isShelf(parsed) ? parsed : null
  } catch {
    return null
  }
}

const faulted = async ($: EngineInterface, fault: 'read' | 'write'): Promise<string> => {
  await update($, report, (): Report => ({ ...REST_REPORT, kind: 'fault', fault }))

  return `${FAULTS[fault]} ${AGAIN}`
}

const look = async ($: EngineInterface): Promise<void> => {
  try {
    const { version } = await $.session.version()
    const shelf = await opened($)
    if (shelf === null) {
      await faulted($, 'read')

      return
    }

    const book = shelf.books[(await read($, held)).key || shelf.last]
    const at = await $.clock.now()
    await update($, report, () => reported(book, at, version))
  } catch {
    await update($, report, () => REST_REPORT)
  }
}

const flush = async ($: EngineInterface): Promise<void> => {
  const { key, texts } = await read($, held)
  if (key === '' || Object.keys(texts).length === 0) return

  try {
    const { version } = await $.session.version()
    const at = await $.clock.now()
    const shelf = await opened($)
    if (shelf === null) {
      await faulted($, 'read')

      return
    }

    const book = merged(shelf.books[key], texts, version, at)
    const made: Shelf = { last: key, books: pruned(book === undefined ? shelf.books : { ...shelf.books, [key]: book }) }
    const text = JSON.stringify(made)
    if (text !== JSON.stringify(shelf)) {
      try {
        await $.fs.write(`${$.plugin.root}/${FILE}`, text)
      } catch {
        await faulted($, 'write')

        return
      }
    }

    await update($, held, kept => ({
      key: kept?.key ?? key,
      texts: Object.fromEntries(Object.entries(kept?.texts ?? {}).filter(([id, later]) => texts[id] !== later)),
    }))
    await update($, report, () => reported(made.books[key], at, ''))
  } catch {
    // A flush that cannot run keeps what is held for the next turn.
  }
}

const wipe = async ($: EngineInterface): Promise<string> => {
  await update($, held, () => REST_HELD)
  try {
    await $.fs.write(`${$.plugin.root}/${FILE}`, JSON.stringify({ last: '', books: {} } satisfies Shelf))
  } catch {
    return faulted($, 'write')
  }
  await update($, report, () => REST_REPORT)

  return CLEARED
}

const detailed = (book: Book, rows: readonly Row[], wanted: number): string => {
  const row = rows[wanted - 1]
  if (row === undefined || book.before === null) return `No amendment ${wanted}. There are ${rows.length}.`

  const printed = excerpt(diff(lines(book.before.texts[row.id]), lines(book.now.texts[row.id])))
  const left = printed.length - MAX_LINES

  return [
    `${wanted} ${row.label}: ${row.fact}, ${book.before.version} → ${book.now.version}`,
    ...printed.slice(0, MAX_LINES),
    ...(left > 0 ? [`… ${plural(left, 'more line')}`] : []),
  ].join('\n')
}

const told = async ($: EngineInterface, wanted: number): Promise<string> => {
  const shelf = await opened($)
  if (shelf === null) return `${FAULTS.read} ${AGAIN}`

  const key = (await read($, held)).key || shelf.last
  const book = shelf.books[key]
  if (book === undefined) return 'No baseline yet.'

  const rows = amended(book)
  if (wanted > 0) return detailed(book, rows, wanted)
  if (book.before === null) return `Baseline taken at ${book.now.version}: ${counted(book.now.texts)}. Nothing to compare yet.`

  const name = key.replace(/\|+$/, '')

  return [
    rows.length === 0
      ? `No change since ${book.before.version} (${name}).`
      : `${book.before.version} → ${book.now.version} (${name}): ${plural(rows.length, 'amendment')}`,
    ...rows.map((row, at) => `${at + 1}  ${row.label}  ${row.fact}`),
    ...(book.loose.length === 0 ? [] : [`Left out, varies within one build: ${[...book.loose].sort().map(labelled).join(', ')}`]),
    COMPARED,
  ].join('\n')
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

  const width = fit((await $.state.get(widths)).value?.['amendments-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - CARD_FRAME
  const isWide = width >= WIDE_COLUMNS
  const drawn = await read($, report)
  const rows = drawn.kind === 'changed' ? drawn.rows : []
  const note = drawn.kind !== 'changed' ? (isWide ? NOTES[drawn.kind] : undefined) : isWide ? plural(rows.length, 'amendment') : String(rows.length)

  return $.widgets.card({
    beneath,
    width,
    title: 'Amendments',
    ...(note === undefined ? {} : { note }),
    body: (
      <Box flexDirection="column">
        {rows.slice(0, MAX_ROWS).map((row, at) => (
          <Box key={`row:${at + 1}`} justifyContent="space-between">
            <Box key={`label:${at + 1}`}>
              <Text wrap="truncate-end">{cut(`${at + 1} ${row.label}`, inner - row.fact.length - 1)}</Text>
            </Box>
            <Box key={`fact:${at + 1}`} flexShrink={0}>
              <Text dimColor>{row.fact}</Text>
            </Box>
          </Box>
        ))}
        {written(drawn, isWide, inner).map(({ key, text, isDim }) => (
          <Box key={key}>
            <Text dimColor={isDim}>{wrapped(text, inner)}</Text>
          </Box>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'amendments-widget',
      description: 'Toggle the Amendments card, show what changed or clear its snapshots',
      argumentHint: '[on|off|show [n]|clear]',
    })
    if ((await $.store.get('isOn')) === true) {
      await update($, isOn, () => true)
      await look($)
    }

    return next(e)
  })

  on('command.run', { command: 'amendments-widget' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = verb.toLowerCase()
    const wanted = arg === 'show' && rest.length === 1 ? Number(WHOLE.exec(rest[0] ?? '')?.[1] ?? 0) : 0
    if (!VERBS.includes(arg) || rest.length > (arg === 'show' ? 1 : 0) || (rest.length === 1 && wanted === 0)) return { text: USAGE }

    if (arg === 'show' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: 'Amendments is off.' }

      return { text: arg === 'clear' ? await wipe($) : await told($, wanted) }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await look($)
    else {
      await update($, held, () => REST_HELD)
      await update($, report, () => REST_REPORT)
    }

    return { text: isShown ? 'Amendments on; /widgets places it.' : 'Amendments off.' }
  })

  on('prompt.compose', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const answer = await next(e)
    try {
      if (e.traits.includes('teammate') || e.traits.includes('analysis') || (await read($, held)).key !== '') return answer

      const sections = sectioned(own(next.trace, answer))
      if (sections !== undefined) {
        const key = keyed(e)
        await update($, held, kept => ((kept?.key ?? '') === '' ? { key, texts: { ...kept?.texts, ...sections } } : (kept ?? REST_HELD)))
      }
    } catch {
      // A capture that fails must not cost Claude the prompt it was given.
    }

    return answer
  })

  on('tool.describe', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const answer = await next(e)
    try {
      const text = own(next.trace, answer).description
      if (e.provider.plugin === 'engine' && typeof text === 'string') {
        await update($, held, kept => ({ key: kept?.key ?? '', texts: { ...kept?.texts, [`t/${e.tool}`]: text } }))
      }
    } catch {
      // A capture that fails must not cost Claude the description it was given.
    }

    return answer
  })

  on('turn.complete', async ($, e, next) => {
    if (await read($, isOn)) await flush($)

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

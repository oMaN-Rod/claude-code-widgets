import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, TurnStepChunk, TurnStepToolChunk } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Held = PluginState['pen-widget']['pen']
type Call = NonNullable<Held>
type Fields = { path: string; text: string }
type Reader = {
  id: string
  tool: string
  index: number
  fields: Fields
  phase: Call['phase']
  depth: number
  isInString: boolean
  isKey: boolean
  isKeyNext: boolean
  key: string
  field: 'path' | 'text' | ''
  escape: string
  high: string
  path: string
  newlines: number
  chars: number
  pieces: number
  done: string[]
  line: string
  room: number
  isInked: boolean
  hasLetter: boolean
}
type Desk = { isReading: boolean; copiedAt: number; flips: number; version: number; reader?: Reader }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const HEAD_COLUMNS = 30
const TAIL_ROWS = 5
const LINE_LETTERS = 120
const PATH_LETTERS = 200
const KEY_LETTERS = 32
const COPY_MS = 100
const COPY_TRIES = 3
const CURSOR = '▌'
const USAGE = 'Usage: /pen-widget [on|off|show|clear]'
const OFF = 'Pen is off.'
const NOTHING = 'Nothing written yet.'
const EMPTY = `${NOTHING} A file, edit or command shows here line by line while Claude is still writing it, before it runs.`
const STOPPED = 'Stopped before it ran.'
const STOPPED_SHORT = 'Stopped.'
const PHASES = { writing: 'writing', written: 'written', stopped: 'stopped before it ran' } as const
const FIELDS = new Map<string, Fields>([
  ['Write', { path: 'file_path', text: 'content' }],
  ['Edit', { path: 'file_path', text: 'new_string' }],
  ['NotebookEdit', { path: 'notebook_path', text: 'new_source' }],
  ['Bash', { path: '', text: 'command' }],
  ['PowerShell', { path: '', text: 'command' }],
])
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const WIDE =
  /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const switched = { plugin: 'pen-widget', key: 'isOn' } as const
const penned = { plugin: 'pen-widget', key: 'pen' } as const
const isOn = atom({ plugin: 'pen-widget', key: 'isOn' } as const, false)
const pen = atom({ plugin: 'pen-widget', key: 'pen' } as const, null as Held)

const fresh = (chunk: TurnStepToolChunk, fields: Fields): Reader => ({
  id: chunk.id,
  tool: chunk.name,
  index: chunk.index,
  fields,
  phase: 'writing',
  depth: 0,
  isInString: false,
  isKey: false,
  isKeyNext: false,
  key: '',
  field: '',
  escape: '',
  high: '',
  path: '',
  newlines: 0,
  chars: 0,
  pieces: 0,
  done: [],
  line: '',
  room: LINE_LETTERS,
  isInked: false,
  hasLetter: false,
})

const inked = (reader: Reader, letter: string): void => {
  reader.chars += 1
  if (letter === '\n') {
    if (reader.isInked) reader.done = [...reader.done, reader.line].slice(-TAIL_ROWS)
    reader.newlines += 1
    reader.line = ''
    reader.room = LINE_LETTERS
    reader.isInked = false
    reader.hasLetter = false

    return
  }
  if (letter !== '\t' && CONTROL.test(letter)) return

  reader.hasLetter = true
  if (reader.room === 0) return

  const kept = letter === '\t' ? '  '.slice(0, reader.room) : letter
  reader.line += kept
  reader.room -= letter === '\t' ? kept.length : 1
  if (kept.trim() !== '') reader.isInked = true
}

const handed = (reader: Reader, unit: string): void => {
  const code = unit.charCodeAt(0)
  if (code >= 0xd800 && code <= 0xdbff) {
    reader.high = unit

    return
  }

  const isLow = code >= 0xdc00 && code <= 0xdfff
  const letter = isLow && reader.high !== '' ? reader.high + unit : unit
  reader.high = ''
  if (isLow && letter === unit) return

  if (reader.isKey) {
    if (reader.key.length < KEY_LETTERS) reader.key += letter
  } else if (reader.field === 'text') {
    inked(reader, letter)
  } else if (reader.field === 'path' && !CONTROL.test(letter)) {
    reader.path = (reader.path + letter).slice(-PATH_LETTERS)
  }
}

const lettered = (reader: Reader, letter: string): void => {
  if (reader.escape === '\\') {
    reader.escape = letter === 'u' ? '\\u' : ''
    if (letter !== 'u') handed(reader, ESCAPES[letter] ?? letter)
  } else if (reader.escape !== '') {
    reader.escape += letter
    if (reader.escape.length < 6) return

    const code = Number.parseInt(reader.escape.slice(2), 16)
    reader.escape = ''
    if (!Number.isNaN(code)) handed(reader, String.fromCharCode(code))
  } else if (letter === '\\') {
    reader.escape = letter
  } else if (letter === '"') {
    reader.isInString = false
    reader.high = ''
  } else {
    handed(reader, letter)
  }
}

const marked = (reader: Reader, letter: string): void => {
  if (letter === '"') {
    reader.isInString = true
    reader.isKey = reader.depth === 1 && reader.isKeyNext
    reader.field = reader.isKey || reader.depth !== 1 || reader.key === '' ? '' : reader.key === reader.fields.path ? 'path' : reader.key === reader.fields.text ? 'text' : ''
    if (reader.isKey) reader.key = ''
  } else if (letter === '{' || letter === '[') {
    reader.depth += 1
    if (reader.depth === 1) reader.isKeyNext = true
  } else if (letter === '}' || letter === ']') {
    if (reader.depth === 0) return

    reader.depth -= 1
    if (reader.depth === 0) reader.phase = 'written'
  } else if (reader.depth === 1 && letter === ':') {
    reader.isKeyNext = false
  } else if (reader.depth === 1 && letter === ',') {
    reader.isKeyNext = true
    reader.key = ''
  }
}

const fed = (reader: Reader, json: string): void => {
  reader.pieces += 1
  for (let at = 0; at < json.length && reader.phase === 'writing'; at += 1) {
    if (reader.isInString) lettered(reader, json.charAt(at))
    else marked(reader, json.charAt(at))
  }
}

const picture = (reader: Reader): Call => ({
  id: reader.id,
  tool: reader.tool,
  path: reader.path,
  phase: reader.phase,
  lines: reader.newlines + (reader.hasLetter ? 1 : 0),
  chars: reader.chars,
  pieces: reader.pieces,
  tail: (reader.isInked ? [...reader.done, reader.line] : reader.done).slice(-TAIL_ROWS),
})

const fitting = (letters: readonly string[], room: number): number => {
  let cells = 0
  let count = 0
  for (const letter of letters) {
    cells += WIDE.test(letter) ? 2 : 1
    if (cells > room) break
    count += 1
  }

  return count
}

const cut = (text: string, room: number): string => {
  const letters = [...text]

  return fitting(letters, room) === letters.length ? text : `${letters.slice(0, fitting(letters, room - 1)).join('')}…`
}

const cutStart = (text: string, room: number): string => {
  const letters = [...text].reverse()

  return fitting(letters, room) === letters.length ? text : `…${letters.slice(0, fitting(letters, room - 1)).reverse().join('')}`
}

const wrapped = (sentence: string, columns: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const held = rows.at(-1)

    return held !== undefined && held.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${held} ${word}`] : [...rows, word]
  }, [])

const brief = (path: string, room: number): string => {
  const kept = cutStart(path, room)
  const at = kept.search(/[\\/]/)

  return kept === path || at < 0 ? kept : `…${kept.slice(at)}`
}

const heading = (held: Call, width: number): string => {
  const inner = width - 4
  if (held.path === '') return cut(held.tool, inner)
  if (width < HEAD_COLUMNS) return brief(held.path, inner)

  return `${held.tool} ${brief(held.path, inner - held.tool.length - 1)}`
}

const trailing = (held: Call, inner: number): string[] => {
  const indent = Math.max(0, Math.min(...held.tail.map(row => row.search(/[^ ]/))))
  const rows = held.tail.map(row => row.slice(indent))
  if (held.phase !== 'writing') return rows.map(row => cut(row, inner))

  return [...rows.slice(0, -1).map(row => cut(row, inner)), `${cut(rows.at(-1) ?? '', inner - 1)}${CURSOR}`]
}

const facts = (held: Held): string =>
  held === null
    ? NOTHING
    : `${held.tool}${held.path === '' ? '' : ` ${held.path}`}: ${plural(held.lines, 'line')}, ${plural(held.chars, 'character')} in ${plural(held.pieces, 'piece')}, ${PHASES[held.phase]}.`

const copied = async ($: EngineInterface, desk: Desk, isFresh: boolean): Promise<void> => {
  const { reader } = desk
  if (reader === undefined) return

  let flipped = await $.state.get(switched)
  let held = await $.state.get(penned)
  let version = isFresh ? held.version : desk.version
  for (let tries = 0; tries < COPY_TRIES; tries += 1) {
    if (flipped.value !== true || flipped.version !== desk.flips || (!isFresh && held.value != null && held.value.id !== reader.id)) break

    const landed = await $.state.set(penned, picture(reader), { ifVersion: version })
    if (landed.isSet) {
      desk.version = landed.version

      return
    }

    // Every get of one dispatch reads one moment, so a switch-off made since shows only after a write has missed.
    flipped = await $.state.get(switched)
    held = await $.state.get(penned)
    version = held.version
  }
  desk.reader = undefined
  desk.isReading = false
}

const halted = async ($: EngineInterface, desk: Desk): Promise<void> => {
  if (desk.reader?.phase !== 'writing') return

  desk.reader.phase = 'stopped'
  await copied($, desk, false)
}

const reading = async ($: EngineInterface, desk: Desk, chunk: TurnStepChunk): Promise<void> => {
  if (chunk.kind === 'tool' || chunk.kind === 'text' || chunk.kind === 'thinking') await halted($, desk)
  if (chunk.kind === 'tool') {
    const fields = FIELDS.get(chunk.name)
    if (fields === undefined || !desk.isReading) return

    desk.reader = fresh(chunk, fields)
    desk.copiedAt = Number.NEGATIVE_INFINITY
    await copied($, desk, true)

    return
  }

  const { reader } = desk
  if (chunk.kind !== 'input' || reader === undefined || reader.phase !== 'writing' || chunk.index !== reader.index) return

  fed(reader, chunk.json)
  if (reader.phase === 'writing') {
    const now = await $.clock.now()
    if (now - desk.copiedAt < COPY_MS) return

    desk.copiedAt = now
  }
  await copied($, desk, false)
}

const guarded = async (desk: Desk, work: () => Promise<void>): Promise<void> => {
  try {
    await work()
  } catch {
    desk.isReading = false
  }
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

  const width = fit((await $.state.get(widths)).value?.['pen-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const held = await read($, pen)
  const rows = held === null ? wrapped(EMPTY, inner) : [heading(held, width), ...trailing(held, inner)]

  return $.widgets.card({
    beneath,
    width,
    title: 'Pen',
    note: held === null ? '' : plural(held.lines, 'line'),
    body: (
      <Box flexDirection="column">
        {rows.map(row => (
          <Text dimColor={held?.phase !== 'writing'} wrap="truncate-end">
            {row}
          </Text>
        ))}
        {held?.phase === 'stopped' && (
          <Text key="stopped" color="yellow" wrap="truncate-end">
            {STOPPED.length <= inner ? STOPPED : STOPPED_SHORT}
          </Text>
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pen-widget',
      description: 'Toggle the Pen card, or show and clear the tool call Claude is writing',
      argumentHint: '[on|off|show|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'pen-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'show' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }
      if (arg === 'show') return { text: facts(await read($, pen)) }

      await update($, pen, () => null)

      return { text: 'Pen cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, pen, () => null)

    return { text: isShown ? 'Pen on; /widgets places it.' : 'Pen off.' }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || !(await read($, isOn))) return yield* next(e)

    const desk: Desk = { isReading: true, copiedAt: Number.NEGATIVE_INFINITY, flips: (await $.state.get(switched)).version, version: 0 }
    try {
      for await (const chunk of next(e)) {
        if (desk.isReading) await guarded(desk, () => reading($, desk, chunk))
        yield chunk
      }
    } finally {
      await guarded(desk, () => halted($, desk))
    }
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

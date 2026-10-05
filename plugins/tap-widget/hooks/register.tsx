import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Fields = Record<string, unknown>
type Tap = { server: string; tool: string; args: Fields }
type Reading = { askedAt: number; readAt: number; reading: string; raw: string; fault: string; fails: number; isChanged: boolean }
type Answer = { reading: string; raw: string; fault: string }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const HINT = '[on|off|list [word]|add <server> <tool> [json] [anyway]|run <n>|show <n>|drop <n>|clear]'
const USAGE = `Usage: /tap-widget ${HINT}`
const OFF = 'Tap is off.'
const EMPTY = ['Name a server and a tool:', '/tap-widget add <server> <tool>', '/tap-widget list shows them.']
const NOT_JSON = 'The arguments are not a JSON object'
const VERBS = ['list', 'add', 'run', 'show', 'drop', 'clear']
const LABELS = ['title', 'name', 'summary', 'subject', 'message', 'text']
const READS = ['get', 'list', 'search', 'read', 'find', 'fetch', 'query', 'show', 'count', 'check', 'status', 'describe', 'view', 'lookup']
const WRITES = [
  'create', 'send', 'delete', 'update', 'post', 'write', 'add', 'remove', 'set', 'put', 'patch', 'edit', 'move', 'merge', 'close', 'cancel',
  'reply', 'run', 'execute', 'publish', 'archive', 'draft', 'upload', 'insert', 'drop', 'comment', 'approve',
]
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g
// The engine leads a refused call's reason with the caller's own name.
const CALLER =/^tap-widget: \$\.mcp\.call: /
const BLANK: Reading = { askedAt: 0, readAt: 0, reading: '', raw: '', fault: '', fails: 0, isChanged: false }
const MOST = 4
const TICK_MS = 60_000
const EVERY_MS = 600_000
const SLOWEST = 8
const WIDE = 36
const SHORT = 40
const LISTED = 30
const READING_MAX = 120
const FAULT_MAX = 100
const RAW_MAX = 2000
const TOAST_MAX = 60
const TOOL_MAX = 60
const WORD_MAX = 40
const NUMBER_MAX = 12
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'tap-widget', key: 'isOn' } as const, false)
const taps = atom({ plugin: 'tap-widget', key: 'taps' } as const, [] as Tap[])
const reads = atom({ plugin: 'tap-widget', key: 'reads' } as const, {} as Record<string, Reading>)
const clock = atom({ plugin: 'tap-widget', key: 'now' } as const, 0)
const flying = atom({ plugin: 'tap-widget', key: 'flying' } as const, [] as string[])

let timer: Timer | undefined

const clean = (text: string): string => text.replace(CONTROL, ' ').replace(/ +/g, ' ').trim()

const cut = (text: string, room: number): string => {
  if (text.length <= room) return text

  return room < 1 ? '' : `${text.slice(0, room - 1)}…`
}

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

const lineOf = (text: string): string =>
  text
    .split(/[\r\n]+/)
    .map(clean)
    .find(line => line !== '') ?? ''

const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)

const keyOf = (tap: Tap): string => `${tap.server} ${tap.tool} ${JSON.stringify(tap.args)}`

const without = <Value,>(held: Record<string, Value>, key: string): Record<string, Value> =>
  Object.fromEntries(Object.entries(held).filter(([other]) => other !== key))

const restored = (saved: unknown): Tap[] => {
  const kept = (Array.isArray(saved) ? saved : []).flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.server === 'string' && typeof entry.tool === 'string' && isRecord(entry.args)
      ? [{ server: entry.server, tool: entry.tool, args: entry.args }]
      : [],
  )

  return kept.filter((tap, at) => kept.findIndex(other => keyOf(other) === keyOf(tap)) === at).slice(0, MOST)
}

const looksReadOnly = (tool: string): boolean => {
  const words = tool
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_.-]+/)
    .map(word => word.toLowerCase())

  return words.some(word => READS.includes(word)) && !words.some(word => WRITES.includes(word))
}

const labelOf = (item: unknown): string => {
  if (typeof item === 'string') return lineOf(item)
  if (typeof item === 'number') return String(item)
  if (!isRecord(item)) return ''

  const named = [...LABELS.map(key => item[key]), ...Object.values(item)].find(value => typeof value === 'string' && lineOf(value) !== '')

  return typeof named === 'string' ? lineOf(named) : ''
}

const labelled = (head: string, first: unknown): string => {
  const label = labelOf(first)

  return label === '' ? head : `${head}: ${label}`
}

const counted = (count: number, key: string): string => `${count} ${count === 1 && /[^s]s$/.test(key) ? key.slice(0, -1) : key}`

const isShort = (value: unknown): boolean =>
  typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && value.length <= SHORT && clean(value) !== '')

const said = (value: unknown): string => {
  if (value === null) return 'nothing'
  if (typeof value === 'string') return lineOf(value)
  if (Array.isArray(value)) return labelled(plural(value.length, 'item'), value[0])
  if (!isRecord(value)) return String(value)

  const fields = Object.entries(value)
  const list = fields.find(([, held]) => Array.isArray(held))
  if (list !== undefined && Array.isArray(list[1])) return labelled(counted(list[1].length, list[0]), list[1][0])

  const short = fields.filter(([, held]) => isShort(held)).slice(0, 2)

  return short.length === 0 ? plural(fields.length, 'field') : short.map(([key, held]) => `${key} ${String(held)}`).join(', ')
}

const blocksOf = (result: unknown): Fields[] => (isRecord(result) && Array.isArray(result.content) ? result.content.filter(isRecord) : [])

const valueOf = (result: unknown): { value: unknown } | undefined => {
  if (isRecord(result) && result.structuredContent !== undefined) return { value: result.structuredContent }

  const block = blocksOf(result).find(found => found.type === 'text')
  if (block === undefined) return undefined

  const text = typeof block.text === 'string' ? block.text : ''
  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    return { value: text }
  }
}

const readingOf = (result: unknown): string => {
  const held = valueOf(result)
  const [first] = blocksOf(result)
  const kind = typeof first?.type === 'string' ? clean(first.type) : ''
  const text = held !== undefined ? said(held.value) : first === undefined ? 'nothing came back' : `${/^[aeiou]/i.test(kind) ? 'an' : 'a'} ${kind} block`

  return cut(clean(text), READING_MAX) || 'nothing'
}

const rawOf = (result: unknown, reading: string): string => {
  const held = valueOf(result)
  const text = held === undefined ? '' : typeof held.value === 'string' ? held.value : JSON.stringify(held.value, null, 1)

  return (
    text
      .replace(CONTROL, letter => (letter === '\n' ? '\n' : ' '))
      .trim()
      .slice(0, RAW_MAX) || reading
  )
}

const faultOf = (result: unknown): string => {
  if (!isRecord(result) || result.isError !== true) return ''

  const line = blocksOf(result)
    .map(block => (typeof block.text === 'string' ? lineOf(block.text) : ''))
    .find(text => text !== '')

  return cut(line === undefined ? 'server error' : `server error: ${line}`, FAULT_MAX)
}

const failed = (error: unknown): string => {
  const line = lineOf(error instanceof Error ? error.message : String(error)).replace(CALLER, '')

  return cut(line === '' ? 'call failed' : `call failed: ${line}`, FAULT_MAX)
}

const argsOf = (json: string): Fields | string => {
  if (json === '') return {}
  try {
    const parsed: unknown = JSON.parse(json)

    return isRecord(parsed) ? parsed : `${NOT_JSON}.`
  } catch (error) {
    return `${NOT_JSON}: ${cut(clean(error instanceof Error ? error.message : String(error)), FAULT_MAX)}`
  }
}

const isDue = (seen: Reading | undefined, at: number): boolean =>
  seen === undefined || seen.askedAt === 0 || at - seen.askedAt >= EVERY_MS * Math.min(SLOWEST, 2 ** seen.fails)

const ask = async ($: EngineInterface, tap: Tap): Promise<Answer> => {
  try {
    const result: unknown = await $.mcp.call(tap.server, tap.tool, tap.args)
    const fault = faultOf(result)
    if (fault !== '') return { reading: '', raw: '', fault }

    const reading = readingOf(result)

    return { reading, raw: rawOf(result, reading), fault: '' }
  } catch (error) {
    return { reading: '', raw: '', fault: failed(error) }
  }
}

const call = async ($: EngineInterface, tap: Tap): Promise<Reading | undefined> => {
  const key = keyOf(tap)
  const claim = { isMine: false }
  await update($, flying, held => {
    claim.isMine = !held.includes(key)

    return claim.isMine ? [...held, key] : held
  })
  if (!claim.isMine) return undefined

  const askedAt = await $.clock.now()
  await update($, clock, () => askedAt)
  await update($, reads, held => ({ ...held, [key]: { ...(held[key] ?? BLANK), askedAt } }))

  const answer = await ask($, tap)
  const settledAt = await $.clock.now()
  const kept = { isStored: false }
  const after = await update($, reads, held => {
    const before = held[key]
    kept.isStored = before !== undefined && before.askedAt === askedAt
    if (before === undefined || !kept.isStored) return held

    return {
      ...held,
      [key]:
        answer.fault === ''
          ? { askedAt, readAt: settledAt, reading: answer.reading, raw: answer.raw, fault: '', fails: 0, isChanged: before.readAt > 0 && before.reading !== answer.reading }
          : { ...before, fault: answer.fault, fails: before.fails + 1, isChanged: false },
    }
  })
  if (!kept.isStored) return undefined

  await update($, flying, held => held.filter(other => other !== key))
  await update($, clock, () => settledAt)

  return after[key]
}

const tick = async ($: EngineInterface): Promise<void> => {
  if (!(await read($, isOn))) return

  const at = await $.clock.now()
  await update($, clock, () => at)
  if ((await read($, flying)).length > 0) return

  for (const tap of await read($, taps)) {
    const key = keyOf(tap)
    const isHeld = (await read($, taps)).some(other => keyOf(other) === key)
    if (!isHeld || !isDue((await read($, reads))[key], await $.clock.now())) continue

    const settled = await call($, tap)
    if (settled === undefined) return

    const number = (await read($, taps)).findIndex(other => keyOf(other) === key) + 1
    if (settled.fault === '' && settled.isChanged) $.ui.toast(`Tap ${number} changed: ${cut(settled.reading, TOAST_MAX)}`)
  }
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void tick($).catch(() => undefined)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const listed = async ($: EngineInterface, typed: string): Promise<string> => {
  const word = clean(typed).slice(0, WORD_MAX)
  const rows = (await $.tool.list()).flatMap(entry => {
    const at = entry.name.indexOf('__', 5)
    if (!entry.mcp || !entry.name.startsWith('mcp__') || at <= 5 || at + 2 >= entry.name.length) return []

    return [{ name: entry.name.toLowerCase(), row: clean(`${entry.name.slice(5, at)} ${entry.name.slice(at + 2)}`) }]
  })
  if (rows.length === 0) return 'No MCP tools in this session.'

  const found = rows.filter(entry => entry.name.includes(word.toLowerCase())).map(entry => entry.row)
  if (found.length === 0) return `No MCP tool matches ${word}.`

  return [...found.slice(0, LISTED), ...(found.length > LISTED ? [`and ${found.length - LISTED} more: /tap-widget list <word>`] : [])].join('\n')
}

const added = async ($: EngineInterface, typed: string): Promise<string> => {
  const [, server = '', tool = '', tail = ''] = /^(\S+)\s+(\S+)\s*([\s\S]*)$/.exec(typed) ?? []
  if (server === '' || clean(server) !== server || clean(tool) !== tool) return USAGE

  const isForced = /(^|\s)anyway$/.test(tail)
  const args = argsOf((isForced ? tail.slice(0, -'anyway'.length) : tail).trim())
  if (typeof args === 'string') return args

  const tap = { server, tool, args }
  const key = keyOf(tap)
  const held = await read($, taps)
  const same = held.findIndex(other => keyOf(other) === key)
  if (same >= 0) return `Already tap ${same + 1}.`
  if (held.length >= MOST) return `Tap holds ${MOST}: drop one first.`
  if (!isForced && !looksReadOnly(tool)) {
    return `${cut(tool, TOOL_MAX)} does not look read-only. Tap would call it every 10m without asking. To add it all the same, end the line with: anyway`
  }

  const askedAt = await $.clock.now()
  await update($, flying, busy => [...busy, key])
  const answer = await ask($, tap)
  await update($, flying, busy => busy.filter(other => other !== key))
  if (answer.fault !== '') return `Not added: ${answer.fault}`
  if (!(await read($, isOn))) return OFF

  const readAt = await $.clock.now()
  const kept = await update($, taps, before => (before.length >= MOST || before.some(other => keyOf(other) === key) ? before : [...before, tap]))
  const number = kept.findIndex(other => keyOf(other) === key) + 1
  if (number === 0) return `Tap holds ${MOST}: drop one first.`

  await update($, reads, before => ({ ...before, [key]: { ...BLANK, askedAt, readAt, reading: answer.reading, raw: answer.raw } }))
  await update($, clock, () => readAt)
  await $.store.set('taps', kept)

  return `Tap ${number}: ${answer.reading}. It will be called every 10m without asking; /tap-widget drop ${number} stops it.`
}

const act = async ($: EngineInterface, typed: string): Promise<string> => {
  const [, first = '', rest = ''] = /^(\S+)\s*([\s\S]*)$/.exec(typed) ?? []
  const verb = first.toLowerCase()
  if (!VERBS.includes(verb)) return USAGE
  if (!(await read($, isOn))) return OFF
  if (verb === 'list') return listed($, rest)
  if (verb === 'add') return added($, rest)
  if (verb === 'clear') {
    if (rest !== '') return USAGE
    await update($, taps, () => [])
    await update($, reads, () => ({}))
    await update($, flying, () => [])
    await $.store.delete('taps')

    return 'Tap cleared.'
  }
  if (!/^(0|[1-9]\d*)$/.test(rest)) return USAGE

  const number = Number(rest)
  const tap = (await read($, taps))[number - 1]
  if (tap === undefined) return `No tap ${cut(rest, NUMBER_MAX)}.`

  const key = keyOf(tap)
  if (verb === 'drop') {
    const kept = await update($, taps, held => held.filter(other => keyOf(other) !== key))
    await update($, reads, held => without(held, key))
    await update($, flying, held => held.filter(other => other !== key))
    if (kept.length === 0) await $.store.delete('taps')
    else await $.store.set('taps', kept)

    return `Dropped ${number}.`
  }
  if (verb === 'show') {
    const seen = (await read($, reads))[key]
    if (seen !== undefined && seen.fault !== '') return `Tap ${number}: ${seen.fault}`

    return seen === undefined || seen.readAt === 0 ? `Tap ${number} has no reading yet.` : seen.raw
  }
  if ((await read($, flying)).includes(key)) return `Tap ${number} is still being read.`

  const settled = await call($, tap)
  if (settled === undefined) return (await read($, isOn)) ? `No tap ${number}.` : OFF

  return `Tap ${number}: ${settled.fault || settled.reading}${settled.fault === '' && settled.isChanged ? ' (changed)' : ''}`
}

const face = ({ Box, Text }: Tags, number: number, tool: string, seen: Reading | undefined, at: number, inner: number): RenderElement[] => {
  const fault = seen?.fault ?? ''
  const isRead = seen !== undefined && (seen.readAt > 0 || fault !== '')
  const age = isRead ? span(at - (fault === '' ? seen.readAt : seen.askedAt)) : '…'
  const head = `${number}`
  const isStarred = isRead && fault === '' && seen.isChanged

  return [
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">
        <Text dimColor>{head}</Text>
        {` ${cut(clean(tool), Math.max(0, inner - head.length - 2 - age.length))}`}
      </Text>
      <Text wrap="truncate-end" dimColor>
        {age}
      </Text>
    </Box>,
    <Text wrap="truncate-end" dimColor={!isRead} color={fault === '' ? undefined : 'yellow'}>
      {isStarred ? <Text color="yellow">* </Text> : '  '}
      {cut(isRead ? fault || seen.reading : 'not read yet', inner - 2)}
    </Text>,
  ]
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

  const width = fit((await $.state.get(widths)).value?.['tap-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const held = await read($, taps)
  const seen = await read($, reads)
  const at = await read($, clock)

  return $.widgets.card({
    beneath,
    width,
    title: 'Tap',
    ...(held.length === 0 ? {} : { note: inner >= WIDE ? plural(held.length, 'tap') : `${held.length}` }),
    body:
      held.length === 0 ? (
        <Box key="empty" flexDirection="column">
          {EMPTY.flatMap(sentence => wrapped(sentence, inner)).map(line => (
            <Text wrap="truncate-end" dimColor>
              {line}
            </Text>
          ))}
        </Box>
      ) : (
        <Box key="taps" flexDirection="column">
          {held.flatMap((tap, row) => face({ Box, Text }, row + 1, tap.tool, seen[keyOf(tap)], at, inner))}
        </Box>
      ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tap-widget',
      description: 'Toggle the Tap card, or add, run, show and drop its taps',
      argumentHint: HINT,
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const saved: unknown = await $.store.get('taps')
    await update($, taps, () => restored(saved))
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'tap-widget' }, async ($, e) => {
    const typed = e.args.trim()
    const arg = typed.toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: await act($, typed) }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) {
      await update($, reads, () => ({}))
      await update($, flying, () => [])
    }
    await sync($)

    return { text: isShown ? 'Tap on; /widgets places it.' : 'Tap off.' }
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

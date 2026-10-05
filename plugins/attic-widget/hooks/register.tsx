import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, ToolDescribeInput, ToolDescribeResult } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, folder, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Book = PluginState['attic-widget']['book']
type Plan = PluginState['attic-widget']['plan']
type Run = PluginState['attic-widget']['run']
type Tool = Book['tools'][string]
type List = 'keep' | 'stow'
type Row = { key: string; text: string; isDim: boolean; isSentence: boolean }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const WIDE_COLUMNS = 30
const WINDOW = 5
const AIRING_EVERY = 10
const FORWARD_CALLS = 3
const SHOW_ROWS = 20
const SEARCH = 'ToolSearch'
const FLOOR = [SEARCH, 'Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob']
const USAGE = 'Usage: /attic-widget [on|off|show|keep <tool>|stow <tool>|clear]'
const VERBS = ['', 'on', 'off', 'show', 'keep', 'stow', 'clear']
const EMPTY = `Counting the tools Claude calls in this project. After ${WINDOW} sessions the unused ones wait behind ${SEARCH}.`
const AIRING = 'Airing: every tool is where the engine puts it this session, so a stowed tool can earn its way back.'
const BLIND = `No ${SEARCH} in this session, so nothing is moved. Still counting.`
const FETCHED = 'Claude fetched '
const REST: Book = { key: '', sessions: 0, base: -1, keep: [], stow: [], tools: {} }
const UNPLANNED: Plan = { isReady: false, n: 1, mode: 'dry', moves: {} }
const IDLE: Run = { isCounted: false, isDirty: false, isMeasured: false, onDemand: -1, fetched: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const restored = { plugin: 'attic-widget', key: 'isOn' } as const
const isOn = atom({ plugin: 'attic-widget', key: 'isOn' } as const, false)
const book = atom({ plugin: 'attic-widget', key: 'book' } as const, REST)
const plan = atom({ plugin: 'attic-widget', key: 'plan' } as const, UNPLANNED)
const run = atom({ plugin: 'attic-widget', key: 'run' } as const, IDLE)

const cut = (text: string, room: number): string => {
  const letters = [...text]

  return letters.length <= room ? text : `${letters.slice(0, Math.max(0, room - 1)).join('')}…`
}

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, cut(word, room)]
  }, [])

const kilo = (tokens: number): string => {
  if (tokens < 1000) return String(tokens)

  const tenths = Math.round(tokens / 100)

  return tenths < 1000 ? `${(tenths / 10).toFixed(1)}k` : `${Math.round(tokens / 1000)}k`
}

const calls = (tool: Tool, n: number): number => tool.used.filter(at => at >= n - WINDOW && at < n).length

const planned = (held: Book, n: number, hasSearch: boolean): Plan => {
  const mode = !hasSearch ? 'blind' : n <= WINDOW ? 'dry' : n % AIRING_EVERY === 0 ? 'airing' : 'live'
  const moves: Plan['moves'] = {}
  if (!hasSearch) return { isReady: true, n, mode, moves }

  for (const name of held.stow) if (!FLOOR.includes(name)) moves[name] = 'away'
  for (const name of held.keep) if (held.tools[name]?.isDeferred === true) moves[name] = 'forward'
  if (mode !== 'live') return { isReady: true, n, mode, moves }

  for (const [name, tool] of Object.entries(held.tools)) {
    if (held.keep.includes(name) || held.stow.includes(name)) continue

    const used = calls(tool, n)
    const isKnown = tool.since <= n - WINDOW && tool.seen >= n - WINDOW
    if (tool.isEngine && !tool.isDeferred && !FLOOR.includes(name) && isKnown && used === 0) moves[name] = 'away'
    else if (tool.isDeferred && used >= FORWARD_CALLS) moves[name] = 'forward'
  }

  return { isReady: true, n, mode, moves }
}

const noted = (held: Book, e: ToolDescribeInput, n: number): Book => {
  const known = held.tools[e.tool]
  const isEngine = e.provider.plugin === 'engine'
  const isDeferred = e.isDeferred === true
  if (known !== undefined && known.isEngine === isEngine && known.isDeferred === isDeferred && known.seen === n) return held

  return { ...held, tools: { ...held.tools, [e.tool]: { isEngine, isDeferred, since: known?.since ?? n, seen: n, used: known?.used ?? [] } } }
}

const tallied = (held: Book, tool: string, n: number): Book => {
  const known = held.tools[tool] ?? { isEngine: false, isDeferred: false, since: n, seen: 0, used: [] }
  if (held.sessions === n && known.used.includes(n)) return held

  return { ...held, sessions: n, tools: { ...held.tools, [tool]: known.used.includes(n) ? known : { ...known, used: [...known.used, n] } } }
}

const listed = (held: Book, list: List, tool: string): Book => {
  const keep = held.keep.filter(name => name !== tool)
  const stow = held.stow.filter(name => name !== tool)
  if (held[list].includes(tool)) return { ...held, keep, stow }

  return { ...held, keep: list === 'keep' ? [...keep, tool] : keep, stow: list === 'stow' ? [...stow, tool] : stow }
}

const merged = (saved: Book, early: Book, n: number): Book =>
  early.key !== ''
    ? saved
    : {
        ...saved,
        tools: {
          ...saved.tools,
          ...Object.fromEntries(
            Object.entries(early.tools).map(([name, tool]) => [name, { ...tool, since: saved.tools[name]?.since ?? n, seen: n, used: saved.tools[name]?.used ?? [] }]),
          ),
        },
      }

const trimmed = (held: Book, n: number): Omit<Book, 'key'> => ({
  sessions: held.sessions,
  base: held.base,
  keep: held.keep,
  stow: held.stow,
  tools: Object.fromEntries(
    Object.entries(held.tools)
      .filter(([name, tool]) => tool.seen >= n - WINDOW || held.keep.includes(name) || held.stow.includes(name))
      .map(([name, tool]) => [name, { ...tool, used: tool.used.filter(at => at >= n - WINDOW) }]),
  ),
})

const present = (held: Book, n: number): string[] => Object.keys(held.tools).filter(name => held.tools[name]?.seen === n)

const idle = (held: Book, n: number): string[] =>
  present(held, n)
    .filter(name => {
      const tool = held.tools[name]

      return tool?.isEngine === true && !tool.isDeferred && tool.used.length === 0 && !FLOOR.includes(name)
    })
    .sort()

const unused = (held: Book, n: number): string[] => idle(held, n).filter(name => !held.keep.includes(name) && !held.stow.includes(name))

const isListed = (held: Book, name: string): boolean => {
  const tool = held.tools[name]

  return tool !== undefined && tool.seen > 0 && !tool.isDeferred
}

const titled = (key: string): string => key.split('/').at(-1) || key || '/'

const going = (held: Book, made: Plan, move: Plan['moves'][string]): string[] => {
  const here = present(held, made.n)

  return Object.keys(made.moves)
    .filter(name => made.moves[name] === move && (here.length === 0 || here.includes(name)))
    .sort()
}

const figures = (held: Book, moved: number, onDemand: number): [wide: string, narrow: string][] => {
  if (onDemand < 0) return []
  if (held.base < 0 || moved === 0) return [[`On demand now: ${kilo(onDemand)} tokens`, `${kilo(onDemand)} on demand`]]

  const less = onDemand - held.base
  const size = kilo(Math.abs(less))
  const head: [string, string] = [`On demand ${kilo(held.base)} -> ${kilo(onDemand)} tokens`, `${kilo(held.base)} -> ${kilo(onDemand)}`]
  if (Math.abs(less) > onDemand) return [head]
  if (less === 0) return [head, ['No change in a request', '+0/request']]

  return [head, less > 0 ? [`${size} less in every request`, `-${size}/request`] : [`${size} more in every request`, `+${size}/request`]]
}

const noteOf = (held: Book, made: Plan, isWide: boolean): string => {
  if (made.mode === 'blind') return 'no search'
  if (made.mode === 'airing') return 'airing'
  if (made.mode === 'dry') return isWide ? `watching ${made.n}/${WINDOW}` : `${made.n}/${WINDOW}`

  const away = going(held, made, 'away').length
  const forward = going(held, made, 'forward').length

  return away === 0 && forward > 0 ? `${forward} forward` : `${away} away`
}

const drawn = (held: Book, made: Plan, ran: Run, inner: number, isWide: boolean): Row[] => {
  const pick = (wide: string, narrow: string): string => (isWide && wide.length <= inner ? wide : narrow)
  const said = (key: string, text: string): Row => ({ key, text, isDim: true, isSentence: true })
  const row = (key: string, wide: string, narrow: string, isDim = false): Row => ({ key, text: pick(wide, narrow), isDim, isSentence: false })
  const away = going(held, made, 'away').length
  const forward = going(held, made, 'forward').length
  const known = present(held, made.n).length
  const never = idle(held, made.n).length
  const latest = ran.fetched.at(-1)
  const more = ran.fetched.length - 1
  const counts = row(
    'counts',
    away === 0 ? `Nothing in the attic, ${forward} forward.` : `${plural(away, 'tool')} in the attic${forward > 0 ? `, ${forward} forward` : ''}.`,
    `${away} away, ${forward} fwd`,
  )
  const rows: Row[] = []

  if (latest !== undefined && isWide) {
    const name = `${cut(latest, inner - FETCHED.length)}${more > 0 ? ` and ${more} more` : ''}`
    rows.push({ ...said('fetch', `${FETCHED}${name} from the attic. ${held.stow.includes(latest) ? 'Stowed by you, so it stays.' : 'Listed again next session.'}`), isDim: false })
  }
  if (latest !== undefined && !isWide) {
    const tail = more > 0 ? ` +${more}` : ''
    rows.push({ key: 'fetch', text: `fetched ${cut(latest, inner - 'fetched '.length - tail.length)}${tail}`, isDim: false, isSentence: false })
    if (held.stow.includes(latest)) rows.push({ key: 'stays', text: 'stays stowed', isDim: false, isSentence: false })
  }

  if (made.mode === 'blind') rows.push(said('said', BLIND))
  if (made.mode === 'airing') rows.push(said('said', AIRING))
  if (made.mode === 'dry' && away + forward === 0) rows.push(known === 0 ? said('said', EMPTY) : row('still', 'Nothing moved yet.', 'nothing moved'))
  if (made.mode === 'live' && away + forward === 0) rows.push(row('still', 'Nothing to move this session.', 'nothing moved'))
  if (away + forward > 0) rows.push(counts)
  if (made.mode === 'dry' && known > 0) {
    rows.push(row('unused', never === 0 ? 'Every tool has been called here.' : `${plural(never, 'tool')} never called here so far.`, `${never} never called`))
  }
  figures(held, away + forward, ran.onDemand).forEach(([wide, narrow], at) => rows.push(row(at === 0 ? 'figure' : 'change', wide, narrow, true)))

  return rows
}

const reported = (held: Book, made: Plan, ran: Run): string => {
  const name = titled(held.key)
  const away = going(held, made, 'away')
  const forward = going(held, made, 'forward')
  const figure = figures(held, away.length + forward.length, ran.onDemand)
    .map(([wide]) => wide)
    .join(', ')
  const rows = [
    ...away.map(tool => `away ${tool}: ${held.stow.includes(tool) ? 'stowed by you' : `no call in the last ${WINDOW} sessions`}`),
    ...forward.map(tool => {
      const known = held.tools[tool]

      return `forward ${tool}: ${held.keep.includes(tool) || known === undefined ? 'kept by you' : `called in ${calls(known, made.n)} of the last ${WINDOW} sessions`}`
    }),
    ...held.keep
      .filter(tool => made.moves[tool] === undefined && isListed(held, tool))
      .sort()
      .map(tool => `kept ${tool}: kept by you`),
    ...(made.mode === 'dry' ? unused(held, made.n).map(tool => `would go ${tool}: never called here`) : []),
  ]

  return [
    made.mode === 'dry'
      ? `Attic, session ${made.n} of ${WINDOW} in ${name}: watching, nothing moved.`
      : `Attic, session ${made.n} in ${name}: ${away.length} away, ${forward.length} forward.`,
    ...(made.mode === 'airing' ? [AIRING] : []),
    ...(made.mode === 'blind' ? [BLIND] : []),
    ...rows.slice(0, SHOW_ROWS),
    ...(rows.length > SHOW_ROWS ? [`and ${rows.length - SHOW_ROWS} more`] : []),
    ...(figure === '' ? [] : [figure]),
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

  const width = fit((await $.state.get(widths)).value?.['attic-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - CARD_FRAME
  const isWide = width >= WIDE_COLUMNS
  const made = await read($, plan)
  const held = await read($, book)

  return $.widgets.card({
    beneath,
    width,
    title: 'Attic',
    note: noteOf(held, made, isWide),
    body: (
      <Box flexDirection="column">
        {drawn(held, made, await read($, run), inner, isWide).flatMap(({ key, text, isDim, isSentence }) =>
          (isSentence ? wrapped(text, inner) : [cut(text, inner)]).map((line, at) => (
            <Box key={`${key}:${at}`}>
              <Text dimColor={isDim} wrap="truncate-end">
                {line}
              </Text>
            </Box>
          )),
        )}
      </Box>
    ),
  })
}

const named = async ($: EngineInterface): Promise<string[]> => {
  try {
    return (await $.tool.list()).map(tool => tool.name)
  } catch {
    return []
  }
}

const opened = async ($: EngineInterface): Promise<void> => {
  const key = folder((await $.session.repo())?.root ?? (await $.session.root()))
  const stored = await $.store.get(`book:${key}`)
  const saved: Book = { ...REST, ...(typeof stored === 'object' && stored !== null ? (stored as Partial<Book>) : {}), key }
  const names = await named($)
  const n = saved.sessions + 1
  const early = await read($, book)
  const made = planned(merged(saved, early, n), n, names.includes(SEARCH))

  await update($, plan, () => made)
  await update($, book, seen => merged(saved, seen ?? REST, n))
  await update($, run, () => ({ ...IDLE, isDirty: early.key === '' && Object.keys(early.tools).length > 0 }))
  if (Object.keys(made.moves).length > 0) $.ui.invalidate('tool.describe')
}

const written = async ($: EngineInterface): Promise<void> => {
  const held = await read($, book)

  await $.store.set(`book:${held.key}`, trimmed(held, (await read($, plan)).n))
  await update($, run, ran => ({ ...(ran ?? IDLE), isDirty: false }))
}

const kept = async ($: EngineInterface): Promise<void> => {
  const { isCounted, isDirty } = await read($, run)
  if (isCounted && isDirty) await written($)
}

const closed = async ($: EngineInterface): Promise<void> => {
  const { moves } = await read($, plan)

  await kept($)
  await update($, book, () => REST)
  await update($, plan, () => UNPLANNED)
  await update($, run, () => IDLE)
  if (Object.keys(moves).length > 0) $.ui.invalidate('tool.describe')
}

const woken = async ($: EngineInterface): Promise<boolean> => {
  try {
    if ((await $.state.get(restored)).version > 0) return false
    const isStored = (await $.store.get('isOn')) === true

    return await update($, isOn, () => isStored)
  } catch {
    return false
  }
}

const placed = async ($: EngineInterface, e: ToolDescribeInput, answer: ToolDescribeResult): Promise<ToolDescribeResult> => {
  const { isReady, n, mode, moves } = await read($, plan)
  const seen = isReady ? n : 0
  const held = await read($, book)
  if (noted(held, e, seen) !== held) {
    await update($, book, held => noted(held ?? REST, e, seen))
    if (isReady) await update($, run, ran => ({ ...(ran ?? IDLE), isDirty: true }))
  }

  const isKept = e.isDeferred === true && mode !== 'blind' && moves[e.tool] === undefined && held.keep.includes(e.tool)
  if (isKept) {
    await update($, plan, made => ({ ...(made ?? UNPLANNED), moves: { ...(made ?? UNPLANNED).moves, [e.tool]: 'forward' } }))
    await update($, run, ran => ({ ...(ran ?? IDLE), isMeasured: false, onDemand: -1 }))
  }

  const move = isKept ? 'forward' : moves[e.tool]

  return move === undefined ? answer : { ...answer, isDeferred: move === 'away' }
}

const counted = async ($: EngineInterface, tool: string): Promise<void> => {
  const { isReady, n, moves } = await read($, plan)
  if (!isReady) return

  const held = await read($, book)
  const isFetched = moves[tool] === 'away' && !(await read($, run)).fetched.includes(tool)
  if (tallied(held, tool, n) === held && !isFetched) return

  await update($, book, seen => tallied(seen ?? REST, tool, n))
  await update($, run, ran => {
    const { fetched, ...rest } = ran ?? IDLE

    return { ...rest, isCounted: true, isDirty: true, fetched: isFetched && !fetched.includes(tool) ? [...fetched, tool] : fetched }
  })
}

const measured = async ($: EngineInterface): Promise<void> => {
  const { isReady, moves } = await read($, plan)
  if (!isReady || (await read($, run)).isMeasured) return

  const rows = ((await $.session.usage({ breakdown: 'summary' })).context.breakdown?.categories ?? []).filter(row => row.kind === 'deferred')
  const onDemand = rows.length === 0 ? -1 : rows.reduce((sum, row) => sum + row.tokens, 0)
  const isBase = onDemand >= 0 && Object.keys(moves).length === 0 && (await read($, book)).base !== onDemand
  if (isBase) await update($, book, held => ({ ...(held ?? REST), base: onDemand }))
  await update($, run, ran => ({ ...(ran ?? IDLE), isMeasured: true, onDemand, isDirty: (ran ?? IDLE).isDirty || isBase }))
}

const shelved = async ($: EngineInterface, list: List, typed: string): Promise<string> => {
  const before = await read($, plan)
  const held = await read($, book)
  const floor = FLOOR.find(name => name.toLowerCase() === typed.toLowerCase())
  if (list === 'stow' && floor !== undefined) return `${floor} is never put away.`

  const known = [...(await named($)), ...Object.keys(held.tools), ...held.keep, ...held.stow]
  const tool = known.find(name => name === typed) ?? known.find(name => name.toLowerCase() === typed.toLowerCase())
  if (tool === undefined) return `No tool named ${typed} in this session.`

  const { [tool]: was, ...others } = before.moves
  const move = planned(await update($, book, seen => listed(seen ?? REST, list, tool)), before.n, before.mode !== 'blind').moves[tool]
  const made: Plan = { ...before, moves: move === undefined ? others : { ...others, [tool]: move } }
  await written($)
  await update($, plan, () => made)
  const isUnseen = list === 'keep' && !held.keep.includes(tool) && before.mode !== 'blind' && held.tools[tool]?.seen !== before.n
  if (move !== was) await update($, run, ran => ({ ...(ran ?? IDLE), isMeasured: false, onDemand: -1 }))
  if (move !== was || isUnseen) $.ui.invalidate('tool.describe')

  if (held[list].includes(tool)) return `${tool} is back to evidence.`
  if (list === 'keep') return `${tool} stays listed.`

  return made.mode === 'blind' ? `${tool} is on the stow list. ${BLIND}` : `${tool} is in the attic from the next request. One prompt-cache miss.`
}

const cleared = async ($: EngineInterface): Promise<string> => {
  const { key, tools } = await read($, book)
  const { mode, moves } = await read($, plan)

  await $.store.delete(`book:${key}`)
  await update($, book, () => ({ ...REST, key }))
  await update($, plan, () => planned(REST, 1, mode !== 'blind'))
  await update($, run, () => IDLE)
  if (Object.keys(moves).length > 0) $.ui.invalidate('tool.describe')

  return `Attic cleared: ${plural(Object.keys(tools).length, 'tool')} forgotten for ${titled(key)}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'attic-widget',
      description: 'Toggle the Attic card, list where each tool waits, keep or stow one, or clear the count',
      argumentHint: '[on|off|show|keep <tool>|stow <tool>|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    else await update($, isOn, shown => shown ?? false)
    if (await read($, isOn)) await opened($)

    return next(e)
  })

  on('command.run', { command: 'attic-widget' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = verb.toLowerCase()
    const [typed = ''] = rest
    if (!VERBS.includes(arg) || rest.length !== (arg === 'keep' || arg === 'stow' ? 1 : 0)) return { text: USAGE }

    if (arg === 'show' || arg === 'keep' || arg === 'stow' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: 'Attic is off.' }
      if (arg === 'show') return { text: reported(await read($, book), await read($, plan), await read($, run)) }

      return { text: arg === 'clear' ? await cleared($) : await shelved($, arg, typed) }
    }

    const wasOn = await read($, isOn)
    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown && !wasOn) await opened($)
    if (!isShown && wasOn) await closed($)

    return { text: isShown ? 'Attic on; /widgets places it.' : 'Attic off.' }
  })

  on('tool.describe', async ($, e, next) => {
    if (!(await read($, isOn)) && !(await woken($))) return next(e)

    const answer = await next(e)
    try {
      return await placed($, e, answer)
    } catch {
      return answer
    }
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    try {
      await counted($, e.tool)
    } catch {
      // A call that cannot be counted still runs: the tally is evidence, never a gate.
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined || !(await read($, isOn))) return next(e)

    try {
      await measured($).catch(() => undefined)
      await kept($)
    } catch {
      // A book that cannot be saved is kept in this session and written at the next turn.
    }

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

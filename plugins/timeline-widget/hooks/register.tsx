import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { TimelineTurn } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 500
const LANES = 5
const LANE_ROWS = 3
const CHART_ROWS = LANES * LANE_ROWS + 2
const MIN_SPAN_MS = 2000
const AXIS = 0x30363d
const TICK = 0x6e7681
const FAILED = 0xe5484d
const OTHER = 0x8b949e
const KINDS: Record<string, number> = {
  Bash: 0xf0883e,
  Read: 0x58a6ff,
  Edit: 0x3fb950,
  Write: 0x3fb950,
  NotebookEdit: 0x3fb950,
  Grep: 0xbc8cff,
  Glob: 0xbc8cff,
  Agent: 0xf778ba,
  WebFetch: 0x39c5cf,
  WebSearch: 0x39c5cf,
}
const IDLE: TimelineTurn = { startedAt: 0, endedAt: null, calls: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'timeline-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'timeline-widget', key: 'tick' } as const, 0)
const turn = atom({ plugin: 'timeline-widget', key: 'turn' } as const, IDLE)

let timer: Timer | undefined

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const span = (ms: number): string => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`)

const sync = async ($: EngineInterface): Promise<void> => {
  const held = await read($, turn)
  const isWanted = (await read($, isOn)) && held.startedAt > 0 && held.endedAt === null
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

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  await read($, tick)
  const wanted = (await $.state.get(widths)).value?.['timeline-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, turn)
  const now = held.endedAt ?? (await $.clock.now())
  const length = Math.max(MIN_SPAN_MS, held.startedAt === 0 ? 0 : now - held.startedAt)
  const at = (time: number): number => Math.min(inner - 1, Math.floor(((time - held.startedAt) / length) * inner))
  const marks: WidgetsMark[] = []

  for (let x = 0; x < inner; x += 1) marks.push([x, CHART_ROWS - 1, AXIS])
  for (let quarter = 0; quarter <= 4; quarter += 1) {
    marks.push([Math.min(inner - 1, Math.floor((quarter / 4) * inner)), CHART_ROWS - 1, TICK])
  }
  for (const call of held.calls) {
    const left = at(call.from)
    const right = Math.max(left, at(call.to ?? now))
    const color = call.isFailed ? FAILED : (KINDS[call.tool] ?? OTHER)
    for (let x = left; x <= right; x += 1) {
      marks.push([x, call.lane * LANE_ROWS, color], [x, call.lane * LANE_ROWS + 1, color])
    }
  }

  return $.widgets.card({
    beneath,
    width,
    title: 'Timeline',
    note: held.startedAt === 0 ? 'no turn yet' : `${some(held.calls.length, 'call')} · ${span(now - held.startedAt)}`,
    body: await $.widgets.picture({ surface, key: 'timeline', columns: inner, rows: CHART_ROWS, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'timeline-widget',
      description: 'Toggle the chart of when each tool call ran during the turn',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'timeline-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /timeline-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Timeline on; /widgets places it.' : 'Timeline off.' }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, turn, () => ({ startedAt: now, endedAt: null, calls: [] }))
    await sync($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, turn, held => ({ ...(held ?? IDLE), endedAt: now }))
      await sync($)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const from = await $.clock.now()
    await update($, turn, held => {
      const before = held ?? IDLE
      const busy = before.calls.filter(call => call.to === null).map(call => call.lane)
      const lane = Array.from({ length: LANES }, (_, index) => index).find(index => !busy.includes(index)) ?? LANES - 1

      return {
        ...before,
        startedAt: before.startedAt === 0 ? from : before.startedAt,
        calls: [...before.calls, { id: e.tool_use_id, tool: e.tool, from, to: null, lane, isFailed: false }],
      }
    })
    await sync($)

    let isFailed = true
    try {
      const ran = await next(e)
      isFailed = ran.isError === true || ran.deny !== undefined

      return ran
    } finally {
      const to = await $.clock.now()
      await update($, turn, held => ({
        ...(held ?? IDLE),
        calls: (held ?? IDLE).calls.map(call => (call.id === e.tool_use_id ? { ...call, to, isFailed } : call)),
      }))
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, e.surface, await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, e.surface, await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, e.surface, await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

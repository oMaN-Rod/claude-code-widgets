import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { TimerTurns } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 1000
const MAX_TURNS = 30
const BARS = '▁▂▃▄▅▆▇█'
const IDLE: TimerTurns = { startedAt: null, durations: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'timer-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'timer-widget', key: 'tick' } as const, 0)
const turns = atom({ plugin: 'timer-widget', key: 'turns' } as const, IDLE)

let timer: Timer | undefined

const span = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = (await read($, isOn)) && (await read($, turns)).startedAt !== null
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
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  await read($, tick)
  const wanted = (await $.state.get(widths)).value?.['timer-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const held = await read($, turns)
  const now = await $.clock.now()
  const shown = held.durations.slice(-(width - 4))
  const longest = Math.max(1, ...held.durations)
  const average = held.durations.reduce((sum, ms) => sum + ms, 0) / Math.max(1, held.durations.length)
  const last = held.durations[held.durations.length - 1]

  return $.widgets.card({
    beneath,
    width,
    title: 'Timer',
    note: held.startedAt === null ? 'idle' : `turn ${span(now - held.startedAt)}`,
    body: (
      <Box flexDirection="column">
        {last === undefined ? (
          <Text dimColor>No finished turns yet.</Text>
        ) : (
          <Text wrap="truncate-end">
            last {span(last)} · avg {span(average)} · longest {span(longest)}
          </Text>
        )}
        {shown.length > 0 && (
          <Text color="cyan">
            {shown.map(ms => BARS[Math.min(BARS.length - 1, Math.floor((ms / longest) * BARS.length))]).join('')}
          </Text>
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'timer-widget',
      description: 'Toggle the turn timer card',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'timer-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, turns, held => ({ startedAt: held?.startedAt ?? null, durations: [] }))

      return { text: 'Timer cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /timer-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Timer widget on; /widgets places it.' : 'Timer widget off.' }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, turns, held => ({ ...(held ?? IDLE), startedAt: now }))
    await sync($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, turns, held => ({
        startedAt: null,
        durations: [...(held ?? IDLE).durations, e.durationMs].slice(-MAX_TURNS),
      }))
      await sync($)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

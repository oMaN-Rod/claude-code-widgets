import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { StreamFlow } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 500
const MAX_BUCKETS = 60
const CHARS_PER_TOKEN = 4
const BARS = '▁▂▃▄▅▆▇█'
const QUIET: StreamFlow = { buckets: [], turnChars: 0, peak: 0, isLive: false }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'stream-widget', key: 'isOn' } as const, false)
const flow = atom({ plugin: 'stream-widget', key: 'flow' } as const, QUIET)

let timer: Timer | undefined
let pending = 0
let streams = 0

const rateOf = (chars: number): number => Math.round(((chars / CHARS_PER_TOKEN) * 1000) / TICK_MS)

const count = (tokens: number): string => (tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`)

const flush = async ($: EngineInterface): Promise<void> => {
  const chars = pending
  pending = 0
  await update($, flow, held => {
    const before = held ?? QUIET

    return {
      buckets: [...before.buckets, chars].slice(-MAX_BUCKETS),
      turnChars: before.turnChars + chars,
      peak: Math.max(before.peak, rateOf(chars)),
      isLive: streams > 0,
    }
  })
}

const sync = ($: EngineInterface): void => {
  if (streams > 0 && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void flush($)
    })
  }
  if (streams === 0 && timer !== undefined) {
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

  const wanted = (await $.state.get(widths)).value?.['stream-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const held = await read($, flow)
  const shown = held.buckets.slice(-(width - 4))
  const most = Math.max(1, ...shown)
  const now = rateOf(held.buckets[held.buckets.length - 1] ?? 0)

  return $.widgets.card({
    beneath,
    width,
    title: 'Stream',
    note: held.isLive ? `~${now} tok/s` : 'idle',
    body: (
      <Box flexDirection="column">
        {shown.length === 0 ? (
          <Text dimColor>Nothing streamed yet.</Text>
        ) : (
          <Text color="cyan">
            {shown.map(chars => BARS[Math.min(BARS.length - 1, Math.floor((chars / most) * BARS.length))]).join('')}
          </Text>
        )}
        <Text dimColor>
          ~{count(Math.round(held.turnChars / CHARS_PER_TOKEN))} tokens this turn, peak ~{held.peak}/s
        </Text>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'stream-widget',
      description: 'Toggle the live gauge of how fast Claude is writing',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'stream-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /stream-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Stream on; /widgets places it.' : 'Stream off.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, flow, held => ({ ...(held ?? QUIET), turnChars: 0, peak: 0 }))

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!(await read($, isOn))) return yield* next(e)

    streams += 1
    sync($)
    try {
      for await (const chunk of next(e)) {
        if (chunk.kind === 'text' || chunk.kind === 'thinking') pending += chunk.text.length
        yield chunk
      }
    } finally {
      streams -= 1
      sync($)
      await flush($)
    }
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

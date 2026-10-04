import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { RainFlow } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 120
const RAIN_ROWS = 14
const TAIL = 6
const MAX_BOOST = 3
const HEAD = 0xd2ffd9
const TRAIL = 0x3fb950
const DARK = 0x04130a
const CALM: RainFlow = { phase: 0, running: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'rain-widget', key: 'isOn' } as const, false)
const flow = atom({ plugin: 'rain-widget', key: 'flow' } as const, CALM)

let timer: Timer | undefined

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const shade = (color: number, factor: number): number =>
  (Math.round((color >> 16) * factor) << 16) |
  (Math.round(((color >> 8) & 255) * factor) << 8) |
  Math.round((color & 255) * factor)

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, flow, held => {
        const before = held ?? CALM

        return { ...before, phase: (before.phase + 1 + Math.min(MAX_BOOST, before.running * 2)) % 1_000_000 }
      })
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

  const wanted = (await $.state.get(widths)).value?.['rain-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, flow)
  const marks: WidgetsMark[] = []

  for (let x = 0; x < inner; x += 2) {
    const pace = 1 + ((x * 7) % 3)
    const head = Math.floor((held.phase * pace) / 2 + x * 5) % (RAIN_ROWS + TAIL)
    for (let drop = 0; drop < TAIL; drop += 1) {
      marks.push([x, head - drop, drop === 0 ? HEAD : shade(TRAIL, 1 - drop / TAIL)])
    }
  }

  return $.widgets.card({
    beneath,
    width,
    title: 'Rain',
    note: held.running === 0 ? 'quiet' : `${some(held.running, 'call')} running`,
    body: await $.widgets.picture({ surface, key: 'rain', columns: inner, rows: RAIN_ROWS, fill: DARK, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rain-widget',
      description: 'Toggle the code rain that speeds up while tool calls run',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'rain-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /rain-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Rain on; /widgets places it.' : 'Rain off.' }
  })

  on('tool.call', async ($, e, next) => {
    await update($, flow, held => ({ ...(held ?? CALM), running: (held ?? CALM).running + 1 }))
    try {
      return await next(e)
    } finally {
      await update($, flow, held => ({ ...(held ?? CALM), running: Math.max(0, (held ?? CALM).running - 1) }))
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

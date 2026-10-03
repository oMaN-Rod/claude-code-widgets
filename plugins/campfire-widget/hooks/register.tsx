import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { CampfireBlaze } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 200
const FIRE_ROWS = 14
const REACH = 9
const MAX_HEAT = 10
const STOKE = 1.5
const COOLING = 0.06
const NIGHT = 0x0b1026
const GROUND = 0x1f2933
const LOG = 0x6b4423
const LOG_DARK = 0x4a2f18
const EMBER = 0xe8590c
const FLAMES = [0xfff1b8, 0xffd43b, 0xff922b, 0xe03131]
const COLD: CampfireBlaze = { heat: 0, tick: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'campfire-widget', key: 'isOn' } as const, false)
const blaze = atom({ plugin: 'campfire-widget', key: 'blaze' } as const, COLD)

let timer: Timer | undefined

const noise = (one: number, other: number): number => (((one * 73_856_093) ^ (other * 19_349_663)) >>> 0) % 100 / 100

const moodOf = (heat: number): string =>
  heat < 1 ? 'embers' : heat < 4 ? 'crackling' : heat < 8 ? 'burning' : 'roaring'

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, blaze, held => ({
        heat: Math.max(0, (held ?? COLD).heat - COOLING),
        tick: ((held ?? COLD).tick + 1) % 1_000_000,
      }))
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

  const wanted = (await $.state.get(widths)).value?.['campfire-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const { heat, tick } = await read($, blaze)
  const middle = Math.floor(inner / 2)
  const base = FIRE_ROWS - 3
  const marks: WidgetsMark[] = []

  for (let x = 0; x < inner; x += 1) marks.push([x, FIRE_ROWS - 1, GROUND])
  for (let offset = -REACH; offset <= REACH; offset += 1) {
    const shape = 1 - Math.abs(offset) / (REACH + 1)
    const height = Math.round(heat * shape * (0.7 + 0.3 * noise(tick, offset)))
    for (let level = 0; level < height; level += 1) {
      const band = Math.min(FLAMES.length - 1, Math.floor((level / Math.max(1, height)) * FLAMES.length))
      marks.push([middle + offset, base - level, FLAMES[band] ?? EMBER])
    }
  }
  for (let spark = 0; spark < Math.floor(heat / 3); spark += 1) {
    const drift = Math.round((noise(spark, Math.floor(tick / 2)) - 0.5) * REACH * 2)
    marks.push([middle + drift, base - Math.round(heat) - 1 - ((tick + spark * 3) % 3), FLAMES[1] ?? EMBER])
  }
  for (let offset = -REACH; offset <= REACH; offset += 1) {
    const isGlowing = heat < 1 ? noise(Math.floor(tick / 3), offset) > 0.7 : offset % 4 === 0
    marks.push([middle + offset, base + 1, isGlowing ? EMBER : offset % 3 === 0 ? LOG_DARK : LOG])
  }

  return $.widgets.card({
    beneath,
    width,
    title: 'Campfire',
    note: moodOf(heat),
    body: await $.widgets.picture({ surface, key: 'campfire', columns: inner, rows: FIRE_ROWS, fill: NIGHT, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'campfire-widget',
      description: 'Toggle the campfire that burns higher the busier the session is',
      argumentHint: '[on|off|stoke]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'campfire-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'stoke') {
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await update($, blaze, held => ({ ...(held ?? COLD), heat: MAX_HEAT }))
      await sync($)

      return { text: 'Campfire stoked.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /campfire-widget [on|off|stoke]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Campfire on; /widgets places it.' : 'Campfire off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) {
      await update($, blaze, held => ({ ...(held ?? COLD), heat: Math.min(MAX_HEAT, (held ?? COLD).heat + STOKE) }))
    }

    return next(e)
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

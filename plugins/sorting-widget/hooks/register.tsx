import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { SortingDeck } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const BARS = 18
const CHART_ROWS = 12
const LOW = 0x1c7ed6
const HIGH = 0x63e6be
const MOVED = 0xfff1b8
const FLOOR = 0x30363d
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const

const shuffle = (seed: number): number[] => {
  const bars = Array.from({ length: BARS }, (_, index) => 1 + Math.round((index / (BARS - 1)) * (CHART_ROWS - 2)))
  let state = (seed % 2_147_483_647) + 1
  for (let index = bars.length - 1; index > 0; index -= 1) {
    state = (state * 48_271) % 2_147_483_647
    const other = state % (index + 1)
    const held = bars[index] ?? 0
    bars[index] = bars[other] ?? 0
    bars[other] = held
  }

  return bars
}

const FRESH: SortingDeck = { bars: shuffle(7), cursor: 0, moved: [], swaps: 0, sorted: 0 }
const isOn = atom({ plugin: 'sorting-widget', key: 'isOn' } as const, false)
const deck = atom({ plugin: 'sorting-widget', key: 'deck' } as const, FRESH)

const step = (held: SortingDeck | undefined): SortingDeck => {
  const before = held ?? FRESH
  for (let tries = 0; tries < BARS; tries += 1) {
    const at = (before.cursor + tries) % (BARS - 1)
    const one = before.bars[at] ?? 0
    const other = before.bars[at + 1] ?? 0
    if (one > other) {
      const bars = [...before.bars]
      bars[at] = other
      bars[at + 1] = one

      return { ...before, bars, cursor: at + 1, moved: [at, at + 1], swaps: before.swaps + 1 }
    }
  }

  return { bars: shuffle(before.swaps + 11), cursor: 0, moved: [], swaps: before.swaps, sorted: before.sorted + 1 }
}

const blend = (share: number): number => {
  const mix = (shift: number): number =>
    Math.round(((LOW >> shift) & 255) + (((HIGH >> shift) & 255) - ((LOW >> shift) & 255)) * share)

  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
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

  const wanted = (await $.state.get(widths)).value?.['sorting-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const pitch = Math.max(2, Math.floor(inner / BARS))
  const held = await read($, deck)
  const marks: WidgetsMark[] = []

  for (let x = 0; x < inner; x += 1) marks.push([x, CHART_ROWS - 1, FLOOR])
  held.bars.forEach((height, index) => {
    const color = held.moved.includes(index) ? MOVED : blend(height / (CHART_ROWS - 1))
    for (let level = 0; level < height; level += 1) {
      for (let dx = 0; dx < pitch - 1; dx += 1) marks.push([index * pitch + dx, CHART_ROWS - 2 - level, color])
    }
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Sorting',
    note: `${held.swaps} swaps · ${held.sorted} sorted`,
    body: await $.widgets.picture({ surface, key: 'sorting', columns: inner, rows: CHART_ROWS, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sorting-widget',
      description: 'Toggle the bar chart that sorts itself one swap per tool call',
      argumentHint: '[on|off|step]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'sorting-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'step') {
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await update($, deck, step)

      return { text: 'One swap.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /sorting-widget [on|off|step]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Sorting on; /widgets places it.' : 'Sorting off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) await update($, deck, step)

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

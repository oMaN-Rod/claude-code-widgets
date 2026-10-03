import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { CoffeeCup } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 20_000
const DEFAULT_MINUTES = 90
const MAX_MINUTES = 480
const CUP_ROWS = 14
const INSIDE_ROWS = 7
const CHINA = 0xe6edf3
const SHADOW = 0xafb8c1
const COFFEE = 0x6f4e37
const CREMA = 0xa9825a
const STEAM = 0x8b949e
const USAGE = 'Usage: /coffee-widget [on|off|refill|<minutes>]'
const EMPTY: CoffeeCup = { pouredAt: 0, lastsMs: DEFAULT_MINUTES * 60_000, isNudged: false, cups: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'coffee-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'coffee-widget', key: 'tick' } as const, 0)
const cup = atom({ plugin: 'coffee-widget', key: 'cup' } as const, EMPTY)

let timer: Timer | undefined

const beat = async ($: EngineInterface): Promise<void> => {
  const held = await read($, cup)
  const now = await $.clock.now()
  if (held.pouredAt > 0 && !held.isNudged && now - held.pouredAt >= held.lastsMs) {
    await update($, cup, before => ({ ...(before ?? EMPTY), isNudged: true }))
    $.ui.toast('The cup is empty. Time for a break.')
  }
  await update($, tick, count => ((count ?? 0) + 1) % 1_000_000)
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void beat($)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const pour = async ($: EngineInterface, minutes?: number): Promise<void> => {
  const now = await $.clock.now()
  await update($, cup, held => ({
    pouredAt: now,
    lastsMs: minutes === undefined ? (held ?? EMPTY).lastsMs : minutes * 60_000,
    isNudged: false,
    cups: (held ?? EMPTY).cups + 1,
  }))
}

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const beat2 = await read($, tick)
  const wanted = (await $.state.get(widths)).value?.['coffee-widget'] ?? CARD_COLUMNS
  const held = await read($, cup)
  const now = await $.clock.now()
  const left = held.pouredAt === 0 ? 0 : Math.max(0, 1 - (now - held.pouredAt) / held.lastsMs)
  const level = Math.ceil(left * INSIDE_ROWS)
  const minutes = Math.ceil((left * held.lastsMs) / 60_000)
  const marks: WidgetsMark[] = []
  const top = CUP_ROWS - INSIDE_ROWS - 2

  for (let y = top; y < CUP_ROWS - 1; y += 1) {
    marks.push([2, y, CHINA], [13, y, SHADOW])
    for (let x = 3; x < 13; x += 1) {
      const depth = CUP_ROWS - 2 - y
      if (y === CUP_ROWS - 2) marks.push([x, y, SHADOW])
      else if (depth <= level) marks.push([x, y, depth === level ? CREMA : COFFEE])
    }
  }
  for (const [x, y] of [[14, top + 2], [15, top + 2], [16, top + 3], [16, top + 4], [15, top + 5], [14, top + 5]] as const) {
    marks.push([x, y, CHINA])
  }
  for (let x = 1; x < 15; x += 1) marks.push([x, CUP_ROWS - 1, SHADOW])
  if (left > 0.5) {
    for (const x of [5, 8, 11]) {
      for (let puff = 0; puff < 3; puff += 1) marks.push([x + ((puff + beat2) % 2), top - 2 - puff, STEAM])
    }
  }

  const picture = await $.widgets.picture({ surface, key: 'coffee', columns: 18, rows: CUP_ROWS, marks })

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Coffee',
    note: left === 0 ? 'empty' : `${Math.round(left * 100)}% left`,
    body: (
      <Box columnGap={2}>
        {picture}
        <Box flexDirection="column" justifyContent="center">
          {left === 0 ? <Text color="yellow">Take a break.</Text> : <Text>{minutes}m until a break</Text>}
          <Text dimColor>{held.cups} cups this session</Text>
          <Text dimColor>/coffee-widget refill</Text>
        </Box>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'coffee-widget',
      description: 'Toggle the coffee cup that empties as you work and nudges you to take a break',
      argumentHint: '[on|off|refill|<minutes>]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if ((await read($, isOn)) && (await read($, cup)).pouredAt === 0) await pour($)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'coffee-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'refill' || /^\d+$/.test(arg)) {
      const minutes = arg === 'refill' ? undefined : Math.min(MAX_MINUTES, Math.max(1, Number(arg)))
      await pour($, minutes)
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await sync($)

      return { text: minutes === undefined ? 'Cup refilled.' : `Cup refilled; it lasts ${minutes} minutes.` }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown && (await read($, cup)).pouredAt === 0) await pour($)
    await sync($)

    return { text: isShown ? 'Coffee on; /widgets places it.' : 'Coffee off.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, e.surface, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, e.surface, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, e.surface, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

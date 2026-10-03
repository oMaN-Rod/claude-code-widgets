import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { OrbitSpin } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 150
const SPACE_ROWS = 16
const MAX_BOOST = 3
const SPACE = 0x0b1026
const TRACK = 0x243056
const SUN = ['.yy.', 'yhhy', 'yhhy', '.yy.']
const PLANETS = [
  { across: 0.22, up: 3, pace: 5, size: 1, color: 0xc9d1d9 },
  { across: 0.42, up: 4.5, pace: 3, size: 2, color: 0x4dabf7 },
  { across: 0.66, up: 6, pace: 2, size: 2, color: 0xe8590c },
  { across: 0.92, up: 7, pace: 1.2, size: 3, color: 0xd9a066 },
]
const STILL: OrbitSpin = { phase: 0, running: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'orbit-widget', key: 'isOn' } as const, false)
const spin = atom({ plugin: 'orbit-widget', key: 'spin' } as const, STILL)

let timer: Timer | undefined

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, spin, held => {
        const before = held ?? STILL

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

  const wanted = (await $.state.get(widths)).value?.['orbit-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, spin)
  const middle = inner / 2
  const level = SPACE_ROWS / 2
  const marks: WidgetsMark[] = []

  for (const planet of PLANETS) {
    const reach = (planet.across * inner) / 2
    for (let step = 0; step < 48; step += 1) {
      const angle = (step / 48) * Math.PI * 2
      marks.push([Math.round(middle + Math.cos(angle) * reach), Math.round(level + Math.sin(angle) * planet.up), TRACK])
    }
  }
  marks.push({ lines: SUN, palette: { y: 0xf2cc60, h: 0xfff1b8 }, left: Math.round(middle) - 2, top: level - 2 })
  PLANETS.forEach((planet, index) => {
    const angle = (held.phase * planet.pace) / 60 + index * 1.7
    const x = Math.round(middle + (Math.cos(angle) * planet.across * inner) / 2)
    const y = Math.round(level + Math.sin(angle) * planet.up)
    for (let dy = 0; dy < Math.min(2, planet.size); dy += 1) {
      for (let dx = 0; dx < planet.size; dx += 1) marks.push([x + dx, y + dy, planet.color])
    }
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Orbit',
    note: held.running === 0 ? 'cruising' : `${held.running} calls · full speed`,
    body: await $.widgets.picture({ surface, key: 'orbit', columns: inner, rows: SPACE_ROWS, fill: SPACE, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'orbit-widget',
      description: 'Toggle the solar system whose planets speed up while tool calls run',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'orbit-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /orbit-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Orbit on; /widgets places it.' : 'Orbit off.' }
  })

  on('tool.call', async ($, e, next) => {
    await update($, spin, held => ({ ...(held ?? STILL), running: (held ?? STILL).running + 1 }))
    try {
      return await next(e)
    } finally {
      await update($, spin, held => ({ ...(held ?? STILL), running: Math.max(0, (held ?? STILL).running - 1) }))
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

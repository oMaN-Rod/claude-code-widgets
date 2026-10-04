import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { DonutSpin } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 120
const SPACE_ROWS = 22
const MAX_BOOST = 3
const SPACE = 0x0b1026
const TUBE = 1
const RING = 2
const DISTANCE = 5
const GLAZE = 0xf783ac
const STILL: DonutSpin = { phase: 0, running: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'donut-widget', key: 'isOn' } as const, false)
const spin = atom({ plugin: 'donut-widget', key: 'spin' } as const, STILL)

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

  const wanted = (await $.state.get(widths)).value?.['donut-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, spin)
  const tilt = held.phase * 0.07
  const roll = held.phase * 0.03
  const [sinA, cosA, sinB, cosB] = [Math.sin(tilt), Math.cos(tilt), Math.sin(roll), Math.cos(roll)]
  const zoom = (SPACE_ROWS * DISTANCE * 3) / (8 * (TUBE + RING))
  const depth = new Map<number, number>()
  const light = new Map<number, number>()

  for (let theta = 0; theta < Math.PI * 2; theta += 0.25) {
    const [sinT, cosT] = [Math.sin(theta), Math.cos(theta)]
    const circleX = RING + TUBE * cosT
    const circleY = TUBE * sinT
    for (let phi = 0; phi < Math.PI * 2; phi += 0.08) {
      const [sinP, cosP] = [Math.sin(phi), Math.cos(phi)]
      const x = circleX * (cosB * cosP + sinA * sinB * sinP) - circleY * cosA * sinB
      const y = circleX * (sinB * cosP - sinA * cosB * sinP) + circleY * cosA * cosB
      const near = 1 / (DISTANCE + cosA * circleX * sinP + circleY * sinA)
      const glow = cosP * cosT * sinB - cosA * cosT * sinP - sinA * sinT + cosB * (cosA * sinT - cosT * sinA * sinP)
      const column = Math.round(inner / 2 + zoom * near * x)
      const row = Math.round(SPACE_ROWS / 2 - zoom * near * y)
      const at = row * inner + column
      if (column < 0 || column >= inner || row < 0 || row >= SPACE_ROWS || near <= (depth.get(at) ?? 0)) continue
      depth.set(at, near)
      light.set(at, Math.max(0, glow))
    }
  }

  const marks: WidgetsMark[] = []
  for (const [at, glow] of light) {
    marks.push([at % inner, Math.floor(at / inner), shade(GLAZE, 0.25 + 0.75 * Math.min(1, glow / 1.4))])
  }

  return $.widgets.card({
    beneath,
    width,
    title: 'Donut',
    note: held.running === 0 ? 'turning' : `${some(held.running, 'call')} · spinning fast`,
    body: await $.widgets.picture({ surface, key: 'donut', columns: inner, rows: SPACE_ROWS, fill: SPACE, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'donut-widget',
      description: 'Toggle the spinning donut, which spins faster while tool calls run',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'donut-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /donut-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Donut on; /widgets places it.' : 'Donut off.' }
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

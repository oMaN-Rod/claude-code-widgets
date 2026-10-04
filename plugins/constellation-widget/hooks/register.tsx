import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { ConstellationSky } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const SKY_ROWS = 16
const FULL = 9
const NIGHT = 0x0b1026
const DUST = 0x2b3a67
const LINE = 0x4c5c96
const STAR = 0xfff1b8
const GLOW = 0xa5b4fc
const NAMES = [
  'The Lesser Linter',
  'The Great Refactor',
  'The Patient Debugger',
  'The Dangling Pointer',
  'The Merge Serpent',
  'The Green Build',
  'The Wandering Cursor',
  'The Twin Semicolons',
]
const DARK: ConstellationSky = { stars: [], calls: 0, finished: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'constellation-widget', key: 'isOn' } as const, false)
const sky = atom({ plugin: 'constellation-widget', key: 'sky' } as const, DARK)

const hash = (text: string): number => {
  let sum = 7
  for (const letter of text) sum = (sum * 31 + letter.charCodeAt(0)) % 100_003

  return sum
}

const place = (held: ConstellationSky | undefined, seed: string): ConstellationSky => {
  const before = held ?? DARK
  const isFull = before.stars.length >= FULL
  const star = {
    across: (hash(`${seed}x`) % 1000) / 1000,
    down: (hash(`${seed}y`) % 1000) / 1000,
    size: Math.min(2, Math.floor(before.calls / 4)),
  }

  return {
    stars: isFull ? [star] : [...before.stars, star],
    calls: 0,
    finished: before.finished + (before.stars.length + 1 === FULL ? 1 : 0),
  }
}

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  beneath: RenderElement,
  spot: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== spot) return beneath

  const wanted = (await $.state.get(widths)).value?.['constellation-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, sky)
  const marks: WidgetsMark[] = []
  const points = held.stars.map(
    star => [3 + Math.round(star.across * (inner - 7)), 2 + Math.round(star.down * (SKY_ROWS - 5))] as const,
  )

  for (let speck = 0; speck < 14; speck += 1) {
    marks.push([(speck * 29 + 3) % inner, (speck * 7 + 1) % SKY_ROWS, DUST])
  }
  points.forEach(([x, y], index) => {
    const next = points[index + 1]
    if (next === undefined) return
    const steps = Math.max(Math.abs(next[0] - x), Math.abs(next[1] - y))
    for (let step = 1; step < steps; step += 2) {
      marks.push([Math.round(x + ((next[0] - x) * step) / steps), Math.round(y + ((next[1] - y) * step) / steps), LINE])
    }
  })
  points.forEach(([x, y], index) => {
    const size = held.stars[index]?.size ?? 0
    if (size > 0) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) marks.push([x + dx, y + dy, GLOW])
    }
    if (size > 1) {
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) marks.push([x + dx, y + dy, LINE])
    }
    marks.push([x, y, STAR])
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Constellation',
    note: `${held.stars.length}/${FULL} · ${held.finished} charted`,
    body: await $.widgets.picture({ surface, key: 'constellation', columns: inner, rows: SKY_ROWS, fill: NIGHT, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'constellation-widget',
      description: 'Toggle the night sky that gains a star each turn',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'constellation-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, sky, () => DARK)

      return { text: 'Sky cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /constellation-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Constellation on; /widgets places it.' : 'Constellation off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) await update($, sky, held => ({ ...(held ?? DARK), calls: (held ?? DARK).calls + 1 }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isOn))) {
      const charted = await update($, sky, held => place(held, e.turnId))
      if (charted.stars.length === FULL) {
        $.ui.toast(`Constellation charted: ${NAMES[(charted.finished - 1) % NAMES.length] ?? ''}`)
      }
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

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { PipesMaze } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 100
const ACROSS = 36
const DOWN = 9
const CELL = 2
const FULL = 0.6
const DARK = 0x0d1117
const COLORS = [0x4dabf7, 0x3fb950, 0xffd43b, 0xf783ac, 0xda77f2, 0xff922b]
const WAYS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const
const EMPTY: PipesMaze = {
  cells: '.'.repeat(ACROSS * DOWN),
  x: 18,
  y: 4,
  heading: 0,
  color: 0,
  seed: 7,
  laid: 0,
  isPaused: false,
}
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'pipes-widget', key: 'isOn' } as const, false)
const maze = atom({ plugin: 'pipes-widget', key: 'maze' } as const, EMPTY)

let timer: Timer | undefined

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const shade = (color: number, factor: number): number =>
  (Math.round((color >> 16) * factor) << 16) |
  (Math.round(((color >> 8) & 255) * factor) << 8) |
  Math.round((color & 255) * factor)

const isOpen = (cells: string, x: number, y: number): boolean =>
  x >= 0 && x < ACROSS && y >= 0 && y < DOWN && cells[y * ACROSS + x] === '.'

const grow = (held: PipesMaze | undefined): PipesMaze => {
  const before = held ?? EMPTY
  if (before.isPaused) return before

  const seed = (before.seed * 1_103_515_245 + 12_345) % 2_147_483_648
  const roll = Math.floor(seed / 65_536)
  const laid = before.cells.replaceAll('.', '').length
  if (laid / before.cells.length > FULL) return { ...EMPTY, seed, color: (before.color + 1) % COLORS.length }

  const order = roll % 10 < 7 ? [0, 1, 3, 2] : roll % 2 === 0 ? [1, 3, 0, 2] : [3, 1, 0, 2]
  const turn = order
    .map(step => (before.heading + step) % WAYS.length)
    .find(heading => isOpen(before.cells, before.x + (WAYS[heading]?.[0] ?? 0), before.y + (WAYS[heading]?.[1] ?? 0)))

  if (turn === undefined) {
    const open = [...before.cells].flatMap((cell, at) => (cell === '.' ? [at] : []))
    const at = open[roll % Math.max(1, open.length)] ?? 0

    return { ...before, seed, x: at % ACROSS, y: Math.floor(at / ACROSS), heading: roll % 4, color: (before.color + 1) % COLORS.length }
  }

  const x = before.x + (WAYS[turn]?.[0] ?? 0)
  const y = before.y + (WAYS[turn]?.[1] ?? 0)
  const at = y * ACROSS + x

  return {
    ...before,
    seed,
    x,
    y,
    heading: turn,
    laid: before.laid + 1,
    cells: `${before.cells.slice(0, at)}${before.color}${before.cells.slice(at + 1)}`,
  }
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, maze, grow)
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

  const wanted = (await $.state.get(widths)).value?.['pipes-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = Math.min(ACROSS * CELL, (width - 4) * 2)
  const held = await read($, maze)
  const marks: WidgetsMark[] = []

  ;[...held.cells].forEach((cell, at) => {
    if (cell === '.') return
    const left = (at % ACROSS) * CELL
    const top = Math.floor(at / ACROSS) * CELL
    const isHead = at === held.y * ACROSS + held.x
    const color = isHead ? 0xffffff : (COLORS[Number(cell)] ?? 0xffffff)
    marks.push([left, top, color], [left + 1, top, shade(color, 0.8)])
    marks.push([left, top + 1, shade(color, 0.8)], [left + 1, top + 1, shade(color, 0.6)])
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Pipes',
    note: held.isPaused ? 'paused while Claude works' : some(held.laid, 'segment'),
    body: await $.widgets.picture({ surface, key: 'pipes', columns: inner, rows: DOWN * CELL, fill: DARK, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pipes-widget',
      description: 'Toggle the pipes screensaver, which grows while the session is idle',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'pipes-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /pipes-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Pipes on; /widgets places it.' : 'Pipes off.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, maze, held => ({ ...(held ?? EMPTY), isPaused: true }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await update($, maze, held => ({ ...(held ?? EMPTY), isPaused: false }))

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

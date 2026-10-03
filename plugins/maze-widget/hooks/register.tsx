import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { MazeTrek } from '../types'

type Point = readonly [x: number, y: number]
type Layout = { walls: string[]; path: Point[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 150
const VIEW_ROWS = 20
const CELLS = 7
const SIZE = CELLS * 2 + 1
const STRIDE_TICKS = 8
const TURN_TICKS = 4
const FIELD = 1.1
const CEILING = 0x0b1026
const FLOOR = 0x1f2933
const FACES = [0xc2703d, 0x8a4f2b]
const WAYS: readonly Point[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const START: MazeTrek = { seed: 7, step: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'maze-widget', key: 'isOn' } as const, false)
const trek = atom({ plugin: 'maze-widget', key: 'trek' } as const, START)

let timer: Timer | undefined
let built: { seed: number; layout: Layout } | undefined

const hash = (text: string): number => {
  let sum = 7
  for (const letter of text) sum = (sum * 31 + letter.charCodeAt(0)) % 100_003

  return sum
}

const shade = (color: number, factor: number): number =>
  (Math.round((color >> 16) * factor) << 16) |
  (Math.round(((color >> 8) & 255) * factor) << 8) |
  Math.round((color & 255) * factor)

const build = (seed: number): Layout => {
  if (built?.seed === seed) return built.layout

  const grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => '#'))
  const seen = new Set<number>([0])
  const trail: Point[] = [[0, 0]]
  const path: Point[] = [[1.5, 1.5]]
  let state = (seed % 2_147_483_647) + 1

  const open = (x: number, y: number): void => {
    const row = grid[y]
    if (row !== undefined) row[x] = '.'
  }
  open(1, 1)
  while (trail.length > 0) {
    const [x, y] = trail[trail.length - 1] ?? [0, 0]
    const free = WAYS.filter(([dx, dy]) => {
      const [nx, ny] = [x + dx, y + dy]

      return nx >= 0 && ny >= 0 && nx < CELLS && ny < CELLS && !seen.has(ny * CELLS + nx)
    })
    if (free.length === 0) {
      trail.pop()
      const back = trail[trail.length - 1]
      if (back !== undefined) path.push([back[0] * 2 + 1.5, back[1] * 2 + 1.5])
      continue
    }
    state = (state * 48_271) % 2_147_483_647
    const [dx, dy] = free[state % free.length] ?? [1, 0]
    open(x * 2 + 1 + dx, y * 2 + 1 + dy)
    open((x + dx) * 2 + 1, (y + dy) * 2 + 1)
    seen.add((y + dy) * CELLS + x + dx)
    trail.push([x + dx, y + dy])
    path.push([(x + dx) * 2 + 1.5, (y + dy) * 2 + 1.5])
  }

  const layout = { walls: grid.map(row => row.join('')), path }
  built = { seed, layout }

  return layout
}

const headingOf = (from: Point, to: Point): number => Math.atan2(to[1] - from[1], to[0] - from[0])

const view = (held: MazeTrek): { x: number; y: number; angle: number; walls: string[] } => {
  const { walls, path } = build(held.seed)
  const legs = path.length - 1
  const leg = Math.floor(held.step / STRIDE_TICKS) % legs
  const along = (held.step % STRIDE_TICKS) / STRIDE_TICKS
  const from = path[leg] ?? [1.5, 1.5]
  const to = path[leg + 1] ?? from
  const before = path[(leg - 1 + legs) % legs] ?? from
  const now = headingOf(from, to)
  const was = leg === 0 ? now : headingOf(before, from)
  const swing = Math.atan2(Math.sin(now - was), Math.cos(now - was))
  const turned = Math.min(1, (held.step % STRIDE_TICKS) / TURN_TICKS)

  return {
    x: from[0] + (to[0] - from[0]) * along,
    y: from[1] + (to[1] - from[1]) * along,
    angle: was + swing * turned,
    walls,
  }
}

const cast = (walls: readonly string[], x: number, y: number, angle: number): { distance: number; face: number } => {
  const [dirX, dirY] = [Math.cos(angle) || 1e-6, Math.sin(angle) || 1e-6]
  const [gapX, gapY] = [Math.abs(1 / dirX), Math.abs(1 / dirY)]
  let [cellX, cellY] = [Math.floor(x), Math.floor(y)]
  let reachX = dirX < 0 ? (x - cellX) * gapX : (cellX + 1 - x) * gapX
  let reachY = dirY < 0 ? (y - cellY) * gapY : (cellY + 1 - y) * gapY
  let face = 0

  for (let hops = 0; hops < SIZE * 3; hops += 1) {
    if (reachX < reachY) {
      reachX += gapX
      cellX += dirX < 0 ? -1 : 1
      face = 0
    } else {
      reachY += gapY
      cellY += dirY < 0 ? -1 : 1
      face = 1
    }
    if (walls[cellY]?.[cellX] !== '.') break
  }

  return { distance: face === 0 ? reachX - gapX : reachY - gapY, face }
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, trek, held => ({ ...(held ?? START), step: ((held ?? START).step + 1) % 1_000_000 }))
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

  const wanted = (await $.state.get(widths)).value?.['maze-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, trek)
  const eye = view(held)
  const marks: WidgetsMark[] = []

  for (let y = VIEW_ROWS / 2; y < VIEW_ROWS; y += 1) {
    const floor = shade(FLOOR, 0.5 + (y - VIEW_ROWS / 2) / VIEW_ROWS)
    for (let x = 0; x < inner; x += 1) marks.push([x, y, floor])
  }
  for (let x = 0; x < inner; x += 1) {
    const ray = eye.angle + (x / inner - 0.5) * FIELD
    const hit = cast(eye.walls, eye.x, eye.y, ray)
    const distance = Math.max(0.1, hit.distance * Math.cos(ray - eye.angle))
    const height = Math.min(VIEW_ROWS, Math.round(VIEW_ROWS / distance))
    const top = Math.floor((VIEW_ROWS - height) / 2)
    const color = shade(FACES[hit.face] ?? FACES[0] ?? 0, Math.max(0.25, Math.min(1, 1.6 / distance)))
    for (let y = top; y < top + height; y += 1) marks.push([x, y, color])
  }

  return $.widgets.card({
    beneath,
    width,
    title: 'Maze',
    note: `${Math.floor(held.step / STRIDE_TICKS)} steps`,
    body: await $.widgets.picture({ surface, key: 'maze', columns: inner, rows: VIEW_ROWS, fill: CEILING, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'maze-widget',
      description: 'Toggle the first-person walk through a maze seeded by the project folder',
      argumentHint: '[on|off|new]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await update($, trek, () => ({ seed: hash(e.cwd), step: 0 }))
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'maze-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'new') {
      await update($, trek, held => ({ seed: (held ?? START).seed + 1, step: 0 }))

      return { text: 'A new maze.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /maze-widget [on|off|new]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Maze on; /widgets places it.' : 'Maze off.' }
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

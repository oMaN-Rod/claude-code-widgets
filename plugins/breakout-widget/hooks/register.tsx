import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { BreakoutGame } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 90
const FIELD_COLUMNS = 72
const FIELD_ROWS = 18
const BRICK_COLUMNS = 6
const BRICK_ROWS = 3
const ACROSS = FIELD_COLUMNS / BRICK_COLUMNS
const MAX_COURSES = 4
const PADDLE = 10
const PADDLE_ROW = FIELD_ROWS - 2
const DARK = 0x0d1117
const BALL = 0xffffff
const BAT = 0xc9d1d9
const COURSES = [0xe5484d, 0xf0883e, 0xffd43b, 0x3fb950]
const FULL = '1'.repeat(ACROSS)
const FRESH: BreakoutGame = { x: 36, y: 12, dx: 1, dy: -1, bricks: [FULL, FULL, FULL], score: 0, walls: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'breakout-widget', key: 'isOn' } as const, false)
const game = atom({ plugin: 'breakout-widget', key: 'game' } as const, FRESH)

let timer: Timer | undefined

const advance = (held: BreakoutGame | undefined): BreakoutGame => {
  const before = held ?? FRESH
  let { dx, dy, score, walls } = before
  let bricks = before.bricks

  if (before.x + dx < 0 || before.x + dx >= FIELD_COLUMNS) dx = -dx
  if (before.y + dy < 0) dy = 1
  if (before.y + dy >= PADDLE_ROW) {
    dy = -1
    dx = (before.x + score) % 5 === 0 ? -dx : dx
  }

  const x = before.x + dx
  const y = before.y + dy
  const course = Math.floor((y - 1) / BRICK_ROWS)
  const column = Math.floor(x / BRICK_COLUMNS)
  const isInBrick = y >= 1 && (y - 1) % BRICK_ROWS < BRICK_ROWS - 1 && x % BRICK_COLUMNS < BRICK_COLUMNS - 1

  if (isInBrick && bricks[course]?.[column] === '1') {
    bricks = bricks.map((row, index) =>
      index === course ? `${row.slice(0, column)}0${row.slice(column + 1)}` : row,
    )
    dy = -dy
    score += 1
  }
  if (bricks.every(row => !row.includes('1'))) {
    bricks = [FULL, FULL, FULL]
    walls += 1
  }

  return { x, y, dx, dy, bricks, score, walls }
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, game, advance)
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

  const wanted = (await $.state.get(widths)).value?.['breakout-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = Math.min(FIELD_COLUMNS, (width - 4) * 2)
  const held = await read($, game)
  const bat = Math.min(FIELD_COLUMNS - PADDLE, Math.max(0, held.x - PADDLE / 2))
  const marks: WidgetsMark[] = []

  held.bricks.forEach((row, course) => {
    ;[...row].forEach((brick, column) => {
      if (brick !== '1') return
      for (let dy = 0; dy < BRICK_ROWS - 1; dy += 1) {
        for (let dx = 0; dx < BRICK_COLUMNS - 1; dx += 1) {
          marks.push([column * BRICK_COLUMNS + dx, 1 + course * BRICK_ROWS + dy, COURSES[course % COURSES.length] ?? BAT])
        }
      }
    })
  })
  for (let dx = 0; dx < PADDLE; dx += 1) marks.push([bat + dx, PADDLE_ROW, BAT])
  marks.push([held.x, held.y, BALL])

  return $.widgets.card({
    beneath,
    width,
    title: 'Breakout',
    note: `${held.score} bricks · ${held.walls} walls cleared`,
    body: await $.widgets.picture({ surface, key: 'breakout', columns: inner, rows: FIELD_ROWS, fill: DARK, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'breakout-widget',
      description: 'Toggle the self-playing brick breaker; tool calls add rows of bricks',
      argumentHint: '[on|off|reset]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'breakout-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'reset') {
      await update($, game, () => FRESH)

      return { text: 'Breakout reset.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /breakout-widget [on|off|reset]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Breakout on; /widgets places it.' : 'Breakout off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) {
      await update($, game, held => ({
        ...(held ?? FRESH),
        bricks: [FULL, ...(held ?? FRESH).bricks].slice(0, MAX_COURSES),
      }))
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

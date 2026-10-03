import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { LifeBoard } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 300
const BOARD_COLUMNS = 72
const BOARD_ROWS = 20
const STALE_LIMIT = 12
const ALIVE = 0x3fb950
const YOUNG = 0xa5f3b5
const GLIDER = ['.#.', '..#', '###']
const EMPTY: LifeBoard = { rows: [], generation: 0, stale: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'life-widget', key: 'isOn' } as const, false)
const board = atom({ plugin: 'life-widget', key: 'board' } as const, EMPTY)

let timer: Timer | undefined

const hash = (text: string): number => {
  let sum = 7
  for (const letter of text) sum = (sum * 31 + letter.charCodeAt(0)) % 100_003

  return sum
}

const soup = (seed: number): string[] => {
  let state = (seed % 2_147_483_647) + 1

  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLUMNS }, () => {
      state = (state * 48_271) % 2_147_483_647

      return state % 4 === 0 ? '1' : '0'
    }).join(''),
  )
}

const isAlive = (rows: readonly string[], x: number, y: number): boolean =>
  rows[(y + BOARD_ROWS) % BOARD_ROWS]?.[(x + BOARD_COLUMNS) % BOARD_COLUMNS] === '1'

const step = (rows: readonly string[]): string[] =>
  rows.map((row, y) =>
    [...row]
      .map((cell, x) => {
        let near = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if ((dx !== 0 || dy !== 0) && isAlive(rows, x + dx, y + dy)) near += 1
          }
        }

        return near === 3 || (cell === '1' && near === 2) ? '1' : '0'
      })
      .join(''),
  )

const stamp = (rows: readonly string[], left: number, top: number): string[] =>
  rows.map((row, y) =>
    [...row]
      .map((cell, x) => {
        const line = GLIDER[(y - top + BOARD_ROWS) % BOARD_ROWS]
        const mark = line?.[(x - left + BOARD_COLUMNS) % BOARD_COLUMNS]

        return mark === '#' ? '1' : cell
      })
      .join(''),
  )

const advance = (held: LifeBoard | undefined, now: number): LifeBoard => {
  const before = held ?? EMPTY
  if (before.rows.length === 0 || before.stale >= STALE_LIMIT) {
    return { rows: soup(now + before.generation), generation: 0, stale: 0 }
  }
  const rows = step(before.rows)
  const count = rows.join('').replaceAll('0', '').length
  const isSame = count === before.rows.join('').replaceAll('0', '').length

  return { rows, generation: before.generation + 1, stale: count === 0 ? STALE_LIMIT : isSame ? before.stale + 1 : 0 }
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void (async () => {
        const now = await $.clock.now()
        await update($, board, held => advance(held, now))
      })()
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

  const wanted = (await $.state.get(widths)).value?.['life-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = Math.min(BOARD_COLUMNS, (width - 4) * 2)
  const held = await read($, board)
  const marks: WidgetsMark[] = []
  let count = 0

  held.rows.forEach((row, y) => {
    for (let x = 0; x < inner; x += 1) {
      if (row[x] !== '1') continue
      count += 1
      marks.push([x, y, held.generation < 2 ? YOUNG : ALIVE])
    }
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Life',
    note: `gen ${held.generation} · ${count} alive`,
    body: await $.widgets.picture({ surface, key: 'life', columns: inner, rows: BOARD_ROWS, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'life-widget',
      description: "Toggle Conway's Game of Life; tool calls drop gliders",
      argumentHint: '[on|off|reset]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'life-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'reset') {
      await update($, board, () => EMPTY)

      return { text: 'Life reseeded.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /life-widget [on|off|reset]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Life on; /widgets places it.' : 'Life off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) {
      const seed = hash(e.tool_use_id)
      await update($, board, held => {
        const before = held ?? EMPTY

        return before.rows.length === 0
          ? before
          : { ...before, rows: stamp(before.rows, seed % BOARD_COLUMNS, seed % BOARD_ROWS), stale: 0 }
      })
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

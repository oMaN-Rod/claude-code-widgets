import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { InvadersFleet } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 300
const SPACE_ROWS = 18
const MAX_INVADERS = 10
const PER_ROW = 5
const SPACING = 10
const LASER_MS = 600
const SPACE = 0x0b1026
const LASER = 0xff6b6b
const INVADER = [
  ['.#...#.', '#######', '##.#.##', '#######', '.#.#.#.'],
  ['.#...#.', '#######', '##.#.##', '#######', '#.#.#.#'],
] as const
const SHIP = ['...#...', '.#####.', '#######']
const COLORS = [0x69db7c, 0x4dabf7, 0xda77f2, 0xffd43b, 0xff922b]
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const CLEAR: InvadersFleet = { invaders: 0, downed: 0, firedAt: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'invaders-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'invaders-widget', key: 'tick' } as const, 0)
const fleet = atom({ plugin: 'invaders-widget', key: 'fleet' } as const, CLEAR)

let timer: Timer | undefined

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, tick, count => ((count ?? 0) + 1) % 1_000_000)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const arrive = async ($: EngineInterface): Promise<void> => {
  await update($, fleet, held => ({
    ...(held ?? CLEAR),
    invaders: Math.min(MAX_INVADERS, (held ?? CLEAR).invaders + 1),
  }))
}

const fire = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  await update($, fleet, held => {
    const before = held ?? CLEAR

    return before.invaders === 0
      ? before
      : { invaders: before.invaders - 1, downed: before.downed + 1, firedAt: now }
  })
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

  const wanted = (await $.state.get(widths)).value?.['invaders-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const beat = await read($, tick)
  const held = await read($, fleet)
  const now = await $.clock.now()
  const sway = [0, 1, 2, 3, 2, 1][beat % 6] ?? 0
  const start = Math.floor((inner - PER_ROW * SPACING) / 2)
  const ship = Math.floor(inner / 2) - 3
  const marks: WidgetsMark[] = []
  const slot = (index: number): readonly [number, number] => [
    start + (index % PER_ROW) * SPACING + (Math.floor(index / PER_ROW) % 2 === 0 ? sway : 3 - sway),
    1 + Math.floor(index / PER_ROW) * 7,
  ]

  for (let index = 0; index < held.invaders; index += 1) {
    const [left, top] = slot(index)
    marks.push({
      lines: INVADER[beat % 2] ?? INVADER[0],
      palette: { '#': COLORS[index % COLORS.length] ?? 0xffffff },
      left,
      top,
    })
  }
  if (now - held.firedAt < LASER_MS && held.downed > 0) {
    const [left, top] = slot(held.invaders)
    for (let y = top + 2; y < SPACE_ROWS - 3; y += 1) marks.push([left + 3, y, LASER])
    marks.push({ lines: SHIP, palette: { '#': 0xe6edf3 }, left, top: SPACE_ROWS - 3 })
  } else {
    marks.push({ lines: SHIP, palette: { '#': 0xe6edf3 }, left: ship, top: SPACE_ROWS - 3 })
  }

  return $.widgets.card({
    beneath,
    width,
    title: 'Invaders',
    note: held.invaders === 0 ? `all clear · ${held.downed} shot down` : `${held.invaders} invaders · ${held.downed} shot down`,
    body: await $.widgets.picture({ surface, key: 'invaders', columns: inner, rows: SPACE_ROWS, fill: SPACE, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'invaders-widget',
      description: 'Toggle the invaders: failing checks send them in, passing checks shoot them down',
      argumentHint: '[on|off|demo|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'invaders-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'demo') {
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await sync($)
      await arrive($)

      return { text: 'Invaders on, one incoming.' }
    }
    if (arg === 'clear') {
      await update($, fleet, () => CLEAR)

      return { text: 'Invaders cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /invaders-widget [on|off|demo|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Invaders on; /widgets places it.' : 'Invaders off.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const command = String((e as { command?: unknown }).command ?? '')
    if (ran.deny !== undefined || !CHECKS.test(command) || !(await read($, isOn))) return ran

    await (ran.isError === true ? arrive($) : fire($))

    return ran
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

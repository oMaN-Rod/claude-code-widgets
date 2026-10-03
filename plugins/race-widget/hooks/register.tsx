import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { RaceCar } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LANES = 5
const LANE_ROWS = 3
const TRACK_ROWS = LANES * LANE_ROWS + 1
const STRIDE = 3
const CAR = ['.bbb.', 'bbbbb']
const ROAD = 0x21262d
const LINE = 0x484f58
const COLORS = [0xe5484d, 0x4dabf7, 0x3fb950, 0xffd43b, 0xda77f2]
const PLACES = ['1st', '2nd', '3rd', '4th', '5th']
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'race-widget', key: 'isOn' } as const, false)
const cars = atom({ plugin: 'race-widget', key: 'cars' } as const, [])

const advance = (held: readonly RaceCar[] | undefined, id: string): RaceCar[] => {
  const before = held ?? []
  const isOver = before.length > 0 && before.every(car => car.place !== null)
  const grid = isOver && !before.some(car => car.id === id) ? [] : before
  const mine = grid.find(car => car.id === id)

  if (mine !== undefined) return grid.map(car => (car.id === id ? { ...car, calls: car.calls + 1 } : car))
  if (grid.length >= LANES) return [...grid]

  return [...grid, { id, number: grid.length + 1, calls: 1, place: null }]
}

const finish = (held: readonly RaceCar[] | undefined, id: string): RaceCar[] => {
  const before = held ?? []
  const placed = before.filter(car => car.place !== null).length

  return before.map(car => (car.id === id && car.place === null ? { ...car, place: placed + 1 } : car))
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

  const wanted = (await $.state.get(widths)).value?.['race-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const grid = await read($, cars)
  const line = inner - 3
  const racing = grid.filter(car => car.place === null).length
  const podium = [...grid]
    .filter(car => car.place !== null)
    .sort((one, other) => (one.place ?? 0) - (other.place ?? 0))
    .map(car => `${PLACES[(car.place ?? 1) - 1] ?? ''} agent ${car.number}`)
  const marks: WidgetsMark[] = []

  for (let y = 0; y < TRACK_ROWS; y += 1) {
    for (let x = 0; x < inner; x += 1) {
      const isLane = y % LANE_ROWS === 0
      marks.push([x, y, isLane && x % 4 < 2 ? LINE : ROAD])
    }
    marks.push([line, y, y % 2 === 0 ? 0xffffff : 0x1f2328], [line + 1, y, y % 2 === 0 ? 0x1f2328 : 0xffffff])
  }
  grid.forEach((car, lane) => {
    marks.push({
      lines: CAR,
      palette: { b: COLORS[lane % COLORS.length] ?? 0xffffff },
      left: car.place !== null ? line - 5 : Math.min(line - 6, car.calls * STRIDE),
      top: lane * LANE_ROWS + 1,
    })
  })
  const picture = await $.widgets.picture({ surface, key: 'race', columns: inner, rows: TRACK_ROWS, marks })

  return $.widgets.card({
    beneath,
    width,
    title: 'Race',
    note: grid.length === 0 ? 'waiting for agents' : `${racing} racing · ${grid.length - racing} finished`,
    body: (
      <Box flexDirection="column">
        {picture}
        <Text dimColor wrap="truncate-end">
          {podium.length === 0 ? 'Subagents race here, one stride per tool call.' : podium.join(' · ')}
        </Text>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'race-widget',
      description: 'Toggle the race track where subagents advance one stride per tool call',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'race-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, cars, () => [])

      return { text: 'Track cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /race-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Race on; /widgets places it.' : 'Race off.' }
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined && (await read($, isOn))) await update($, cars, held => advance(held, id))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) await update($, cars, held => finish(held, id))

    return next(e)
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

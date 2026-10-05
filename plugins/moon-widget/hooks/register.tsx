import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import { fit, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Size = { columns: number; rows: number }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const USAGE = 'Usage: /moon-widget [on|off|north|south]'
const TICK_MS = 60_000
const DAY_MS = 86_400_000
const LUNATION_MS = 29.530588853 * DAY_MS
const PASSES = 8
const NEAR_DEGREES = 6
const SIDE_COLUMNS = 38
const WIDE_COLUMNS = 56
const SMALL: Size = { columns: 10, rows: 5 }
const MEDIUM: Size = { columns: 14, rows: 7 }
const LARGE: Size = { columns: 18, rows: 9 }
const LIT = 0xf2e9c4
const DARK = 0x30363d
const FULL = 'Full moon'
const NAMES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  FULL,
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
]
const LORE = [
  'Dark sky. Start something.',
  'Begun now, it grows.',
  'Half lit. Decide what ships.',
  'Nearly full. Finish it.',
  'Folklore says: do not deploy.',
  'Light fades. Delete code.',
  'Let go of what did not work.',
  'Rest. A new cycle is near.',
]
const TERMS: readonly (readonly [d: number, m: number, p: number, f: number, c: number])[] = [
  [0, 0, 1, 0, 6288774],
  [2, 0, -1, 0, 1274027],
  [2, 0, 0, 0, 658314],
  [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116],
  [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793],
  [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322],
  [2, -1, 0, 0, 45758],
  [0, 1, -1, 0, -40923],
  [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383],
  [2, 0, 0, -2, 15327],
  [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675],
  [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548],
  [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766],
  [1, 0, -1, 0, -5163],
  [1, 1, 0, 0, 4987],
  [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994],
  [4, 0, 0, 0, 3861],
  [2, 0, -3, 0, 3665],
]
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'moon-widget', key: 'isOn' } as const, false)
const isSouth = atom({ plugin: 'moon-widget', key: 'isSouth' } as const, false)
const tick = atom({ plugin: 'moon-widget', key: 'tick' } as const, 0)

let timer: Timer | undefined

const turned = (degrees: number): number => ((degrees % 360) + 360) % 360

const sin = (degrees: number): number => Math.sin((degrees * Math.PI) / 180)

const cos = (degrees: number): number => Math.cos((degrees * Math.PI) / 180)

const elongation = (now: number): number => {
  const t = (now / DAY_MS + 2440587.5 - 2451545 + 69 / 86400) / 36525
  const d = 297.8501921 + 445267.1114034 * t
  const m = 357.5291092 + 35999.0502909 * t
  const p = 134.9633964 + 477198.8675055 * t
  const f = 93.272095 + 483202.0175233 * t
  const fade = 1 - 0.002516 * t
  const sum = TERMS.reduce(
    (held, [byD, byM, byP, byF, size]) => held + size * (byM === 0 ? 1 : fade) * sin(byD * d + byM * m + byP * p + byF * f),
    0,
  )
  const moon = 218.3164477 + 481267.88123421 * t + sum / 1e6
  const sun =
    280.46646 + 36000.76983 * t + (1.914602 - 0.004817 * t) * sin(m) + 0.019993 * sin(2 * m) + 0.000289 * sin(3 * m)

  return turned(moon - sun)
}

const fullMoon = (now: number, isNearest: boolean): number => {
  let at = now
  for (let pass = 0; pass < PASSES; pass += 1) {
    const ahead = turned(180 - elongation(at))
    at += ((pass === 0 && !isNearest) || ahead <= 180 ? ahead : ahead - 360) / 360 * LUNATION_MS
  }

  return at
}

const phaseOf = (angle: number): number => {
  const quarter = Math.round(angle / 90)

  return Math.abs(angle - quarter * 90) <= NEAR_DEGREES ? (quarter % 4) * 2 : Math.floor(angle / 90) * 2 + 1
}

const isLit = (angle: number, x: number, half: number): boolean =>
  angle < 180 ? x > half * cos(angle) : x < -half * cos(angle)

const discOf = (angle: number, { columns, rows }: Size, isMirrored: boolean): WidgetsMark[] => {
  const marks: WidgetsMark[] = []
  for (let row = 0; row < rows; row += 1) {
    const y = ((row + 0.5) / rows) * 2 - 1
    const half = Math.sqrt(1 - y * y)
    for (let column = 0; column < columns; column += 1) {
      const x = ((column + 0.5) / columns) * 2 - 1
      if (Math.abs(x) <= half) marks.push([column, row, isLit(angle, isMirrored ? -x : x, half) ? LIT : DARK])
    }
  }

  return marks
}

const barOf = (angle: number, columns: number, isMirrored: boolean): string =>
  Array.from({ length: columns }, (_, column) => {
    const x = ((column + 0.5) / columns) * 2 - 1

    return isLit(angle, isMirrored ? -x : x, 1) ? '█' : '░'
  }).join('')

const countdownOf = (now: number, isFull: boolean): string => {
  const moment = fullMoon(now, isFull)
  if (!isFull) return `Full in ${span(moment - now)}`

  return moment >= now ? `Peak in ${span(moment - now)}` : `Peak ${span(now - moment)} ago`
}

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

  await read($, tick)
  const width = fit((await $.state.get(widths)).value?.['moon-widget'] ?? CARD_COLUMNS, columns)
  const now = await $.clock.now()
  const angle = elongation(now)
  const phase = phaseOf(angle)
  const name = NAMES[phase] ?? ''
  const isFull = name === FULL
  const isMirrored = await read($, isSouth)
  const isStacked = width < SIDE_COLUMNS
  const size = isStacked ? SMALL : width < WIDE_COLUMNS ? MEDIUM : LARGE
  const disc =
    surface === 'terminal' ? (
      await $.widgets.picture({
        surface,
        key: 'moon',
        columns: size.columns * 2,
        rows: size.rows * 2,
        marks: discOf(angle, { columns: size.columns * 2, rows: size.rows * 2 }, isMirrored),
      })
    ) : (
      <Text key="bar">{barOf(angle, size.columns, isMirrored)}</Text>
    )

  return $.widgets.card({
    beneath,
    width,
    title: 'Moon',
    note: `${Math.round(((1 - cos(angle)) / 2) * 100)}% lit`,
    body: (
      <Box flexDirection="column">
        <Box flexDirection={isStacked ? 'column' : 'row'} columnGap={2}>
          {disc}
          <Box flexDirection="column" justifyContent="center">
            <Text key="name" bold color={isFull ? 'yellow' : undefined} wrap="truncate-end">
              {name}
            </Text>
            <Text key="countdown" dimColor wrap="truncate-end">
              {countdownOf(now, isFull)}
            </Text>
          </Box>
        </Box>
        <Text key="lore" dimColor italic wrap="wrap">
          {LORE[phase] ?? ''}
        </Text>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'moon-widget',
      description: 'Toggle the Moon card, or draw it for the northern or southern sky',
      argumentHint: '[on|off|north|south]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if ((await $.store.get('isSouth')) === true) await update($, isSouth, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'moon-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'north' || arg === 'south') {
      if (!(await read($, isOn))) return { text: 'Moon is off; /moon-widget on shows it.' }

      await $.store.set('isSouth', await update($, isSouth, () => arg === 'south'))

      return { text: `Moon drawn for the ${arg}ern sky.` }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Moon on; /widgets places it.' : 'Moon off.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, e.surface, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, e.surface, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, e.surface, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

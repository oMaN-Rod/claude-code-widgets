import { atom, read, update } from 'claude-code'
import type {
  Elements,
  EngineInterface,
  Register,
  RenderElement,
  RenderSurface,
  SessionContextUsage,
  SessionRateLimit,
  Timer,
} from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { WeatherReading } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 500
const SKY_ROWS = 10
const SUN = [
  '.....yyyyyy.....',
  '..yyhhhhyyyyyy..',
  'yyhhhhyyyyyyyyyy',
  'yyyyyyyyyyyyyyyy',
  '..yyyyyyyyyyyy..',
  '.....yyyyyy.....',
]
const CLOUD = [
  '....cccccccc........',
  '..cccccccccccccc....',
  'cccccccccccccccccccc',
  '.gggggggggggggggggg.',
]
const BOLT = ['....zz', '..zz..', 'zzzzzz', '..zz..', 'zz....']
const GRASS_LIGHT = 0x56d364
const GRASS = 0x2ea043
const RAIN = 0x58a6ff
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }
const CALM: WeatherReading = { percent: null, limits: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'weather-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'weather-widget', key: 'tick' } as const, 0)
const reading = atom({ plugin: 'weather-widget', key: 'reading' } as const, CALM)
const preview = atom({ plugin: 'weather-widget', key: 'preview' } as const, null)

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

const taken = (context: SessionContextUsage, rateLimits: readonly SessionRateLimit[]): WeatherReading => ({
  percent: context.percent ?? null,
  limits: rateLimits.map(({ kind, percentUsed }) => ({ kind, percentUsed })),
})

const forecast = (percent: number): string => {
  if (percent >= 90) return 'Storm: compaction is close'
  if (percent >= 75) return 'Rain: the window is filling'
  if (percent >= 50) return 'Clouding over'
  if (percent >= 25) return 'Fair'

  return 'Clear skies'
}

const drawCard = async (
  $: EngineInterface,
  surface: RenderSurface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  width: number,
): Promise<RenderElement> => {
  const beat = await read($, tick)
  const held = await read($, reading)
  const percent = (await read($, preview)) ?? held.percent ?? 0
  const inner = (width - 4) * 2
  const marks: WidgetsMark[] = []
  const isStormy = percent >= 90
  const isRainy = percent >= 75
  const cloud = isStormy
    ? { c: 0x484f58, g: 0x30363d }
    : isRainy
      ? { c: 0x8b949e, g: 0x6e7681 }
      : { c: 0xe6edf3, g: 0xafb8c1 }
  const clouds = percent >= 75 ? 4 : percent >= 50 ? 3 : percent >= 25 ? 1 : 0

  for (let x = 0; x < inner; x += 1) marks.push([x, SKY_ROWS - 1, x % 7 === 3 ? GRASS_LIGHT : GRASS])

  if (!isRainy) {
    marks.push({ lines: SUN, palette: { y: 0xf2cc60, h: 0xfff1b8 }, left: 4, top: 1 })
    if (beat % 2 === 0) {
      for (const [x, y] of [[1, 3], [2, 4], [22, 3], [23, 4], [11, 8], [12, 8], [12, 0], [13, 0]] as const) {
        marks.push([x, y, 0xf2cc60])
      }
    }
  }
  for (let index = 0; index < clouds; index += 1) {
    const span = inner + 24
    const left = ((beat + index * Math.floor(span / Math.max(1, clouds))) % span) - 20
    marks.push({ lines: CLOUD, palette: cloud, left, top: index % 2 })
  }
  if (isRainy) {
    for (let x = 2; x < inner; x += 5) {
      marks.push([x, 5 + ((beat + x) % (SKY_ROWS - 6)), RAIN])
    }
  }
  if (isStormy && beat % 6 < 2) {
    marks.push({ lines: BOLT, palette: { z: 0xffe066 }, left: Math.floor(inner / 2), top: 4 })
  }

  const limits = held.limits
    .map(limit => `${LABELS[limit.kind] ?? limit.kind} ${Math.round(limit.percentUsed)}%`)
    .join(' · ')

  const picture = await $.widgets.picture({ surface, key: 'weather', columns: inner, rows: SKY_ROWS, marks })

  return $.widgets.card({
    beneath,
    width,
    title: 'Weather',
    note: `context ${Math.round(percent)}%`,
    body: (
      <Box flexDirection="column">
        {picture}
        <Text wrap="truncate-end">{forecast(percent)}</Text>
        {limits !== '' && (
          <Text dimColor wrap="truncate-end">
            limits {limits}
          </Text>
        )}
      </Box>
    ),
  })
}

const wide = async ($: EngineInterface): Promise<number> =>
  (await $.state.get(widths)).value?.['weather-widget'] ?? CARD_COLUMNS

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  tags: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  return drawCard($, surface, tags, beneath, Math.min(await wide($), Math.max(20, columns)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'weather-widget',
      description: 'Toggle the weather: clear when context is free, a storm near compaction',
      argumentHint: '[on|off|live|<percent>]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await update($, preview, () => null)
    if (await read($, isOn)) {
      const { context, rateLimits } = await $.session.usage()
      await update($, reading, () => taken(context, rateLimits))
    }
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'weather-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (/^\d+$/.test(arg)) {
      const percent = Math.min(100, Number(arg))
      await update($, preview, () => percent)
    } else if (arg === 'live') {
      await update($, preview, () => null)
    } else if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /weather-widget [on|off|live|<percent>]' }
    }

    const isShown = await update($, isOn, shown =>
      arg === '' ? !(shown ?? false) : arg !== 'off',
    )
    await $.store.set('isOn', isShown)
    if (isShown) {
      const { context, rateLimits } = await $.session.usage()
      await update($, reading, () => taken(context, rateLimits))
    }
    await sync($)

    return { text: isShown ? 'Weather on; /widgets places it.' : 'Weather off.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, reading, () => taken(e.context, e.rateLimits))

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

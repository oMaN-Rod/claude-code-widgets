import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  RenderElement,
  SessionContextUsage,
  SessionRateLimit,
  Timer,
} from 'claude-code'

import type { WeatherReading } from '../types'
import { CARD_COLUMNS, canvas, dot, frame, paint, picture, stack, tagsOf } from './kit'
import type { Place, Tags } from './kit'

const PANE = 'widgets'
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

const drawCard = async ($: EngineInterface, tags: Tags, width: number): Promise<RenderElement> => {
  const { Box, Text } = tags
  const beat = await read($, tick)
  const held = await read($, reading)
  const percent = (await read($, preview)) ?? held.percent ?? 0
  const inner = (width - 4) * 2
  const pixels = canvas(inner, SKY_ROWS)
  const isStormy = percent >= 90
  const isRainy = percent >= 75
  const cloud = isStormy
    ? { c: 0x484f58, g: 0x30363d }
    : isRainy
      ? { c: 0x8b949e, g: 0x6e7681 }
      : { c: 0xe6edf3, g: 0xafb8c1 }
  const clouds = percent >= 75 ? 4 : percent >= 50 ? 3 : percent >= 25 ? 1 : 0

  for (let x = 0; x < inner; x += 1) dot(pixels, x, SKY_ROWS - 1, x % 7 === 3 ? GRASS_LIGHT : GRASS)

  if (!isRainy) {
    paint(pixels, SUN, { y: 0xf2cc60, h: 0xfff1b8 }, 4, 1)
    if (beat % 2 === 0) {
      for (const [x, y] of [[1, 3], [2, 4], [22, 3], [23, 4], [11, 8], [12, 8], [12, 0], [13, 0]] as const) {
        dot(pixels, x, y, 0xf2cc60)
      }
    }
  }
  for (let index = 0; index < clouds; index += 1) {
    const span = inner + 24
    const left = ((beat + index * Math.floor(span / Math.max(1, clouds))) % span) - 20
    paint(pixels, CLOUD, cloud, left, index % 2)
  }
  if (isRainy) {
    for (let x = 2; x < inner; x += 5) {
      dot(pixels, x, 5 + ((beat + x) % (SKY_ROWS - 6)), RAIN)
    }
  }
  if (isStormy && beat % 6 < 2) paint(pixels, BOLT, { z: 0xffe066 }, Math.floor(inner / 2), 4)

  const limits = held.limits
    .map(limit => `${LABELS[limit.kind] ?? limit.kind} ${Math.round(limit.percentUsed)}%`)
    .join(' · ')

  return frame(
    tags,
    width,
    'Weather',
    `context ${Math.round(percent)}%`,
    <Box flexDirection="column">
      {picture(tags, 'weather', pixels)}
      <Text wrap="truncate-end">{forecast(percent)}</Text>
      {limits !== '' && (
        <Text dimColor wrap="truncate-end">
          limits {limits}
        </Text>
      )}
    </Box>,
  )
}

const show = async (
  $: EngineInterface,
  tags: Tags,
  beneath: RenderElement,
  place: Place,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  return stack(tags, beneath, await drawCard($, tags, Math.min(CARD_COLUMNS, Math.max(20, columns))))
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
    show($, tagsOf($.ui.resolve(e)), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, tagsOf($.ui.resolve(e)), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, tagsOf($.ui.resolve(e)), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

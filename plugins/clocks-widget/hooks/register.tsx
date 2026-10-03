import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Reading = { time: string; day: number }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 15_000
const MAX_ZONES = 6
const DEFAULT_ZONES = ['UTC']
const USAGE = 'Usage: /clocks-widget [on|off|add <zone>|remove <zone>|clear]'
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'clocks-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'clocks-widget', key: 'tick' } as const, 0)
const zones = atom({ plugin: 'clocks-widget', key: 'zones' } as const, DEFAULT_ZONES)

let timer: Timer | undefined

const pad = (value: number): string => String(value).padStart(2, '0')

const isZones = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(zone => typeof zone === 'string')

const readingIn = (now: number, zone: string): Reading | undefined => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now))
    const part = (type: string): number => Number(parts.find(one => one.type === type)?.value ?? 0)

    return {
      time: `${pad(part('hour'))}:${pad(part('minute'))}`,
      day: Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000,
    }
  } catch {
    return undefined
  }
}

const nameOf = (zone: string): string => (zone.split('/').pop() ?? zone).replaceAll('_', ' ')

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
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  await read($, tick)
  const wanted = (await $.state.get(widths)).value?.['clocks-widget'] ?? CARD_COLUMNS
  const now = await $.clock.now()
  const here = new Date(now)
  const today = Date.UTC(here.getFullYear(), here.getMonth(), here.getDate()) / 86_400_000
  const listed = await read($, zones)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Clocks',
    note: `${pad(here.getHours())}:${pad(here.getMinutes())} here`,
    body: (
      <Box flexDirection="column">
        {listed.length === 0 && <Text dimColor>/clocks-widget add Asia/Tokyo</Text>}
        {listed.map(zone => {
          const there = readingIn(now, zone)
          const shift = there === undefined ? 0 : there.day - today

          return (
            <Box justifyContent="space-between" columnGap={1}>
              <Text wrap="truncate-end">{nameOf(zone)}</Text>
              <Text>
                <Text bold>{there?.time ?? '--:--'}</Text>
                {shift !== 0 && (
                  <Text dimColor>
                    {' '}
                    {shift > 0 ? '+' : '-'}
                    {Math.abs(shift)}d
                  </Text>
                )}
              </Text>
            </Box>
          )
        })}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'clocks-widget',
      description: 'Toggle the world clocks card, or add and remove time zones',
      argumentHint: '[on|off|add <zone>|remove <zone>|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('zones')
    if (isZones(kept)) await update($, zones, () => kept)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'clocks-widget' }, async ($, e) => {
    const [verb = '', zone = ''] = e.args.trim().split(/\s+/)
    const arg = verb.toLowerCase()
    const listed = await read($, zones)

    if (arg === 'add') {
      if (readingIn(await $.clock.now(), zone) === undefined || zone === '') {
        return { text: `"${zone}" is not a time zone; use a name like Europe/Madrid.` }
      }
      if (listed.includes(zone)) return { text: `${zone} is already listed.` }
      if (listed.length >= MAX_ZONES) return { text: `The card holds ${MAX_ZONES} zones; remove one first.` }

      const kept = await update($, zones, held => [...(held ?? DEFAULT_ZONES), zone])
      await $.store.set('zones', kept)

      return { text: `${zone} added.` }
    }
    if (arg === 'remove') {
      const found = listed.find(one => one.toLowerCase() === zone.toLowerCase() || nameOf(one).toLowerCase() === zone.toLowerCase())
      if (found === undefined) return { text: `${zone} is not listed.` }

      const kept = await update($, zones, held => (held ?? DEFAULT_ZONES).filter(one => one !== found))
      await $.store.set('zones', kept)

      return { text: `${found} removed.` }
    }
    if (arg === 'clear') {
      await update($, zones, () => [])
      await $.store.set('zones', [])

      return { text: 'Clocks cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Clocks on; /widgets places it.' : 'Clocks off.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

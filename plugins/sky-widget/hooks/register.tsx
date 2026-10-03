import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { SkyPhase } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 60_000
const SKY_ROWS = 12
const MAX_STARS = 24
const STAR_EVERY_MINUTES = 10
const FILLS: Record<SkyPhase, number> = { night: 0x0b1026, dawn: 0x5c4d8a, day: 0x4dabf7, dusk: 0xd9662e }
const GROUND: Record<SkyPhase, number> = { night: 0x14261a, dawn: 0x2b4a2f, day: 0x3fb950, dusk: 0x2b4a2f }
const SUN = ['.yy.', 'yhhy', 'yhhy', '.yy.']
const MOON = ['.mm.', 'mm..', 'mm..', '.mm.']
const STAR = 0xe6edf3
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'sky-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'sky-widget', key: 'tick' } as const, 0)
const startedAt = atom({ plugin: 'sky-widget', key: 'startedAt' } as const, 0)

let timer: Timer | undefined

const phaseAt = (hour: number): SkyPhase =>
  hour < 5 || hour >= 21 ? 'night' : hour < 7 ? 'dawn' : hour < 18 ? 'day' : 'dusk'

const pad = (value: number): string => String(value).padStart(2, '0')

const lasted = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
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
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  await read($, tick)
  const wanted = (await $.state.get(widths)).value?.['sky-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const now = await $.clock.now()
  const clock = new Date(now)
  const hour = clock.getHours() + clock.getMinutes() / 60
  const phase = phaseAt(hour)
  const isSunUp = hour >= 6 && hour < 18
  const along = isSunUp ? (hour - 6) / 12 : ((hour + 6) % 24) / 12
  const left = Math.round(along * (inner - 4))
  const top = Math.round(SKY_ROWS - 6 - Math.sin(along * Math.PI) * (SKY_ROWS - 6))
  const session = now - (await read($, startedAt))
  const marks: WidgetsMark[] = []

  if (phase !== 'day') {
    const stars = Math.min(MAX_STARS, 4 + Math.floor(session / 60_000 / STAR_EVERY_MINUTES))
    for (let star = 0; star < (phase === 'night' ? stars : Math.floor(stars / 3)); star += 1) {
      marks.push([(star * 37 + 5) % inner, (star * 11 + 1) % (SKY_ROWS - 3), STAR])
    }
  }
  marks.push(
    isSunUp
      ? { lines: SUN, palette: { y: 0xf2cc60, h: 0xfff1b8 }, left, top }
      : { lines: MOON, palette: { m: 0xe6edf3 }, left, top },
  )
  for (let x = 0; x < inner; x += 1) marks.push([x, SKY_ROWS - 1, GROUND[phase]])

  return $.widgets.card({
    beneath,
    width,
    title: 'Sky',
    note: `${pad(clock.getHours())}:${pad(clock.getMinutes())} · up ${lasted(session)}`,
    body: await $.widgets.picture({
      surface,
      key: 'sky',
      columns: inner,
      rows: SKY_ROWS,
      fill: FILLS[phase],
      marks,
    }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sky-widget',
      description: 'Toggle the sky: sun, moon and stars at your local time',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const now = await $.clock.now()
    await update($, startedAt, held => (held === undefined || held === 0 ? now : held))
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'sky-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /sky-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    const now = await $.clock.now()
    await update($, startedAt, held => (held === undefined || held === 0 ? now : held))
    await sync($)

    return { text: isShown ? 'Sky on; /widgets places it.' : 'Sky off.' }
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

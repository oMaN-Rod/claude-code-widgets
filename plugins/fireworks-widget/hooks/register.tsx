import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { FireworksShot } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 150
const SKY_ROWS = 14
const SHOW_MS = 3600
const RISE_MS = 900
const SPARKS = 14
const NIGHT = 0x0b1026
const GROUND = 0x1f2933
const ASH = 0x6e7681
const COLORS = [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xff922b]
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'fireworks-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'fireworks-widget', key: 'tick' } as const, 0)
const shots = atom({ plugin: 'fireworks-widget', key: 'shots' } as const, [])
const total = atom({ plugin: 'fireworks-widget', key: 'total' } as const, 0)

let timer: Timer | undefined

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const shade = (color: number, factor: number): number =>
  (Math.round((color >> 16) * factor) << 16) |
  (Math.round(((color >> 8) & 255) * factor) << 8) |
  Math.round((color & 255) * factor)

const sync = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  const isWanted = (await read($, isOn)) && (await read($, shots)).some(shot => now - shot.at < SHOW_MS)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void (async () => {
        await update($, tick, count => ((count ?? 0) + 1) % 1_000_000)
        await sync($)
      })()
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const launch = async ($: EngineInterface, isDud: boolean): Promise<void> => {
  const at = await $.clock.now()
  await update($, shots, held => [...(held ?? []).filter(shot => at - shot.at < SHOW_MS), { at, seed: at % 9973, isDud }])
  if (!isDud) await update($, total, count => (count ?? 0) + 1)
  await sync($)
}

const burst = (marks: WidgetsMark[], shot: FireworksShot, age: number, inner: number): void => {
  const x = 6 + (shot.seed % Math.max(1, inner - 12))
  const peak = 2 + (shot.seed % 4)

  if (age < RISE_MS) {
    const y = Math.round(SKY_ROWS - 2 - (age / RISE_MS) * (SKY_ROWS - 2 - peak))
    marks.push([x, y, shot.isDud ? ASH : 0xfff1b8])

    return
  }

  const spread = (age - RISE_MS) / (SHOW_MS - RISE_MS)
  const color = shot.isDud ? ASH : (COLORS[shot.seed % COLORS.length] ?? 0xffffff)
  for (let spark = 0; spark < (shot.isDud ? 4 : SPARKS); spark += 1) {
    const angle = (spark / SPARKS) * Math.PI * 2
    const reach = shot.isDud ? 1.5 : 2 + spread * 7
    const drop = spread * spread * (shot.isDud ? 9 : 3)
    marks.push([
      Math.round(x + Math.cos(angle) * reach * 1.6),
      Math.round(peak + Math.sin(angle) * reach + drop),
      shade(color, 1 - spread * 0.7),
    ])
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
  const wanted = (await $.state.get(widths)).value?.['fireworks-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const now = await $.clock.now()
  const live = (await read($, shots)).filter(shot => now - shot.at < SHOW_MS)
  const marks: WidgetsMark[] = []

  for (let x = 0; x < inner; x += 1) marks.push([x, SKY_ROWS - 1, GROUND])
  for (const shot of live) burst(marks, shot, now - shot.at, inner)

  return $.widgets.card({
    beneath,
    width,
    title: 'Fireworks',
    note: some(await read($, total), 'celebration'),
    body: await $.widgets.picture({ surface, key: 'fireworks', columns: inner, rows: SKY_ROWS, fill: NIGHT, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'fireworks-widget',
      description: 'Toggle the fireworks that go off when checks pass',
      argumentHint: '[on|off|demo]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'fireworks-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'demo') {
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await launch($, false)

      return { text: 'Fireworks on, one away.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /fireworks-widget [on|off|demo]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Fireworks on; /widgets places it.' : 'Fireworks off.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const command = String((e as { command?: unknown }).command ?? '')
    if (ran.deny === undefined && CHECKS.test(command) && (await read($, isOn))) {
      await launch($, ran.isError === true)
    }

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

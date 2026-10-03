import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { EqualizerMix } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 120
const BANDS = 12
const PEAK = 12
const METER_ROWS = 14
const LOW = 0x3fb950
const MID = 0xffd43b
const HIGH = 0xe5484d
const REST = 0x21262d
const SILENT: EqualizerMix = { levels: Array.from({ length: BANDS }, () => 0), calls: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'equalizer-widget', key: 'isOn' } as const, false)
const mix = atom({ plugin: 'equalizer-widget', key: 'mix' } as const, SILENT)

let timer: Timer | undefined

const hash = (text: string): number => {
  let sum = 7
  for (const letter of text) sum = (sum * 31 + letter.charCodeAt(0)) % 100_003

  return sum
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = (await read($, isOn)) && (await read($, mix)).levels.some(level => level > 0)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void (async () => {
        await update($, mix, held => ({
          ...(held ?? SILENT),
          levels: (held ?? SILENT).levels.map(level => Math.max(0, level - 1)),
        }))
        await sync($)
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

  const wanted = (await $.state.get(widths)).value?.['equalizer-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const pitch = Math.max(2, Math.floor(inner / BANDS))
  const held = await read($, mix)
  const marks: WidgetsMark[] = []

  held.levels.forEach((level, band) => {
    for (let step = 0; step < PEAK; step += 1) {
      const color = step >= level ? REST : step < 7 ? LOW : step < 10 ? MID : HIGH
      for (let dx = 0; dx < pitch - 1; dx += 1) marks.push([band * pitch + dx, METER_ROWS - 2 - step, color])
    }
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Equalizer',
    note: `${held.calls} calls`,
    body: await $.widgets.picture({ surface, key: 'equalizer', columns: inner, rows: METER_ROWS, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'equalizer-widget',
      description: 'Toggle the level meters that jump with tool activity',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'equalizer-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /equalizer-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Equalizer on; /widgets places it.' : 'Equalizer off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) {
      const hit = hash(e.tool) % BANDS
      const kick = hash(e.tool_use_id) % 4
      await update($, mix, held => ({
        calls: (held ?? SILENT).calls + 1,
        levels: (held ?? SILENT).levels.map((level, band) => {
          const away = Math.abs(band - hit)

          return Math.max(level, away > 2 ? 0 : PEAK - kick - away * 4)
        }),
      }))
      await sync($)
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

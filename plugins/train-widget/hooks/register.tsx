import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 250
const TRACK_ROWS = 10
const MAX_WAGONS = 12
const LOCO_COLUMNS = 9
const WAGON_COLUMNS = 8
const RAIL = 0x6e7681
const TIE = 0x8a5a2b
const SMOKE = 0xc9d1d9
const LOCO = [
  '.cccc..k.',
  '.cwwc..k.',
  '.ccccbbbb',
  'rrrrrrrrr',
  'rrrrrrrrr',
  '.o..o..o.',
]
const WAGON = [
  'wwwwwww.',
  'wwwwwww.',
  'ddddddd-',
  '.o...o..',
]
const LOCO_COLORS = { c: 0xd97757, w: 0xfff1b8, k: 0x30363d, b: 0x484f58, r: 0xc2452d, o: 0x1f2328 }
const KINDS: Record<string, number> = {
  Bash: 0xf0883e,
  Read: 0x58a6ff,
  Edit: 0x3fb950,
  Write: 0x3fb950,
  NotebookEdit: 0x3fb950,
  Grep: 0xbc8cff,
  Glob: 0xbc8cff,
  Agent: 0xf778ba,
  WebFetch: 0x39c5cf,
  WebSearch: 0x39c5cf,
}
const OTHER = 0x8b949e
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'train-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'train-widget', key: 'tick' } as const, 0)
const wagons = atom({ plugin: 'train-widget', key: 'wagons' } as const, [])

let timer: Timer | undefined

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const shade = (color: number, factor: number): number =>
  (Math.round((color >> 16) * factor) << 16) |
  (Math.round(((color >> 8) & 255) * factor) << 8) |
  Math.round((color & 255) * factor)

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

  const wanted = (await $.state.get(widths)).value?.['train-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const beat = await read($, tick)
  const pulled = await read($, wagons)
  const length = LOCO_COLUMNS + pulled.length * WAGON_COLUMNS
  const head = ((beat * 2) % (inner + length)) - LOCO_COLUMNS
  const marks: WidgetsMark[] = []

  for (let x = 0; x < inner; x += 1) marks.push([x, TRACK_ROWS - 1, (x + beat) % 4 === 0 ? TIE : RAIL])
  for (let puff = 0; puff < 3; puff += 1) {
    marks.push([head + 7 - puff * 2 - (beat % 2), 2 - puff, SMOKE])
  }
  marks.push({ lines: LOCO, palette: LOCO_COLORS, left: head, top: TRACK_ROWS - 1 - LOCO.length })
  pulled.forEach((kind, index) => {
    const color = KINDS[kind] ?? OTHER
    marks.push({
      lines: WAGON,
      palette: { w: color, d: shade(color, 0.7), o: LOCO_COLORS.o, '-': LOCO_COLORS.b },
      left: head - (index + 1) * WAGON_COLUMNS,
      top: TRACK_ROWS - 1 - WAGON.length,
    })
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Train',
    note: pulled.length === 0 ? 'running light' : `${some(pulled.length, 'wagon')} this turn`,
    body: await $.widgets.picture({ surface, key: 'train', columns: inner, rows: TRACK_ROWS, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'train-widget',
      description: 'Toggle the train: one wagon per tool call this turn',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'train-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /train-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Train on; /widgets places it.' : 'Train off.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, wagons, () => [])

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) {
      await update($, wagons, held => [...(held ?? []), e.tool].slice(-MAX_WAGONS))
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

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { MosaicWall } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TILE = 2
const WALL_ROWS = 6
const MAX_TILES = 60 * WALL_ROWS
const GROUT = 0x161b22
const KINDS: Record<string, string> = {
  Bash: 'b',
  Read: 'r',
  Edit: 'e',
  Write: 'e',
  NotebookEdit: 'e',
  Grep: 's',
  Glob: 's',
  Agent: 'a',
  WebFetch: 'w',
  WebSearch: 'w',
}
const COLORS: Record<string, number> = {
  b: 0xf0883e,
  r: 0x58a6ff,
  e: 0x3fb950,
  s: 0xbc8cff,
  a: 0xf778ba,
  w: 0x39c5cf,
  o: 0x8b949e,
  x: 0xe5484d,
}
const BARE: MosaicWall = { tiles: '', laid: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'mosaic-widget', key: 'isOn' } as const, false)
const wall = atom({ plugin: 'mosaic-widget', key: 'wall' } as const, BARE)

const shade = (color: number, factor: number): number =>
  (Math.round((color >> 16) * factor) << 16) |
  (Math.round(((color >> 8) & 255) * factor) << 8) |
  Math.round((color & 255) * factor)

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['mosaic-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const across = Math.min(MAX_TILES / WALL_ROWS, width - 4)
  const held = await read($, wall)
  const shown = held.tiles.slice(-(across * WALL_ROWS))
  const marks: WidgetsMark[] = []

  ;[...shown].forEach((kind, index) => {
    const left = (index % across) * TILE
    const top = Math.floor(index / across) * TILE
    const color = COLORS[kind] ?? GROUT
    marks.push([left, top, color], [left + 1, top, shade(color, 0.85)])
    marks.push([left, top + 1, shade(color, 0.85)], [left + 1, top + 1, shade(color, 0.7)])
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Mosaic',
    note: `${held.laid} tiles`,
    body: await $.widgets.picture({
      surface,
      key: 'mosaic',
      columns: across * TILE,
      rows: WALL_ROWS * TILE,
      fill: GROUT,
      marks,
    }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mosaic-widget',
      description: 'Toggle the mosaic: one tile per tool call, coloured by tool',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'mosaic-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, wall, () => BARE)

      return { text: 'Mosaic cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /mosaic-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Mosaic on; /widgets places it.' : 'Mosaic off.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!(await read($, isOn))) return ran

    const kind = ran.isError === true || ran.deny !== undefined ? 'x' : (KINDS[e.tool] ?? 'o')
    await update($, wall, held => ({
      tiles: `${(held ?? BARE).tiles}${kind}`.slice(-MAX_TILES),
      laid: (held ?? BARE).laid + 1,
    }))

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

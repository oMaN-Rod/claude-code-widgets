import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { GardenPlot } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const PLOT_COLUMNS = 28
const PLOT_ROWS = 16
const MAX_STEM = 11
const MAX_FLOWERS = 5
const WILT_MS = 20_000
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|build|check)\b/
const BARE: GardenPlot = { leaves: 0, blooms: 0, wiltedUntil: 0 }
const SOIL = 0x6b4423
const POT = 0xc2703d
const POT_RIM = 0xe08e5b
const STEM = 0x2f9e44
const LEAF = 0x51cf66
const DRY = 0x8a7a4f
const PETAL = 0xf783ac
const HEART = 0xffd43b
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'garden-widget', key: 'isOn' } as const, false)
const plot = atom({ plugin: 'garden-widget', key: 'plot' } as const, BARE)

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const isPlot = (value: unknown): value is Pick<GardenPlot, 'leaves' | 'blooms'> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as GardenPlot).leaves === 'number' &&
  typeof (value as GardenPlot).blooms === 'number'

const stemOf = (leaves: number): number => Math.min(MAX_STEM, Math.floor(Math.log2(leaves + 1) * 1.6))

const draw = (held: GardenPlot, isWilted: boolean): WidgetsMark[] => {
  const marks: WidgetsMark[] = []
  const middle = Math.floor(PLOT_COLUMNS / 2)
  const base = PLOT_ROWS - 5
  const stem = stemOf(held.leaves)
  const green = isWilted ? DRY : STEM
  const leaf = isWilted ? DRY : LEAF

  for (let x = 0; x < PLOT_COLUMNS; x += 1) marks.push([x, PLOT_ROWS - 1, SOIL])
  for (let x = middle - 4; x <= middle + 4; x += 1) marks.push([x, base + 1, POT_RIM])
  for (let y = base + 2; y < PLOT_ROWS - 1; y += 1) {
    for (let x = middle - 3; x <= middle + 3; x += 1) marks.push([x, y, POT])
  }

  for (let level = 0; level < stem; level += 1) {
    const y = base - level
    const lean = isWilted && level > stem / 2 ? level - Math.floor(stem / 2) : 0
    marks.push([middle + lean, y, green])
    if (level > 0 && level % 2 === 0) {
      const side = level % 4 === 0 ? -1 : 1
      const droop = isWilted ? 1 : 0
      marks.push([middle + lean + side, y + droop, leaf])
      marks.push([middle + lean + side * 2, y + droop * 2 - (isWilted ? 0 : 1), leaf])
    }
  }

  const flowers = isWilted ? 0 : Math.min(MAX_FLOWERS, held.blooms)
  for (let flower = 0; flower < flowers; flower += 1) {
    const level = Math.max(1, stem - flower * 2)
    const x = middle + (flower === 0 ? 0 : flower % 2 === 0 ? -3 : 3)
    const y = base - level - (flower === 0 ? 1 : 0)
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) marks.push([x + dx, y + dy, PETAL])
    marks.push([x, y, HEART])
  }

  return marks
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

  const wanted = (await $.state.get(widths)).value?.['garden-widget'] ?? CARD_COLUMNS
  const held = await read($, plot)
  const isWilted = (await $.clock.now()) < held.wiltedUntil
  const mood = isWilted ? 'wilting' : held.leaves === 0 ? 'a bare pot' : stemOf(held.leaves) < 4 ? 'seedling' : 'thriving'
  const picture = await $.widgets.picture({
    surface,
    key: 'garden',
    columns: PLOT_COLUMNS,
    rows: PLOT_ROWS,
    marks: draw(held, isWilted),
  })

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Garden',
    note: mood,
    body: (
      <Box columnGap={2}>
        {picture}
        <Box flexDirection="column" justifyContent="center">
          <Text>{held.leaves === 1 ? '1 leaf' : `${held.leaves} leaves`}</Text>
          <Text>{some(held.blooms, 'bloom')}</Text>
          {isWilted && <Text dimColor>a call failed</Text>}
        </Box>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'garden-widget',
      description: 'Toggle the garden: it grows with tool calls and flowers when checks pass',
      argumentHint: '[on|off|reset]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('plot')
    if (isPlot(kept)) await update($, plot, () => ({ leaves: kept.leaves, blooms: kept.blooms, wiltedUntil: 0 }))

    return next(e)
  })

  on('command.run', { command: 'garden-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'reset') {
      await update($, plot, () => BARE)
      await $.store.set('plot', { leaves: 0, blooms: 0 })

      return { text: 'Garden replanted.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /garden-widget [on|off|reset]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Garden on; /widgets places it.' : 'Garden off.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!(await read($, isOn)) || ran.deny !== undefined) return ran

    const now = await $.clock.now()
    const command = String((e as { command?: unknown }).command ?? '')
    const isFailed = ran.isError === true
    const isChecked = !isFailed && e.tool === 'Bash' && CHECKS.test(command)
    const grown = await update($, plot, held => {
      const before = held ?? BARE

      return isFailed
        ? { ...before, wiltedUntil: now + WILT_MS }
        : { ...before, leaves: before.leaves + 1, blooms: before.blooms + (isChecked ? 1 : 0) }
    })
    await $.store.set('plot', { leaves: grown.leaves, blooms: grown.blooms })
    if (isFailed) {
      $.clock.after(WILT_MS, () => {
        void update($, plot, held => ({ ...(held ?? BARE), wiltedUntil: 0 }))
      })
    }

    return ran
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

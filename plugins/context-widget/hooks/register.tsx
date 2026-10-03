import { atom, read, update } from 'claude-code'
import type {
  Elements,
  EngineInterface,
  Register,
  RenderElement,
  RenderNode,
  RenderSurface,
} from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { ContextMode, ContextSlice, ContextSnapshot } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LINE_CELLS = 20
const GLYPH = { used: '█', buffer: '▒', free: '░' } as const
const MODES: readonly string[] = ['auto', 'detailed', 'grid', 'top', 'bar', 'line']
const SHORT: Record<string, string> = {
  'System prompt': 'System',
  'System tools': 'Tools',
  'MCP tools': 'MCP',
  'Custom agents': 'Agents',
  'Memory files': 'Memory',
  'Free space': 'Free',
  'Autocompact buffer': 'Buffer',
}
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'context-widget', key: 'isOn' } as const, false)
const mode = atom({ plugin: 'context-widget', key: 'mode' } as const, 'auto')
const snapshot = atom(
  { plugin: 'context-widget', key: 'snapshot' } as const,
  null,
)

const tokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`

  return String(count)
}

const allot = (values: readonly number[], width: number): number[] => {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0 || width <= 0) return values.map(() => 0)

  const cells = values.map(value =>
    value > 0 ? Math.max(1, Math.floor((value / total) * width)) : 0,
  )
  let spare = width - cells.reduce((sum, count) => sum + count, 0)

  while (spare !== 0) {
    const widest = cells.indexOf(Math.max(...cells))
    const count = cells[widest] ?? 0
    if (spare < 0 && count <= 1) break
    cells[widest] = count + Math.sign(spare)
    spare -= Math.sign(spare)
  }

  return cells
}

const measure = async ($: EngineInterface): Promise<void> => {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const found = context.breakdown
  if (found === undefined) return

  const slices: ContextSlice[] = []
  for (const row of found.categories) {
    if (row.kind !== 'deferred' && row.tokens > 0) {
      slices.push({
        name: row.name,
        tokens: row.tokens,
        color: row.color,
        kind: row.kind,
      })
    }
  }
  const measured: ContextSnapshot = {
    model: found.model,
    totalTokens: found.totalTokens,
    maxTokens: found.rawMaxTokens,
    percentage: found.percentage,
    slices,
  }
  await update($, snapshot, () => measured)
}

const isMode = (value: unknown): value is ContextMode =>
  typeof value === 'string' && MODES.includes(value)

const short = (name: string): string => SHORT[name] ?? name.slice(0, 8)

const share = (slice: ContextSlice, shot: ContextSnapshot): string =>
  `${Math.round((slice.tokens / Math.max(1, shot.maxTokens)) * 100)}%`

const drawBar = ({ Box, Text }: Tags, shot: ContextSnapshot, width: number): RenderElement => {
  const cells = allot(
    shot.slices.map(slice => slice.tokens),
    width,
  )

  return (
    <Box>
      {shot.slices.map((slice, index) => (
        <Text color={slice.color}>{GLYPH[slice.kind].repeat(cells[index] ?? 0)}</Text>
      ))}
    </Box>
  )
}

const drawLegend = (
  { Box, Text }: Tags,
  shot: ContextSnapshot,
  view: Exclude<ContextMode, 'auto' | 'line'>,
  inner: number,
): RenderNode[] => {
  if (view === 'detailed') {
    return shot.slices.map(slice => (
      <Box justifyContent="space-between">
        <Text wrap="truncate-end">
          <Text color={slice.color}>{GLYPH[slice.kind]}</Text> {slice.name}
        </Text>
        <Text dimColor>
          {' '}
          {tokens(slice.tokens)} {share(slice, shot)}
        </Text>
      </Box>
    ))
  }

  if (view === 'grid') {
    const half = Math.floor((inner - 2) / 2)
    const rows: RenderNode[] = []
    for (let index = 0; index < shot.slices.length; index += 2) {
      rows.push(
        <Box columnGap={2}>
          {shot.slices.slice(index, index + 2).map(slice => (
            <Box width={half} justifyContent="space-between">
              <Text wrap="truncate-end">
                <Text color={slice.color}>{GLYPH[slice.kind]}</Text> {short(slice.name)}
              </Text>
              <Text dimColor> {share(slice, shot)}</Text>
            </Box>
          ))}
        </Box>,
      )
    }

    return rows
  }

  if (view === 'top') {
    const largest = shot.slices
      .filter(slice => slice.kind === 'used')
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 3)

    return [
      <Text wrap="truncate-end">
        {largest.map((slice, index) => (
          <Text>
            {index > 0 ? ' ' : ''}
            <Text color={slice.color}>{GLYPH.used}</Text> {short(slice.name)}{' '}
            <Text dimColor>{share(slice, shot)}</Text>
          </Text>
        ))}
      </Text>,
    ]
  }

  return []
}

const drawCard = async (
  $: EngineInterface,
  tags: Tags,
  width: number,
  isDocked: boolean,
): Promise<RenderElement> => {
  const { Box, Text } = tags
  const shot = await read($, snapshot)
  const chosen = await read($, mode)
  const view = chosen === 'auto' ? (isDocked ? 'detailed' : 'top') : chosen
  const inner = width - 4
  const total =
    shot === null
      ? ''
      : `${tokens(shot.totalTokens)}/${tokens(shot.maxTokens)}`

  if (view === 'line') {
    return (
      <Box columnGap={1}>
        <Text bold>Context</Text>
        {shot === null ? (
          <Text dimColor>No reading yet.</Text>
        ) : (
          drawBar(tags, shot, LINE_CELLS)
        )}
        {shot !== null && (
          <Text dimColor>
            {shot.percentage}% · {total}
          </Text>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderDimColor paddingX={1}>
      <Text wrap="truncate-end">
        <Text bold>Context</Text>
        {shot !== null && (
          <Text dimColor>
            {' '}
            {total} ({shot.percentage}%)
          </Text>
        )}
      </Text>
      {shot === null && <Text dimColor>No reading yet.</Text>}
      {shot !== null && drawBar(tags, shot, inner)}
      {shot !== null && drawLegend(tags, shot, view, inner)}
    </Box>
  )
}

const wide = async ($: EngineInterface): Promise<number> =>
  (await $.state.get(widths)).value?.['context-widget'] ?? CARD_COLUMNS

const show = async (
  $: EngineInterface,
  tags: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
  isDocked: boolean,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = Math.min(await wide($), Math.max(20, columns))

  return $.widgets.stack({ beneath, card: await drawCard($, tags, width, isDocked) })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-widget',
      description: 'Toggle the context window card, or set its view mode',
      argumentHint: '[auto|detailed|grid|top|bar|line]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('mode')
    if (isMode(kept)) await update($, mode, () => kept)
    if (await read($, isOn)) await measure($)

    return next(e)
  })

  on('command.run', { command: 'context-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg !== '') {
      if (!isMode(arg)) {
        return { text: 'Usage: /context-widget [auto|detailed|grid|top|bar|line]' }
      }
      await update($, mode, () => arg)
      await $.store.set('mode', arg)
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await measure($)

      return { text: `Context widget on, ${arg} view.` }
    }

    const isShown = await update($, isOn, shown => !(shown ?? false))
    await $.store.set('isOn', isShown)
    if (!isShown) return { text: 'Context widget off.' }
    await measure($)

    return { text: `Context widget on, ${await read($, mode)} view; /widgets places it.` }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') && (await read($, isOn))) await measure($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show(
      $,
      $.ui.resolve(e),
      await next(e),
      'side',
      e.props.bodyColumns,
      e.props.placement === 'dock',
    ),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns, false),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80, false),
  )
}

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_READINGS = 60
const RECENT = 5
const DROP = 20
const BARS = '▁▂▃▄▅▆▇█'
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'forecast-widget', key: 'isOn' } as const, false)
const readings = atom({ plugin: 'forecast-widget', key: 'readings' } as const, [])

const record = async ($: EngineInterface): Promise<void> => {
  const { context } = await $.session.usage()
  const percent = context.percent
  if (percent === undefined) return

  await update($, readings, held => {
    const before = held ?? []
    const last = before[before.length - 1]

    return last !== undefined && percent < last - DROP ? [percent] : [...before, percent].slice(-MAX_READINGS)
  })
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

  const wanted = (await $.state.get(widths)).value?.['forecast-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const held = await read($, readings)
  const now = held[held.length - 1]
  const recent = held.slice(-(RECENT + 1))
  const growth = recent.length < 2 ? 0 : ((recent[recent.length - 1] ?? 0) - (recent[0] ?? 0)) / (recent.length - 1)
  const left = now === undefined || growth <= 0 ? undefined : Math.floor((100 - now) / growth)
  const shown = held.slice(-(width - 4))

  return $.widgets.card({
    beneath,
    width,
    title: 'Forecast',
    note: now === undefined ? '' : `context ${Math.round(now)}%`,
    body: (
      <Box flexDirection="column">
        {now === undefined && <Text dimColor>No turns measured yet.</Text>}
        {now !== undefined && (
          <Text wrap="truncate-end">
            {left === undefined ? 'holding steady' : `about ${left} turns until compaction`}
          </Text>
        )}
        {now !== undefined && (
          <Text dimColor wrap="truncate-end">
            {growth >= 0 ? '+' : ''}
            {growth.toFixed(1)}% per turn over the last {Math.max(1, recent.length - 1)}
          </Text>
        )}
        {shown.length > 0 && (
          <Text color={now !== undefined && now >= 80 ? 'red' : now !== undefined && now >= 50 ? 'yellow' : 'green'}>
            {shown
              .map(percent => BARS[Math.min(BARS.length - 1, Math.floor((percent / 100) * BARS.length))])
              .join('')}
          </Text>
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'forecast-widget',
      description: 'Toggle the chart of context growth and the turns left before compaction',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'forecast-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, readings, () => [])

      return { text: 'Forecast cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /forecast-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown && (await read($, readings)).length === 0) await record($)

    return { text: isShown ? 'Forecast on; /widgets places it.' : 'Forecast off.' }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isOn))) await record($)

    return next(e)
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

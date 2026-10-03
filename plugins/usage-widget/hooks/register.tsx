import { atom, read, update } from 'claude-code'
import type {
  Elements,
  EngineInterface,
  Register,
  RenderElement,
  RenderNode,
  RenderSurface,
  SessionCost,
  SessionRateLimit,
} from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { UsageSnapshot } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LABELS: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: '7-day',
  spend_limit: 'Spend limit',
}
const COLORS: Record<string, string> = {
  five_hour: 'cyan',
  seven_day: 'magenta',
  spend_limit: 'yellow',
}
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'usage-widget', key: 'isOn' } as const, false)
const snapshot = atom(
  { plugin: 'usage-widget', key: 'snapshot' } as const,
  null,
)

const snap = (
  rateLimits: readonly SessionRateLimit[],
  cost: SessionCost | undefined,
): UsageSnapshot => ({
  windows: rateLimits.map(({ kind, percentUsed, resetsAt }) =>
    resetsAt === undefined ? { kind, percentUsed } : { kind, percentUsed, resetsAt },
  ),
  ...(cost === undefined ? {} : { costUsd: cost.usd }),
})

const until = (resetsAt: string | undefined, now: number): string => {
  if (resetsAt === undefined) return ''
  const minutes = Math.round((Date.parse(resetsAt) - now) / 60_000)
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  if (minutes < 60) return ` · resets in ${minutes}m`
  if (minutes < 48 * 60) return ` · resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`

  return ` · resets in ${Math.round(minutes / 1440)}d`
}

const load = async ($: EngineInterface): Promise<void> => {
  const { rateLimits, cost } = await $.session.usage()
  await update($, snapshot, () => snap(rateLimits, cost))
}

const drawCard = async ($: EngineInterface, { Box, Text }: Tags, width: number): Promise<RenderElement> => {
  const shot = await read($, snapshot)
  const now = await $.clock.now()
  const inner = width - 4
  const windows = shot?.windows ?? []

  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderDimColor paddingX={1}>
      <Text wrap="truncate-end">
        <Text bold>Usage</Text>
        {shot?.costUsd !== undefined && <Text dimColor> ${shot.costUsd.toFixed(2)} this session</Text>}
      </Text>
      {windows.length === 0 && (
        <Text dimColor wrap="wrap">
          No rate-limit reading yet.
        </Text>
      )}
      {windows.map(window => {
        const filled = Math.min(
          inner,
          Math.max(window.percentUsed > 0 ? 1 : 0, Math.round((window.percentUsed / 100) * inner)),
        )
        const color = COLORS[window.kind] ?? 'green'

        return (
          <Box flexDirection="column">
            <Text wrap="truncate-end">
              {LABELS[window.kind] ?? window.kind.replaceAll('_', ' ')}
              <Text dimColor>
                {' '}
                {window.percentUsed}%{until(window.resetsAt, now)}
              </Text>
            </Text>
            <Box>
              <Text color={color}>{'█'.repeat(filled)}</Text>
              <Text dimColor>{'░'.repeat(inner - filled)}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

const wide = async ($: EngineInterface): Promise<number> =>
  (await $.state.get(widths)).value?.['usage-widget'] ?? CARD_COLUMNS

const show = async (
  $: EngineInterface,
  tags: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = Math.min(await wide($), Math.max(20, columns))

  return $.widgets.stack({ beneath, card: await drawCard($, tags, width) })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-widget',
      description: 'Toggle the rate-limit usage card among the /widgets cards',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if (await read($, isOn)) await load($)

    return next(e)
  })

  on('command.run', { command: 'usage-widget' }, async $ => {
    const isShown = await update($, isOn, shown => !(shown ?? false))
    await $.store.set('isOn', isShown)
    if (!isShown) return { text: 'Usage widget off.' }
    await load($)

    return { text: 'Usage widget on; /widgets places it.' }
  })

  on('session.measure', async ($, e, next) => {
    if (await read($, isOn)) {
      await update($, snapshot, () => snap(e.rateLimits, e.cost))
    }

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

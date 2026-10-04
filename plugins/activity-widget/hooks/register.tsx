import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { ActivityLog } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_ROWS = 6
const DETAILS: readonly string[] = ['command', 'file_path', 'notebook_path', 'pattern', 'description', 'query', 'url']
const QUIET: ActivityLog = { calls: [], total: 0, failed: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'activity-widget', key: 'isOn' } as const, false)
const log = atom({ plugin: 'activity-widget', key: 'log' } as const, QUIET)
const asked = new Set<string>()

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const detailOf = (input: Readonly<Record<string, unknown>>): string => {
  for (const key of DETAILS) {
    const value = input[key]
    if (typeof value === 'string' && value !== '') {
      return key.endsWith('_path') ? (value.split(/[\\/]/).pop() ?? value) : value.split('\n')[0] ?? value
    }
  }

  return ''
}

const took = (ms: number): string => (ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)}m`)

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['activity-widget'] ?? CARD_COLUMNS
  const held = await read($, log)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Activity',
    note: held.total === 0 ? '' : `${some(held.total, 'call')} · ${held.failed} failed`,
    body: (
      <Box flexDirection="column">
        {held.calls.length === 0 && <Text dimColor>No tool calls yet.</Text>}
        {held.calls.map(call => (
          <Box columnGap={1}>
            <Text color={call.isFailed ? 'red' : 'green'}>{call.isFailed ? '✗' : '✓'}</Text>
            <Box flexGrow={1}>
              <Text wrap="truncate-end">
                {call.tool}
                {call.detail !== '' && <Text dimColor> {call.detail}</Text>}
              </Text>
            </Box>
            <Text dimColor>{call.isAsked === true ? `asked ${took(call.ms)}` : took(call.ms)}</Text>
          </Box>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'activity-widget',
      description: 'Toggle the card listing the latest tool calls',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'activity-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, log, () => QUIET)

      return { text: 'Activity cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /activity-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Activity widget on; /widgets places it.' : 'Activity widget off.' }
  })

  on('tool.check', async (_$, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id !== undefined) asked.add(e.tool_use_id)

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const startedAt = await $.clock.now()
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt
    const isFailed = ran.isError === true || ran.deny !== undefined
    const isAsked = e.tool_use_id !== undefined && asked.delete(e.tool_use_id)
    const call = { tool: e.tool, detail: detailOf(e as Readonly<Record<string, unknown>>), ms, isFailed, isAsked }

    await update($, log, held => {
      const before = held ?? QUIET

      return {
        calls: [call, ...before.calls].slice(0, MAX_ROWS),
        total: before.total + 1,
        failed: before.failed + (isFailed ? 1 : 0),
      }
    })

    return ran
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

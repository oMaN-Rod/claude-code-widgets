import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { GuardTally } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_ROWS = 4
const NONE: GuardTally = { allow: 0, ask: 0, deny: 0, asked: {}, denied: {} }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'guard-widget', key: 'isOn' } as const, false)
const tally = atom({ plugin: 'guard-widget', key: 'tally' } as const, NONE)

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const labelOf = (tool: string, input: unknown): string => {
  const command = (input as { command?: unknown } | null)?.command
  const word = typeof command === 'string' ? (command.trim().split(/\s+/)[0] ?? '') : ''

  return word === '' ? tool : `${tool} ${word}`
}

const bump = (counts: Readonly<Record<string, number>>, label: string): Record<string, number> => ({
  ...counts,
  [label]: (counts[label] ?? 0) + 1,
})

const top = (counts: Readonly<Record<string, number>>): [string, number][] =>
  Object.entries(counts)
    .sort((one, other) => other[1] - one[1])
    .slice(0, MAX_ROWS)

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['guard-widget'] ?? CARD_COLUMNS
  const held = await read($, tally)
  const total = held.allow + held.ask + held.deny

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Guard',
    note: total === 0 ? '' : some(total, 'check'),
    body: (
      <Box flexDirection="column">
        {total === 0 && <Text dimColor>No permission checks yet.</Text>}
        {total > 0 && (
          <Text wrap="truncate-end">
            <Text color="green">{held.allow} allowed</Text> · <Text color="yellow">{held.ask} asked</Text> ·{' '}
            <Text color="red">{held.deny} denied</Text>
          </Text>
        )}
        {top(held.asked).map(([label, count]) => (
          <Box justifyContent="space-between" columnGap={1}>
            <Text wrap="truncate-end">
              <Text color="yellow">?</Text> {label}
            </Text>
            <Text dimColor>×{count}</Text>
          </Box>
        ))}
        {top(held.denied).map(([label, count]) => (
          <Box justifyContent="space-between" columnGap={1}>
            <Text wrap="truncate-end">
              <Text color="red">✗</Text> {label}
            </Text>
            <Text dimColor>×{count}</Text>
          </Box>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guard-widget',
      description: 'Toggle the tally of permission checks: allowed, asked and denied',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'guard-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, tally, () => NONE)

      return { text: 'Guard cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /guard-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Guard on; /widgets places it.' : 'Guard off.' }
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id === undefined || !(await read($, isOn))) return verdict

    const label = labelOf(e.tool, e.input)
    await update($, tally, held => {
      const before = held ?? NONE

      return {
        ...before,
        [verdict.decision]: before[verdict.decision] + 1,
        asked: verdict.decision === 'ask' ? bump(before.asked, label) : before.asked,
        denied: verdict.decision === 'deny' ? bump(before.denied, label) : before.denied,
      }
    })

    return verdict
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

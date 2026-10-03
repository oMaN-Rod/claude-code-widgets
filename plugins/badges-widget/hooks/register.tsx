import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { BadgesStats } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Badge = { id: string; name: string; hint: string; isEarned: (stats: BadgesStats) => boolean }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const EDITORS: readonly string[] = ['Edit', 'Write', 'NotebookEdit']
const FRESH: BadgesStats = { calls: 0, streak: 0, greens: 0, edits: 0, longestTurnMs: 0, lateCalls: 0 }
const BADGES: readonly Badge[] = [
  { id: 'first', name: 'First steps', hint: 'one tool call', isEarned: stats => stats.calls >= 1 },
  { id: 'steady', name: 'Steady hands', hint: '20 calls without a failure', isEarned: stats => stats.streak >= 20 },
  { id: 'green', name: 'Green light', hint: 'a passing check', isEarned: stats => stats.greens >= 1 },
  { id: 'hat-trick', name: 'Hat trick', hint: '3 passing checks in a row', isEarned: stats => stats.greens >= 3 },
  { id: 'editor', name: 'Editor', hint: '25 edits', isEarned: stats => stats.edits >= 25 },
  { id: 'century', name: 'Century', hint: '100 tool calls', isEarned: stats => stats.calls >= 100 },
  { id: 'marathon', name: 'Marathon', hint: 'a turn over 10 minutes', isEarned: stats => stats.longestTurnMs >= 600_000 },
  { id: 'night-owl', name: 'Night owl', hint: 'a call between midnight and 5', isEarned: stats => stats.lateCalls >= 1 },
]
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'badges-widget', key: 'isOn' } as const, false)
const stats = atom({ plugin: 'badges-widget', key: 'stats' } as const, FRESH)
const earned = atom({ plugin: 'badges-widget', key: 'earned' } as const, [])

const isStats = (value: unknown): value is BadgesStats =>
  typeof value === 'object' &&
  value !== null &&
  Object.keys(FRESH).every(key => typeof (value as Record<string, unknown>)[key] === 'number')

const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(id => typeof id === 'string')

const award = async ($: EngineInterface, held: BadgesStats): Promise<void> => {
  const before = await read($, earned)
  const fresh = BADGES.filter(badge => !before.includes(badge.id) && badge.isEarned(held))

  await $.store.set('stats', held)
  if (fresh.length === 0) return

  const kept = await update($, earned, ids => [...(ids ?? []), ...fresh.map(badge => badge.id)])
  await $.store.set('earned', kept)
  for (const badge of fresh) $.ui.toast(`Badge earned: ${badge.name}`)
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

  const wanted = (await $.state.get(widths)).value?.['badges-widget'] ?? CARD_COLUMNS
  const won = await read($, earned)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Badges',
    note: `${won.length}/${BADGES.length}`,
    body: (
      <Box flexDirection="column">
        {BADGES.map(badge =>
          won.includes(badge.id) ? (
            <Text color="yellow" wrap="truncate-end">
              ★ {badge.name}
            </Text>
          ) : (
            <Text dimColor wrap="truncate-end">
              ☆ {badge.name}: {badge.hint}
            </Text>
          ),
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'badges-widget',
      description: 'Toggle the achievements card',
      argumentHint: '[on|off|reset]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('stats')
    if (isStats(kept)) await update($, stats, () => ({ ...kept, streak: 0 }))
    const won = await $.store.get('earned')
    if (isIds(won)) await update($, earned, () => won)

    return next(e)
  })

  on('command.run', { command: 'badges-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'reset') {
      await update($, stats, () => FRESH)
      await update($, earned, () => [])
      await $.store.set('stats', FRESH)
      await $.store.set('earned', [])

      return { text: 'Badges reset.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /badges-widget [on|off|reset]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Badges on; /widgets places it.' : 'Badges off.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    const hour = new Date(await $.clock.now()).getHours()
    const command = String((e as { command?: unknown }).command ?? '')
    const isFailed = ran.isError === true
    const isCheck = e.tool === 'Bash' && CHECKS.test(command)
    const held = await update($, stats, before => {
      const was = before ?? FRESH

      return {
        ...was,
        calls: was.calls + 1,
        streak: isFailed ? 0 : was.streak + 1,
        greens: isCheck ? (isFailed ? 0 : was.greens + 1) : was.greens,
        edits: was.edits + (!isFailed && EDITORS.includes(e.tool) ? 1 : 0),
        lateCalls: was.lateCalls + (hour < 5 ? 1 : 0),
      }
    })
    await award($, held)

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const held = await update($, stats, before => ({
        ...(before ?? FRESH),
        longestTurnMs: Math.max((before ?? FRESH).longestTurnMs, e.durationMs),
      }))
      await award($, held)
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

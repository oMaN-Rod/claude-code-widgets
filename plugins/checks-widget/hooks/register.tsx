import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 30_000
const MAX_ROWS = 4
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'checks-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'checks-widget', key: 'tick' } as const, 0)
const runs = atom({ plugin: 'checks-widget', key: 'runs' } as const, [])

let timer: Timer | undefined

const span = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`

  return `${Math.floor(seconds / 3600)}h`
}

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
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  await read($, tick)
  const wanted = (await $.state.get(widths)).value?.['checks-widget'] ?? CARD_COLUMNS
  const held = await read($, runs)
  const now = await $.clock.now()
  const [latest] = held
  const streak = held.findIndex(run => run.isPassed !== latest?.isPassed)
  const inRow = streak === -1 ? held.length : streak

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Checks',
    note: latest === undefined ? '' : `${inRow} ${latest.isPassed ? 'passing' : 'failing'} in a row`,
    body: (
      <Box flexDirection="column">
        {held.length === 0 && <Text dimColor>No test, lint or build runs yet.</Text>}
        {held.slice(0, MAX_ROWS).map(run => (
          <Box columnGap={1}>
            <Text color={run.isPassed ? 'green' : 'red'}>{run.isPassed ? '✓' : '✗'}</Text>
            <Box flexGrow={1}>
              <Text wrap="truncate-end">{run.command}</Text>
            </Box>
            <Text dimColor>
              {span(run.ms)} · {span(now - run.at)} ago
            </Text>
          </Box>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'checks-widget',
      description: 'Toggle the card showing the latest test, lint and build runs',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'checks-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, runs, () => [])

      return { text: 'Checks cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /checks-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Checks widget on; /widgets places it.' : 'Checks widget off.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = String((e as { command?: unknown }).command ?? '').split('\n')[0] ?? ''
    if (!CHECKS.test(command) || !(await read($, isOn))) return next(e)

    const startedAt = await $.clock.now()
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    const at = await $.clock.now()
    const run = { command, isPassed: ran.isError !== true, ms: at - startedAt, at }
    await update($, runs, held => [run, ...(held ?? [])].slice(0, 20))

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

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, ProcessRunResult, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { WatchRun } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TIMEOUT_MS = 180_000
const MAX_LINES = 4
const EDITORS: readonly string[] = ['Edit', 'Write', 'NotebookEdit']
const UNSET: WatchRun = { command: '', status: 'idle', ms: 0, runs: 0, lines: [] }
const LIGHTS: Record<WatchRun['status'], string> = { idle: 'gray', running: 'yellow', passed: 'green', failed: 'red' }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'watch-widget', key: 'isOn' } as const, false)
const watch = atom({ plugin: 'watch-widget', key: 'watch' } as const, UNSET)

let isRunning = false
let isStale = false

const span = (ms: number): string => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)}m`)

const tidy = (text: string): string[] =>
  text
    .split('\n')
    .map(line => [...line.replaceAll('\r', '')].filter(letter => letter >= ' ').join('').trim())
    .filter(line => line !== '')

const shell = async ($: EngineInterface, command: string): Promise<ProcessRunResult> => {
  try {
    return await $.process.run(['sh', '-c', command], { timeoutMs: TIMEOUT_MS })
  } catch {
    return $.process.run(['cmd', '/c', command], { timeoutMs: TIMEOUT_MS })
  }
}

const check = async ($: EngineInterface): Promise<void> => {
  const { command } = await read($, watch)
  if (command === '' || !(await read($, isOn))) return
  if (isRunning) {
    isStale = true

    return
  }

  isRunning = true
  isStale = false
  const startedAt = await $.clock.now()
  await update($, watch, held => ({ ...(held ?? UNSET), status: 'running' as const }))
  let status: WatchRun['status'] = 'failed'
  let lines: string[] = []
  try {
    const ran = await shell($, command)
    status = ran.exitCode === 0 ? 'passed' : 'failed'
    lines = status === 'passed' ? [] : tidy(ran.stderr.trim() === '' ? ran.stdout : ran.stderr).slice(-MAX_LINES)
  } catch (error) {
    lines = [String(error).slice(0, 120)]
  }
  const ms = (await $.clock.now()) - startedAt
  isRunning = false
  await update($, watch, held =>
    (held ?? UNSET).command === command
      ? { command, status, ms, runs: (held ?? UNSET).runs + 1, lines }
      : (held ?? UNSET),
  )
  if (isStale) await check($)
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

  const wanted = (await $.state.get(widths)).value?.['watch-widget'] ?? CARD_COLUMNS
  const held = await read($, watch)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Watch',
    note: held.command,
    body:
      held.command === '' ? (
        <Text dimColor>/watch bun test</Text>
      ) : (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text color={LIGHTS[held.status]}>●</Text> {held.status}
            {held.runs > 0 && (
              <Text dimColor>
                {' '}
                · {span(held.ms)} · run {held.runs}
              </Text>
            )}
          </Text>
          {held.lines.map(line => (
            <Text dimColor wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Box>
      ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'watch-widget',
      description: 'Toggle the watch card, rerun its command now, or stop watching',
      argumentHint: '[on|off|run|stop]',
    })
    await $.command.register({
      name: 'watch',
      description: 'Rerun a command after every edit and show whether it passes',
      argumentHint: '<command>',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('command')
    if (typeof kept === 'string' && kept !== '') await update($, watch, () => ({ ...UNSET, command: kept }))

    return next(e)
  })

  on('command.run', { command: 'watch-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'run') {
      void check($)

      return { text: 'Running.' }
    }
    if (arg === 'stop') {
      await update($, watch, () => UNSET)
      await $.store.set('command', '')

      return { text: 'Stopped watching.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /watch-widget [on|off|run|stop]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Watch on; /widgets places it.' : 'Watch off.' }
  })

  on('command.run', { command: 'watch' }, async ($, e) => {
    const command = e.args.trim()
    if (command === '') return { text: 'Usage: /watch <command>' }

    await update($, watch, () => ({ ...UNSET, command }))
    await $.store.set('command', command)
    await update($, isOn, () => true)
    await $.store.set('isOn', true)
    void check($)

    return { text: `Watching: ${command}` }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (EDITORS.includes(e.tool) && ran.isError !== true && ran.deny === undefined) void check($)

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

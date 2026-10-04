import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { PomodoroRun } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 1000
const FOCUS_MINUTES = 25
const BREAK_MINUTES = 5
const MAX_MINUTES = 180
const USAGE = 'Usage: /pomodoro-widget [on|off|start|break|stop|<minutes>]'
const RESTING: PomodoroRun = { kind: null, startedAt: 0, endsAt: 0, done: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'pomodoro-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'pomodoro-widget', key: 'tick' } as const, 0)
const run = atom({ plugin: 'pomodoro-widget', key: 'run' } as const, RESTING)

let timer: Timer | undefined

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const pad = (value: number): string => String(value).padStart(2, '0')

const beat = async ($: EngineInterface): Promise<void> => {
  const held = await read($, run)
  const now = await $.clock.now()
  if (held.kind !== null && now >= held.endsAt) {
    await update($, run, before => ({
      ...(before ?? RESTING),
      kind: null,
      done: (before ?? RESTING).done + (held.kind === 'focus' ? 1 : 0),
    }))
    $.ui.toast(held.kind === 'focus' ? 'Focus session done. Take a break.' : 'Break over.')
    await sync($)

    return
  }
  await update($, tick, count => ((count ?? 0) + 1) % 1_000_000)
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = (await read($, run)).kind !== null
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void beat($)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const begin = async ($: EngineInterface, kind: 'focus' | 'break', minutes: number): Promise<void> => {
  const now = await $.clock.now()
  await update($, run, held => ({
    ...(held ?? RESTING),
    kind,
    startedAt: now,
    endsAt: now + minutes * 60_000,
  }))
  await update($, isOn, () => true)
  await $.store.set('isOn', true)
  await sync($)
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
  const wanted = (await $.state.get(widths)).value?.['pomodoro-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = width - 4
  const held = await read($, run)
  const now = await $.clock.now()
  const left = Math.max(0, Math.ceil((held.endsAt - now) / 1000))
  const share = held.kind === null ? 0 : (now - held.startedAt) / Math.max(1, held.endsAt - held.startedAt)
  const filled = Math.min(inner, Math.round(share * inner))

  return $.widgets.card({
    beneath,
    width,
    title: 'Pomodoro',
    note: held.kind ?? 'idle',
    body: (
      <Box flexDirection="column">
        {held.kind === null ? (
          <Text dimColor>/pomodoro-widget start to focus.</Text>
        ) : (
          <Text bold>
            {pad(Math.floor(left / 60))}:{pad(left % 60)}
          </Text>
        )}
        {held.kind !== null && (
          <Box>
            <Text color={held.kind === 'focus' ? 'red' : 'green'}>{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(inner - filled)}</Text>
          </Box>
        )}
        <Text dimColor>{some(held.done, 'focus session')} done</Text>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pomodoro-widget',
      description: 'Toggle the focus timer, or start a focus session or a break',
      argumentHint: '[on|off|start|break|stop|<minutes>]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'pomodoro-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'start' || /^\d+$/.test(arg)) {
      const minutes = arg === 'start' ? FOCUS_MINUTES : Math.min(MAX_MINUTES, Math.max(1, Number(arg)))
      await begin($, 'focus', minutes)

      return { text: `Focus for ${minutes} minutes.` }
    }
    if (arg === 'break') {
      await begin($, 'break', BREAK_MINUTES)

      return { text: `Break for ${BREAK_MINUTES} minutes.` }
    }
    if (arg === 'stop') {
      await update($, run, held => ({ ...(held ?? RESTING), kind: null }))
      await sync($)

      return { text: 'Timer stopped.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Pomodoro on; /widgets places it.' : 'Pomodoro off.' }
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

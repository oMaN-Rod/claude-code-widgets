import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 1000
const USAGE = 'Usage: /countdown <HH:MM|<n>m|<n>h> [label]'
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'countdown-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'countdown-widget', key: 'tick' } as const, 0)
const target = atom({ plugin: 'countdown-widget', key: 'target' } as const, null)

let timer: Timer | undefined

const pad = (value: number): string => String(value).padStart(2, '0')

const span = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  return hours > 0
    ? `${hours}h ${pad(minutes)}m ${pad(seconds % 60)}s`
    : `${minutes}m ${pad(seconds % 60)}s`
}

const whenOf = (text: string, now: number): number | undefined => {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(text)
  const lapse = /^(\d+)(m|h)$/.exec(text)

  if (lapse !== null) return now + Number(lapse[1]) * (lapse[2] === 'h' ? 3_600_000 : 60_000)
  if (clock === null || Number(clock[1]) > 23 || Number(clock[2]) > 59) return undefined

  const at = new Date(now)
  at.setHours(Number(clock[1]), Number(clock[2]), 0, 0)

  return at.getTime() <= now ? at.getTime() + 86_400_000 : at.getTime()
}

const beat = async ($: EngineInterface): Promise<void> => {
  const held = await read($, target)
  const now = await $.clock.now()
  if (held !== null && !held.isRung && now >= held.at) {
    await update($, target, before => (before === null || before === undefined ? null : { ...before, isRung: true }))
    $.ui.toast(held.label === '' ? 'Countdown reached.' : `Time: ${held.label}`)
  }
  await update($, tick, count => ((count ?? 0) + 1) % 1_000_000)
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = (await read($, target)) !== null
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
  const wanted = (await $.state.get(widths)).value?.['countdown-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = width - 4
  const held = await read($, target)
  const now = await $.clock.now()

  if (held === null) {
    return $.widgets.card({
      beneath,
      width,
      title: 'Countdown',
      note: '',
      body: <Text dimColor>/countdown 17:00 standup</Text>,
    })
  }

  const share = Math.min(1, (now - held.setAt) / Math.max(1, held.at - held.setAt))
  const filled = Math.round(share * inner)
  const due = new Date(held.at)

  return $.widgets.card({
    beneath,
    width,
    title: 'Countdown',
    note: held.label,
    body: (
      <Box flexDirection="column">
        {now >= held.at ? (
          <Text bold color="red">
            reached {span(now - held.at)} ago
          </Text>
        ) : (
          <Text bold>{span(held.at - now)}</Text>
        )}
        <Box>
          <Text color={now >= held.at ? 'red' : 'cyan'}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(inner - filled)}</Text>
        </Box>
        <Text dimColor>
          until {pad(due.getHours())}:{pad(due.getMinutes())}
        </Text>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'countdown-widget',
      description: 'Toggle the countdown card, or clear its deadline',
      argumentHint: '[on|off|clear]',
    })
    await $.command.register({
      name: 'countdown',
      description: 'Count down to a time of day or a number of minutes or hours from now',
      argumentHint: '<HH:MM|<n>m|<n>h> [label]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'countdown-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, target, () => null)
      await sync($)

      return { text: 'Countdown cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /countdown-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Countdown on; /widgets places it.' : 'Countdown off.' }
  })

  on('command.run', { command: 'countdown' }, async ($, e) => {
    const [when = '', ...words] = e.args.trim().split(/\s+/)
    const now = await $.clock.now()
    const at = whenOf(when.toLowerCase(), now)
    if (at === undefined) return { text: USAGE }

    const label = words.join(' ')
    await update($, target, () => ({ at, setAt: now, label, isRung: false }))
    await update($, isOn, () => true)
    await $.store.set('isOn', true)
    await sync($)

    return { text: `Counting down ${span(at - now)}${label === '' ? '' : ` to ${label}`}.` }
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

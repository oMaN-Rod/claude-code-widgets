import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { EarshotCall, EarshotMessage } from '../types'
import { fit, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Row = { key: string; text: string; color?: 'yellow' | 'green'; isDim?: boolean; isMarked?: boolean }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const USAGE = 'Usage: /earshot-widget [on|off|last|clear]'
const OFF = 'Earshot is off.'
const QUIET = 'Nothing waiting to be heard.'
const EMPTY = 'Type while Claude works: this shows when Claude got your message and what it ran first.'
const NO_TEXT = '(no text)'
const CHANGERS = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell']
const SHELLS = ['Bash', 'PowerShell']
const WIDE = 30
const PERIOD_MS = 1000
const KEPT = 5
const TEXT_MAX = 80
const LABEL_MAX = 60
const STORED = 12
const LISTED = 4
const EARLIER = 2
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'earshot-widget', key: 'isOn' } as const, false)
const messages = atom({ plugin: 'earshot-widget', key: 'messages' } as const, [] as EarshotMessage[])
const flight = atom({ plugin: 'earshot-widget', key: 'flight' } as const, [] as EarshotCall[])

let timer: Timer | undefined

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

const cut = (text: string, room: number): string => {
  if (text.length <= room) return text

  return room < 1 ? '' : `${text.slice(0, room - 1).trimEnd()}…`
}

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

const stored = (text: string): string => flat(text).slice(0, TEXT_MAX).trimEnd()

const fitted = (inner: number, forms: readonly string[]): string => forms.find(form => form.length <= inner) ?? forms.at(-1) ?? ''

const quoted = (text: string, room: number): string => (text === '' ? cut(NO_TEXT, room) : `"${cut(text, Math.max(1, room - 2))}"`)

const fileName = (path: string): string => path.split(/[\\/]/).at(-1) ?? ''

const labelOf = (tool: string, input: Readonly<Record<string, unknown>>): string => {
  const said = (key: string): string => {
    const value = input[key]

    return typeof value === 'string' ? value : ''
  }
  const detail =
    tool === 'Edit' || tool === 'Write' ? fileName(said('file_path')) : tool === 'NotebookEdit' ? fileName(said('notebook_path')) : SHELLS.includes(tool) ? said('command') : ''
  const name = tool.startsWith('mcp__') ? tool.split('__').slice(2).join('__') || tool : tool

  return cut(flat(`${name} ${detail}`), LABEL_MAX)
}

const bare = (label: string): string => (label.includes(' ') ? label.slice(label.indexOf(' ') + 1) : label)

const lateness = (message: EarshotMessage, now: number): string => span((message.status === 'waiting' ? now : message.settledAt) - message.at)

const wordOf = (message: EarshotMessage): string => {
  if (message.status === 'waiting') return 'waiting'
  if (message.status === 'heard') return message.isTimed ? `${lateness(message, 0)} late` : 'heard'

  return message.status === 'missed' ? 'not heard' : 'own turn'
}

const statusOf = (message: EarshotMessage, late: string, inner: number, isWide: boolean): string => {
  const forms = {
    waiting: [`not heard yet · ${late}`, `waiting · ${late}`, `waiting ${late}`],
    heard: message.isTimed ? [`heard ${late} after you sent it`, `heard ${late} late`, `heard +${late}`] : ['heard in the turn it was sent over', 'heard this turn'],
    missed: ['The turn ended before Claude got it.', 'Turn ended first.', 'Turn ended.'],
    own: [`Ran as its own turn, ${late} later.`, `Own turn, ${late} later.`, `Own turn +${late}`, `Own +${late}`],
  }[message.status]

  return fitted(inner, isWide ? forms : forms.slice(1))
}

const listOf = (message: EarshotMessage, inner: number, isWide: boolean): Row[] => {
  const isHeard = message.status === 'heard'
  const said = (forms: readonly string[]): string => fitted(inner, isWide ? forms : forms.slice(1))
  if (!message.isTimed) return [{ key: 'untimed', text: said(['Sent remotely: wait not measured.', 'Wait not timed.']), isDim: true }]
  if (message.changeCount === 0 && message.readCount === 0) {
    if (message.status === 'waiting') return []

    return [
      {
        key: 'nothing',
        text: said(isHeard ? ['Nothing ran before it heard you.', 'Nothing ran first.', 'Nothing ran.'] : ['Nothing ran meanwhile.', 'Nothing ran.']),
        color: 'green',
      },
    ]
  }

  const reads = plural(message.readCount, 'read')
  if (message.changeCount === 0) return [{ key: 'reads', text: said([`${reads}, nothing changed`, `${reads} only`]) }]

  return [
    ...(message.status === 'waiting' ? [] : [{ key: 'heading', text: isHeard ? said(['Before it heard you:', 'Before that:']) : 'Meanwhile:' }]),
    ...message.changes.slice(0, LISTED).map((label, at) => ({ key: `change-${at}`, text: cut(isWide ? label : bare(label), inner - 2), isMarked: true })),
    ...(message.changeCount > LISTED ? [{ key: 'more', text: `+${message.changeCount - LISTED} more`, isDim: true }] : []),
    ...(message.readCount > 0 ? [{ key: 'reads', text: `and ${reads}`, isDim: true }] : []),
  ]
}

const rowsOf = (held: readonly EarshotMessage[], behind: EarshotCall | undefined, now: number, inner: number, isWide: boolean): Row[] => {
  const newest = held.at(-1)
  if (newest === undefined) return []

  return [
    { key: 'quote', text: quoted(newest.text, inner), color: 'yellow' },
    { key: 'status', text: statusOf(newest, lateness(newest, now), inner, isWide) },
    ...(newest.isPushed ? [{ key: 'pushed', text: fitted(inner, isWide ? ['A command went to the background', 'Backgrounded'] : ['Went to background', 'Backgrounded']), isDim: true }] : []),
    ...(newest.status === 'waiting' && behind !== undefined ? [{ key: 'behind', text: cut(`behind ${isWide ? behind.label : bare(behind.label)}`, inner) }] : []),
    ...listOf(newest, inner, isWide),
    ...held
      .slice(0, -1)
      .reverse()
      .slice(0, EARLIER)
      .map((earlier, at) => {
        const whole = wordOf(earlier)
        const word = earlier.status === 'heard' && inner - whole.length - 3 < 4 ? `+${lateness(earlier, 0)}` : whole

        return { key: `earlier-${at}`, text: `${quoted(earlier.text, Math.max(4, inner - word.length - 3))} · ${word}`, isDim: true }
      }),
  ]
}

const report = (message: EarshotMessage, now: number): string => {
  const quote = message.text === '' ? NO_TEXT : `"${message.text}"`
  if (!message.isTimed) {
    return `${quote} was heard in the turn it was sent over. It was sent remotely, so Earshot got it only at delivery and its wait is not measured.`
  }

  const late = lateness(message, now)
  const first = {
    waiting: `${quote} is not heard yet, ${late} so far.`,
    heard: `${quote} was heard ${late} after you sent it.`,
    missed: `${quote} was not heard: the turn ended ${late} after you sent it.`,
    own: `${quote} was not heard in that turn and ran as its own turn ${late} after you sent it.`,
  }[message.status]
  const reads = plural(message.readCount, 'read')
  const unlisted = message.changeCount - message.changes.length
  const second =
    message.changeCount > 0
      ? `Changes first: ${message.changes.join(', ')}${unlisted > 0 ? ` and ${unlisted} more` : ''}${message.readCount > 0 ? `; ${reads}` : ''}.`
      : message.readCount > 0
        ? `${reads}, nothing changed.`
        : 'Nothing ran in between.'

  return [first, second, ...(message.isPushed ? ['A command went to the background to let it through.'] : [])].join('\n')
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = (await read($, isOn)) && (await read($, messages)).some(message => message.status === 'waiting')
  if (isWanted && timer === undefined) {
    timer = $.clock.every(PERIOD_MS, () => $.ui.invalidate('ui.render'))
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const hear = async ($: EngineInterface, text: string): Promise<void> => {
  const said = flat(text)
  const isMatch = (held: readonly EarshotMessage[]): EarshotMessage | undefined =>
    held.find(message => message.status === 'waiting' && message.text !== '' && said.includes(message.text))
  if (isMatch(await read($, messages)) === undefined) return

  const now = await $.clock.now()
  await update($, messages, kept => {
    const heard = isMatch(kept ?? [])

    return (kept ?? []).map(message => (message === heard ? { ...message, status: 'heard' as const, settledAt: now } : message))
  })
  await sync($)
}

// A hook that waited on a long call reads state as it stood when the call began; update() retries on what stands now.
const count = async ($: EngineInterface, startedAt: number, label: string, isChange: boolean, isPush: boolean): Promise<void> => {
  await update($, messages, kept => {
    const pushed = isPush ? (kept ?? []).find(message => message.status === 'waiting') : undefined

    return (kept ?? []).map(message => {
      const marked = message === pushed ? { ...message, isPushed: true } : message
      if (message.status !== 'waiting' || message.at > startedAt) return marked
      if (!isChange) return { ...marked, readCount: marked.readCount + 1 }

      return { ...marked, changes: marked.changes.length < STORED ? [...marked.changes, label] : marked.changes, changeCount: marked.changeCount + 1 }
    })
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

  const width = fit((await $.state.get(widths)).value?.['earshot-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const isWide = width >= WIDE
  const held = await read($, messages)
  const newest = held.at(-1)
  if (newest === undefined) {
    return $.widgets.card({
      beneath,
      width,
      title: 'Earshot',
      body: (
        <Box key="empty" flexDirection="column">
          {wrapped(QUIET, inner).map((line, at) => (
            <Text key={`quiet-${at}`} wrap="truncate-end">
              {line}
            </Text>
          ))}
          {wrapped(EMPTY, inner).map((line, at) => (
            <Text key={`say-${at}`} wrap="truncate-end" dimColor>
              {line}
            </Text>
          ))}
        </Box>
      ),
    })
  }

  const isWaiting = newest.status === 'waiting'
  const rows = rowsOf(held, isWaiting ? (await read($, flight))[0] : undefined, isWaiting ? await $.clock.now() : 0, inner, isWide)

  return $.widgets.card({
    beneath,
    width,
    title: 'Earshot',
    ...(isWide ? { note: wordOf(newest) } : {}),
    body: (
      <Box key="heard" flexDirection="column">
        {rows.map(row => (
          <Text key={row.key} wrap="truncate-end" color={row.color} dimColor={row.isDim === true}>
            {row.isMarked === true && <Text color="yellow">! </Text>}
            {row.text}
          </Text>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'earshot-widget',
      description: 'Toggle the Earshot card, or read the last message typed over a turn in full',
      argumentHint: '[on|off|last|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'earshot-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'last' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }

      const held = await read($, messages)
      const newest = held.at(-1)
      if (arg === 'last') return { text: newest === undefined ? 'No message typed over a turn yet.' : report(newest, await $.clock.now()) }

      await update($, messages, () => [])
      await sync($)

      return { text: `Earshot cleared: ${plural(held.length, 'message')} forgotten.` }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) {
      await update($, messages, () => [])
      await update($, flight, () => [])
    }
    await sync($)

    return { text: isShown ? 'Earshot on; /widgets places it.' : 'Earshot off.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const isOwn = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (e.turnId === undefined || e.wait || !isOwn || e.text.startsWith('/') || !(await read($, isOn))) return next(e)

    const at = await $.clock.now()
    const turnId = e.turnId
    const isTimed = e.origin.kind === 'composer'
    const fresh: EarshotMessage = {
      text: stored(e.text),
      at,
      turnId,
      isTimed,
      status: isTimed ? 'waiting' : 'heard',
      settledAt: isTimed ? 0 : at,
      changes: [],
      changeCount: 0,
      readCount: 0,
      isPushed: false,
    }
    await update($, messages, kept => [...(kept ?? []), fresh].slice(-KEPT))
    await sync($)

    const entered = await next(e)
    await update($, messages, kept => {
      const held = kept ?? []
      const found = held.findLastIndex(message => message.at === at && message.turnId === turnId)
      if ('drop' in entered || entered.text.startsWith('/')) return held.filter((_, index) => index !== found)

      return held.map((message, index) => (index === found ? { ...message, text: stored(entered.text) } : message))
    })
    await sync($)

    return entered
  })

  on('prompt.attachment', { type: 'queued_command' }, async ($, e, next) => {
    if (e.agentId === undefined && e.origin.kind === 'engine' && (await read($, isOn))) await hear($, e.text)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const isDue = (message: EarshotMessage): boolean => message.status === 'waiting' && message.turnId === e.turnId
    if (e.agentId === undefined && (await read($, isOn)) && (await read($, messages)).some(isDue)) {
      const now = await $.clock.now()
      await update($, messages, kept => (kept ?? []).map(message => (isDue(message) ? { ...message, status: 'heard' as const, settledAt: now } : message)))
      await sync($)
    }

    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined || !(await read($, isOn))) return next(e)

    const at = await $.clock.now()
    const label = labelOf(e.tool, e)
    const id = e.tool_use_id ?? `${e.tool} ${at}`
    await update($, flight, kept => [...(kept ?? []), { id, label, at }])
    try {
      const done = await next(e)
      if (done.deny === undefined) {
        const isPush = SHELLS.includes(e.tool) && typeof done.result === 'object' && done.result !== null && 'backgroundedToDeliverMessage' in done.result && done.result.backgroundedToDeliverMessage === true
        await count($, at, label, CHANGERS.includes(e.tool) && done.isReadOnly !== true, isPush)
      }

      return done
    } finally {
      await update($, flight, kept => (kept ?? []).filter(flying => flying.id !== id))
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isOn))) {
      const now = await $.clock.now()
      await update($, messages, kept => (kept ?? []).map(message => (message.status === 'waiting' ? { ...message, status: 'missed' as const, settledAt: now } : message)))
      await update($, flight, () => [])
      await sync($)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (await read($, isOn)) {
      const said = flat(e.text)
      const isRun = (message: EarshotMessage): boolean => message.status === 'missed' && message.text !== '' && said.includes(message.text)
      if ((await read($, messages)).some(isRun)) {
        const now = await $.clock.now()
        await update($, messages, kept => (kept ?? []).map(message => (isRun(message) ? { ...message, status: 'own' as const, settledAt: now } : message)))
        await sync($)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

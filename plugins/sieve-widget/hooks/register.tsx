import { atom, read, update } from 'claude-code'
import type {
  Elements,
  EngineInterface,
  PluginState,
  Register,
  RenderElement,
  RenderSurface,
  SessionCompactResult,
  SessionContextUsage,
  SessionMessage,
  ToolUseSummary,
} from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type State = PluginState['sieve-widget']
type Preview = NonNullable<State['preview']>
type Outcome = NonNullable<State['last']>
type Row = { text: string; isDim?: boolean; isWrapped?: boolean }
type Drawn = { note?: string; rows: Row[] }
type Weight = { talk: number; traffic: number }
type Weighing = { preview: Preview; sieved: Sieved }

export type Sieved = { messages: SessionMessage[]; kept: number; calls: number; lines: number }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_EDGE = 4
const LONG_COLUMNS = 36
const USAGE = 'Usage: /sieve-widget [on|off]'
const MARK = '[sieve-widget]'
const DETAIL_KEYS = ['file_path', 'path', 'command', 'pattern', 'url', 'query', 'description']
const DETAIL_LENGTH = 80
const DIGEST_ENTRIES = 40
const ENOUGH_OF_WINDOW = 0.5
const ENOUGH_OF_TOTAL = 0.75
const CHARS_PER_TOKEN = 4
const MESSAGES_ROW = 'Messages'
const SKIP_PRECOMPUTE = 'Sieve will handle the compaction.'
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'sieve-widget', key: 'isOn' } as const, false)
const face = atom({ plugin: 'sieve-widget', key: 'face' } as const, 'empty')
const preview = atom({ plugin: 'sieve-widget', key: 'preview' } as const, null)
const last = atom({ plugin: 'sieve-widget', key: 'last' } as const, null)

const isBlank = (text: string): boolean => text.trim() === ''

const isDigest = (message: SessionMessage): boolean => message.role === 'user' && message.text.startsWith(MARK)

const hasResults = (message: SessionMessage): boolean => (message.toolResults?.length ?? 0) > 0

const isTurnStart = (message: SessionMessage): boolean =>
  message.role === 'user' && !hasResults(message) && !isBlank(message.text) && !isDigest(message)

const hasCalls = (messages: readonly SessionMessage[]): boolean => messages.some(message => message.toolUses.length > 0)

export const size = (count: number): string => {
  const whole = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (whole < 1000) return String(whole)
  if (whole < 10_000) return `${(Math.floor(whole / 100) / 10).toFixed(1)}k`
  if (whole < 1_000_000) return `${Math.floor(whole / 1000)}k`
  if (whole < 10_000_000) return `${(Math.floor(whole / 100_000) / 10).toFixed(1)}M`

  return `${Math.min(999, Math.floor(whole / 1_000_000))}M`
}

const named = (count: number, word: string): string => plural(count, word).replace(/^\S+/, size(count))

const entry = (use: ToolUseSummary): string => {
  const detail = DETAIL_KEYS.map(key => use.input[key]).find(value => typeof value === 'string')
  const cut = typeof detail === 'string' ? detail.replace(/\s+/g, ' ').trim().slice(0, DETAIL_LENGTH).trim() : ''

  return `${use.tool}${cut === '' ? '' : ` ${cut}`}${use.isError === true ? ' (failed)' : ''}`
}

const digest = (uses: readonly ToolUseSummary[]): string => {
  const counts = new Map<string, number>()
  for (const use of uses) {
    const name = entry(use)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const entries = [...counts].map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
  const listed = entries.slice(0, DIGEST_ENTRIES)
  if (entries.length > DIGEST_ENTRIES) listed.push(`and ${entries.length - DIGEST_ENTRIES} more`)

  return `${MARK} ${plural(uses.length, 'tool call')} folded here by a widget, results dropped (not written by the user): ${listed.join('; ')}. Run a call again if you need its result.`
}

const isPaired = (tail: readonly SessionMessage[]): boolean => {
  const used = new Set(tail.flatMap(message => message.toolUses.map(use => use.tool_use_id)))

  return tail.every(message => (message.toolResults ?? []).every(result => used.has(result.tool_use_id)))
}

export const sieve = (messages: readonly SessionMessage[], tailTurns: number): Sieved => {
  const starts = messages.flatMap((message, at) => (isTurnStart(message) ? [at] : []))
  let nth = starts.length - tailTurns
  let cut = starts[nth] ?? 0
  while (cut > 0 && !isPaired(messages.slice(cut))) {
    nth -= 1
    cut = starts[nth] ?? 0
  }
  const head: SessionMessage[] = []
  let pending: ToolUseSummary[] = []
  let calls = 0
  let lines = 0

  const emit = (message: SessionMessage): void => {
    if (pending.length > 0) {
      head.push({ role: 'user', text: digest(pending), toolUses: [] })
      lines += 1
      pending = []
    }
    head.push(message)
  }

  for (const message of messages.slice(0, cut)) {
    if (message.role === 'assistant' && message.toolUses.length > 0) {
      if (!isBlank(message.text)) emit({ role: 'assistant', text: message.text, toolUses: [] })
      pending.push(...message.toolUses)
      calls += message.toolUses.length
    } else if (message.role === 'user' && hasResults(message)) {
      if (!isBlank(message.text)) emit({ role: 'user', text: message.text, toolUses: [] })
    } else {
      emit(message)
    }
  }
  if (pending.length > 0) {
    head.push({ role: 'user', text: digest(pending), toolUses: [] })
    lines += 1
  }

  return {
    messages: [...head, ...messages.slice(cut)],
    kept: messages.filter(message => !isBlank(message.text) && !isDigest(message)).length,
    calls,
    lines,
  }
}

const weigh = (messages: readonly SessionMessage[]): Weight => {
  let talk = 0
  let traffic = 0
  for (const message of messages) {
    talk += message.text.length
    for (const use of message.toolUses) traffic += JSON.stringify(use.input).length + (use.text?.length ?? 0)
  }

  return { talk, traffic }
}

const measure = (messages: readonly SessionMessage[], context: SessionContextUsage): Weighing => {
  const whole = weigh(messages)
  const chars = whole.talk + whole.traffic
  const total = Math.max(0, context.tokens ?? context.breakdown?.totalTokens ?? chars / CHARS_PER_TOKEN)
  const row = context.breakdown?.categories.find(category => category.kind === 'used' && category.name === MESSAGES_ROW)
  const conv = Math.min(total, Math.max(0, row?.tokens ?? total))
  const rest = total - conv
  const scale = chars === 0 ? 0 : conv / chars

  const attempt = (tailTurns: number): Weighing => {
    const sieved = sieve(messages, tailTurns)
    const after = weigh(sieved.messages)
    const left = rest + (after.talk + after.traffic) * scale

    return {
      sieved,
      preview: {
        total,
        talk: whole.talk * scale,
        traffic: whole.traffic * scale,
        left,
        isEnough: sieved.calls > 0 && left <= ENOUGH_OF_WINDOW * context.window && left <= ENOUGH_OF_TOTAL * total,
      },
    }
  }
  const wide = attempt(2)

  return wide.preview.isEnough ? wide : attempt(1)
}

const bar = ({ total, talk, traffic }: Preview, columns: number): string => {
  const parts = [talk, traffic, Math.round(Math.max(0, total - talk - traffic))]
  const sum = parts.reduce((held, part) => held + part, 0)
  if (sum <= 0) return '░'.repeat(columns)

  const cells = parts.map(part => (part > 0 ? Math.max(1, Math.floor((part / sum) * columns)) : 0))
  const widest = cells.indexOf(Math.max(...cells))
  const spare = columns - cells.reduce((held, cell) => held + cell, 0)

  return ['█', '▒', '░'].map((glyph, at) => glyph.repeat((cells[at] ?? 0) + (at === widest ? spare : 0))).join('')
}

const draw = (shown: State['face'], weighed: State['preview'], outcome: State['last'], columns: number): Drawn => {
  const say = (long: string, short: string): Row => ({ text: columns >= LONG_COLUMNS ? long : short })
  const dim = (long: string, short: string): Row => ({ ...say(long, short), isDim: true })

  if (shown === 'unread') {
    return {
      note: 'no reading',
      rows: [say('Could not read the conversation', 'could not read'), say('The next turn tries again', 'tries next turn')],
    }
  }
  if (shown === 'outcome' && outcome?.kind === 'sieved') {
    return {
      note: 'sieved',
      rows: [
        say(`About ${size(outcome.before)} to about ${size(outcome.after)}`, `${size(outcome.before)} to ${size(outcome.after)}`),
        say(`Every word of ${named(outcome.kept, 'message')} kept`, `${named(outcome.kept, 'text')} kept`),
        say(`${named(outcome.calls, 'tool call')} folded to ${named(outcome.lines, 'line')}`, `${size(outcome.calls)} folded`),
        say('No summary written, no tokens spent', 'no tokens spent'),
      ],
    }
  }
  if (shown === 'outcome' && outcome?.kind === 'short') {
    return {
      note: 'passed on',
      rows: [
        say(`A sieve would leave about ${size(outcome.after)}`, `${size(outcome.after)}: not enough`),
        say('Not enough: the usual summary ran', 'summary ran'),
      ],
    }
  }
  if (shown === 'outcome' && outcome?.kind === 'asked') {
    return {
      note: 'passed on',
      rows: [say('Compaction came with instructions', 'had instructions'), say('The usual summary ran with them', 'summary ran')],
    }
  }
  if (shown === 'outcome' && outcome?.kind === 'failed') {
    return {
      note: 'failed',
      rows: [say('Could not sieve this conversation', 'could not sieve'), say('The usual summary ran', 'summary ran')],
    }
  }
  if (shown === 'working' && weighed !== null) {
    return {
      note: `about ${size(weighed.total)}`,
      rows: [
        { text: bar(weighed, columns) },
        say(`about ${size(weighed.talk)} conversation`, `${size(weighed.talk)} talk`),
        say(`about ${size(weighed.traffic)} tool traffic`, `${size(weighed.traffic)} tools`),
        say(`A sieve leaves about ${size(weighed.left)}`, `leaves ${size(weighed.left)}`),
        ...(weighed.isEnough ? [] : [dim('Too much: a summary would run', 'too much left')]),
        ...(outcome?.kind === 'sieved'
          ? [
              dim(
                `Last sieve: about ${size(outcome.before)} to ${size(outcome.after)}`,
                `last ${size(outcome.before)} → ${size(outcome.after)}`,
              ),
            ]
          : []),
      ],
    }
  }

  return {
    rows: [
      { text: 'Nothing to sieve yet.', isWrapped: true },
      { text: 'After a turn with tool calls: what a compaction would keep and drop.', isDim: true, isWrapped: true },
    ],
  }
}

const settle = async ($: EngineInterface, shown: State['face'], weighed: State['preview']): Promise<void> => {
  await update($, preview, () => weighed)
  await update($, face, () => shown)
}

const record = async ($: EngineInterface, outcome: Outcome): Promise<void> => {
  await update($, last, () => outcome)
  await update($, face, () => 'outcome')
}

const look = async ($: EngineInterface): Promise<void> => {
  try {
    const messages = await $.session.messages()
    if (!hasCalls(messages)) return await settle($, 'empty', null)

    await settle($, 'working', measure(messages, (await $.session.usage({ breakdown: 'summary' })).context).preview)
  } catch {
    await settle($, 'unread', null)
  }
}

const passOn = async (
  $: EngineInterface,
  isRecorded: boolean,
  passing: Promise<SessionCompactResult>,
  outcome: Outcome,
  toast?: string,
): Promise<SessionCompactResult> => {
  const passed = await passing
  if (!isRecorded || passed.messages === undefined) return passed

  await record($, outcome)
  if (toast !== undefined) $.ui.toast(toast)

  return passed
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

  const width = fit((await $.state.get(widths)).value?.['sieve-widget'] ?? CARD_COLUMNS, columns)
  const { note, rows } = draw(await read($, face), await read($, preview), await read($, last), width - CARD_EDGE)

  return $.widgets.card({
    beneath,
    width,
    title: 'Sieve',
    note,
    body: (
      <Box flexDirection="column">
        {rows.map(row => (
          <Text dimColor={row.isDim === true} wrap={row.isWrapped === true ? 'wrap' : 'truncate-end'}>
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
      name: 'sieve-widget',
      description: 'Toggle the Sieve card',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) {
      await update($, isOn, () => true)
      await look($)
    }

    return next(e)
  })

  on('command.run', { command: 'sieve-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) {
      await look($)
    } else {
      await update($, last, () => null)
      await settle($, 'empty', null)
    }

    return { text: isShown ? 'Sieve on; /widgets places it.' : 'Sieve off.' }
  })

  on('session.measure', async ($, e, next) => {
    const { tokens } = e.context
    if (!(await read($, isOn)) || !e.changed.includes('context') || tokens === undefined) return next(e)

    await update($, last, held => (held?.kind === 'sieved' && !held.isMeasured ? { ...held, after: tokens, isMeasured: true } : (held ?? null)))
    await look($)

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (!(await read($, isOn)) || e.agentId !== undefined) return next(e)

    const isRecorded = e.trigger !== 'precompute'
    const zeros = { before: 0, after: 0, isMeasured: false, kept: 0, calls: 0, lines: 0 }
    if (!isBlank(e.instructions ?? '')) return passOn($, isRecorded, next(e), { kind: 'asked', ...zeros })

    let weighed: Weighing
    try {
      weighed = measure(e.messages, (await $.session.usage({ breakdown: 'summary' })).context)
    } catch {
      return passOn($, isRecorded, next(e), { kind: 'failed', ...zeros })
    }

    const { total, left, isEnough } = weighed.preview
    if (!isEnough) {
      return passOn(
        $,
        isRecorded,
        next(e),
        { kind: 'short', ...zeros, before: total, after: left },
        `Sieve would not free enough (about ${size(left)} left): the usual summary ran.`,
      )
    }
    if (!isRecorded) return { skip: SKIP_PRECOMPUTE }

    const { messages, kept, calls, lines } = weighed.sieved
    await record($, { kind: 'sieved', before: total, after: left, isMeasured: false, kept, calls, lines })
    $.ui.toast(`Sieve: about ${size(total)} to about ${size(left)}, every word kept, no summary.`)

    return { messages }
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

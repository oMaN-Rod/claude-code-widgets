import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Log = PluginState['witness-widget']['log']
type Row = { text: string; isDim?: boolean; isWrapped?: boolean }
type Drawn = { note?: string; rows: Row[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_EDGE = 4
const LONG_COLUMNS = 36
const USAGE = 'Usage: /witness-widget [on|off|show|clear]'
const OFF = 'Witness is off.'
const PEOPLE: readonly string[] = ['composer', 'bridge', 'sdk']
const CHARS_PER_TOKEN = 4
const HELD_CHARS = 2000
const KEPT_ENTRIES = 20
const SHOWN_ROWS = 3
const BLANK: Log = { prompts: 0, additions: 0, chars: 0, last: 'none', lastCount: 0, lastChars: 0, entries: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'witness-widget', key: 'isOn' } as const, false)
const log = atom({ plugin: 'witness-widget', key: 'log' } as const, BLANK)

const grouped = (count: number): string => String(count).replace(/\B(?=(\d{3})+$)/g, ',')

export const tok = (count: number): string => (count < 10_000 ? grouped(count) : `${grouped(Math.floor(count / 1000))}k`)

const counted = (count: number, word: string): string => plural(count, word).replace(/^\S+/, grouped(count))

const weight = (chars: number): number => Math.ceil(chars / CHARS_PER_TOKEN)

const tokens = (chars: number): string => plural(weight(chars), 'token').replace(/^\S+/, tok(weight(chars)))

const record = (held: Log, entered: readonly unknown[] | undefined): Log => {
  if (entered === undefined) return { ...held, last: 'dropped' }

  const added = entered.filter((block): block is string => typeof block === 'string' && block.trim() !== '')
  const prompts = held.prompts + 1
  const lastChars = added.reduce((sum, block) => sum + block.length, 0)

  return {
    prompts,
    additions: held.additions + added.length,
    chars: held.chars + lastChars,
    last: added.length > 0 ? 'added' : 'none',
    lastCount: added.length,
    lastChars,
    entries: [...held.entries, ...added.map(block => ({ prompt: prompts, text: block.slice(0, HELD_CHARS), chars: block.length }))].slice(-KEPT_ENTRIES),
  }
}

const draw = (held: Log, inner: number): Drawn => {
  const isLong = inner >= LONG_COLUMNS
  const totals: Row[] =
    held.additions > 0
      ? [
          { text: isLong ? `${counted(held.additions, 'addition')} over ${counted(held.prompts, 'prompt')}` : `${grouped(held.additions)} added` },
          { text: isLong ? `about ${tokens(held.chars)} in all` : `all ~${tok(weight(held.chars))} tok` },
        ]
      : []

  if (held.last === 'dropped') {
    return {
      note: 'dropped',
      rows: [{ text: isLong ? 'Last prompt was dropped' : 'prompt dropped' }, { text: isLong ? 'Nothing reached Claude' : 'nothing sent' }, ...totals],
    }
  }
  if (held.additions === 0) {
    return {
      rows: [
        { text: 'Nothing hidden yet.', isWrapped: true },
        { text: 'When a widget adds context to a prompt, its words show here.', isDim: true, isWrapped: true },
      ],
    }
  }
  if (held.last === 'none') return { note: 'quiet', rows: [{ text: isLong ? 'Last prompt: nothing added' : 'nothing added' }, ...totals] }

  const more = held.lastCount - SHOWN_ROWS

  return {
    note: `+${grouped(held.lastCount)}`,
    rows: [
      ...held.entries
        .filter(entry => entry.prompt === held.prompts)
        .slice(0, SHOWN_ROWS)
        .map(entry => ({ text: entry.text.replace(/\s+/g, ' ').trim() })),
      ...(more > 0 ? [{ text: isLong ? `and ${grouped(more)} more` : `+${grouped(more)} more`, isDim: true }] : []),
      { text: isLong ? `Last prompt: about ${tokens(held.lastChars)}` : `now ~${tok(weight(held.lastChars))} tok` },
      ...totals,
      { text: isLong ? '/witness-widget show: all in full' : 'show: in full', isDim: true },
    ],
  }
}

const told = (held: Log): string => {
  if (held.additions === 0) return 'No hidden context has entered with a prompt since Witness was switched on.'

  return [
    `${counted(held.additions, 'addition')} over ${counted(held.prompts, 'prompt')}, about ${tokens(held.chars)} in all (${CHARS_PER_TOKEN} characters a token).`,
    ...held.entries.flatMap(entry => [
      '',
      `[prompt ${grouped(entry.prompt)}] about ${tokens(entry.chars)}`,
      entry.text,
      ...(entry.chars > HELD_CHARS ? [`[cut: the first ${grouped(HELD_CHARS)} of ${grouped(entry.chars)} characters]`] : []),
    ]),
    ...(held.additions > held.entries.length ? ['', `Only the last ${KEPT_ENTRIES} are kept.`] : []),
  ].join('\n')
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

  const width = fit((await $.state.get(widths)).value?.['witness-widget'] ?? CARD_COLUMNS, columns)
  const { note, rows } = draw(await read($, log), width - CARD_EDGE)

  return $.widgets.card({
    beneath,
    width,
    title: 'Witness',
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
      name: 'witness-widget',
      description: 'Toggle the Witness card, or show what was added to your prompts',
      argumentHint: '[on|off|show|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'witness-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'show' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }
      if (arg === 'show') return { text: told(await read($, log)) }
      await update($, log, () => BLANK)

      return { text: 'Witness cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, log, () => BLANK)

    return { text: isShown ? 'Witness on; /widgets places it.' : 'Witness off.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, isOn)) || !PEOPLE.includes(e.origin?.kind ?? 'composer')) return next(e)

    const entered = await next(e)
    if (await read($, isOn)) await update($, log, held => record(held, entered.drop === undefined ? (entered.context ?? e.context ?? []) : undefined))

    return entered
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

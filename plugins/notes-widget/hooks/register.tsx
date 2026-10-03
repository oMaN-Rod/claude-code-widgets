import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_NOTES = 12
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'notes-widget', key: 'isOn' } as const, false)
const notes = atom({ plugin: 'notes-widget', key: 'notes' } as const, [])

const isNotes = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(note => typeof note === 'string')

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['notes-widget'] ?? CARD_COLUMNS
  const pinned = await read($, notes)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Notes',
    note: pinned.length === 0 ? '' : `${pinned.length} pinned`,
    body: (
      <Box flexDirection="column">
        {pinned.length === 0 && <Text dimColor>Nothing pinned. Add one with /note.</Text>}
        {pinned.map((note, index) => (
          <Box columnGap={1}>
            <Text dimColor>{index + 1}.</Text>
            <Box flexGrow={1}>
              <Text wrap="wrap">{note}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'notes-widget',
      description: 'Toggle the pinned notes card',
      argumentHint: '[on|off|clear]',
    })
    await $.command.register({
      name: 'note',
      description: 'Pin a note to the notes card, or remove one by its number',
      argumentHint: '<text|done <n>>',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('notes')
    if (isNotes(kept)) await update($, notes, () => kept)

    return next(e)
  })

  on('command.run', { command: 'notes-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, notes, () => [])
      await $.store.set('notes', [])

      return { text: 'Notes cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /notes-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Notes widget on; /widgets places it.' : 'Notes widget off.' }
  })

  on('command.run', { command: 'note' }, async ($, e) => {
    const text = e.args.trim()
    const done = /^done\s+(\d+)$/i.exec(text)
    const pinned = await read($, notes)

    if (text === '') return { text: 'Usage: /note <text|done <n>>' }
    if (done !== null) {
      const at = Number(done[1]) - 1
      if (pinned[at] === undefined) return { text: `There is no note ${at + 1}.` }

      const kept = await update($, notes, held => (held ?? []).filter((_, index) => index !== at))
      await $.store.set('notes', kept)

      return { text: `Note ${at + 1} removed.` }
    }
    if (pinned.length >= MAX_NOTES) return { text: `The card holds ${MAX_NOTES} notes; remove one first.` }

    const kept = await update($, notes, held => [...(held ?? []), text])
    await $.store.set('notes', kept)
    await update($, isOn, () => true)
    await $.store.set('isOn', true)

    return { text: `Pinned as note ${kept.length}.` }
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

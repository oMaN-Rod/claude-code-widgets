import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { BoardNotes } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Pin = { goal?: unknown; findings?: unknown; questions?: unknown; clear?: unknown }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TOOL = /^mcp__board-widget__pin$/
const MAX_ITEMS = 6
const MAX_LENGTH = 160
const BLANK: BoardNotes = { goal: '', findings: [], questions: [] }
const SCHEMA = {
  type: 'object',
  properties: {
    goal: { type: 'string', description: 'What you are working towards right now, in one line.' },
    findings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Key facts established so far. Replaces the list.',
    },
    questions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Open questions for the user. Replaces the list.',
    },
    clear: { type: 'boolean', description: 'Wipe the board before applying the other fields.' },
  },
}
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'board-widget', key: 'isOn' } as const, false)
const notes = atom({ plugin: 'board-widget', key: 'notes' } as const, BLANK)

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const lineOf = (value: unknown): string => String(value).replaceAll(/\s+/g, ' ').trim().slice(0, MAX_LENGTH)

const listOf = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.map(lineOf).filter(line => line !== '').slice(0, MAX_ITEMS)
    : undefined

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['board-widget'] ?? CARD_COLUMNS
  const held = await read($, notes)
  const isBlank = held.goal === '' && held.findings.length === 0 && held.questions.length === 0

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Board',
    note: isBlank ? '' : 'kept by Claude',
    body: (
      <Box flexDirection="column">
        {isBlank && (
          <Text dimColor wrap="wrap">
            Empty. Claude pins its goal, findings and open questions here.
          </Text>
        )}
        {held.goal !== '' && (
          <Text bold wrap="wrap">
            {held.goal}
          </Text>
        )}
        {held.findings.map(finding => (
          <Text wrap="wrap">
            <Text color="green">✓</Text> {finding}
          </Text>
        ))}
        {held.questions.map(question => (
          <Text wrap="wrap">
            <Text color="yellow">?</Text> {question}
          </Text>
        ))}
      </Box>
    ),
  })
}

const declare = async ($: EngineInterface): Promise<void> => {
  await $.tool.register({
    name: 'pin',
    description:
      'Update the status board the user keeps on screen. Pin your current goal, the key findings so far and any open questions for the user. Call it when the goal changes or something worth keeping in view is established.',
    inputSchema: SCHEMA,
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'board-widget',
      description: 'Toggle the status board that Claude keeps up to date',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) {
      await update($, isOn, () => true)
      await declare($)
    }

    return next(e)
  })

  on('command.run', { command: 'board-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, notes, () => BLANK)

      return { text: 'Board cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /board-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await declare($)

    return {
      text: isShown
        ? 'Board on; Claude can pin to it from the next prompt. /widgets places it.'
        : 'Board off. The pin tool stays registered until the session ends.',
    }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const pin = e as Pin
    const kept = await update($, notes, held => {
      const before = pin.clear === true ? BLANK : (held ?? BLANK)

      return {
        goal: pin.goal === undefined ? before.goal : lineOf(pin.goal),
        findings: listOf(pin.findings) ?? before.findings,
        questions: listOf(pin.questions) ?? before.questions,
      }
    })
    const text = `Board updated: ${kept.goal === '' ? 'no goal' : 'goal set'}, ${some(kept.findings.length, 'finding')}, ${some(kept.questions.length, 'question')}.`

    return { result: text, text }
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

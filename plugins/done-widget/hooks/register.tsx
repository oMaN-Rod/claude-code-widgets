import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Item = { text: string; evidence: string }
type List = { items: Item[]; isDue: boolean; nudges: number }
type Tick = { item?: unknown; evidence?: unknown }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LONG_COLUMNS = 36
const MAX_ITEMS = 6
const MAX_TEXT = 80
const MAX_EVIDENCE = 120
const MAX_ECHO = 20
const USAGE = 'Usage: /done-widget [on|off|add <criterion>|drop <number>|show|clear]'
const OFF = 'Done is off.'
const OPENING =
  "done-widget: the user's definition of done for this task. Tick each item with the tick tool as you meet it, giving the evidence that proves it, and do not call the work finished while any is open:"
const EMPTY = ['No definition of done yet.', '/done-widget add the tests pass', 'Claude ticks each with its evidence.'] as const
const NAMED = /\b(done list|definition of done|done-widget)\b/g
const NUMBERED = /\bitems?\s+#?\d+((\s*,\s*|\s*&\s*|\s+and\s+|\s+or\s+)#?\d+)*/g
const ALL_BUT = /\b(?:everything|all)\s+but\b/g
const SENTENCE = /(?<=[.!?\n])/
const CLAUSE = /[.,;:!?\n]|\s[-–—]\s|\b(?:but|and|though|although|however|while|so(?!\s+far\b))\b/
const ASKED = /\?[^\p{L}\p{N}]*$/u
const FAILURES = /\b(?!0+\b)\d+\s+(?:fail\w*|errors?)\b/g
const REPORTED = '\u0000'
const WHOLE = String.raw`(?:finished|completed|done\s+with|finished\s+with)(?:\s+(?:implementing|building|writing))?\s+(?:everything|it\s+all|all\s+of\s+it|all\s+(?:of\s+)?the\s+work|(?:the|this|that)\s+(?:whole\s+|entire\s+)?(?:work|task|job|refactor|refactoring|implementation|migration|rewrite|changes?|fix|feature|update))`
const CLOSED = String.raw`(?:\s+(?:now|here|too|already|as\s+well|for\s+you|as\s+requested|as\s+asked|as\s+planned|successfully|correctly|properly|fully|entirely))*[^\p{L}\p{N}]*$`
const CLAIM = new RegExp(String.raw`\b(?:done|finished|complete|completed|fixed|resolved|all\s+set|${WHOLE})${CLOSED}`, 'u')
const RAN = new RegExp(
  String.raw`(?:\b(?:tests?|test\s+runs?|suites?|builds?|runs?|commands?|installs?|downloads?|compiles?|scripts?)(?:['’]s|(?:\s+(?:is|are|was|were|has|have|had|been|just|now|also|all))*)\s+|\x60\s*|\b(?:bun|npm|npx|pnpm|yarn|node|deno|tsc|eslint|prettier|vitest|jest|pytest|cargo|go|make|git|docker|pip)\s+)(?:done|finished|complete|completed)${CLOSED}`,
  'u',
)
const HEDGED =
  /\b(?:not|never|no|nothing|none|nor|cannot|without|except|far\s+from|nowhere\s+near|yet\s+to|so\s+far|almost|nearly|mostly|mainly|largely|partly|partially|half|still|remaining|remains?|open|once|until|when|if|before|after|will|to\s+be|needs?|needed)\b|n['’]t\b/
const ONE_ITEM = /\bitems?\b/
const EVERY_ITEM = /\b(?:all|every|each)\s+(?:of\s+)?(?:the\s+)?(?:(?:\d+|two|three|four|five|six)\s+)?items?\b/
const BLANK: List = { items: [], isDue: false, nudges: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'done-widget', key: 'isOn' } as const, false)
const list = atom({ plugin: 'done-widget', key: 'list' } as const, BLANK)

const clean = (typed: string, most: number): string => typed.replaceAll(/\s+/g, ' ').trim().slice(0, most)

const listed = (items: readonly Item[]): string =>
  items.map(({ text, evidence }, at) => (evidence === '' ? `${at + 1}. [ ] ${text}` : `${at + 1}. [x] ${text} (${evidence})`)).join('\n')

const wrapped = (sentence: string, columns: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const last = rows.at(-1)

    return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
  }, [])

const unmet = (items: readonly Item[]): number[] => items.flatMap(({ evidence }, at) => (evidence === '' ? [at + 1] : []))

const reported = (sentence: string): string => {
  const at = [...sentence.matchAll(FAILURES)].at(-1)?.index

  return at === undefined ? sentence : `${sentence.slice(0, at).replaceAll(':', `${REPORTED}:`)}${sentence.slice(at)}`
}

const claims = (answer: string, items: readonly Item[]): boolean =>
  items
    .reduce((said, { text }) => said.replaceAll(text.toLowerCase(), ' '), answer.toLowerCase())
    .replaceAll(NAMED, ' ')
    .replaceAll(NUMBERED, 'item')
    .replaceAll(ALL_BUT, 'except')
    .split(SENTENCE)
    .filter(sentence => !ASKED.test(sentence))
    .flatMap(sentence => reported(sentence).split(CLAUSE))
    .some(
      clause =>
        !clause.endsWith(REPORTED) &&
        CLAIM.test(clause) &&
        !HEDGED.test(clause) &&
        (!ONE_ITEM.test(clause) || EVERY_ITEM.test(clause)) &&
        !RAN.test(clause),
    )

const answer = (said: string, isError = false) => (isError ? { result: said, text: said, isError } : { result: said, text: said })

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['done-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const isLong = inner >= LONG_COLUMNS
  const { items, nudges } = await read($, list)
  const met = items.length - unmet(items).length

  return $.widgets.card({
    beneath,
    width,
    title: 'Done',
    note: items.length === 0 ? '' : met === items.length ? 'all met' : `${met}/${items.length} met`,
    body:
      items.length === 0 ? (
        <Box flexDirection="column">
          {EMPTY.flatMap(sentence => wrapped(sentence, inner)).map(row => (
            <Text dimColor>{row}</Text>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column">
          {items.flatMap(({ text, evidence }, at) => [
            <Text key={`item-${at + 1}`} wrap="truncate-end">
              {evidence === '' ? <Text color="yellow">·</Text> : <Text color="green">✓</Text>} {at + 1} {text}
            </Text>,
            ...(evidence === ''
              ? []
              : [
                  <Text key={`evidence-${at + 1}`} dimColor wrap="truncate-end">
                    {`    ${evidence}`}
                  </Text>,
                ]),
          ])}
          {nudges > 0 && (
            <Text key="nudges" color="yellow" wrap="truncate-end">
              {isLong ? `Said done too soon: ${plural(nudges, 'nudge')}` : plural(nudges, 'nudge')}
            </Text>
          )}
        </Box>
      ),
  })
}

const offer = async ($: EngineInterface): Promise<void> => {
  await $.tool.register({
    name: 'tick',
    description:
      "Tick one item on the user's definition of done, with evidence. The user keeps a checklist of what finished means for this task; you are told it with a prompt. When you have met an item and verified it, call this with its number and what proves it: the command you ran and its result, or the file and line. Tick only what you have verified. Do not tell the user the work is finished while items are open: say which are open and why.",
    inputSchema: {
      type: 'object',
      properties: {
        item: { type: 'number', description: 'The number of the item on the checklist.' },
        evidence: { type: 'string', description: 'What proves it: the command you ran and its result, or the file and line.' },
      },
      required: ['item', 'evidence'],
    },
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'done-widget',
      description: 'Toggle the definition of done that Claude ticks with evidence',
      argumentHint: '[on|off|add <criterion>|drop <number>|show|clear]',
    })
    if ((await $.store.get('isOn')) === true) {
      await update($, isOn, () => true)
      await offer($)
    }

    return next(e)
  })

  on('command.run', { command: 'done-widget' }, async ($, e) => {
    const typed = e.args.trim()
    const [verb = ''] = typed.split(/\s+/)
    const arg = verb.toLowerCase()
    const rest = typed.slice(verb.length).trim()

    if (arg === 'add' || arg === 'drop' || ((arg === 'show' || arg === 'clear') && rest === '')) {
      if (!(await read($, isOn))) return { text: OFF }

      const held = await read($, list)
      const { items } = held
      if (arg === 'show') {
        if (items.length === 0) return { text: 'The definition of done is empty. /done-widget add <criterion> adds an item.' }

        return {
          text: [
            `${plural(items.length, 'item')}, ${items.length - unmet(items).length} met:`,
            listed(items),
            ...(held.nudges > 0 ? [`Said done too soon: ${plural(held.nudges, 'nudge')}`] : []),
          ].join('\n'),
        }
      }
      if (arg === 'clear') {
        await update($, list, () => BLANK)

        return { text: 'Done list cleared.' }
      }
      if (arg === 'add') {
        const text = clean(rest, MAX_TEXT)
        if (text === '') return { text: 'Add what? Try /done-widget add the tests pass' }

        const same = items.findIndex(item => item.text.toLowerCase() === text.toLowerCase())
        if (same >= 0) return { text: `Already on the list as item ${same + 1}.` }
        if (items.length >= MAX_ITEMS) {
          return { text: `The list is full (${plural(MAX_ITEMS, 'item')}). /done-widget drop <number> makes room.` }
        }
        await update($, list, () => ({ ...held, items: [...items, { text, evidence: '' }], isDue: true }))

        return { text: `Item ${items.length + 1}: done when ${text}. Claude is told with your next prompt.` }
      }

      const at = /^\d+$/.test(rest) ? Number(rest) : 0
      const dropped = items[at - 1]
      if (dropped === undefined) return { text: `There is no item "${rest.slice(0, MAX_ECHO)}". /done-widget show lists them.` }
      await update($, list, () => ({ ...held, items: items.filter((_, index) => index !== at - 1), isDue: true }))

      return { text: `Dropped item ${at}: ${dropped.text}` }
    }
    if (rest !== '' || (arg !== '' && arg !== 'on' && arg !== 'off')) return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) {
      await update($, list, held => ({ ...(held ?? BLANK), isDue: true }))
      await offer($)
    }

    return {
      text: isShown
        ? 'Done on; /done-widget add <criterion> writes the list. /widgets places it.'
        : 'Done off. The tick tool stays listed until the session ends and ticks nothing.',
    }
  })

  on('tool.call', { tool: 'mcp__done-widget__tick' }, async ($, e) => {
    if (!(await read($, isOn))) return answer('Done is off; nothing was ticked.', true)

    const held = await read($, list)
    const { items } = held
    if (items.length === 0) return answer('The definition of done is empty; there is nothing to tick.', true)

    const tick = e as Tick
    const at = tick.item
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 1 || at > items.length) {
      return answer(`There is no item ${at === undefined ? '(none given)' : String(at).slice(0, MAX_ECHO)}. The list:\n${listed(items)}`, true)
    }

    const evidence = clean(String(tick.evidence ?? ''), MAX_EVIDENCE)
    if (evidence === '') return answer(`Item ${at} needs evidence: the command you ran and its result, or the file and line.`, true)

    const ticked = items.map((item, index) => (index + 1 === at ? { ...item, evidence } : item))
    await update($, list, () => ({ ...held, items: ticked }))
    const open = unmet(ticked)

    return answer(`${listed(ticked)}\n${open.length === 0 ? 'Every item is met.' : `Still open: ${open.join(', ')}.`}`)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge' && e.origin.kind !== 'sdk') return next(e)

    const held = await read($, list)
    if (!held.isDue || held.items.length === 0) return next(e)

    await update($, list, now => ({ ...(now ?? held), isDue: false }))

    return next({ ...e, context: [...(e.context ?? []), `${OPENING}\n${listed(held.items)}`] })
  })

  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    if (!(await read($, isOn)) || e.agentId !== undefined || e.isAborted || e.reason !== 'answer') return ended

    const { items } = await read($, list)
    const open = unmet(items)
    if (open.length === 0 || !claims(e.answer, items)) return ended

    await update($, list, held => ({ ...(held ?? BLANK), nudges: (held?.nudges ?? 0) + 1 }))
    try {
      await $.prompt.suggest({
        text:
          open.length === 1
            ? `Item ${open[0]} on the done list is still open. Meet it and tick it with evidence, or say why not.`
            : `Items ${open.join(', ')} on the done list are still open. Meet them and tick them with evidence, or say why not.`,
      })
    } catch {
      return ended
    }

    return ended
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if ((await read($, isOn)) && e.agentId === undefined && e.trigger !== 'precompute' && result.skip === undefined) {
      await update($, list, held => ({ ...(held ?? BLANK), isDue: true }))
    }

    return result
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

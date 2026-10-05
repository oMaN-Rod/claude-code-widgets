import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, ModelForkResult, PluginState, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Talk = PluginState['aside-widget']['talk']
type Reason = Exclude<ModelForkResult, { isAnswered: true }>['reason']

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LONG_COLUMNS = 36
const ANSWER_ROWS = 8
const QUESTION_LETTERS = 300
const ANSWER_LETTERS = 600
const USAGE = 'Usage: /aside-widget [on|off|ask <question>|clear]'
const OFF = 'Aside is off.'
const BUSY = 'Still answering the last one; /aside-widget clear drops it.'
const DROPPED = 'Aside dropped the answer.'
const ANSWERED = 'Answered on the Aside card.'
const EMPTY = 'No side question yet. /aside-widget ask <question> asks about this conversation without adding a turn to it.'
const READING = 'Reading the conversation…'
const BRIEF =
  'This is a side question from the user about the conversation so far. Answer it in plain text, in under 280 characters. Use no tools and do not carry on with the task.'
const SORRY: Record<Reason, string> = {
  'nothing-to-fork': 'Nothing to ask about yet. Finish one turn first.',
  'api-error': 'The model could not be reached. Try again.',
  'empty-reply': 'The model gave no answer.',
  aborted: 'The question was cut short.',
}
const LETTER = /[\u{1f1e6}-\u{1f1ff}]{2}|\P{M}(?:\p{M}|‍\P{M}|[\u{1f3fb}-\u{1f3ff}])*|\p{M}+/gu
const UNSEEN = /^[\p{M}\p{Cf}]/u
const WIDE =
  /^(?:[ᄀ-ᅟ⺀-〾ぁ-꓏ꥠ-꥿가-힣豈-﫿︰-﹯！-｠￠-￦\u{1b000}-\u{1b2ff}\u{20000}-\u{3fffd}]|\p{Emoji_Presentation})|️/u
const IDLE: Talk ={ status: 'idle', question: '', answer: '', turns: 0, ticket: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'aside-widget', key: 'isOn' } as const, false)
const talk = atom({ plugin: 'aside-widget', key: 'talk' } as const, IDLE)

const tidy = (text: string, letters: number): string => text.replace(/\s+/g, ' ').trim().slice(0, letters)

const letters = (text: string): string[] => text.match(LETTER) ?? []

// Terminal cells, not code units: wide scripts and emoji take two, joiners and combining marks none.
const cells = (text: string): number =>
  letters(text).reduce((sum, letter) => sum + (UNSEEN.test(letter) ? 0 : WIDE.test(letter) ? 2 : 1), 0)

const pieces = (text: string, columns: number): string[] =>
  letters(text).reduce<string[]>((rows, letter) => {
    const last = rows.at(-1)

    return last !== undefined && cells(last) + cells(letter) <= columns ? [...rows.slice(0, -1), last + letter] : [...rows, letter]
  }, [])

const wrapped = (sentence: string, columns: number): string[] =>
  sentence
    .split(' ')
    .flatMap(word => pieces(word, columns))
    .reduce<string[]>((rows, word) => {
      const last = rows.at(-1)

      return last !== undefined && cells(last) + 1 + cells(word) <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
    }, [])

const noteOf = ({ status, turns }: Talk, isLong: boolean): string => {
  if (status === 'idle') return ''
  if (status === 'asking') return 'asking'
  if (status === 'failed') return 'no answer'
  if (turns === 0) return ''

  return isLong ? `${plural(turns, 'turn')} ago` : `${turns} ago`
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

  const width = fit((await $.state.get(widths)).value?.['aside-widget'] ?? CARD_COLUMNS, columns)
  const held = await read($, talk)
  const inner = width - 4
  const room = inner * ANSWER_ROWS
  const said =
    held.status === 'idle'
      ? EMPTY
      : held.status === 'asking'
        ? READING
        : held.status === 'answered' && cells(held.answer) > room
          ? `${pieces(held.answer, room - 1)[0]}…`
          : held.answer

  return $.widgets.card({
    beneath,
    width,
    title: 'Aside',
    note: noteOf(held, inner >= LONG_COLUMNS),
    body: (
      <Box flexDirection="column">
        {held.status !== 'idle' && (
          <Box key="question">
            <Text bold wrap="truncate-end">
              {held.question}
            </Text>
          </Box>
        )}
        <Box key={held.status === 'idle' ? 'empty' : 'answer'} flexDirection="column">
          {wrapped(said, inner).map((line, at) => (
            <Text
              key={at}
              dimColor={held.status === 'idle' || held.status === 'asking'}
              wrap="truncate-end"
              {...(held.status === 'failed' ? { color: 'red' as const } : {})}
            >
              {line}
            </Text>
          ))}
        </Box>
      </Box>
    ),
  })
}

const rest = async ($: EngineInterface): Promise<void> => {
  await update($, talk, (held = IDLE) => ({ ...IDLE, ticket: held.ticket }))
}

const ask = async ($: EngineInterface, question: string): Promise<string> => {
  const before = await read($, talk)
  if (before.status === 'asking') return BUSY

  const ticket = before.ticket + 1
  await update($, talk, () => ({ status: 'asking', question, answer: '', turns: 0, ticket }))
  const reply = await $.model.fork({ prompt: `${BRIEF}\n\n${question}` }).catch(() => ({ isAnswered: false, reason: 'api-error' }) as const)
  const answer = reply.isAnswered ? tidy(reply.text, ANSWER_LETTERS) : ''
  const outcome =
    answer === ''
      ? ({ status: 'failed', answer: SORRY[reply.isAnswered ? 'empty-reply' : reply.reason] } as const)
      : ({ status: 'answered', answer } as const)
  const after = await update($, talk, (held = IDLE) => (held.status === 'asking' && held.ticket === ticket ? { ...held, ...outcome } : held))
  if (after.ticket !== ticket || after.status !== outcome.status) return DROPPED

  return outcome.status === 'answered' ? ANSWERED : outcome.answer
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'aside-widget',
      description: 'Toggle the card that answers a side question about this conversation',
      argumentHint: '[on|off|ask <question>|clear]',
      immediate: true,
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'aside-widget' }, async ($, e) => {
    const typed = e.args.trim()
    const [word = ''] = typed.split(/\s+/)
    const arg = typed.toLowerCase()
    if (word.toLowerCase() === 'ask') {
      if (!(await read($, isOn))) return { text: OFF }

      const question = tidy(typed.slice(word.length), QUESTION_LETTERS)

      return { text: question === '' ? USAGE : await ask($, question) }
    }
    if (arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }
      await rest($)

      return { text: 'Aside cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await rest($)

    return { text: isShown ? 'Aside on; /widgets places it.' : 'Aside off.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!(await read($, isOn)) || e.agentId !== undefined) return done

    await update($, talk, (held = IDLE) => (held.status === 'answered' ? { ...held, turns: held.turns + 1 } : held))

    return done
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

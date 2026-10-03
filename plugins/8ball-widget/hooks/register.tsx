import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const ANSWERS: readonly (readonly [text: string, color: string])[] = [
  ['Yes, and sooner than you think.', 'green'],
  ['All signs point to yes.', 'green'],
  ['Ship it.', 'green'],
  ['The tests agree with you.', 'green'],
  ['Without a doubt.', 'green'],
  ['It will work on the first try.', 'green'],
  ['Yes, once you read the error message.', 'green'],
  ['Ask again after coffee.', 'yellow'],
  ['The answer is in the logs.', 'yellow'],
  ['Unclear. Add a test and ask again.', 'yellow'],
  ['Only on your machine.', 'yellow'],
  ['It depends on the cache.', 'yellow'],
  ['Sleep on it.', 'yellow'],
  ['Not today.', 'red'],
  ['The linter says no.', 'red'],
  ['Very doubtful.', 'red'],
  ['Not without a rollback plan.', 'red'],
  ['No, and you already knew that.', 'red'],
]
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: '8ball-widget', key: 'isOn' } as const, false)
const reading = atom({ plugin: '8ball-widget', key: 'reading' } as const, null)

const hash = (text: string): number => {
  let sum = 7
  for (const letter of text) sum = (sum * 31 + letter.charCodeAt(0)) % 100_003

  return sum
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

  const wanted = (await $.state.get(widths)).value?.['8ball-widget'] ?? CARD_COLUMNS
  const held = await read($, reading)
  const [answer, color] = ANSWERS[held?.answer ?? 0] ?? ['', 'white']

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: '8 Ball',
    note: '',
    body:
      held === null ? (
        <Text dimColor>/8ball will this deploy cleanly?</Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor wrap="wrap">
            {held.question}
          </Text>
          <Text bold color={color} wrap="wrap">
            {answer}
          </Text>
        </Box>
      ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: '8ball-widget',
      description: 'Toggle the 8 ball card',
      argumentHint: '[on|off]',
    })
    await $.command.register({
      name: '8ball',
      description: 'Ask the 8 ball a yes or no question',
      argumentHint: '<question>',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: '8ball-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /8ball-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? '8 ball on; /widgets places it.' : '8 ball off.' }
  })

  on('command.run', { command: '8ball' }, async ($, e) => {
    const question = e.args.trim()
    if (question === '') return { text: 'Usage: /8ball <question>' }

    const answer = (hash(question) + (await $.clock.now())) % ANSWERS.length
    await update($, reading, () => ({ question, answer }))
    await update($, isOn, () => true)
    await $.store.set('isOn', true)

    return { text: ANSWERS[answer]?.[0] ?? '' }
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

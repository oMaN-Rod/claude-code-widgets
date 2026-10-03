import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const FORTUNES = [
  'The bug you seek is in the file you trust most.',
  'A small commit today spares a long rebase tomorrow.',
  'Read the error message twice before you read the code once.',
  'The test you skip is the one that would have failed.',
  'Delete the clever line; keep the clear one.',
  'An hour of logging saves a day of guessing.',
  'Your future self will read this name. Choose it kindly.',
  'What worked on your machine has yet to meet the others.',
  'The cache is stale. It is always the cache.',
  'A green build is a promise, not a proof.',
  'Ask what the code does before asking why it is slow.',
  'The simplest fix is hiding behind the assumption you never checked.',
  'Two small functions will outlive one large one.',
  'Today is a good day to write the test first.',
  'Off by one is still off.',
  'The comment lies less when there is no comment to lie.',
  'A question asked early costs less than a rewrite asked late.',
  'Ship the boring version. Excitement can follow in a patch.',
  'Time zones will find you eventually.',
  'Rest. The answer often arrives away from the keyboard.',
]
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'fortune-widget', key: 'isOn' } as const, false)
const draw = atom({ plugin: 'fortune-widget', key: 'draw' } as const, 0)

const hash = (text: string): number => {
  let sum = 7
  for (const letter of text) sum = (sum * 31 + letter.charCodeAt(0)) % 100_003

  return sum
}

const show = async (
  $: EngineInterface,
  { Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['fortune-widget'] ?? CARD_COLUMNS
  const drawn = await read($, draw)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Fortune',
    note: `no. ${(drawn % FORTUNES.length) + 1}`,
    body: <Text wrap="wrap">{FORTUNES[drawn % FORTUNES.length] ?? ''}</Text>,
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'fortune-widget',
      description: 'Toggle the fortune card, or draw the next fortune',
      argumentHint: '[on|off|next]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await update($, draw, () => hash(e.cwd))

    return next(e)
  })

  on('command.run', { command: 'fortune-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'next') {
      await update($, draw, drawn => (drawn ?? 0) + 1)
      await update($, isOn, () => true)
      await $.store.set('isOn', true)

      return { text: 'A new fortune is drawn.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /fortune-widget [on|off|next]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Fortune on; /widgets places it.' : 'Fortune off.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, draw, drawn => (drawn ?? 0) + 1 + (hash(e.turnId) % (FORTUNES.length - 1)))

    return next(e)
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

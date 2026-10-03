import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'

import { CARD_COLUMNS, frame, stack, tagsOf } from './kit'
import type { Place } from './kit'

const PANE = 'widgets'
const BOARD_COLUMNS = 32
const BOARD_ROWS = 10
const site = { plugin: 'widgets', key: 'site' } as const
const isOn = atom({ plugin: 'snake-widget', key: 'isOn' } as const, false)
const best = atom({ plugin: 'snake-widget', key: 'best' } as const, 0)

const show = async (
  $: EngineInterface,
  table: Elements[RenderSurface],
  beneath: RenderElement,
  place: Place,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const tags = tagsOf(table)
  const { Text } = tags
  const record = await read($, best)
  const width = Math.min(CARD_COLUMNS, Math.max(BOARD_COLUMNS + 4, columns))
  const board =
    'Client' in table ? (
      <table.Client
        key="snake"
        module="./snake.tsx"
        props={{ best: record }}
        width={BOARD_COLUMNS}
        height={BOARD_ROWS}
      />
    ) : (
      <Text dimColor>Snake plays in the terminal.</Text>
    )

  return stack(tags, beneath, frame(tags, width, 'Snake', `best ${record}`, board))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'snake-widget',
      description: 'Toggle Snake: it plays itself until you take the keys',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('best')
    if (typeof kept === 'number') await update($, best, () => kept)

    return next(e)
  })

  on('command.run', { command: 'snake-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /snake-widget [on|off]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Snake on; /widgets places it.' : 'Snake off.' }
  })

  on('ui.message', async ($, e) => {
    const score = Number((e.data as { score?: unknown } | null)?.score ?? 0)
    const record = await update($, best, held => Math.max(held ?? 0, Number.isFinite(score) ? score : 0))
    await $.store.set('best', record)

    return { props: { best: record } }
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

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const BOARD_COLUMNS = 34
const BOARD_ROWS = 10
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'minesweeper-widget', key: 'isOn' } as const, false)
const best = atom({ plugin: 'minesweeper-widget', key: 'best' } as const, 0)

const wide = async ($: EngineInterface): Promise<number> =>
  (await $.state.get(widths)).value?.['minesweeper-widget'] ?? CARD_COLUMNS

const show = async (
  $: EngineInterface,
  table: Elements[RenderSurface],
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const { Text } = table
  const record = await read($, best)
  const width = Math.min(await wide($), Math.max(BOARD_COLUMNS + 4, columns))
  const board =
    'Client' in table ? (
      <table.Client
        key="mines"
        module="./mines.tsx"
        props={{ best: record }}
        width={BOARD_COLUMNS}
        height={BOARD_ROWS}
      />
    ) : (
      <Text dimColor>Minesweeper plays in the terminal.</Text>
    )

  return $.widgets.card({ beneath, width, title: 'Minesweeper', note: `${record} wins`, body: board })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'minesweeper-widget',
      description: 'Toggle Minesweeper: click to reveal, right-click to flag',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('best')
    if (typeof kept === 'number') await update($, best, () => kept)

    return next(e)
  })

  on('command.run', { command: 'minesweeper-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /minesweeper-widget [on|off]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Minesweeper on; /widgets places it.' : 'Minesweeper off.' }
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

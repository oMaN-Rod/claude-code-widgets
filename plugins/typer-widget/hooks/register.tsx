import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const BOARD_COLUMNS = 34
const BOARD_ROWS = 11
const MAX_WORDS = 80
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'typer-widget', key: 'isOn' } as const, false)
const best = atom({ plugin: 'typer-widget', key: 'best' } as const, 0)
const words = atom({ plugin: 'typer-widget', key: 'words' } as const, [])

const gather = async ($: EngineInterface): Promise<void> => {
  try {
    const listed = await $.process.run(['git', 'ls-files'])
    if (listed.exitCode !== 0) return

    const found = new Set<string>()
    for (const part of listed.stdout.toLowerCase().split(/[^a-z0-9]+/)) {
      if (part.length >= 3 && part.length <= 10 && /[a-z]/.test(part)) found.add(part)
      if (found.size >= MAX_WORDS) break
    }
    await update($, words, () => [...found])
  } catch {
    await update($, words, () => [])
  }
}

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
  const wanted = (await $.state.get(widths)).value?.['typer-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(BOARD_COLUMNS + 4, columns))
  const board =
    'Client' in table ? (
      <table.Client
        key="typer"
        module="./typer.tsx"
        props={{ best: record, words: await read($, words) }}
        width={BOARD_COLUMNS}
        height={BOARD_ROWS}
      />
    ) : (
      <Text dimColor>Typer plays in the terminal.</Text>
    )

  return $.widgets.card({ beneath, width, title: 'Typer', note: `best ${record}`, body: board })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'typer-widget',
      description: 'Toggle the typing game: type the falling words, drawn from your own file names',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('best')
    if (typeof kept === 'number') await update($, best, () => kept)
    if (await read($, isOn)) await gather($)

    return next(e)
  })

  on('command.run', { command: 'typer-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /typer-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await gather($)

    return { text: isShown ? 'Typer on; /widgets places it.' : 'Typer off.' }
  })

  on('ui.message', async ($, e) => {
    const score = Number((e.data as { score?: unknown } | null)?.score ?? 0)
    const record = await update($, best, held => Math.max(held ?? 0, Number.isFinite(score) ? score : 0))
    await $.store.set('best', record)

    return { props: { best: record, words: await read($, words) } }
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

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { TodosHit, TodosScan } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_ROWS = 6
const TAGS = ['TODO', 'FIXME', 'HACK', 'XXX'] as const
const PATTERN = `\\b(${TAGS.join('|')})\\b`
const HIT = new RegExp(`^(.+?):(\\d+):.*?\\b(${TAGS.join('|')})\\b[:\\s]*(.*)$`)
const EDITORS: readonly string[] = ['Edit', 'Write', 'NotebookEdit']
const COLORS: Record<string, string> = { TODO: 'cyan', FIXME: 'red', HACK: 'yellow', XXX: 'magenta' }
const UNREAD: TodosScan = { hits: [], isRepo: true }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'todos-widget', key: 'isOn' } as const, false)
const scan = atom({ plugin: 'todos-widget', key: 'scan' } as const, UNREAD)

const parse = (listed: string): TodosHit[] =>
  listed.split('\n').flatMap(line => {
    const found = HIT.exec(line)
    if (found === null) return []
    const [, path = '', at = '0', tag = '', text = ''] = found

    return [{ tag, path, line: Number(at), text: text.trim() }]
  })

const load = async ($: EngineInterface): Promise<void> => {
  try {
    const listed = await $.process.run(['git', 'grep', '-n', '-I', '-E', PATTERN])
    await update($, scan, () =>
      listed.exitCode > 1 ? { hits: [], isRepo: false } : { hits: parse(listed.stdout), isRepo: true },
    )
  } catch {
    await update($, scan, () => ({ hits: [], isRepo: false }))
  }
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

  const wanted = (await $.state.get(widths)).value?.['todos-widget'] ?? CARD_COLUMNS
  const held = await read($, scan)
  const counts = TAGS.map(tag => [tag, held.hits.filter(hit => hit.tag === tag).length] as const)
    .filter(([, count]) => count > 0)
    .map(([tag, count]) => `${count} ${tag}`)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Todos',
    note: counts.join(' · '),
    body: (
      <Box flexDirection="column">
        {!held.isRepo && <Text dimColor>Not a git repository.</Text>}
        {held.isRepo && held.hits.length === 0 && <Text dimColor>No TODO or FIXME comments.</Text>}
        {held.hits.slice(0, MAX_ROWS).map(hit => (
          <Text wrap="truncate-end">
            <Text color={COLORS[hit.tag] ?? 'cyan'}>{hit.tag}</Text>{' '}
            <Text dimColor>
              {hit.path.split('/').pop()}:{hit.line}
            </Text>{' '}
            {hit.text}
          </Text>
        ))}
        {held.hits.length > MAX_ROWS && <Text dimColor>… {held.hits.length - MAX_ROWS} more</Text>}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'todos-widget',
      description: 'Toggle the card listing TODO and FIXME comments in the repository',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if (await read($, isOn)) await load($)

    return next(e)
  })

  on('command.run', { command: 'todos-widget' }, async $ => {
    const isShown = await update($, isOn, shown => !(shown ?? false))
    await $.store.set('isOn', isShown)
    if (!isShown) return { text: 'Todos widget off.' }
    await load($)

    return { text: 'Todos widget on; /widgets places it.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (EDITORS.includes(e.tool) && (await read($, isOn))) await load($)

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (await read($, isOn)) await load($)

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

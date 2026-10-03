import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_ROWS = 8
const EDITORS: readonly string[] = ['Edit', 'Write', 'NotebookEdit']
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'changes-widget', key: 'isOn' } as const, false)
const root = atom({ plugin: 'changes-widget', key: 'root' } as const, '')
const files = atom({ plugin: 'changes-widget', key: 'files' } as const, [])

const tidy = (path: string): string => path.replaceAll('\\', '/')

const relative = (path: string, base: string): string =>
  base !== '' && tidy(path).startsWith(`${tidy(base)}/`) ? tidy(path).slice(tidy(base).length + 1) : tidy(path)

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['changes-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const edited = await read($, files)
  const base = await read($, root)
  const edits = edited.reduce((sum, file) => sum + file.edits, 0)
  const hidden = edited.length - MAX_ROWS

  return $.widgets.card({
    beneath,
    width,
    title: 'Changes',
    note: edited.length === 0 ? '' : `${edited.length} files · ${edits} edits`,
    body: (
      <Box flexDirection="column">
        {edited.length === 0 && <Text dimColor>No files edited yet.</Text>}
        {edited.slice(0, MAX_ROWS).map(file => (
          <Box justifyContent="space-between" columnGap={1}>
            <Text wrap="truncate-start">{relative(file.path, base)}</Text>
            <Text dimColor>{file.edits}</Text>
          </Box>
        ))}
        {hidden > 0 && <Text dimColor>… {hidden} more</Text>}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changes-widget',
      description: 'Toggle the card listing the files edited this session',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await update($, root, () => e.cwd)

    return next(e)
  })

  on('command.run', { command: 'changes-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, files, () => [])

      return { text: 'Changes cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /changes-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Changes widget on; /widgets places it.' : 'Changes widget off.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = String((e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path ?? '')
    if (!EDITORS.includes(e.tool) || path === '' || ran.isError === true || ran.deny !== undefined) return ran

    await update($, files, held => {
      const before = held ?? []
      const edits = (before.find(file => file.path === path)?.edits ?? 0) + 1

      return [{ path, edits }, ...before.filter(file => file.path !== path)]
    })

    return ran
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

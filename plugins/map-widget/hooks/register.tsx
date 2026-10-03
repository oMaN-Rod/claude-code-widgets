import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { MapAtlas } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAP_ROWS = 16
const MAX_BLOCK = 4
const MAX_FILES = 20_000
const EDITORS: readonly string[] = ['Edit', 'Write', 'NotebookEdit']
const READ = 0x58a6ff
const EDITED = 0x3fb950
const FOLDERS = [0x30363d, 0x3d444d, 0x2b3a4a, 0x3a3346, 0x33402f, 0x463a2e]
const BLANK: MapAtlas = { root: '', files: [], read: [], edited: [], isRepo: true }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'map-widget', key: 'isOn' } as const, false)
const atlas = atom({ plugin: 'map-widget', key: 'atlas' } as const, BLANK)

const tidy = (path: string): string => path.replaceAll('\\', '/')

const relative = (path: string, root: string): string => {
  const full = tidy(path)
  const base = `${tidy(root)}/`

  return root !== '' && full.toLowerCase().startsWith(base.toLowerCase()) ? full.slice(base.length) : full
}

const survey = async ($: EngineInterface): Promise<void> => {
  try {
    const listed = await $.process.run(['git', 'ls-files'])
    const files = listed.exitCode === 0 ? listed.stdout.split('\n').filter(Boolean).slice(0, MAX_FILES).sort() : []
    await update($, atlas, held => ({ ...(held ?? BLANK), files, isRepo: listed.exitCode === 0 }))
  } catch {
    await update($, atlas, held => ({ ...(held ?? BLANK), files: [], isRepo: false }))
  }
}

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['map-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, atlas)
  const count = held.files.length
  const block = Math.max(1, Math.min(MAX_BLOCK, Math.floor(Math.sqrt((inner * MAP_ROWS) / Math.max(1, count)))))
  const across = Math.floor(inner / block)
  const capacity = across * Math.floor(MAP_ROWS / block)
  const share = Math.max(1, Math.ceil(count / capacity))
  const wasRead = new Set(held.read)
  const wasEdited = new Set(held.edited)
  const folders: string[] = []
  const colors: number[] = []

  held.files.forEach((file, index) => {
    const cell = Math.floor(index / share)
    const folder = file.includes('/') ? (file.split('/')[0] ?? '') : ''
    if (!folders.includes(folder)) folders.push(folder)
    const base = FOLDERS[folders.indexOf(folder) % FOLDERS.length] ?? 0x30363d
    const color = wasEdited.has(file) ? EDITED : wasRead.has(file) ? READ : base
    const before = colors[cell]
    if (before === undefined || color === EDITED || (color === READ && before !== EDITED)) colors[cell] = color
  })

  const marks: WidgetsMark[] = []
  colors.forEach((color, cell) => {
    const left = (cell % across) * block
    const top = Math.floor(cell / across) * block
    for (let dy = 0; dy < Math.max(1, block - (block > 2 ? 1 : 0)); dy += 1) {
      for (let dx = 0; dx < Math.max(1, block - (block > 2 ? 1 : 0)); dx += 1) marks.push([left + dx, top + dy, color])
    }
  })
  const picture = await $.widgets.picture({ surface, key: 'map', columns: inner, rows: MAP_ROWS, marks })

  return $.widgets.card({
    beneath,
    width,
    title: 'Map',
    note: held.isRepo ? `${count} files` : '',
    body: !held.isRepo ? (
      <Text dimColor>Not a git repository.</Text>
    ) : (
      <Box flexDirection="column">
        {picture}
        <Text wrap="truncate-end">
          <Text color="#58a6ff">■</Text> {wasRead.size} read <Text color="#3fb950">■</Text> {wasEdited.size} edited
        </Text>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'map-widget',
      description: 'Toggle the map of the repository showing which files Claude has read and edited',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await update($, atlas, held => ({ ...(held ?? BLANK), root: e.cwd }))
    if (await read($, isOn)) await survey($)

    return next(e)
  })

  on('command.run', { command: 'map-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, atlas, held => ({ ...(held ?? BLANK), read: [], edited: [] }))

      return { text: 'Map cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /map-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await survey($)

    return { text: isShown ? 'Map on; /widgets places it.' : 'Map off.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const given = (e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path
    if (typeof given !== 'string' || ran.isError === true || ran.deny !== undefined) return ran

    const isEdit = EDITORS.includes(e.tool)
    if (!isEdit && e.tool !== 'Read') return ran

    const before = await read($, atlas)
    const file = relative(given, before.root)
    await update($, atlas, held => {
      const was = held ?? BLANK

      return isEdit
        ? { ...was, edited: was.edited.includes(file) ? was.edited : [...was.edited, file] }
        : { ...was, read: was.read.includes(file) ? was.read : [...was.read, file] }
    })
    if (isEdit && !before.files.includes(file) && (await read($, isOn))) await survey($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, e.surface, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, e.surface, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, e.surface, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

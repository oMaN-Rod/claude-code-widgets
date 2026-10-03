import { atom, read, update } from 'claude-code'
import type {
  Elements,
  EngineInterface,
  Register,
  RenderElement,
  RenderNode,
  RenderSurface,
} from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { Tree, TreeDir } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>

const PANE = 'widgets'
const SLOT = 'file-tree-slot'
const CARD_COLUMNS = 40
const COMPACT_ROWS = 10
const SKIPPED = new Set(['.git', 'node_modules'])
const MAX_ENTRIES = 200
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'file-tree-widget', key: 'isOn' } as const, false)
const tree = atom({ plugin: 'file-tree-widget', key: 'tree' } as const, null)

const list = async ($: EngineInterface, path: string): Promise<TreeDir> => {
  const found = await $.fs.list(path)
  const entries = found
    .filter(entry => !SKIPPED.has(entry.name))
    .map(entry => ({ name: entry.name, isDir: entry.kind === 'dir' }))
    .sort(
      (a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name),
    )

  return {
    entries: entries.slice(0, MAX_ENTRIES),
    hidden: Math.max(0, entries.length - MAX_ENTRIES),
  }
}

const load = async ($: EngineInterface): Promise<void> => {
  const root = await $.session.root()
  const kept = await read($, tree)
  const expanded = kept?.root === root ? kept.expanded : []
  const dirs: Record<string, TreeDir> = {}
  const open: string[] = []

  dirs[root] = await list($, root)
  for (const path of expanded) {
    try {
      dirs[path] = await list($, path)
      open.push(path)
    } catch {
      continue
    }
  }
  const loaded: Tree = { root, dirs, expanded: open }
  await update($, tree, () => loaded)
}

const toggle = async ($: EngineInterface, path: string): Promise<void> => {
  const kept = await read($, tree)
  if (kept === null) return

  if (kept.expanded.includes(path)) {
    await update($, tree, now =>
      now ? { ...now, expanded: now.expanded.filter(one => one !== path) } : null,
    )

    return
  }

  const listed = await list($, path)
  await update($, tree, now =>
    now
      ? {
          ...now,
          dirs: { ...now.dirs, [path]: listed },
          expanded: [...now.expanded, path],
        }
      : null,
  )
}

const fill = (node: RenderNode, card: RenderElement): RenderNode => {
  if (typeof node !== 'object') return node
  const { props, children } = node as { props?: { key?: unknown }; children?: RenderNode[] }
  if (props?.key === SLOT) return card

  return children === undefined
    ? node
    : ({ ...node, children: children.map(child => fill(child, card)) } as RenderElement)
}

const drawCard = async (
  $: EngineInterface,
  { Box, Button, Text }: Tags,
  width: number,
  maxRows: number,
): Promise<RenderElement> => {
  const shown = await read($, tree)
  const rows: RenderNode[] = []

  const walk = (dir: string, depth: number): void => {
    const listed = shown?.dirs[dir]
    if (shown === null || listed === undefined) return

    for (const entry of listed.entries) {
      const path = `${dir}/${entry.name}`
      const isOpen = entry.isDir && shown.expanded.includes(path)

      rows.push(
        <Box paddingLeft={depth * 2}>
          {entry.isDir ? (
            <Button
              plain
              key={`dir:${path}`}
              label={`${isOpen ? '▾' : '▸'} ${entry.name}/`}
              onPress={() => toggle($, path)}
            />
          ) : (
            <Text wrap="truncate-end">  {entry.name}</Text>
          )}
        </Box>,
      )
      if (isOpen) walk(path, depth + 1)
    }
    if (listed.hidden > 0) {
      rows.push(
        <Box paddingLeft={depth * 2}>
          <Text dimColor>  … {listed.hidden} more</Text>
        </Box>,
      )
    }
  }

  if (shown !== null) walk(shown.root, 0)
  const cut = rows.length > maxRows ? rows.length - (maxRows - 1) : 0

  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderDimColor paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold wrap="truncate-start">
          {shown?.root.split(/[\\/]/).pop() ?? 'Files'}
        </Text>
        <Button plain dimColor key="refresh" label="↻" onPress={() => load($)} />
      </Box>
      {rows.length === 0 && <Text dimColor>Empty.</Text>}
      {cut > 0 ? rows.slice(0, maxRows - 1) : rows}
      {cut > 0 && <Text dimColor>  … {cut} more rows</Text>}
    </Box>
  )
}

const wide = async ($: EngineInterface): Promise<number> =>
  (await $.state.get(widths)).value?.['file-tree-widget'] ?? CARD_COLUMNS

const show = async (
  $: EngineInterface,
  tags: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
  maxRows: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = Math.min(await wide($), Math.max(20, columns))

  const card = await drawCard($, tags, width, maxRows)
  const stacked = await $.widgets.stack({ beneath, card: <tags.Box key={SLOT} /> })

  return fill(stacked, card) as RenderElement
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'file-tree-widget',
      description: 'Toggle the project file tree card among the /widgets cards',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if (await read($, isOn)) await load($)

    return next(e)
  })

  on('command.run', { command: 'file-tree-widget' }, async $ => {
    const isShown = await update($, isOn, shown => !(shown ?? false))
    await $.store.set('isOn', isShown)
    if (!isShown) return { text: 'File tree off.' }
    await load($)

    return { text: 'File tree on; /widgets places it.' }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isOn))) await load($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show(
      $,
      $.ui.resolve(e),
      await next(e),
      'side',
      e.props.bodyColumns,
      e.props.placement === 'dock' ? Infinity : COMPACT_ROWS,
    ),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns, COMPACT_ROWS),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80, COMPACT_ROWS),
  )
}

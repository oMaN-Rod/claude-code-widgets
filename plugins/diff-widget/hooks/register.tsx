import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { DiffPatch } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Code'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_LINES = 14
const CONTEXT = 1
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'diff-widget', key: 'isOn' } as const, false)
const patch = atom({ plugin: 'diff-widget', key: 'patch' } as const, null)

const linesOf = (text: string): string[] =>
  text
    .replaceAll('\r', '')
    .split('\n')
    .map(line => [...line].filter(letter => letter === '\t' || letter >= ' ').join(''))

const patchOf = (path: string, before: string, after: string): DiffPatch => {
  const old = before === '' ? [] : linesOf(before)
  const fresh = after === '' ? [] : linesOf(after)
  let head = 0
  while (head < old.length && head < fresh.length && old[head] === fresh[head]) head += 1
  let tail = 0
  while (
    tail < old.length - head &&
    tail < fresh.length - head &&
    old[old.length - 1 - tail] === fresh[fresh.length - 1 - tail]
  ) {
    tail += 1
  }

  const removed = old.slice(head, old.length - tail)
  const added = fresh.slice(head, fresh.length - tail)
  const lead = old.slice(Math.max(0, head - CONTEXT), head)
  const trail = old.slice(old.length - tail, old.length - tail + CONTEXT)
  const body = [
    ...lead.map(line => ` ${line}`),
    ...removed.map(line => `-${line}`),
    ...added.map(line => `+${line}`),
    ...trail.map(line => ` ${line}`),
  ]
  const start = head - lead.length + 1
  const kept = lead.length + trail.length
  const name = path.replaceAll('\\', '/').split('/').pop() ?? path
  const source = [
    `--- a/${name}`,
    `+++ b/${name}`,
    `@@ -${start},${kept + removed.length} +${start},${kept + added.length} @@`,
    ...body.slice(0, MAX_LINES),
  ].join('\n')

  return { path, source: source.slice(0, 9000), added: added.length, removed: removed.length }
}

const show = async (
  $: EngineInterface,
  { Box, Text, Code }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['diff-widget'] ?? CARD_COLUMNS
  const held = await read($, patch)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Diff',
    note: held === null ? '' : `+${held.added} -${held.removed}`,
    body:
      held === null ? (
        <Text dimColor>No edits yet.</Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor wrap="truncate-start">
            {held.path.replaceAll('\\', '/')}
          </Text>
          <Code source={held.source} format="diff" path={held.path} wrap="truncate-end" />
        </Box>
      ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'diff-widget',
      description: 'Toggle the card showing the last edit as a diff',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'diff-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, patch, () => null)

      return { text: 'Diff cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /diff-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Diff widget on; /widgets places it.' : 'Diff widget off.' }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.isError === true || ran.deny !== undefined) return ran

    const { file_path, old_string, new_string } = e as { file_path?: unknown; old_string?: unknown; new_string?: unknown }
    await update($, patch, () => patchOf(String(file_path ?? ''), String(old_string ?? ''), String(new_string ?? '')))

    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.isError === true || ran.deny !== undefined) return ran

    const { file_path, content } = e as { file_path?: unknown; content?: unknown }
    await update($, patch, () => patchOf(String(file_path ?? ''), '', String(content ?? '')))

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

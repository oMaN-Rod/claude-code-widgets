import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { GitStatus } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const WRITERS: readonly string[] = ['Bash', 'Edit', 'Write', 'NotebookEdit']
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'git-widget', key: 'isOn' } as const, false)
const status = atom({ plugin: 'git-widget', key: 'status' } as const, null)

const parse = (porcelain: string, subject: string): GitStatus => {
  const found: GitStatus = { branch: 'detached', ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, subject }

  for (const line of porcelain.split('\n')) {
    const [kind, first = '', second = '', third = ''] = line.split(' ')
    if (kind === '#' && first === 'branch.head') found.branch = second === '(detached)' ? 'detached' : second
    if (kind === '#' && first === 'branch.ab') {
      found.ahead = Math.abs(Number(second))
      found.behind = Math.abs(Number(third))
    }
    if (kind === '?') found.untracked += 1
    if (kind === 'u') found.changed += 1
    if (kind === '1' || kind === '2') {
      if (first[0] !== '.') found.staged += 1
      if (first[1] !== '.') found.changed += 1
    }
  }

  return found
}

const load = async ($: EngineInterface): Promise<void> => {
  try {
    const listed = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'])
    if (listed.exitCode !== 0) {
      await update($, status, () => null)

      return
    }
    const logged = await $.process.run(['git', 'log', '-1', '--format=%s'])
    await update($, status, () => parse(listed.stdout, logged.exitCode === 0 ? logged.stdout.trim() : ''))
  } catch {
    await update($, status, () => null)
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

  const wanted = (await $.state.get(widths)).value?.['git-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const held = await read($, status)

  if (held === null) {
    return $.widgets.card({
      beneath,
      width,
      title: 'Git',
      note: '',
      body: <Text dimColor>Not a git repository.</Text>,
    })
  }

  const parts = [
    held.staged > 0 ? `${held.staged} staged` : '',
    held.changed > 0 ? `${held.changed} changed` : '',
    held.untracked > 0 ? `${held.untracked} untracked` : '',
  ].filter(part => part !== '')
  const drift = [held.ahead > 0 ? `↑${held.ahead}` : '', held.behind > 0 ? `↓${held.behind}` : '']
    .filter(part => part !== '')
    .join(' ')

  return $.widgets.card({
    beneath,
    width,
    title: held.branch,
    note: drift,
    body: (
      <Box flexDirection="column">
        {parts.length === 0 ? (
          <Text color="green">clean</Text>
        ) : (
          <Text color="yellow" wrap="truncate-end">
            {parts.join(' · ')}
          </Text>
        )}
        {held.subject !== '' && (
          <Text dimColor wrap="truncate-end">
            {held.subject}
          </Text>
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'git-widget',
      description: 'Toggle the git status card among the /widgets cards',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if (await read($, isOn)) await load($)

    return next(e)
  })

  on('command.run', { command: 'git-widget' }, async $ => {
    const isShown = await update($, isOn, shown => !(shown ?? false))
    await $.store.set('isOn', isShown)
    if (!isShown) return { text: 'Git widget off.' }
    await load($)

    return { text: 'Git widget on; /widgets places it.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (WRITERS.includes(e.tool) && (await read($, isOn))) await load($)

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

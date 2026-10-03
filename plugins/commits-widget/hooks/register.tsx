import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { CommitsLog } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_ROWS = 8
const UNREAD: CommitsLog = { base: '', rows: [], isRepo: true }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'commits-widget', key: 'isOn' } as const, false)
const log = atom({ plugin: 'commits-widget', key: 'log' } as const, UNREAD)

const git = async ($: EngineInterface, ...args: string[]): Promise<string | undefined> => {
  try {
    const ran = await $.process.run(['git', ...args])

    return ran.exitCode === 0 ? ran.stdout : undefined
  } catch {
    return undefined
  }
}

const mark = async ($: EngineInterface): Promise<void> => {
  const head = await git($, 'rev-parse', 'HEAD')
  await update($, log, held => ({
    ...(held ?? UNREAD),
    base: (held ?? UNREAD).base === '' ? (head ?? '').trim() : (held ?? UNREAD).base,
    isRepo: head !== undefined,
  }))
}

const load = async ($: EngineInterface): Promise<void> => {
  if ((await read($, log)).base === '') await mark($)
  const { base } = await read($, log)
  if (base === '') return

  const listed = await git($, 'log', '--format=%h%x09%s', `${base}..HEAD`)
  const rows = (listed ?? '')
    .split('\n')
    .filter(line => line.includes('\t'))
    .map(line => {
      const [hash = '', ...subject] = line.split('\t')

      return { hash, subject: subject.join(' ') }
    })
  await update($, log, held => ({ ...(held ?? UNREAD), rows, isRepo: listed !== undefined }))
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

  const wanted = (await $.state.get(widths)).value?.['commits-widget'] ?? CARD_COLUMNS
  const held = await read($, log)

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Commits',
    note: held.isRepo ? `${held.rows.length} this session` : '',
    body: (
      <Box flexDirection="column">
        {!held.isRepo && <Text dimColor>Not a git repository.</Text>}
        {held.isRepo && held.rows.length === 0 && <Text dimColor>No commits yet this session.</Text>}
        {held.rows.slice(0, MAX_ROWS).map(row => (
          <Text wrap="truncate-end">
            <Text color="yellow">{row.hash}</Text> {row.subject}
          </Text>
        ))}
        {held.rows.length > MAX_ROWS && <Text dimColor>… {held.rows.length - MAX_ROWS} more</Text>}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'commits-widget',
      description: 'Toggle the card listing the commits made this session',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await mark($)

    return next(e)
  })

  on('command.run', { command: 'commits-widget' }, async $ => {
    const isShown = await update($, isOn, shown => !(shown ?? false))
    await $.store.set('isOn', isShown)
    if (!isShown) return { text: 'Commits widget off.' }
    await load($)

    return { text: 'Commits widget on; /widgets places it.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (await read($, isOn)) await load($)

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

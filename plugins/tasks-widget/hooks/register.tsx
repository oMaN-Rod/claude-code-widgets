import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { TaskRow, TaskStatus } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Todo = { content?: unknown; status?: unknown }
type Created = { task?: { id?: unknown; subject?: unknown } }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const MAX_ROWS = 8
const STATUSES: readonly string[] = ['pending', 'in_progress', 'completed']
const MARKS: Record<TaskStatus, string> = { pending: '☐', in_progress: '◐', completed: '☑' }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'tasks-widget', key: 'isOn' } as const, false)
const tasks = atom({ plugin: 'tasks-widget', key: 'tasks' } as const, [])

const isStatus = (value: unknown): value is TaskStatus => typeof value === 'string' && STATUSES.includes(value)

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['tasks-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = width - 4
  const held = await read($, tasks)
  const done = held.filter(task => task.status === 'completed').length
  const filled = held.length === 0 ? 0 : Math.round((done / held.length) * inner)
  const open = held.filter(task => task.status !== 'completed')
  const shown = [...open, ...held.filter(task => task.status === 'completed')].slice(0, MAX_ROWS)

  return $.widgets.card({
    beneath,
    width,
    title: 'Tasks',
    note: held.length === 0 ? '' : `${done}/${held.length} done`,
    body: (
      <Box flexDirection="column">
        {held.length === 0 && <Text dimColor>No tasks yet.</Text>}
        {held.length > 0 && (
          <Box>
            <Text color="green">{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(inner - filled)}</Text>
          </Box>
        )}
        {shown.map(task => (
          <Text
            wrap="truncate-end"
            dimColor={task.status === 'completed'}
            bold={task.status === 'in_progress'}
          >
            {MARKS[task.status]} {task.subject}
          </Text>
        ))}
        {held.length > MAX_ROWS && <Text dimColor>… {held.length - MAX_ROWS} more</Text>}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tasks-widget',
      description: 'Toggle the card showing the task list and its progress',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'tasks-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, tasks, () => [])

      return { text: 'Tasks cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /tasks-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Tasks widget on; /widgets places it.' : 'Tasks widget off.' }
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.isError === true || ran.deny !== undefined) return ran

    const todos = (e as { todos?: readonly Todo[] }).todos ?? []
    await update($, tasks, () =>
      todos.map((todo, index) => ({
        id: String(index),
        subject: String(todo.content ?? ''),
        status: isStatus(todo.status) ? todo.status : 'pending',
      })),
    )

    return ran
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const made = (ran.result as Created | undefined)?.task
    if (ran.isError === true || ran.deny !== undefined || made?.id === undefined) return ran

    const row: TaskRow = {
      id: String(made.id),
      subject: String(made.subject ?? (e as { subject?: unknown }).subject ?? ''),
      status: 'pending',
    }
    await update($, tasks, held => [...(held ?? []).filter(task => task.id !== row.id), row])

    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.isError === true || ran.deny !== undefined) return ran

    const { taskId, status, subject } = e as { taskId?: unknown; status?: unknown; subject?: unknown }
    await update($, tasks, held =>
      status === 'deleted'
        ? (held ?? []).filter(task => task.id !== taskId)
        : (held ?? []).map(task =>
            task.id === taskId
              ? {
                  ...task,
                  subject: typeof subject === 'string' ? subject : task.subject,
                  status: isStatus(status) ? status : task.status,
                }
              : task,
          ),
    )

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

import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'tasks-widget',
  component: 'Pane',
  requestId: 'widgets',
  props: {
    title: 'Widgets',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const run = (command: string, args = '') =>
  ({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  }) as const

const LAYOUT: Plugin = {
  name: 'widgets',
  register(on) {
    on('engine.create', async (_$, e, next) => ({
      ...(await next(e)),
      widgets: {
        stack: async ({ beneath, card }) => ({ type: 'Box' as const, children: [beneath, card] }),
        card: async ({ beneath, title, note, body }) => ({
          type: 'Box' as const,
          children: [
            beneath,
            { type: 'Text' as const, children: [title ?? 'untitled'] },
            { type: 'Text' as const, children: [note ?? 'no note'] },
            body,
          ],
        }),
        picture: async () => ({ type: 'Text' as const, children: ['no picture'] }),
      },
    }))
    on('command.run', { command: 'place' }, async ($, e) => {
      await $.state.set({ plugin: 'widgets', key: 'site' } as const, e.args as 'side')

      return { text: e.args }
    })
  },
}

test('follows the task tools and the todo list', { plugins: [LAYOUT] }, async ($, on) => {
  let made = 0

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('tool.call', (_$, e) => {
    if (e.tool === 'TaskCreate') {
      made += 1

      return { result: { task: { id: String(made), subject: e.subject } }, text: 'ok' }
    }

    return { result: 'ok', text: 'ok' }
  })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('tasks-widget', 'on'))).text).toMatch(/on/)

  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await empty.find({ text: /No tasks yet/ })).toBeDefined()
  await empty.unmount()

  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'u1', subject: 'Write the parser', description: 'd' })
  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'u2', subject: 'Test the parser', description: 'd' })
  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'u3', subject: 'Drop me', description: 'd' })
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u4', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u5', taskId: '2', status: 'in_progress' })
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u6', taskId: '3', status: 'deleted' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^1\/2 done$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^█+$/ }))?.text).toHaveLength(18)
    const rows = await ui.findAll({ type: 'Text', text: /parser$/ })
    expect(rows.map(row => row.text)).toEqual(['◐ Test the parser', '☑ Write the parser'])
    expect(await ui.find({ text: /Drop me/ })).toBeUndefined()
    await ui.unmount()
  }

  await $.tool.call({
    tool: 'TodoWrite',
    tool_use_id: 'u7',
    todos: [
      { content: 'One', status: 'completed', activeForm: 'Doing one' },
      { content: 'Two', status: 'pending', activeForm: 'Doing two' },
      { content: 'Three', status: 'pending', activeForm: 'Doing three' },
    ],
  })
  const listed = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await listed.find({ text: /^1\/3 done$/ })).toBeDefined()
  expect(await listed.find({ text: /^☐ Two$/ })).toBeDefined()
  expect(await listed.find({ text: /parser/ })).toBeUndefined()
  await listed.unmount()

  expect((await $.command.run(run('tasks-widget', 'clear'))).text).toMatch(/cleared/)
  expect((await $.command.run(run('tasks-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('tasks-widget', 'off'))).text).toMatch(/off/)
})

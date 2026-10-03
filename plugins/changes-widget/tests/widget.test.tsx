import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'changes-widget',
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

test('lists the files edited this session, most recent first', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.call', (_$, e) =>
    e.tool === 'Write' && e.file_path === '/work/bad.ts'
      ? { result: 'boom', isError: true, text: 'boom' }
      : { result: 'ok', text: 'ok' },
  )
  mock.store(on)

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('changes-widget', 'on'))).text).toMatch(/on/)

  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await empty.find({ text: /No files edited yet/ })).toBeDefined()
  await empty.unmount()

  await $.tool.call({ tool: 'Edit', tool_use_id: 'u1', file_path: '/work/src/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'u2', file_path: '/elsewhere/b.ts', content: '' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'u3', file_path: '/work/src/a.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'u4', file_path: '/work/bad.ts', content: '' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u5', file_path: '/work/read.ts' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^2 files · 3 edits$/ })).toBeDefined()
    const rows = await ui.findAll({ type: 'Text', text: /\.ts$/ })
    expect(rows.map(row => row.text)).toEqual(['src/a.ts', '/elsewhere/b.ts'])
    await ui.unmount()
  }

  expect((await $.command.run(run('changes-widget', 'clear'))).text).toMatch(/cleared/)
  const cleared = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await cleared.find({ text: /No files edited yet/ })).toBeDefined()
  await cleared.unmount()

  expect((await $.command.run(run('changes-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('changes-widget', 'off'))).text).toMatch(/off/)
})

import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'diff-widget',
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

test('shows the last edit as a unified diff', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('tool.call', (_$, e) =>
    e.tool === 'Edit' && e.file_path === '/work/bad.ts'
      ? { result: 'boom', isError: true, text: 'boom' }
      : { result: 'ok', text: 'ok' },
  )
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('diff-widget', 'on'))).text).toMatch(/on/)

  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await empty.find({ text: /No edits yet/ })).toBeDefined()
  await empty.unmount()

  await $.tool.call({
    tool: 'Edit',
    tool_use_id: 'u1',
    file_path: '/work/src/sum.ts',
    old_string: 'const sum = (a, b) => {\n  return a - b\n}',
    new_string: 'const sum = (a, b) => {\n  // add, not subtract\n  return a + b\n}',
  })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'u2', file_path: '/work/bad.ts', old_string: 'a', new_string: 'b' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^\+2 -1$/ })).toBeDefined()
    expect(await ui.find({ text: /^\/work\/src\/sum\.ts$/ })).toBeDefined()
    const code = await ui.find({ type: 'Code' })
    expect(code?.props).toMatchObject({ format: 'diff', path: '/work/src/sum.ts' })
    expect(String(code?.props.source).split('\n')).toEqual([
      '--- a/sum.ts',
      '+++ b/sum.ts',
      '@@ -1,3 +1,4 @@',
      ' const sum = (a, b) => {',
      '-  return a - b',
      '+  // add, not subtract',
      '+  return a + b',
      ' }',
    ])
    await ui.unmount()
  }

  await $.tool.call({ tool: 'Write', tool_use_id: 'u3', file_path: '/work/new.ts', content: 'export const one = 1\n' })
  const written = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await written.find({ text: /^\+2 -0$/ })).toBeDefined()
  await written.unmount()

  expect((await $.command.run(run('diff-widget', 'clear'))).text).toMatch(/cleared/)
  expect((await $.command.run(run('diff-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('diff-widget', 'off'))).text).toMatch(/off/)
})

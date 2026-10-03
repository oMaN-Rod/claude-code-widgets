import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'todos-widget',
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

const ran = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

test('counts the TODO and FIXME comments git knows about', { plugins: [LAYOUT] }, async ($, on) => {
  let listed = ['src/a.ts:12:  // TODO: handle the empty case', 'src/b.ts:3:# FIXME broken on Windows', 'lib/c.ts:40:/* TODO tidy */'].join('\n')
  let exitCode = 0

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('process.run', () => ran(exitCode, listed))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('todos-widget'))).text).toMatch(/on/)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^2 TODO · 1 FIXME$/ })).toBeDefined()
    expect(await ui.find({ text: /^TODO a\.ts:12 handle the empty case$/ })).toBeDefined()
    expect(await ui.find({ text: /^FIXME b\.ts:3 broken on Windows$/ })).toBeDefined()
    expect(await ui.find({ text: /^TODO c\.ts:40 tidy \*\/$/ })).toBeDefined()
    await ui.unmount()
  }

  listed = ''
  exitCode = 1
  await $.tool.call({ tool: 'Edit', tool_use_id: 'u1', file_path: '/work/src/a.ts', old_string: 'a', new_string: 'b' })
  const clean = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await clean.find({ text: /No TODO or FIXME comments/ })).toBeDefined()
  await clean.unmount()

  exitCode = 128
  await $.tool.call({ tool: 'Write', tool_use_id: 'u2', file_path: '/x', content: '' })
  const none = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await none.find({ text: /Not a git repository/ })).toBeDefined()
  await none.unmount()

  expect((await $.command.run(run('todos-widget'))).text).toMatch(/off/)
})

import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'git-widget',
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

const PORCELAIN = [
  '# branch.oid 1234',
  '# branch.head feature',
  '# branch.upstream origin/feature',
  '# branch.ab +2 -1',
  '1 M. N... 100644 100644 100644 a b staged.ts',
  '1 .M N... 100644 100644 100644 a b changed.ts',
  '1 MM N... 100644 100644 100644 a b both.ts',
  '? new.ts',
].join('\n')

const ran = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

test('shows the branch, its drift and what is pending', { plugins: [LAYOUT] }, async ($, on) => {
  let isRepo = true
  let isDirty = true

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('process.run', (_$, e) => {
    if (!isRepo) return ran(128, '')
    if (e.argv[1] === 'log') return ran(0, 'Add the thing\n')

    return ran(0, isDirty ? PORCELAIN : '# branch.head main\n')
  })
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('git-widget'))).text).toMatch(/on/)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^feature$/ })).toBeDefined()
    expect(await ui.find({ text: /^↑2 ↓1$/ })).toBeDefined()
    expect(await ui.find({ text: /^2 staged · 2 changed · 1 untracked$/ })).toBeDefined()
    expect(await ui.find({ text: /^Add the thing$/ })).toBeDefined()
    await ui.unmount()
  }

  isDirty = false
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'git commit -am x' })
  const clean = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await clean.find({ text: /^main$/ })).toBeDefined()
  expect(await clean.find({ text: /^clean$/ })).toBeDefined()
  await clean.unmount()

  isRepo = false
  await $.tool.call({ tool: 'Write', tool_use_id: 'u2', file_path: '/x', content: '' })
  const none = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await none.find({ text: /Not a git repository/ })).toBeDefined()
  await none.unmount()

  expect((await $.command.run(run('git-widget'))).text).toMatch(/off/)
  const off = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await off.find({ text: /Not a git repository/ })).toBeUndefined()
})

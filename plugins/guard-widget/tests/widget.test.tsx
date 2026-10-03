import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'guard-widget',
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

test('tallies the permission decisions and what was asked about', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('tool.check', (_$, e) => {
    const command = String((e.input as { command?: unknown }).command ?? '')
    if (command.startsWith('rm')) return { decision: 'deny' as const }
    if (command.startsWith('git push')) return { decision: 'ask' as const }

    return { decision: 'allow' as const }
  })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('guard-widget', 'on'))).text).toMatch(/Guard on/)

  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await empty.find({ text: /No permission checks yet/ })).toBeDefined()
  await empty.unmount()

  await $.tool.check({ tool: 'Read', input: { file_path: '/x' }, tool_use_id: 'u1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'git push origin main' }, tool_use_id: 'u2' })
  await $.tool.check({ tool: 'Bash', input: { command: 'git push --tags' }, tool_use_id: 'u3' })
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'u4' })
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^4 checks$/ })).toBeDefined()
    expect(await ui.find({ text: /^1 allowed · 2 asked · 1 denied$/ })).toBeDefined()
    expect(await ui.find({ text: /^\? Bash git$/ })).toBeDefined()
    expect(await ui.find({ text: /^×2$/ })).toBeDefined()
    expect(await ui.find({ text: /^✗ Bash rm$/ })).toBeDefined()
    await ui.unmount()
  }

  expect((await $.command.run(run('guard-widget', 'clear'))).text).toMatch(/cleared/)
  expect((await $.command.run(run('guard-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('guard-widget', 'off'))).text).toMatch(/off/)
})

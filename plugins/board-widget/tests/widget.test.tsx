import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'board-widget',
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

const pin = (tool_use_id: string, input: Record<string, unknown>) =>
  ({ tool: 'mcp__board-widget__pin', tool_use_id, ...input }) as never

test('registers a pin tool and shows what Claude pins', { plugins: [LAYOUT] }, async ($, on) => {
  const registered: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('tool.register', (_$, e) => {
    registered.push(e.name)

    return { value: { tool: `mcp__board-widget__${e.name}` } }
  })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('board-widget', 'on'))).text).toMatch(/Board on/)
  expect(registered).toEqual(['pin'])

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /Claude pins its goal/ })).toBeDefined()

  const first = await $.tool.call(
    pin('u1', { goal: 'Find why   login fails', findings: ['Token expires early', ''], questions: ['Which env?'] }),
  )
  expect(first.text).toBe('Board updated: goal set, 1 findings, 1 questions.')
  expect(await ui.find({ text: /^Find why login fails$/ })).toBeDefined()
  expect(await ui.find({ text: /^✓ Token expires early$/ })).toBeDefined()
  expect(await ui.find({ text: /^\? Which env\?$/ })).toBeDefined()
  expect(await ui.find({ text: /^kept by Claude$/ })).toBeDefined()

  await $.tool.call(pin('u2', { findings: ['Token expires early', 'Clock skew on the server'] }))
  expect(await ui.find({ text: /^Find why login fails$/ })).toBeDefined()
  expect(await ui.find({ text: /^✓ Clock skew on the server$/ })).toBeDefined()
  expect(await ui.find({ text: /^\? Which env\?$/ })).toBeDefined()

  await $.tool.call(pin('u3', { clear: true, goal: 'Write the fix' }))
  expect(await ui.find({ text: /^Write the fix$/ })).toBeDefined()
  expect(await ui.find({ text: /Token expires early/ })).toBeUndefined()

  expect((await $.command.run(run('board-widget', 'clear'))).text).toMatch(/cleared/)
  expect(await ui.find({ text: /Claude pins its goal/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('board-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('board-widget', 'off'))).text).toMatch(/Board off/)
})

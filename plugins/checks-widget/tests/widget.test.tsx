import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'checks-widget',
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

test('records test, lint and build runs and ages them on the clock', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  const clock = mock.clock(on, { now: 1000 })
  on('tool.call', async (_$, e) => {
    await clock.advance(4000)

    return e.tool === 'Bash' && e.command.includes('lint')
      ? { result: 'boom', isError: true, text: 'boom' }
      : { result: 'ok', text: 'ok' }
  })
  on('tool.check', () => ({ decision: 'ask' as const }))
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('checks-widget', 'on'))).text).toMatch(/on/)

  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await empty.find({ text: /No test, lint or build runs yet/ })).toBeDefined()
  await empty.unmount()

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'ls -la' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u2', command: 'bun run lint' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'bun test' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u4', command: 'bun run build' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^2 passing in a row$/ })).toBeDefined()
    const rows = await ui.findAll({ type: 'Text', text: /^bun / })
    expect(rows.map(row => row.text)).toEqual(['bun run build', 'bun test', 'bun run lint'])
    expect((await ui.findAll({ type: 'Text', text: /^[✓✗]$/ })).map(part => part.text)).toEqual(['✓', '✓', '✗'])
    expect(await ui.find({ text: /^4s · 0s ago$/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await clock.advance(150_000)
  expect(await ui.find({ text: /^4s · 2m ago$/ })).toBeDefined()
  await ui.unmount()

  await $.tool.check({ tool: 'Bash', input: { command: 'bun test' }, tool_use_id: 'u5' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u5', command: 'bun test' })
  const waited = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await waited.find({ text: /^0s ago$/ })).toBeDefined()
  await waited.unmount()

  expect((await $.command.run(run('checks-widget', 'clear'))).text).toMatch(/cleared/)
  expect((await $.command.run(run('checks-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('checks-widget', 'off'))).text).toMatch(/off/)
})

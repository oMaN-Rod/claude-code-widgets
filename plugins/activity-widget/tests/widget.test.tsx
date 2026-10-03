import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'activity-widget',
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

test('lists the latest tool calls with their duration and outcome', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  const clock = mock.clock(on, { now: 1000 })
  on('tool.call', async (_$, e) => {
    await clock.advance(e.tool === 'Bash' ? 2500 : 40)

    return e.tool === 'Read' ? { result: 'boom', isError: true, text: 'boom' } : { result: 'ok', text: 'ok' }
  })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('activity-widget', 'on'))).text).toMatch(/on/)

  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await empty.find({ text: /No tool calls yet/ })).toBeDefined()
  await empty.unmount()

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'bun test' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u2', file_path: '/work/src/a.ts' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^2 calls · 1 failed$/ })).toBeDefined()
    const rows = await ui.findAll({ type: 'Text', text: /^(Read|Bash) / })
    expect(rows.map(row => row.text)).toEqual(['Read a.ts', 'Bash bun test'])
    expect((await ui.findAll({ type: 'Text', text: /^(40ms|2\.5s)$/ })).map(part => part.text)).toEqual(['40ms', '2.5s'])
    expect((await ui.findAll({ type: 'Text', text: /^[✓✗]$/ })).map(part => part.text)).toEqual(['✗', '✓'])
    await ui.unmount()
  }

  for (let call = 0; call < 8; call += 1) {
    await $.tool.call({ tool: 'Glob', tool_use_id: `g${call}`, pattern: '*.ts' })
  }
  const full = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await full.find({ text: /^10 calls · 1 failed$/ })).toBeDefined()
  expect(await full.findAll({ type: 'Text', text: /^Glob / })).toHaveLength(6)
  await full.unmount()

  expect((await $.command.run(run('activity-widget', 'clear'))).text).toMatch(/cleared/)
  expect((await $.command.run(run('activity-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('activity-widget', 'off'))).text).toMatch(/off/)
})

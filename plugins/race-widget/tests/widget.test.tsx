import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'race-widget',
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
        picture: async ({ surface, key, columns, rows, marks }) => {
          if (surface !== 'terminal') return { type: 'Text' as const, children: ['no picture'] }

          const blank = String.fromCharCode(32, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1)
          const sum = [...JSON.stringify(marks)].reduce((held, letter) => (held * 31 + letter.charCodeAt(0)) % 0xffffff, 7)
          const first = String.fromCharCode(32, 0, 0, 0, sum & 255, (sum >> 8) & 255, sum >> 16, 0, 0, 0, 0, 1)

          return {
            type: 'Raster',
            props: {
              key,
              columns: Math.ceil(columns / 2),
              rows: Math.ceil(rows / 2),
              cells: btoa(first + blank.repeat(Math.ceil(columns / 2) * Math.ceil(rows / 2) - 1)),
            },
          } as never
        },
      },
    }))
    on('command.run', { command: 'place' }, async ($, e) => {
      await $.state.set({ plugin: 'widgets', key: 'site' } as const, e.args as 'side')

      return { text: e.args }
    })
  },
}

const done = (agentId: string) =>
  ({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: agentId, reason: 'answer', agentId }) as const

const call = (agentId: string, id: string) =>
  ({ tool: 'Read', tool_use_id: id, file_path: '/x', agentId }) as never

test('races the subagents, one stride per tool call, and ranks them as they finish', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('race-widget', 'on'))).text).toMatch(/Race on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^waiting for agents$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 8 })
  const empty = (await ui.find({ type: 'Raster' }))?.props.cells

  await $.tool.call({ tool: 'Read', tool_use_id: 'main', file_path: '/x' })
  expect((await ui.find({ type: 'Raster' }))?.props.cells).toBe(empty)

  await $.tool.call(call('a1', 'u1'))
  await $.tool.call(call('a2', 'u2'))
  await $.tool.call(call('a2', 'u3'))
  expect(await ui.find({ text: /^2 racing · 0 finished$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(empty)

  await $.turn.complete(done('a2'))
  expect(await ui.find({ text: /^1 racing · 1 finished$/ })).toBeDefined()
  expect(await ui.find({ text: /^1st agent 2$/ })).toBeDefined()

  await $.turn.complete(done('a1'))
  expect(await ui.find({ text: /^1st agent 2 · 2nd agent 1$/ })).toBeDefined()

  await $.tool.call(call('a3', 'u4'))
  expect(await ui.find({ text: /^1 racing · 0 finished$/ })).toBeDefined()

  expect((await $.command.run(run('race-widget', 'clear'))).text).toMatch(/cleared/)
  expect(await ui.find({ text: /^waiting for agents$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('race-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('race-widget', 'off'))).text).toMatch(/off/)
})

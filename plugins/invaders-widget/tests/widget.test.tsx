import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'invaders-widget',
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

test('sends an invader per failing check and shoots one down per passing check', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('tool.call', (_$, e) =>
    e.tool === 'Bash' && e.command.includes('lint')
      ? { result: 'boom', isError: true, text: 'boom' }
      : { result: 'ok', text: 'ok' },
  )
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('invaders-widget', 'on'))).text).toMatch(/Invaders on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^all clear · 0 down$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 9 })
  const empty = (await ui.find({ type: 'Raster' }))?.props.cells

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'bun test' })
  expect(await ui.find({ text: /^all clear · 0 down$/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u2', command: 'bun run lint' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'bun run lint' })
  expect(await ui.find({ text: /^2 invaders · 0 down$/ })).toBeDefined()
  const invaded = (await ui.find({ type: 'Raster' }))?.props.cells
  expect(invaded).not.toBe(empty)

  await clock.advance(300)
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(invaded)

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u4', command: 'bun test' })
  expect(await ui.find({ text: /^1 invader · 1 down$/ })).toBeDefined()

  expect((await $.command.run(run('invaders-widget', 'clear'))).text).toMatch(/cleared/)
  expect(await ui.find({ text: /^all clear · 0 down$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('invaders-widget', 'demo'))).text).toMatch(/one incoming/)
  expect((await $.command.run(run('invaders-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('invaders-widget', 'off'))).text).toMatch(/off/)
})

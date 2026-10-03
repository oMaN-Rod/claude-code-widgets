import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'campfire-widget',
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

test('burns higher with tool calls and dies down on the clock', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('campfire-widget', 'on'))).text).toMatch(/Campfire on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^embers$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 7 })
  const cold = (await ui.find({ type: 'Raster' }))?.props.cells

  for (let call = 0; call < 3; call += 1) {
    await $.tool.call({ tool: 'Read', tool_use_id: `u${call}`, file_path: '/x' })
  }
  expect(await ui.find({ text: /^burning$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(cold)

  expect((await $.command.run(run('campfire-widget', 'stoke'))).text).toMatch(/stoked/)
  expect(await ui.find({ text: /^roaring$/ })).toBeDefined()

  await clock.advance(40_000)
  expect(await ui.find({ text: /^embers$/ })).toBeDefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
  expect(await desktop.find({ text: /^Campfire$/ })).toBeDefined()
  await desktop.unmount()

  expect((await $.command.run(run('campfire-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('campfire-widget', 'off'))).text).toMatch(/off/)
})

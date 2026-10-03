import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'minesweeper-widget',
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

test('reveals on a click, flags on a right click and keeps the wins', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('minesweeper-widget', 'on'))).text).toMatch(/Minesweeper on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const hidden = async () => (await ui.findAll({ in: 'mines', type: 'Text', text: /^░░$/ })).length
  const info = async () => (await ui.find({ in: 'mines', type: 'Text', text: /^mines \d+ / }))?.text ?? ''

  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^0 wins$/ })).toBeDefined()
  expect((await ui.find({ type: 'Client' }))?.props).toMatchObject({ module: expect.stringContaining('mines.tsx') })
  expect(await hidden()).toBe(96)
  expect(await info()).toBe('mines 12 · wins 0 · revealing')

  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'mines' })
  const opened = await hidden()
  expect(opened).toBeLessThan(93)
  expect(opened).toBeGreaterThanOrEqual(12)

  await ui.pointer({ type: 'down', x: 23, y: 7, button: 'right', in: 'mines' })
  expect(await info()).toMatch(/^mines 1[12] /)

  await ui.key({ key: 'f', in: 'mines' })
  expect(await info()).toMatch(/flagging$/)

  await ui.key({ key: 'r', in: 'mines' })
  expect(await hidden()).toBe(96)
  expect(await info()).toBe('mines 12 · wins 0 · revealing')

  await ui.post({ score: 3 }, { in: 'mines' })
  expect(await ui.find({ text: /^3 wins$/ })).toBeDefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ text: /^Minesweeper$/ })).toBeDefined()
  await desktop.unmount()

  expect((await $.command.run(run('minesweeper-widget', 'off'))).text).toMatch(/off/)
  expect((await $.command.run(run('minesweeper-widget', 'fast'))).text).toMatch(/Usage/)
})

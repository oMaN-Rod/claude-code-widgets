import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: '2048-widget',
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

test('plays itself, takes the keys and keeps the best score', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('2048-widget', 'on'))).text).toMatch(/2048 on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^best 0$/ })).toBeDefined()
  expect((await ui.find({ type: 'Client' }))?.props).toMatchObject({ module: expect.stringContaining('tiles.tsx') })
  expect(await ui.find({ in: 'tiles', text: /auto-play/ })).toBeDefined()
  expect(await ui.find({ in: 'tiles', text: /^score 0 / })).toBeDefined()

  await ui.advance(400 * 40)
  const scored = (await ui.find({ in: 'tiles', text: /^score \d+/ }))?.text ?? ''
  expect(Number(/score (\d+)/.exec(scored)?.[1])).toBeGreaterThan(0)

  await ui.key({ key: 'left', in: 'tiles' })
  expect(await ui.find({ in: 'tiles', text: /· (you|game over)$/ })).toBeDefined()

  await ui.post({ score: 512 }, { in: 'tiles' })
  expect(await ui.find({ text: /^best 512$/ })).toBeDefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ text: /^2048$/ })).toBeDefined()
  await desktop.unmount()

  expect((await $.command.run(run('2048-widget', 'off'))).text).toMatch(/off/)
  expect((await $.command.run(run('2048-widget', 'fast'))).text).toMatch(/Usage/)
})

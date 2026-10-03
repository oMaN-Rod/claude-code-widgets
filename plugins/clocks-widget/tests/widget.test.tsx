import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'clocks-widget',
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

test('shows the time in each listed zone and keeps the list', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  const clock = mock.clock(on, { now: Date.UTC(2026, 0, 5, 12, 30) })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('clocks-widget', 'on'))).text).toMatch(/Clocks on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^\d\d:\d\d here$/ })).toBeDefined()
  expect(await ui.find({ text: /^UTC$/ })).toBeDefined()
  expect(await ui.find({ text: /^12:30/ })).toBeDefined()

  expect((await $.command.run(run('clocks-widget', 'add Asia/Tokyo'))).text).toMatch(/Asia\/Tokyo added/)
  expect((await $.command.run(run('clocks-widget', 'add Asia/Tokyo'))).text).toMatch(/already listed/)
  expect((await $.command.run(run('clocks-widget', 'add Mars/Phobos'))).text).toMatch(/not a time zone/)
  expect(await ui.find({ text: /^Tokyo$/ })).toBeDefined()
  expect(await ui.find({ text: /^21:30/ })).toBeDefined()

  await clock.advance(4 * 3_600_000)
  expect(await ui.find({ text: /^16:30/ })).toBeDefined()
  expect(await ui.find({ text: /^01:30/ })).toBeDefined()

  expect((await $.command.run(run('clocks-widget', 'remove tokyo'))).text).toMatch(/Asia\/Tokyo removed/)
  expect((await $.command.run(run('clocks-widget', 'remove tokyo'))).text).toMatch(/not listed/)
  expect(await ui.find({ text: /^Tokyo$/ })).toBeUndefined()

  expect((await $.command.run(run('clocks-widget', 'clear'))).text).toMatch(/cleared/)
  expect(await ui.find({ text: /add Asia\/Tokyo/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('clocks-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('clocks-widget', 'off'))).text).toMatch(/off/)
})

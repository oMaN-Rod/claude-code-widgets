import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: '8ball-widget',
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

test('answers a question and shows it on the card', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('8ball-widget', 'on'))).text).toMatch(/8 ball on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /\/8ball will this deploy cleanly\?/ })).toBeDefined()

  expect((await $.command.run(run('8ball', ''))).text).toMatch(/Usage/)
  const first = (await $.command.run(run('8ball', 'Will the build pass?'))).text ?? ''
  expect(first.length).toBeGreaterThan(3)
  expect(await ui.find({ text: /^Will the build pass\?$/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Text' })).some(part => part.text === first)).toBe(true)

  await clock.advance(1)
  const second = (await $.command.run(run('8ball', 'Will the build pass?'))).text
  expect(second).not.toBe(first)
  await ui.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ text: /^8 Ball$/ })).toBeDefined()
  await desktop.unmount()

  expect((await $.command.run(run('8ball-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('8ball-widget', 'off'))).text).toMatch(/off/)
})

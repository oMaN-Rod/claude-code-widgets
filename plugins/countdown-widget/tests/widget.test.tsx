import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'countdown-widget',
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

test('counts down to a deadline and announces it', { plugins: [LAYOUT] }, async ($, on) => {
  const toasts: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: new Date(2026, 0, 5, 16, 0).getTime() })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('countdown-widget', 'on'))).text).toMatch(/Countdown on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /\/countdown 17:00 standup/ })).toBeDefined()

  expect((await $.command.run(run('countdown', 'soon'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('countdown', '25:00'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('countdown', '17:00 the standup'))).text).toBe('Counting down 1h 00m 00s to the standup.')
  expect(await ui.find({ text: /^the standup$/ })).toBeDefined()
  expect(await ui.find({ text: /^1h 00m 00s$/ })).toBeDefined()
  expect(await ui.find({ text: /^until 17:00$/ })).toBeDefined()

  await clock.advance(30 * 60_000)
  expect(await ui.find({ text: /^30m 00s$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^█+$/ }))?.text).toHaveLength(18)

  await clock.advance(31 * 60_000)
  expect(await ui.find({ text: /^reached 1m 00s ago$/ })).toBeDefined()
  expect(toasts).toEqual(['Time: the standup'])

  expect((await $.command.run(run('countdown', '2m'))).text).toBe('Counting down 2m 00s.')
  expect(await ui.find({ text: /^2m 00s$/ })).toBeDefined()

  expect((await $.command.run(run('countdown-widget', 'clear'))).text).toMatch(/cleared/)
  expect(await ui.find({ text: /\/countdown 17:00 standup/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('countdown-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('countdown-widget', 'off'))).text).toMatch(/off/)
})

import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'pomodoro-widget',
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

test('counts a focus session down, announces its end and counts it', { plugins: [LAYOUT] }, async ($, on) => {
  const toasts: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('pomodoro-widget', 'on'))).text).toMatch(/Pomodoro on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^idle$/ })).toBeDefined()
  expect(await ui.find({ text: /^0 focus sessions done$/ })).toBeDefined()

  expect((await $.command.run(run('pomodoro-widget', '2'))).text).toMatch(/Focus for 2 minutes/)
  expect(await ui.find({ text: /^focus$/ })).toBeDefined()
  expect(await ui.find({ text: /^02:00$/ })).toBeDefined()

  await clock.advance(60_000)
  expect(await ui.find({ text: /^01:00$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^█+$/ }))?.text).toHaveLength(18)

  await clock.advance(61_000)
  expect(await ui.find({ text: /^idle$/ })).toBeDefined()
  expect(await ui.find({ text: /^1 focus session done$/ })).toBeDefined()
  expect(toasts).toEqual(['Focus session done. Take a break.'])

  expect((await $.command.run(run('pomodoro-widget', 'break'))).text).toMatch(/Break for 5 minutes/)
  expect(await ui.find({ text: /^break$/ })).toBeDefined()
  expect((await $.command.run(run('pomodoro-widget', 'stop'))).text).toMatch(/stopped/)
  expect(await ui.find({ text: /^idle$/ })).toBeDefined()
  expect(await ui.find({ text: /^1 focus session done$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('pomodoro-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('pomodoro-widget', 'off'))).text).toMatch(/off/)
})

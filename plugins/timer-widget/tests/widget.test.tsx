import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'timer-widget',
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

const done = (turnId: string, durationMs: number) =>
  ({ answer: 'ok', durationMs, isAborted: false, turnId, reason: 'answer' }) as const

test('times the running turn and charts the finished ones', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('timer-widget', 'on'))).text).toMatch(/on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^idle$/ })).toBeDefined()
  expect(await ui.find({ text: /No finished turns yet/ })).toBeDefined()

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(5000)
  expect(await ui.find({ text: /^turn 5s$/ })).toBeDefined()

  await $.turn.complete(done('t1', 10_000))
  await $.turn.complete({ ...done('sub', 99_000), agentId: 'a1' })
  expect(await ui.find({ text: /^idle$/ })).toBeDefined()
  expect(await ui.find({ text: /^last 10s · avg 10s · longest 10s$/ })).toBeDefined()

  await $.turn.start({ text: 'go', turnId: 't2' })
  await $.turn.complete(done('t2', 80_000))
  expect(await ui.find({ text: /^last 1m 20s · avg 45s · longest 1m 20s$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^[▁▂▃▄▅▆▇█]+$/ }))?.text).toBe('▂█')
  await ui.unmount()

  expect((await $.command.run(run('timer-widget', 'clear'))).text).toMatch(/cleared/)
  expect((await $.command.run(run('timer-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('timer-widget', 'off'))).text).toMatch(/off/)
})

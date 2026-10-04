import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'forecast-widget',
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

const done = (turnId: string) => ({ answer: 'ok', durationMs: 1000, isAborted: false, turnId, reason: 'answer' }) as const

test('charts context growth and predicts the turns left', { plugins: [LAYOUT] }, async ($, on) => {
  let percent = 10
  const toasts: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, tokens: percent * 2000, percent }, rateLimits: [] },
  }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('forecast-widget', 'on'))).text).toMatch(/Forecast on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^context 10%$/ })).toBeDefined()
  expect(await ui.find({ text: /^no trend yet$/ })).toBeDefined()

  for (const next of [20, 30, 40]) {
    percent = next
    await $.turn.complete(done(`t${next}`))
  }
  await $.turn.complete({ ...done('sub'), agentId: 'a1' })
  expect(await ui.find({ text: /^context 40%$/ })).toBeDefined()
  expect(await ui.find({ text: /^about 6 turns until compaction$/ })).toBeDefined()
  expect(await ui.find({ text: /^\+10\.0% per turn over the last 3$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^[▁▂▃▄▅▆▇█]+$/ }))?.text).toBe('▁▂▃▄')

  expect(toasts).toEqual([])
  for (const next of [55, 70, 85]) {
    percent = next
    await $.turn.complete(done(`t${next}`))
  }
  expect(toasts).toEqual(['Forecast: about 2 turns until compaction at this pace. /compact now, while you can still say what to keep.'])

  percent = 12
  await $.turn.complete(done('compacted'))
  expect(await ui.find({ text: /^context 12%$/ })).toBeDefined()
  expect(await ui.find({ text: /^no trend yet$/ })).toBeDefined()

  expect((await $.command.run(run('forecast-widget', 'clear'))).text).toMatch(/cleared/)
  expect(await ui.find({ text: /No turns measured yet/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('forecast-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('forecast-widget', 'off'))).text).toMatch(/off/)
})

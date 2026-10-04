import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'stream-widget',
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

test('measures how fast text arrives while a step streams', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  const clock = mock.clock(on, { now: 1000 })
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: 'x'.repeat(400) } as never
    await clock.advance(500)
    yield { kind: 'thinking', index: 1, text: 'y'.repeat(200) } as never
    await clock.advance(500)

    return { turnId: e.turnId, index: e.index, text: 'x', answer: 'x', toolUses: [] } as never
  })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('stream-widget', 'on'))).text).toMatch(/Stream on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^idle$/ })).toBeDefined()
  expect(await ui.find({ text: /Nothing streamed yet/ })).toBeDefined()

  await $.turn.start({ text: 'go', turnId: 't1' })
  const kinds: string[] = []
  for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'test', messageCount: 1 })) {
    kinds.push(chunk.kind)
  }
  expect(kinds).toEqual(['text', 'thinking'])

  expect(await ui.find({ text: /^idle$/ })).toBeDefined()
  expect(await ui.find({ text: /^~150 tokens this turn, peak ~200\/s$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^[▁▂▃▄▅▆▇█]+$/ }))?.text.startsWith('█▅')).toBe(true)

  await $.turn.start({ text: 'go', turnId: 't2' })
  expect(await ui.find({ text: /^~0 tokens this turn, peak ~0\/s$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('stream-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('stream-widget', 'off'))).text).toMatch(/off/)
})

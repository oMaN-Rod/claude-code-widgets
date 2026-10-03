import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'usage-widget',
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

const RUN = {
  command: 'usage-widget',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

const NOW = Date.parse('2026-10-03T12:00:00Z')

const USAGE = {
  startedAt: 0,
  context: { window: 200_000 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 25, resetsAt: '2026-10-03T14:30:00Z' },
    { kind: 'seven_day', percentUsed: 50 },
  ],
  cost: { usd: 1.5 },
}

const place = (args: string) =>
  ({
    command: 'place',
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

test('draws one bar per rate-limit window once toggled on', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  mock.clock(on, { now: NOW })
  mock.store(on)

  await $.command.run(place('side'))

  expect((await $.command.run(RUN)).text).toMatch(/on/)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /5-hour 25% · resets in 2h 30m/ })).toBeDefined()
    expect(await ui.find({ text: /7-day 50%$/ })).toBeDefined()
    expect(await ui.find({ text: /\$1\.50 this session/ })).toBeDefined()

    const filled = await ui.findAll({ type: 'Text', text: /^█{2,}$/ })
    expect(filled.map(part => part.text.length)).toEqual([9, 18])
    await ui.unmount()
  }

  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 75 }],
    changed: ['rateLimits'],
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /5-hour 75%$/ })).toBeDefined()
  expect(await ui.find({ text: /7-day/ })).toBeUndefined()
  await ui.unmount()

  expect((await $.command.run(RUN)).text).toMatch(/off/)
  const off = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await off.find({ text: /Usage/ })).toBeUndefined()
})

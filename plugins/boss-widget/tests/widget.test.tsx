import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'boss-widget',
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
        picture: async ({ surface, key, columns, rows, marks }) => {
          if (surface !== 'terminal') return { type: 'Text' as const, children: ['no picture'] }

          const blank = String.fromCharCode(32, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1)
          const sum = [...JSON.stringify(marks)].reduce((held, letter) => (held * 31 + letter.charCodeAt(0)) % 0xffffff, 7)
          const first = String.fromCharCode(32, 0, 0, 0, sum & 255, (sum >> 8) & 255, sum >> 16, 0, 0, 0, 0, 1)

          return {
            type: 'Raster',
            props: {
              key,
              columns: Math.ceil(columns / 2),
              rows: Math.ceil(rows / 2),
              cells: btoa(first + blank.repeat(Math.ceil(columns / 2) * Math.ceil(rows / 2) - 1)),
            },
          } as never
        },
      },
    }))
    on('command.run', { command: 'place' }, async ($, e) => {
      await $.state.set({ plugin: 'widgets', key: 'site' } as const, e.args as 'side')

      return { text: e.args }
    })
  },
}

const measured = (percent: number) => ({
  context: { window: 200_000, tokens: percent * 2000, percent },
  rateLimits: [],
  changed: ['context' as const],
})

test('wears the boss down as context fills and levels up on compaction', { plugins: [LAYOUT] }, async ($, on) => {
  const toasts: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, tokens: 20_000, percent: 10 }, rateLimits: [] },
  }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('boss-widget', 'on'))).text).toMatch(/Boss on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^Boss Lv 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^HP 90%$/ })).toBeDefined()
  expect(await ui.find({ text: /^unbothered$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 7, rows: 5 })

  await $.session.measure(measured(82))
  expect(await ui.find({ text: /^HP 18%$/ })).toBeDefined()
  expect(await ui.find({ text: /^one hit left$/ })).toBeDefined()

  await $.session.measure(measured(12))
  expect(await ui.find({ text: /^Boss Lv 2$/ })).toBeDefined()
  expect(await ui.find({ text: /^defeated!$/ })).toBeDefined()
  expect(toasts).toEqual(['The Context Window is down. Level 2 begins.'])

  await clock.advance(9000)
  expect(await ui.find({ text: /^HP 88%$/ })).toBeDefined()
  expect(await ui.find({ text: /^unbothered$/ })).toBeDefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
  expect(await desktop.find({ text: /^HP 88%$/ })).toBeDefined()
  await desktop.unmount()

  expect((await $.command.run(run('boss-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('boss-widget', 'off'))).text).toMatch(/off/)
})

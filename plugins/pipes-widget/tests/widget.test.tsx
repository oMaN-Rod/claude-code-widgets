import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'pipes-widget',
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

const done = (turnId: string) => ({ answer: 'ok', durationMs: 1000, isAborted: false, turnId, reason: 'answer' }) as const

test('lays pipe while the session is idle and pauses during a turn', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('pipes-widget', 'on'))).text).toMatch(/Pipes on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const cells = async () => (await ui.find({ type: 'Raster' }))?.props.cells

  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^0 segments$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 9 })
  const blank = await cells()

  await clock.advance(1000)
  expect(await ui.find({ text: /^10 segments$/ })).toBeDefined()
  const grown = await cells()
  expect(grown).not.toBe(blank)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(1000)
  expect(await ui.find({ text: /^paused while Claude works$/ })).toBeDefined()
  expect(await cells()).toBe(grown)

  await $.turn.complete(done('t1'))
  await clock.advance(500)
  expect(await ui.find({ text: /^15 segments$/ })).toBeDefined()

  await clock.advance(100 * 400)
  expect(await ui.find({ text: /^\d+ segments$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('pipes-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('pipes-widget', 'off'))).text).toMatch(/off/)
})

import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'coffee-widget',
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

test('empties over the session, nudges for a break and refills', { plugins: [LAYOUT] }, async ($, on) => {
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
  expect((await $.command.run(run('coffee-widget', 'on'))).text).toMatch(/Coffee on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^100% left$/ })).toBeDefined()
  expect(await ui.find({ text: /^90m until a break$/ })).toBeDefined()
  expect(await ui.find({ text: /^1 cups this session$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 9, rows: 7 })
  const full = (await ui.find({ type: 'Raster' }))?.props.cells

  await clock.advance(45 * 60_000)
  expect(await ui.find({ text: /^50% left$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(full)

  await clock.advance(46 * 60_000)
  expect(await ui.find({ text: /^empty$/ })).toBeDefined()
  expect(await ui.find({ text: /^Take a break\.$/ })).toBeDefined()
  expect(toasts).toEqual(['The cup is empty. Time for a break.'])

  expect((await $.command.run(run('coffee-widget', '30'))).text).toMatch(/lasts 30 minutes/)
  expect(await ui.find({ text: /^30m until a break$/ })).toBeDefined()
  expect(await ui.find({ text: /^2 cups this session$/ })).toBeDefined()
  expect((await $.command.run(run('coffee-widget', 'refill'))).text).toBe('Cup refilled.')
  expect(await ui.find({ text: /^3 cups this session$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('coffee-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('coffee-widget', 'off'))).text).toMatch(/off/)
})

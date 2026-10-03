import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const BAND = {
  plugin: 'aquarium-widget',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const run = (command: string, args = '') =>
  ({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
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

test('adds a fish while a tool call runs and animates on the clock', { plugins: [LAYOUT] }, async ($, on) => {
  let finish: (() => void) | undefined

  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('tool.call', async () => {
    await new Promise<void>(resolve => {
      finish = resolve
    })

    return { result: 'ok', text: 'ok' }
  })
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'above'))
  expect((await $.command.run(run('aquarium-widget', 'on'))).text).toMatch(/Aquarium on/)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /^all quiet$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 6 })
  const still = (await ui.find({ type: 'Raster' }))?.props.cells

  await clock.advance(400)
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(still)

  const call = $.tool.call({ tool: 'Agent', tool_use_id: 'u1', description: 'd', prompt: 'p' })
  await clock.settle()
  expect(await ui.find({ text: /^1 agents · 0 tools running$/ })).toBeDefined()
  finish?.()
  await call
  expect(await ui.find({ text: /^all quiet$/ })).toBeDefined()

  await $.command.run(run('aquarium-widget', 'demo'))
  expect(await ui.find({ text: /^2 agents · 3 tools running$/ })).toBeDefined()
  await clock.advance(31_000)
  expect(await ui.find({ text: /^all quiet$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('aquarium-widget', 'off'))).text).toMatch(/off/)
})

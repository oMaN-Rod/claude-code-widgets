import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'constellation-widget',
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

test('adds a star per turn and names the constellation when it is full', { plugins: [LAYOUT] }, async ($, on) => {
  const toasts: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('constellation-widget', 'on'))).text).toMatch(/Constellation on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^0\/9 stars · 0 charted$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 8 })
  const empty = (await ui.find({ type: 'Raster' }))?.props.cells

  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/x' })
  await $.turn.complete(done('t1'))
  await $.turn.complete({ ...done('sub'), agentId: 'a1' })
  expect(await ui.find({ text: /^1\/9 stars · 0 charted$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(empty)

  for (let turn = 2; turn <= 9; turn += 1) await $.turn.complete(done(`t${turn}`))
  expect(await ui.find({ text: /^9\/9 stars · 1 charted$/ })).toBeDefined()
  expect(toasts).toEqual(['Constellation charted: The Lesser Linter'])

  await $.turn.complete(done('t10'))
  expect(await ui.find({ text: /^1\/9 stars · 1 charted$/ })).toBeDefined()

  expect((await $.command.run(run('constellation-widget', 'clear'))).text).toMatch(/cleared/)
  expect((await ui.find({ type: 'Raster' }))?.props.cells).toBe(empty)
  await ui.unmount()

  expect((await $.command.run(run('constellation-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('constellation-widget', 'off'))).text).toMatch(/off/)
})

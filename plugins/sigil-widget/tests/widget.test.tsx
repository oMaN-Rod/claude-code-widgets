import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'sigil-widget',
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

test('draws an emblem from the session and keeps one per session', { plugins: [LAYOUT] }, async ($, on) => {
  const data: Record<string, unknown> = { gallery: [{ id: 5, seed: 12345, calls: 40 }] }

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', (_$, e) =>
    e.tool === 'Read' ? { result: 'boom', isError: true, text: 'boom' } : { result: 'ok', text: 'ok' },
  )
  on('store.get', (_$, e) => ({ value: data[e.key] }))
  on('store.set', (_$, e) => {
    data[e.key] = e.value

    return { value: undefined }
  })
  mock.clock(on, { now: 9000 })

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('sigil-widget', 'on'))).text).toMatch(/Sigil on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^1 kept$/ })).toBeDefined()
  expect(await ui.find({ text: /^this session: 0 calls · 0 turns · 0 failures$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 8 })
  const blank = (await ui.find({ type: 'Raster' }))?.props.cells

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'ls' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u2', file_path: '/x' })
  expect(await ui.find({ text: /^this session: 2 calls · 0 turns · 1 failures$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(blank)

  await $.turn.complete(done('t1'))
  await $.turn.complete(done('t2'))
  const kept = data.gallery as { id: number; calls: number }[]
  expect(kept.map(entry => [entry.id, entry.calls])).toEqual([[5, 40], [9000, 2]])
  expect(await ui.find({ text: /^1 kept$/ })).toBeDefined()

  expect((await $.command.run(run('sigil-widget', 'clear'))).text).toMatch(/cleared/)
  expect(await ui.find({ text: /^0 kept$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('sigil-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('sigil-widget', 'off'))).text).toMatch(/off/)
})

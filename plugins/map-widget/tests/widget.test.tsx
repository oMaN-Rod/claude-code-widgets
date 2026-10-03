import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'map-widget',
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

const ran = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

test('maps the tracked files and lights up the ones read and edited', { plugins: [LAYOUT] }, async ($, on) => {
  let isRepo = true

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.run', () =>
    isRepo ? ran(0, ['README.md', 'src/a.ts', 'src/b.ts', 'src/c.ts', 'tests/a.test.ts'].join('\n')) : ran(128, ''),
  )
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  mock.store(on)

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('map-widget', 'on'))).text).toMatch(/Map on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^5 files$/ })).toBeDefined()
  expect(await ui.find({ text: /^■ 0 read ■ 0 edited$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 8 })
  const untouched = (await ui.find({ type: 'Raster' }))?.props.cells

  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/work/src/a.ts' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u2', file_path: '/work/src/a.ts' })
  expect(await ui.find({ text: /^■ 1 read ■ 0 edited$/ })).toBeDefined()
  const afterRead = (await ui.find({ type: 'Raster' }))?.props.cells
  expect(afterRead).not.toBe(untouched)

  await $.tool.call({ tool: 'Edit', tool_use_id: 'u3', file_path: '/work/src/b.ts', old_string: 'a', new_string: 'b' })
  expect(await ui.find({ text: /^■ 1 read ■ 1 edited$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(afterRead)

  expect((await $.command.run(run('map-widget', 'clear'))).text).toMatch(/cleared/)
  expect((await ui.find({ type: 'Raster' }))?.props.cells).toBe(untouched)
  await ui.unmount()

  isRepo = false
  await $.command.run(run('map-widget', 'off'))
  await $.command.run(run('map-widget', 'on'))
  const none = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await none.find({ text: /Not a git repository/ })).toBeDefined()
  await none.unmount()

  expect((await $.command.run(run('map-widget', 'sideways'))).text).toMatch(/Usage/)
})

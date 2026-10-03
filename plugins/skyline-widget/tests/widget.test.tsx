import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const BAND = {
  plugin: 'skyline-widget',
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
    on('command.run', { command: 'place' }, async ($, e) => {
      await $.state.set({ plugin: 'widgets', key: 'site' } as const, e.args as 'side')

      return { text: e.args }
    })
  },
}

test('adds a building per turn and a floor per tool call', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', (_$, e) =>
    e.tool === 'Bash' ? { result: 'boom', isError: true, text: 'boom' } : { result: 'ok', text: 'ok' },
  )
  mock.store(on)

  await $.command.run(run('place', 'above'))
  expect((await $.command.run(run('skyline-widget', 'on'))).text).toMatch(/Skyline on/)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /^0 turns · 0 tool calls$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 6 })
  const empty = (await ui.find({ type: 'Raster' }))?.props.cells

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/x' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u2', command: 'false' })
  expect(await ui.find({ text: /^1 turns · 2 tool calls$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(empty)

  await $.command.run(run('skyline-widget', 'demo'))
  expect(await ui.find({ text: /^9 turns · 42 tool calls$/ })).toBeDefined()
  await $.command.run(run('skyline-widget', 'clear'))
  expect(await ui.find({ text: /^0 turns · 0 tool calls$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('skyline-widget', 'off'))).text).toMatch(/off/)
  expect((await $.command.run(run('skyline-widget', 'tall'))).text).toMatch(/Usage/)
})

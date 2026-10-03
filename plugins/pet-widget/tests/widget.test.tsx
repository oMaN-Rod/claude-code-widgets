import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const BAND = {
  plugin: 'pet-widget',
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

test('draws the pet and follows the session mood', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'boom', isError: true, text: 'boom' }))
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'above'))
  expect((await $.command.run(run('pet-widget', 'on'))).text).toMatch(/Pet on/)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 16, rows: 7 })
  expect(await ui.find({ text: /^idle$/ })).toBeDefined()

  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await ui.find({ text: /^work$/ })).toBeDefined()

  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/x' })
  expect(await ui.find({ text: /^dizzy$/ })).toBeDefined()
  expect(await ui.find({ text: /Read failed/ })).toBeDefined()

  await clock.advance(7000)
  expect(await ui.find({ text: /^work$/ })).toBeDefined()

  expect((await $.command.run(run('pet-widget', 'happy'))).text).toMatch(/happy/)
  expect(await ui.find({ text: /^happy$/ })).toBeDefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
  expect(await desktop.find({ text: /Clawd/ })).toBeDefined()
  await desktop.unmount()

  expect((await $.command.run(run('pet-widget', 'off'))).text).toMatch(/off/)
  expect((await $.command.run(run('pet-widget', 'purple'))).text).toMatch(/Usage/)
})

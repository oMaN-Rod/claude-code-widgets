import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const BAND = {
  plugin: 'weather-widget',
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

test('turns context usage into a forecast', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000, tokens: 20_000, percent: 10 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 23 }],
    },
  }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'above'))
  expect((await $.command.run(run('weather-widget', 'on'))).text).toMatch(/Weather on/)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /^context 10%$/ })).toBeDefined()
  expect(await ui.find({ text: /^Clear skies$/ })).toBeDefined()
  expect(await ui.find({ text: /limits 5h 23%/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 5 })

  await $.session.measure({
    context: { window: 200_000, tokens: 164_000, percent: 82 },
    rateLimits: [],
    changed: ['context'],
  })
  expect(await ui.find({ text: /^Rain: the window is filling$/ })).toBeDefined()

  await $.command.run(run('weather-widget', '95'))
  expect(await ui.find({ text: /^Storm: compaction is close$/ })).toBeDefined()
  await $.command.run(run('weather-widget', 'live'))
  expect(await ui.find({ text: /^context 10%$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('weather-widget', 'off'))).text).toMatch(/off/)
  expect((await $.command.run(run('weather-widget', 'snow'))).text).toMatch(/Usage/)
})

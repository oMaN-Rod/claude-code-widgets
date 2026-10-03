import type { SessionUsage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'context-widget',
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

const BAND = {
  plugin: 'context-widget',
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
        picture: async () => ({ type: 'Text' as const, children: ['no picture'] }),
      },
    }))
    on('command.run', { command: 'place' }, async ($, e) => {
      await $.state.set({ plugin: 'widgets', key: 'site' } as const, e.args as 'side')

      return { text: e.args }
    })
  },
}

const row = (name: string, tokens: number, color: string, kind: 'used' | 'free' | 'buffer' | 'deferred') => ({
  name,
  tokens,
  color,
  kind,
  isDeferred: kind === 'deferred',
})

const USAGE: SessionUsage = {
  startedAt: 0,
  rateLimits: [],
  context: {
    window: 200_000,
    breakdown: {
      categories: [
        row('System prompt', 20_000, 'promptBorder', 'used'),
        row('Messages', 60_000, 'permission', 'used'),
        row('MCP tools (deferred)', 9_000, 'inactive', 'deferred'),
        row('Free space', 100_000, 'inactive', 'free'),
        row('Autocompact buffer', 20_000, 'inactive', 'buffer'),
      ],
      totalTokens: 80_000,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      autocompactSource: 'auto',
      percentage: 40,
      gridRows: [],
      model: 'test-model',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
}

test('draws its card where the layout mod places the widgets', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('session.usage', () => ({ value: USAGE }))
  mock.store(on)

  await $.command.run(run('place', 'side'))
  const idle = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await idle.find({ text: /System prompt/ })).toBeUndefined()
  await idle.unmount()

  expect((await $.command.run(run('context-widget'))).text).toMatch(/on/)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /80\.0k\/200\.0k \(40%\)/ })).toBeDefined()
    expect(await ui.find({ text: /deferred/ })).toBeUndefined()

    const bar = await ui.findAll({ type: 'Text', text: /^[█▒░]{2,}$/ })
    expect(bar).toHaveLength(4)
    expect(bar.reduce((cells, part) => cells + part.text.length, 0)).toBe(36)
    await ui.unmount()

    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ text: /System prompt/ })).toBeUndefined()
    await band.unmount()
  }

  await $.command.run(run('place', 'above'))
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ text: /Messages 30%/ })).toBeDefined()
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ text: /System prompt/ })).toBeUndefined()
  await pane.unmount()

  expect((await $.command.run(run('context-widget'))).text).toMatch(/off/)
})

test('draws each view mode at its own height', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('session.usage', () => ({ value: USAGE }))
  mock.store(on)

  await $.command.run(run('place', 'above'))

  const drawn = async (view: string) => {
    expect((await $.command.run(run('context-widget', view))).text).toMatch(view)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const found = {
      names: (await ui.findAll({ type: 'Text', text: /^. (System prompt|Free space)$/ })).length,
      short: (await ui.findAll({ type: 'Text', text: /^. (System|Free|Buffer)$/ })).length,
      top: await ui.find({ type: 'Text', text: /Messages 30%.*System 10%/ }),
      cells: (await ui.findAll({ type: 'Text', text: /^[█▒░]{2,}$/ })).reduce(
        (cells, part) => cells + part.text.length,
        0,
      ),
      isFramed: (await ui.findAll({ type: 'Box' })).some(box => box.props.borderStyle === 'round'),
    }
    await ui.unmount()

    return found
  }

  expect(await drawn('detailed')).toMatchObject({ names: 2, short: 0, cells: 36, isFramed: true })
  expect(await drawn('grid')).toMatchObject({ names: 0, short: 3, cells: 36, isFramed: true })
  expect(await drawn('bar')).toMatchObject({ names: 0, short: 0, top: undefined, cells: 36 })
  expect(await drawn('line')).toMatchObject({ cells: 20, isFramed: false })
  expect((await drawn('top')).top).toBeDefined()
  expect((await drawn('auto')).top).toBeDefined()

  const docked = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await docked.find({ text: /System prompt/ })).toBeUndefined()
  await docked.unmount()

  await $.command.run(run('place', 'side'))
  const side = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await side.find({ text: /System prompt/ })).toBeDefined()
  await side.unmount()

  expect((await $.command.run(run('context-widget', 'sideways'))).text).toMatch(/Usage/)
})

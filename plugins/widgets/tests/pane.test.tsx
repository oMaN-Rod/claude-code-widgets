import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'widgets',
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

const PROBE: Plugin = {
  name: 'probe',
  register(on) {
    on('command.run', { command: 'site' }, async $ => {
      const { value } = await $.state.get({ plugin: 'widgets', key: 'site' } as const)

      return { text: String(value) }
    })
  },
}

const run = (args: string, command = 'widgets', isFullscreen = true) =>
  ({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen, columns: 160 },
  }) as const

test('moves the widgets between the pane, the band and the hint row', { plugins: [PROBE] }, async ($, on) => {
  const open: { id: string; columns?: number }[] = []

  on('ui.panes', () => ({
    value: open.map(pane => ({
      id: pane.id,
      title: 'Widgets',
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }))
  on('ui.open', (_$, e) => {
    open.splice(0, open.length, { id: e.id, columns: e.columns })

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    open.splice(0, open.length, ...open.filter(pane => pane.id !== e.id))

    return { value: undefined }
  })
  mock.store(on)

  const site = async () => (await $.command.run(run('', 'site'))).text

  expect((await $.command.run(run(''))).text).toMatch(/beside the transcript \(44 columns\)/)
  expect(open).toEqual([{ id: 'widgets', columns: 44 }])
  expect(await site()).toBe('side')

  expect((await $.command.run(run('above'))).text).toMatch(/above the prompt/)
  expect(open).toEqual([])
  expect(await site()).toBe('above')

  expect((await $.command.run(run(''))).text).toMatch(/hidden/)
  expect(await site()).toBe('off')

  expect((await $.command.run(run(''))).text).toMatch(/above the prompt/)
  expect(await site()).toBe('above')

  expect((await $.command.run(run('below'))).text).toMatch(/below the prompt/)
  expect(await site()).toBe('below')

  expect((await $.command.run(run('60'))).text).toMatch(/\(60 columns\)/)
  expect(open).toEqual([{ id: 'widgets', columns: 60 }])

  expect(await site()).toBe('side')

  expect((await $.command.run(run('side', 'widgets', false))).text).toMatch(/below the prompt; they dock/)
  expect(open).toEqual([])
  expect(await site()).toBe('below')

  expect((await $.command.run(run('', 'widgets', false))).text).toMatch(/hidden/)
  expect((await $.command.run(run('', 'widgets', false))).text).toMatch(/below the prompt; they dock/)
  expect(open).toEqual([])

  expect((await $.command.run(run('sideways'))).text).toMatch(/Usage/)
})

test('hints at the widget commands until a widget draws', async ($, on) => {
  let isStacked = false

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return isStacked ? (
      <Box key="widgets-stack">
        <Text>a card</Text>
      </Box>
    ) : (
      <Text>nothing</Text>
    )
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    isStacked = false
    const empty = await $.ui.mount({ ...PANE, surface })
    expect(await empty.find({ text: /\/context-widget/ })).toBeDefined()
    await empty.unmount()

    isStacked = true
    const full = await $.ui.mount({ ...PANE, surface })
    expect(await full.find({ text: /^a card$/ })).toBeDefined()
    expect(await full.find({ text: /\/context-widget/ })).toBeUndefined()
    await full.unmount()
  }
})

const HINT = {
  plugin: 'widgets',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

for (const isFullscreen of [true, false]) {
  test(`restores the saved side placement in a ${isFullscreen ? 'fullscreen' : 'default'} session`, { plugins: [PROBE] }, async ($, on) => {
    const opened: string[] = []

    on('ui.render', { component: 'PromptHint' }, ($, e) => {
      const { Text } = $.ui.resolve(e)

      return <Text>{e.props.hint}</Text>
    })
    on('ui.panes', () => ({ value: [] }))
    on('ui.open', (_$, e) => {
      opened.push(e.id)

      return { value: { isPlaced: true } }
    })
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    const clock = mock.clock(on, { now: 1000 })
    mock.store(on, { site: isFullscreen ? 'side' : 'below', last: 'side' })

    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({
      ...HINT,
      surface: 'terminal',
      viewport: { columns: 160, rows: 45, isFullscreen },
    })
    await clock.advance(1000)

    expect((await $.command.run(run('', 'site'))).text).toBe(isFullscreen ? 'side' : 'below')
    expect(opened).toEqual(isFullscreen ? ['widgets'] : [])
    await ui.unmount()
  })
}

test('restores a saved placement above the prompt as it was', { plugins: [PROBE] }, async ($, on) => {
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  mock.clock(on, { now: 1000 })
  mock.store(on, { site: 'above', last: 'above' })

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

  expect((await $.command.run(run('', 'site'))).text).toBe('above')
})

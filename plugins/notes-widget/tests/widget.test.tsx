import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'notes-widget',
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
        picture: async () => ({ type: 'Text' as const, children: ['no picture'] }),
      },
    }))
    on('command.run', { command: 'place' }, async ($, e) => {
      await $.state.set({ plugin: 'widgets', key: 'site' } as const, e.args as 'side')

      return { text: e.args }
    })
  },
}

test('pins notes, removes them by number and restores them', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  mock.store(on, { notes: ['Kept from before'] })

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run(run('place', 'side'))

  expect((await $.command.run(run('note', 'Ship the release'))).text).toMatch(/Pinned as note 2/)
  expect((await $.command.run(run('note', 'Call Ana back'))).text).toMatch(/Pinned as note 3/)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^3 pinned$/ })).toBeDefined()
    const rows = await ui.findAll({ type: 'Text', text: /^(Kept|Ship|Call)/ })
    expect(rows.map(row => row.text)).toEqual(['Kept from before', 'Ship the release', 'Call Ana back'])
    await ui.unmount()
  }

  expect((await $.command.run(run('note', 'done 1'))).text).toMatch(/Note 1 removed/)
  expect((await $.command.run(run('note', 'done 9'))).text).toMatch(/no note 9/)
  expect((await $.command.run(run('note', ''))).text).toMatch(/Usage/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^2 pinned$/ })).toBeDefined()
  expect(await ui.find({ text: /Kept from before/ })).toBeUndefined()
  await ui.unmount()

  expect((await $.command.run(run('notes-widget', 'clear'))).text).toMatch(/cleared/)
  const cleared = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await cleared.find({ text: /Nothing pinned/ })).toBeDefined()
  await cleared.unmount()

  expect((await $.command.run(run('notes-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('notes-widget', 'off'))).text).toMatch(/off/)
})

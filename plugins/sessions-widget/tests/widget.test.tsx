import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'sessions-widget',
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

const ran = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

test('lists this session beside the others that checked in recently', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('process.run', () => ran(0, 'main\n'))
  const clock = mock.clock(on, { now: 100_000 })
  const data: Record<string, unknown> = {
    peers: [
      { id: 'other', cwd: '/work/api', branch: 'feature', isBusy: true, at: 95_000 },
      { id: 'gone', cwd: '/work/old', branch: 'main', isBusy: false, at: 1000 },
    ],
  }
  on('store.get', (_$, e) => ({ value: data[e.key] }))
  on('store.set', (_$, e) => {
    data[e.key] = e.value

    return { value: undefined }
  })

  await $.session.start({ cwd: 'C:\\code\\site', surface: 'terminal', isInteractive: true })
  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('sessions-widget', 'on'))).text).toMatch(/Sessions on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^2 open$/ })).toBeDefined()
  expect(await ui.find({ text: /^site main$/ })).toBeDefined()
  expect(await ui.find({ text: /^here$/ })).toBeDefined()
  expect(await ui.find({ text: /^api feature$/ })).toBeDefined()
  expect(await ui.find({ text: /^busy$/ })).toBeDefined()
  expect(await ui.find({ text: /old/ })).toBeUndefined()

  const kept = data.peers as { id: string; cwd: string }[]
  expect(kept.map(peer => peer.cwd).sort()).toEqual(['/work/api', 'C:\\code\\site'])

  await $.turn.start({ text: 'go', turnId: 't1' })
  const busy = data.peers as { cwd: string; isBusy: boolean }[]
  expect(busy.find(peer => peer.cwd === 'C:\\code\\site')?.isBusy).toBe(true)

  await clock.advance(40_000)
  expect(await ui.find({ text: /^1 open$/ })).toBeDefined()
  expect(await ui.find({ text: /^api feature$/ })).toBeUndefined()
  await ui.unmount()

  expect((await $.command.run(run('sessions-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('sessions-widget', 'off'))).text).toMatch(/off/)
})

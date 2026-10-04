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

test('lists the live sessions from the shared file and relays a line to one', { plugins: [LAYOUT] }, async ($, on) => {
  const sent: string[] = []
  let file = JSON.stringify([
    { id: 'other', cwd: '/work/api', branch: 'feature', isBusy: false, at: 95_000, since: 95_000 - 12 * 60_000 },
    { id: 'gone', cwd: '/work/old', branch: 'main', isBusy: false, at: 1000 },
  ])

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'mine' }))
  on('session.send', (_$, e) => {
    sent.push(`${e.to}:${e.text}`)

    return e.text.includes('fail') ? { isDelivered: false as const, reason: 'no such session' } : { isDelivered: true as const }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('process.run', () => ran(0, 'main\n'))
  on('fs.read', (_$, e) => {
    expect(e.path.replaceAll('\\', '/')).toMatch(/sessions-widget\/\.sessions\.json$/)

    return { value: file }
  })
  on('fs.write', (_$, e) => {
    file = e.text

    return { value: undefined }
  })
  mock.store(on)
  const clock = mock.clock(on, { now: 100_000 })
  const kept = () => JSON.parse(file) as { id: string; cwd: string; isBusy: boolean }[]

  await $.session.start({ cwd: 'C:\\code\\site', surface: 'terminal', isInteractive: true })
  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('sessions-widget', 'on'))).text).toMatch(/Sessions on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^2 open$/ })).toBeDefined()
  expect(await ui.find({ text: /^site main$/ })).toBeDefined()
  expect(await ui.find({ text: /^here$/ })).toBeDefined()
  expect(await ui.find({ text: /^1 api feature$/ })).toBeDefined()
  expect(await ui.find({ text: /^waiting 12m$/ })).toBeDefined()
  expect(await ui.find({ text: /old/ })).toBeUndefined()
  expect(kept().map(peer => peer.id).sort()).toEqual(['mine', 'other'])

  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(kept().find(peer => peer.id === 'mine')?.isBusy).toBe(true)
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(kept().find(peer => peer.id === 'mine')?.isBusy).toBe(false)

  expect((await $.command.run(run('relay', 'hello'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('relay', '4 hello'))).text).toBe('No session 4 on the card.')
  expect((await $.command.run(run('relay', '1 the API changed,\nre-read types.ts'))).text).toBe(
    'Sent to api. It reads it as a message from this session.',
  )
  expect((await $.command.run(run('relay', '1 fail'))).text).toBe('Not delivered to api: no such session')
  expect(sent).toHaveLength(2)
  expect(sent[0]).toMatch(/the API changed,\nre-read types\.ts$/)

  await clock.advance(40_000)
  expect(await ui.find({ text: /^1 open$/ })).toBeDefined()
  expect(await ui.find({ text: /api feature/ })).toBeUndefined()
  await ui.unmount()

  expect((await $.command.run(run('sessions-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('sessions-widget', 'off'))).text).toMatch(/off/)
})

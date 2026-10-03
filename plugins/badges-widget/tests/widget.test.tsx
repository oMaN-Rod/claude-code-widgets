import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'badges-widget',
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

const done = (turnId: string, durationMs: number) =>
  ({ answer: 'ok', durationMs, isAborted: false, turnId, reason: 'answer' }) as const

test('awards badges as the session earns them and keeps them', { plugins: [LAYOUT] }, async ($, on) => {
  const toasts: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', (_$, e) =>
    e.tool === 'Read' ? { result: 'boom', isError: true, text: 'boom' } : { result: 'ok', text: 'ok' },
  )
  mock.clock(on, { now: new Date(2026, 0, 5, 12, 0).getTime() })
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('badges-widget', 'on'))).text).toMatch(/Badges on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^0\/8$/ })).toBeDefined()
  expect(await ui.find({ text: /^☆ First steps: one tool call$/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'bun test' })
  expect(await ui.find({ text: /^2\/8$/ })).toBeDefined()
  expect(await ui.find({ text: /^★ First steps$/ })).toBeDefined()
  expect(await ui.find({ text: /^★ Green light$/ })).toBeDefined()
  expect(toasts).toEqual(['Badge earned: First steps', 'Badge earned: Green light'])

  await $.tool.call({ tool: 'Read', tool_use_id: 'u2', file_path: '/x' })
  for (let call = 0; call < 20; call += 1) {
    await $.tool.call({ tool: 'Glob', tool_use_id: `g${call}`, pattern: '*.ts' })
  }
  expect(await ui.find({ text: /^★ Steady hands$/ })).toBeDefined()

  await $.turn.complete(done('t1', 700_000))
  expect(await ui.find({ text: /^★ Marathon$/ })).toBeDefined()
  expect(await ui.find({ text: /^4\/8$/ })).toBeDefined()
  expect(await ui.find({ text: /^☆ Night owl/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('badges-widget', 'reset'))).text).toMatch(/reset/)
  const cleared = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await cleared.find({ text: /^0\/8$/ })).toBeDefined()
  await cleared.unmount()

  expect((await $.command.run(run('badges-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('badges-widget', 'off'))).text).toMatch(/off/)
})

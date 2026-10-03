import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'watch-widget',
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

const ran = (exitCode: number, stdout: string, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

test('reruns the watched command after each edit and shows the outcome', { plugins: [LAYOUT] }, async ($, on) => {
  const commands: string[] = []
  let isBroken = false

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  const clock = mock.clock(on, { now: 1000 })
  on('process.run', async (_$, e) => {
    commands.push(e.argv.join(' '))
    await clock.advance(2000)

    return isBroken ? ran(1, '', 'sum.test.ts:3\nexpected 4, got 0\n\n1 fail') : ran(0, '3 pass')
  })
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('watch-widget', 'on'))).text).toMatch(/Watch on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /\/watch bun test/ })).toBeDefined()

  expect((await $.command.run(run('watch', ''))).text).toMatch(/Usage/)
  expect((await $.command.run(run('watch', 'bun test'))).text).toBe('Watching: bun test')
  await clock.settle()
  expect(commands).toEqual(['sh -c bun test'])
  expect(await ui.find({ text: /^bun test$/ })).toBeDefined()
  expect(await ui.find({ text: /^● passed · 2\.0s · run 1$/ })).toBeDefined()

  isBroken = true
  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/x' })
  await clock.settle()
  expect(commands).toHaveLength(1)

  await $.tool.call({ tool: 'Edit', tool_use_id: 'u2', file_path: '/work/sum.ts', old_string: 'a', new_string: 'b' })
  await clock.settle()
  expect(commands).toHaveLength(2)
  expect(await ui.find({ text: /^● failed · 2\.0s · run 2$/ })).toBeDefined()
  expect(await ui.find({ text: /^expected 4, got 0$/ })).toBeDefined()
  expect(await ui.find({ text: /^1 fail$/ })).toBeDefined()

  expect((await $.command.run(run('watch-widget', 'stop'))).text).toMatch(/Stopped/)
  expect(await ui.find({ text: /\/watch bun test/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('watch-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('watch-widget', 'off'))).text).toMatch(/off/)
})

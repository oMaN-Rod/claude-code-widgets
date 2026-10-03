import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'typer-widget',
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

test('drops words from the repository and clears the ones you type', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('process.run', () => ran(0, 'src/parser.ts\nsrc/parser.test.ts\n'))
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('typer-widget', 'on'))).text).toMatch(/Typer on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const info = async () => (await ui.find({ in: 'typer', type: 'Text', text: /^score \d+ / }))?.text ?? ''

  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^best 0$/ })).toBeDefined()
  expect((await ui.find({ type: 'Client' }))?.props).toMatchObject({
    module: expect.stringContaining('typer.tsx'),
    props: { best: 0, words: ['src', 'parser', 'test'] },
  })
  expect(await info()).toBe('score 0 · best 0 · type to start')

  await ui.advance(500 * 4)
  expect(await ui.find({ in: 'typer', text: /parser|src|test/ })).toBeUndefined()

  await ui.key({ key: 'z', in: 'typer' })
  expect(await info()).toBe('score 0 · best 0 · ♥♥♥')
  await ui.advance(500)
  const first = (await ui.find({ in: 'typer', type: 'Text', text: /^(parser|src|test)$/ }))?.text ?? ''
  expect(first).not.toBe('')

  for (const letter of first) await ui.key({ key: letter, in: 'typer' })
  expect(await info()).toBe(`score ${first.length} · best ${first.length} · ♥♥♥`)

  await ui.advance(500 * 60)
  expect(await info()).toMatch(/· (game over|type to start)$/)

  await ui.post({ score: 77 }, { in: 'typer' })
  expect(await ui.find({ text: /^best 77$/ })).toBeDefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ text: /^Typer$/ })).toBeDefined()
  await desktop.unmount()

  expect((await $.command.run(run('typer-widget', 'off'))).text).toMatch(/off/)
  expect((await $.command.run(run('typer-widget', 'fast'))).text).toMatch(/Usage/)
})

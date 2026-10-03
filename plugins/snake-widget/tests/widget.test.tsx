import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const BAND = {
  plugin: 'snake-widget',
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

test('plays itself, takes the keys and keeps the best score', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  mock.store(on)

  await $.command.run(run('place', 'above'))
  expect((await $.command.run(run('snake-widget', 'on'))).text).toMatch(/Snake on/)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /^best 0$/ })).toBeDefined()
  expect((await ui.find({ type: 'Client' }))?.props).toMatchObject({ module: expect.stringContaining('snake.tsx') })
  expect(await ui.find({ in: 'snake', text: /auto-play/ })).toBeDefined()

  await ui.advance(160 * 400)
  const scored = (await ui.find({ in: 'snake', text: /^score \d+/ }))?.text ?? ''
  expect(Number(/best (\d+)/.exec(scored)?.[1])).toBeGreaterThan(0)

  await ui.key({ key: 'up', in: 'snake' })
  expect(await ui.find({ in: 'snake', text: /· (you|game over)$/ })).toBeDefined()

  await ui.post({ score: 99 }, { in: 'snake' })
  expect(await ui.find({ text: /^best 99$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('snake-widget', 'off'))).text).toMatch(/off/)
  expect((await $.command.run(run('snake-widget', 'fast'))).text).toMatch(/Usage/)
})

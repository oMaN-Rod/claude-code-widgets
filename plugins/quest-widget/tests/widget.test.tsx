import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'quest-widget',
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

test('turns tool calls into fights, checks into loot and failures into wounds', { plugins: [LAYOUT] }, async ($, on) => {
  const toasts: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', (_$, e) =>
    e.tool === 'Read' ? { result: 'boom', isError: true, text: 'boom' } : { result: 'ok', text: 'ok' },
  )
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('quest-widget', 'on'))).text).toMatch(/Quest on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^Quest Lv 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^room 0$/ })).toBeDefined()
  expect(await ui.find({ text: /The dungeon waits/ })).toBeDefined()

  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await ui.find({ text: /^room 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^You enter / })).toBeDefined()

  await $.tool.call({ tool: 'Grep', tool_use_id: 'u1', pattern: 'x' })
  expect(await ui.find({ text: /^You slay a Search Bat \(\+5 XP\)\.$/ })).toBeDefined()
  expect(await ui.find({ text: /^0 gold · 1 slain · 0 falls$/ })).toBeDefined()

  await $.tool.call({ tool: 'Read', tool_use_id: 'u2', file_path: '/x' })
  expect(await ui.find({ text: /^The Scroll Wisp strikes back \(-13 HP\)\.$/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'bun test' })
  expect(await ui.find({ text: /^The checks pass: a chest holds 12 gold\.$/ })).toBeDefined()
  expect(await ui.find({ text: /^12 gold · 1 slain · 0 falls$/ })).toBeDefined()

  for (let call = 0; call < 7; call += 1) {
    await $.tool.call({ tool: 'Bash', tool_use_id: `b${call}`, command: 'ls' })
  }
  expect(await ui.find({ text: /^Quest Lv 2$/ })).toBeDefined()
  expect(toasts).toEqual(['Quest: level 2 reached.'])

  for (let call = 0; call < 5; call += 1) {
    await $.tool.call({ tool: 'Read', tool_use_id: `r${call}`, file_path: '/x' })
  }
  expect(await ui.find({ text: /^6 gold · 8 slain · 1 fall$/ })).toBeDefined()
  expect(toasts).toEqual(['Quest: level 2 reached.', 'Quest: you fell in battle.'])

  expect((await $.command.run(run('quest-widget', 'reset'))).text).toMatch(/reset/)
  expect(await ui.find({ text: /^Quest Lv 1$/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run(run('quest-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('quest-widget', 'off'))).text).toMatch(/off/)
})

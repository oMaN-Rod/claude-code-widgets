import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'sound-widget',
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
        picture: async ({ surface, key, columns, rows, marks }) => {
          if (surface !== 'terminal') return { type: 'Text' as const, children: ['no picture'] }

          const blank = String.fromCharCode(32, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1)
          const sum = [...JSON.stringify(marks)].reduce((held, letter) => (held * 31 + letter.charCodeAt(0)) % 0xffffff, 7)
          const first = String.fromCharCode(32, 0, 0, 0, sum & 255, (sum >> 8) & 255, sum >> 16, 0, 0, 0, 0, 1)

          return {
            type: 'Raster',
            props: {
              key,
              columns: Math.ceil(columns / 2),
              rows: Math.ceil(rows / 2),
              cells: btoa(first + blank.repeat(Math.ceil(columns / 2) * Math.ceil(rows / 2) - 1)),
            },
          } as never
        },
      },
    }))
    on('command.run', { command: 'place' }, async ($, e) => {
      await $.state.set({ plugin: 'widgets', key: 'site' } as const, e.args as 'side')

      return { text: e.args }
    })
  },
}

test('plays a note per tool call and draws it on the piano roll', { plugins: [LAYOUT] }, async ($, on) => {
  const played: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('audio.play', (_$, e) => {
    played.push(`${e.clip.asset}@${e.gain}`)

    return { value: undefined }
  })
  on('tool.call', (_$, e) =>
    e.tool === 'Read' ? { result: 'boom', isError: true, text: 'boom' } : { result: 'ok', text: 'ok' },
  )
  mock.store(on)

  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('sound-widget', 'on'))).text).toMatch(/Sound on/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const cells = async () => (await ui.find({ type: 'Raster' }))?.props.cells

  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /^0 notes$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 36, rows: 7 })
  const empty = await cells()

  await $.tool.call({ tool: 'Edit', tool_use_id: 'u1', file_path: '/x', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u2', command: 'bun test' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u3', file_path: '/x' })
  expect(played).toEqual(['sounds/e4.wav@0.5', 'sounds/pass.wav@0.5', 'sounds/fail.wav@0.5'])
  expect(await ui.find({ text: /^3 notes$/ })).toBeDefined()
  expect(await cells()).not.toBe(empty)

  expect((await $.command.run(run('sound-widget', 'mute'))).text).toMatch(/muted/)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u4', command: 'ls' })
  expect(played).toHaveLength(3)
  expect(await ui.find({ text: /^4 notes · muted$/ })).toBeDefined()

  expect((await $.command.run(run('sound-widget', 'mute'))).text).toMatch(/unmuted/)
  expect((await $.command.run(run('sound-widget', 'test'))).text).toMatch(/chord/)
  expect(played).toHaveLength(4)
  await ui.unmount()

  expect((await $.command.run(run('sound-widget', 'sideways'))).text).toMatch(/Usage/)
  expect((await $.command.run(run('sound-widget', 'off'))).text).toMatch(/off/)
})

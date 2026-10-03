import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const BAND = {
  plugin: 'pet-widget',
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

test('draws the pet and follows the session mood', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'boom', isError: true, text: 'boom' }))
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'above'))
  expect((await $.command.run(run('pet-widget', 'on'))).text).toMatch(/Pet on/)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 16, rows: 7 })
  expect(await ui.find({ text: /^idle$/ })).toBeDefined()

  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await ui.find({ text: /^work$/ })).toBeDefined()

  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/x' })
  expect(await ui.find({ text: /^dizzy$/ })).toBeDefined()
  expect(await ui.find({ text: /Read failed/ })).toBeDefined()

  await clock.advance(7000)
  expect(await ui.find({ text: /^work$/ })).toBeDefined()

  expect((await $.command.run(run('pet-widget', 'happy'))).text).toMatch(/happy/)
  expect(await ui.find({ text: /^happy$/ })).toBeDefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
  expect(await desktop.find({ text: /Clawd/ })).toBeDefined()
  await desktop.unmount()

  expect((await $.command.run(run('pet-widget', 'off'))).text).toMatch(/off/)
  expect((await $.command.run(run('pet-widget', 'purple'))).text).toMatch(/Usage/)
})

const BADGES: Plugin = {
  name: 'badges-widget',
  register(on) {
    on('command.run', { command: 'earn' }, async ($, e) => {
      await $.state.set({ plugin: 'badges-widget', key: 'earned' } as never, e.args.split(',') as never)

      return { text: e.args }
    })
  },
}

test('levels up with XP and wears a hat once badges are earned', { plugins: [LAYOUT, BADGES] }, async ($, on) => {
  const toasts: string[] = []

  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  mock.clock(on, { now: 1000 })
  mock.store(on)

  await $.command.run(run('place', 'above'))
  await $.command.run(run('pet-widget', 'on'))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /^Clawd Lv 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^0 XP$/ })).toBeDefined()

  for (let call = 0; call < 20; call += 1) {
    await $.tool.call({ tool: 'Glob', tool_use_id: `g${call}`, pattern: '*.ts' })
  }
  expect(await ui.find({ text: /^Clawd Lv 2$/ })).toBeDefined()
  expect(await ui.find({ text: /^20 XP$/ })).toBeDefined()
  expect(toasts).toEqual(['Clawd reached level 2.'])

  const bare = (await ui.find({ type: 'Raster' }))?.props.cells
  await $.command.run(run('earn', 'first'))
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(bare)
  await ui.unmount()
})

test('goes away when another session holds it and comes back on a prompt', { plugins: [LAYOUT] }, async ($, on) => {
  const data: Record<string, unknown> = { isOn: true }

  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('store.get', (_$, e) => ({ value: data[e.key] }))
  on('store.set', (_$, e) => {
    data[e.key] = e.value

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: 1000 })

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run(run('place', 'above'))
  const mine = (data.home as { holder: string }).holder
  expect(mine).not.toBe('')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeDefined()

  data.home = { holder: 'another-session', at: 2000 }
  await clock.advance(3000)
  expect(await ui.find({ text: /^away$/ })).toBeDefined()
  expect(await ui.find({ text: /visiting another session/ })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()

  await $.turn.start({ text: 'go', turnId: 't1' })
  expect((data.home as { holder: string }).holder).toBe(mine)
  expect(await ui.find({ text: /^work$/ })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.unmount()
})

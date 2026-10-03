import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'commits-widget',
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

test('lists the commits made since the session started', { plugins: [LAYOUT] }, async ($, on) => {
  let made: string[] = []
  let isRepo = true
  const ranges: string[] = []

  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.run', (_$, e) => {
    if (!isRepo) return ran(128, '')
    if (e.argv[1] === 'rev-parse') return ran(0, 'base123\n')
    ranges.push(e.argv[3] ?? '')

    return ran(0, made.join('\n'))
  })
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  mock.store(on)

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run(run('place', 'side'))
  expect((await $.command.run(run('commits-widget'))).text).toMatch(/on/)

  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await empty.find({ text: /No commits yet this session/ })).toBeDefined()
  await empty.unmount()

  made = ['bbb2222\tFix the parser', 'aaa1111\tAdd the parser']
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'git commit -m x' })
  expect(ranges.at(-1)).toBe('base123..HEAD')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /^2 this session$/ })).toBeDefined()
    const rows = await ui.findAll({ type: 'Text', text: /parser$/ })
    expect(rows.map(row => row.text)).toEqual(['bbb2222 Fix the parser', 'aaa1111 Add the parser'])
    await ui.unmount()
  }

  isRepo = false
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u2', command: 'cd /tmp' })
  const none = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await none.find({ text: /Not a git repository/ })).toBeDefined()
  await none.unmount()

  expect((await $.command.run(run('commits-widget'))).text).toMatch(/off/)
})

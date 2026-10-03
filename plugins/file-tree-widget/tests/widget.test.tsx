import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'file-tree-widget',
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

const RUN = {
  command: 'file-tree-widget',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

const entry = (name: string, kind: 'file' | 'dir') => ({
  name,
  kind,
  size: 0,
  mtimeMs: 0,
  isLink: false,
})

const DISK: Record<string, ReturnType<typeof entry>[]> = {
  '/work/app': [
    entry('readme.md', 'file'),
    entry('src', 'dir'),
    entry('.git', 'dir'),
    entry('node_modules', 'dir'),
  ],
  '/work/app/src': [entry('main.ts', 'file')],
}

const place = (args: string) =>
  ({
    command: 'place',
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

test('lists the project root and expands a directory on press', { plugins: [LAYOUT] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('session.root', () => ({ value: '/work/app' }))
  on('fs.list', (_$, e) => {
    const path = e.path.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/')

    return { value: DISK[path] ?? [] }
  })

  mock.store(on)

  await $.command.run(place('side'))
  expect((await $.command.run(RUN)).text).toMatch(/on/)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ text: /readme\.md/ })).toBeDefined()
    expect(await ui.find({ text: /node_modules|\.git/ })).toBeUndefined()

    const labels = (await ui.findAll({ type: 'Button' })).map(one => one.props.label)
    expect(labels).toEqual(['↻', '▸ src/'])
    expect(await ui.find({ text: /main\.ts/ })).toBeUndefined()

    await ui.press({ key: 'dir:/work/app/src' })
    expect(await ui.find({ text: /main\.ts/ })).toBeDefined()
    expect((await ui.find({ key: 'dir:/work/app/src' }))?.props.label).toBe('▾ src/')

    await ui.press({ key: 'dir:/work/app/src' })
    expect(await ui.find({ text: /main\.ts/ })).toBeUndefined()
    await ui.unmount()
  }

  expect((await $.command.run(RUN)).text).toMatch(/off/)
})

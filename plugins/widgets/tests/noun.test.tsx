import { expect, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const PANE = {
  plugin: 'widgets',
  component: 'Pane',
  requestId: 'widgets',
  props: {
    title: 'Widgets',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const FIRST: Plugin = {
  name: 'first',
  register(on) {
    on('ui.render', { component: 'Pane', requestId: 'widgets' }, async ($, e, next) => {
      const picture = await $.widgets.picture({
        surface: e.surface,
        key: 'art',
        columns: 6,
        rows: 4,
        fill: 0x101010,
        marks: [[0, 0, 0xff0000], { lines: ['.ab'], palette: { a: 0x00ff00, b: 0x0000ff }, left: 2, top: 1 }],
      })

      return $.widgets.card({
        beneath: await next(e),
        width: 40,
        title: 'First',
        note: 'one',
        body: picture,
      })
    })
  },
}

const PRESSED: Plugin = {
  name: 'pressed',
  register(on) {
    on('ui.render', { component: 'Pane', requestId: 'widgets' }, async ($, e, next) => {
      const { Box, Button } = $.ui.resolve(e)
      const stacked = await $.widgets.stack({ beneath: await next(e), card: <Box key="slot" /> })
      const [base, row] = (stacked as { children: { children: unknown[] }[] }).children

      return {
        ...stacked,
        children: [
          base,
          {
            ...row,
            children: [
              ...(row?.children.slice(0, -1) ?? []),
              <Button plain key="press" label="press me" onPress={() => $.ui.toast('pressed')} />,
            ],
          },
        ],
      } as typeof stacked
    })
  },
}

const SECOND: Plugin = {
  name: 'second',
  register(on) {
    on('ui.render', { component: 'Pane', requestId: 'widgets' }, async ($, e, next) => {
      const { Text } = $.ui.resolve(e)

      return $.widgets.card({
        beneath: await next(e),
        width: 30,
        body: <Text>inside</Text>,
      })
    })
  },
}

test('stacks the cards other plugins draw through $.widgets', { plugins: [FIRST, PRESSED, SECOND] }, async ($, on) => {
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^beneath$/ })).toBeDefined()
  expect(await ui.find({ text: /No widgets on/ })).toBeUndefined()
  expect(await ui.find({ text: /^inside$/ })).toBeDefined()
  expect(await ui.find({ key: 'press' })).toBeDefined()
  expect(await ui.find({ key: 'slot' })).toBeUndefined()
  expect(await ui.find({ text: /^First$/ })).toBeDefined()
  expect(await ui.find({ text: /^one$/ })).toBeDefined()
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 3, rows: 2 })
  const widths = (await ui.findAll({ type: 'Box' })).map(box => box.props?.width).filter(Boolean)
  expect(widths.sort()).toEqual([30, 40])
  expect(await ui.findAll({ key: 'widgets-stack' })).toHaveLength(1)
  const rows = (await ui.findAll({ type: 'Box' })).filter(box => box.props?.flexWrap === 'wrap')
  expect(rows.length).toBe(1)
  await ui.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
  expect(await desktop.find({ text: /draws in the terminal/ })).toBeDefined()
  await desktop.unmount()
})

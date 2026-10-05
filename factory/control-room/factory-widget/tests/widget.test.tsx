import { expect, test } from 'claude-code/testing'

import { LAYOUT, ground, run, session, target } from './kit'

const NAME = 'factory-widget'
const PATH = '/work/project/factory/floor/board.json'

const order = (id: string, widget: string, fields: object = {}) => ({
  id,
  kind: 'rebuild',
  widget,
  title: null,
  brief: 'Rebuild to the standard',
  status: 'open',
  station: 'build',
  holder: 'machinist',
  openedAt: '2026-10-04T18:00:00.000Z',
  closedAt: null,
  sendBacks: 0,
  stamps: [],
  log: [{ at: '2026-10-04T18:05:00.000Z', agent: 'machinist', station: 'build', action: 'took the order at build' }],
  ...fields,
})

const BOARD = {
  at: '2026-10-04T18:30:00.000Z',
  orders: [
    order('WO-0001', 'hello-widget', { status: 'shipped', station: 'shipping', holder: null, closedAt: '2026-10-04T18:20:00.000Z' }),
    order('WO-0002', 'moon-widget', {
      station: 'inspection',
      holder: 'inspector',
      sendBacks: 1,
      stamps: [{ at: '2026-10-04T18:10:00.000Z', station: 'inspection', by: 'inspector', result: 'send-back', to: 'build', reason: 'The disc wraps at 20 columns' }],
    }),
    order('WO-0003', 'collision-widget'),
  ],
}

const started = async ($: Parameters<Parameters<typeof test>[2]>[0], files: Record<string, string>, on: Parameters<Parameters<typeof test>[2]>[1]) => {
  const world = ground(on, { files })
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))

  return world
}

test('A1: says there is no floor when the project has no board', { plugins: [LAYOUT] }, async ($, on) => {
  await started($, {}, on)

  const ui = await $.ui.mount(target(NAME, 'Pane'))
  expect((await ui.find({ key: 'note' }))?.text).toBe('no floor')
  expect(await ui.find({ text: /No factory floor here/ })).toBeDefined()
  expect((await $.command.run(run(NAME, 'orders'))).text).toMatch(/board\.json is missing/)
  await ui.unmount()
})

test('A2: shows each open order with its station and holder', { plugins: [LAYOUT] }, async ($, on) => {
  await started($, { [PATH]: JSON.stringify(BOARD) }, on)

  const ui = await $.ui.mount(target(NAME, 'Pane'))
  expect((await ui.find({ key: 'note' }))?.text).toBe('2 on the line')
  expect(await ui.find({ text: /WO-0002 moon/ })).toBeDefined()
  expect(await ui.find({ text: /inspection · inspector ↩1/ })).toBeDefined()
  expect(await ui.find({ text: /build · machinist/ })).toBeDefined()
  expect(await ui.find({ text: /^check 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^idea ·$/ })).toBeDefined()
  expect(await ui.find({ text: /hello-widget|WO-0001 hello/ })).toBeUndefined()
  await ui.unmount()
})

test('A3: counts the dock and the turn-backs', { plugins: [LAYOUT] }, async ($, on) => {
  await started($, { [PATH]: JSON.stringify(BOARD) }, on)

  const ui = await $.ui.mount(target(NAME, 'Pane'))
  expect(await ui.find({ text: /dock 1 · last hello 18:20/ })).toBeDefined()
  expect(await ui.find({ text: /1 turn-back · WO-0002 inspection: sent back to build by inspector: The disc wraps/ })).toBeDefined()
  await ui.unmount()
})

test('A4: reports orders, shipped, turned and one order\'s log', { plugins: [LAYOUT] }, async ($, on) => {
  await started($, { [PATH]: JSON.stringify(BOARD) }, on)

  expect((await $.command.run(run(NAME, 'orders'))).text).toBe(
    'WO-0002 moon-widget (rebuild) at inspection, inspector, sent back 1×\nWO-0003 collision-widget (rebuild) at build, machinist',
  )
  expect((await $.command.run(run(NAME, 'shipped'))).text).toBe('WO-0001 hello-widget shipped 2026-10-04 18:20')
  expect((await $.command.run(run(NAME, 'turned'))).text).toMatch(/^WO-0002 inspection: sent back to build/)
  expect((await $.command.run(run(NAME, 'log 3'))).text).toBe('WO-0003 collision-widget: at build\n18:05 machinist @ build: took the order at build')
  expect((await $.command.run(run(NAME, 'log wo-0009'))).text).toMatch(/^No work order WO-0009/)
})

test('A5: picks up a changed board on its timer', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await started($, { [PATH]: JSON.stringify(BOARD) }, on)

  const ui = await $.ui.mount(target(NAME, 'Pane'))
  world.files.set(PATH, JSON.stringify({ at: '2026-10-04T18:40:00.000Z', orders: [BOARD.orders[0], BOARD.orders[2]] }))
  await world.clock.advance(5000)
  expect((await ui.find({ key: 'note' }))?.text).toBe('1 on the line')
  await ui.unmount()
})

test('A6: reports nothing and reads nothing while off', { plugins: [LAYOUT] }, async ($, on) => {
  await started($, { [PATH]: JSON.stringify(BOARD) }, on)

  await $.command.run(run(NAME, 'off'))
  expect((await $.command.run(run(NAME, 'orders'))).text).toBe('Factory is off; /factory-widget on first.')
  expect((await $.command.run(run(NAME, 'log'))).text).toMatch(/^Usage/)
})

test('A7: shortens stations and order ids on a narrow card', { plugins: [LAYOUT] }, async ($, on) => {
  await started($, { [PATH]: JSON.stringify(BOARD) }, on)

  const ui = await $.ui.mount(target(NAME, 'Pane', 20))
  expect(await ui.find({ text: /^c 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^0002 moon$/ })).toBeDefined()
  expect(await ui.find({ text: /check ↩1/ })).toBeDefined()
  await ui.unmount()
})

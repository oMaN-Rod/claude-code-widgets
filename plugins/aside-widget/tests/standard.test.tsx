import { expect, test } from 'claude-code/testing'

import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'

const NAME = 'aside-widget'
const HOUR = 3_600_000

test('standard: stays inert while off', { plugins: [LAYOUT] }, async ($, on) => {
  const world = ground(on)
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))

  await session($)
  await turn($)
  await world.clock.advance(HOUR)

  expect(world.writes).toEqual([])
  expect(world.contexts).toEqual([])
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    const ui = await $.ui.mount(target(NAME, component))
    expect(await ui.find({ key: 'card' })).toBeUndefined()
    await ui.unmount()
  }
})

test('standard: switches with on, off and a bare toggle', { plugins: [LAYOUT] }, async ($, on) => {
  const world = ground(on)
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))

  await session($)
  expect(world.commands).toContain(NAME)
  await $.command.run(run('place', 'side'))
  const ui = await $.ui.mount(target(NAME, 'Pane'))

  await $.command.run(run(NAME, 'on'))
  expect(world.store.get('isOn')).toBe(true)
  expect(await ui.find({ key: 'card' })).toBeDefined()

  await $.command.run(run(NAME))
  expect(world.store.get('isOn')).toBe(false)
  expect(await ui.find({ key: 'card' })).toBeUndefined()

  await $.command.run(run(NAME))
  expect(world.store.get('isOn')).toBe(true)

  expect((await $.command.run(run(NAME, 'no-such-word'))).text).toMatch(/^Usage: \/aside-widget/)
  expect(world.store.get('isOn')).toBe(true)

  await $.command.run(run(NAME, 'off'))
  expect(world.store.get('isOn')).toBe(false)
  await ui.unmount()

  const before = world.writes.length
  await turn($, 'Another prompt', 'turn-2')
  await world.clock.advance(HOUR)
  expect(world.writes.slice(before)).toEqual([])
})

test('standard: comes back on from the store', { plugins: [LAYOUT] }, async ($, on) => {
  ground(on, { store: { isOn: true } })

  await session($)
  await $.command.run(run('place', 'side'))
  const ui = await $.ui.mount(target(NAME, 'Pane'))
  expect(await ui.find({ key: 'card' })).toBeDefined()
  await ui.unmount()
})

test('standard: draws only where the layout places it', { plugins: [LAYOUT] }, async ($, on) => {
  ground(on)

  await session($)
  await $.command.run(run(NAME, 'on'))
  for (const [site] of SITES) {
    await $.command.run(run('place', site))
    for (const [other, component] of SITES) {
      const ui = await $.ui.mount(target(NAME, component))
      expect((await ui.find({ key: 'card' })) !== undefined).toBe(other === site)
      await ui.unmount()
    }
  }
})

test('standard: fits narrow and wide placements on both surfaces', { plugins: [LAYOUT] }, async ($, on) => {
  ground(on)

  await session($)
  await $.command.run(run(NAME, 'on'))
  await $.command.run(run('place', 'side'))
  for (const surface of ['terminal', 'desktop']) {
    for (const [columns, width] of [[12, 20], [28, 28], [40, 40], [90, 40]] as const) {
      const ui = await $.ui.mount(target(NAME, 'Pane', columns, surface))
      expect((await ui.find({ key: 'card' }))?.props.width).toBe(width)
      await ui.unmount()
    }
  }

  await $.command.run(run('widen', `${NAME} 60`))
  const wide = await $.ui.mount(target(NAME, 'Pane', 90))
  expect((await wide.find({ key: 'card' }))?.props.width).toBe(60)
  await wide.unmount()
})

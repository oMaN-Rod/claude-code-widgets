import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, ground, run, session, target } from './kit'
import type { Given, Ground } from './kit'

const NAME = 'moon-widget'
const MINUTE = 60_000
const HOUR = 3_600_000
const NORTH_HALF = '░░░░░░░███████'
const SOUTH_HALF = '███████░░░░░░░'
const FULL_MOONS = ['2026-01-03T10:03', '2026-02-01T22:09', '2026-10-26T04:12']
const WORKING = '2026-10-22T12:00'
const CRESCENT = '2026-10-14T12:00'
const BEST = '2026-10-25T23:00'
const AFTER_PEAK = '2026-10-26T09:00'
const MEAN_FULL = '2026-02-03T06:00'
const FIRST_QUARTER = '2026-10-18T16:00'
const LAST_QUARTER = '2026-11-01T20:00'
const NEW_MOON = '2026-11-09T07:00'
const WANING_CRESCENT = '2026-11-05T12:00'

const at = (minute: string): number => Date.parse(`${minute}:00Z`)

const open = async ($: Engine, on: On, given: Given): Promise<Ground> => {
  const world = ground(on, given)
  await session($)
  await $.command.run(run('place', 'side'))
  if (given.store?.isOn !== true) await $.command.run(run(NAME, 'on'))

  return world
}

const mount = ($: Engine, columns = 40, surface = 'desktop') => $.ui.mount(target(NAME, 'Pane', columns, surface))

type Card = Awaited<ReturnType<typeof mount>>

const SHOWN: Readonly<Record<string, (text: string, props: Readonly<Record<string, unknown>>) => boolean>> = {
  name: (_text, props) => props.bold === true,
  countdown: text => /^(Full in|Peak) /.test(text),
  lore: (_text, props) => props.italic === true,
  bar: text => /^[█░]+$/.test(text),
}

const part = async (ui: Card, key: string): Promise<string> => {
  const isShown = SHOWN[key]
  if (isShown === undefined) return (await ui.find({ key }))?.text ?? ''

  return (await ui.findAll({ type: 'Text' })).find(text => isShown(text.text, text.props))?.text ?? ''
}

const jump = async ($: Engine, world: Ground, to: number): Promise<void> => {
  await $.command.run(run(NAME, 'off'))
  await world.clock.set(to)
  await $.command.run(run(NAME, 'on'))
}

const rows = (line: string, columns: number): number =>
  line.split(' ').reduce(
    (held, word) =>
      held.used === 0
        ? { count: 1, used: word.length }
        : held.used + 1 + word.length <= columns
          ? { count: held.count, used: held.used + 1 + word.length }
          : { count: held.count + 1, used: word.length },
    { count: 0, used: 0 },
  ).count

test('A1: an ordinary night shows the phase, how lit, the countdown and its lore', { plugins: [LAYOUT] }, async ($, on) => {
  await open($, on, { now: at(WORKING) })
  const ui = await mount($)

  expect(await part(ui, 'title')).toBe('Moon')
  expect(await part(ui, 'note')).toBe('84% lit')
  expect(await part(ui, 'name')).toBe('Waxing gibbous')
  expect(await part(ui, 'countdown')).toBe('Full in 3d 16h')
  expect(await part(ui, 'lore')).toBe('Nearly full. Finish it.')
  await ui.unmount()
})

test('A2: a young moon is a waxing crescent eleven days from full', { plugins: [LAYOUT] }, async ($, on) => {
  await open($, on, { now: at(CRESCENT) })
  const ui = await mount($)

  expect(await part(ui, 'note')).toBe('14% lit')
  expect(await part(ui, 'name')).toBe('Waxing crescent')
  expect(await part(ui, 'countdown')).toBe('Full in 11d 16h')
  expect(await part(ui, 'lore')).toBe('Begun now, it grows.')
  await ui.unmount()
})

test('A3: hours before the full moon the card counts down to the peak', { plugins: [LAYOUT] }, async ($, on) => {
  await open($, on, { now: at(BEST) })
  const ui = await mount($)

  expect(await part(ui, 'note')).toBe('100% lit')
  expect(await part(ui, 'name')).toBe('Full moon')
  expect(await part(ui, 'countdown')).toMatch(/^Peak in 5h \d\dm$/)
  expect(await part(ui, 'lore')).toBe('Folklore says: do not deploy.')
  await ui.unmount()
})

test('A4: hours after the full moon the card says how long ago the peak was', { plugins: [LAYOUT] }, async ($, on) => {
  await open($, on, { now: at(AFTER_PEAK) })
  const ui = await mount($)

  expect(await part(ui, 'name')).toBe('Full moon')
  expect(await part(ui, 'countdown')).toMatch(/^Peak 4h \d\dm ago$/)
  await ui.unmount()
})

test('A5: where the mean lunation said full, the moon is already waning', { plugins: [LAYOUT] }, async ($, on) => {
  await open($, on, { now: at(MEAN_FULL) })
  const ui = await mount($)

  expect(await part(ui, 'name')).toBe('Waning gibbous')
  expect(await part(ui, 'countdown')).toBe('Full in 28d 5h')
  expect(await ui.find({ text: 'Full moon' })).toBeUndefined()
  await ui.unmount()
})

test('A6: the peak falls within fifteen minutes of each published full moon', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await open($, on, { now: at(FULL_MOONS[0] ?? '') - 15 * MINUTE })
  const ui = await mount($)

  for (const moment of FULL_MOONS) {
    await jump($, world, at(moment) - 15 * MINUTE)
    expect(await part(ui, 'name')).toBe('Full moon')
    expect(await part(ui, 'countdown')).toMatch(/^Peak in /)
    await world.clock.set(at(moment) + 15 * MINUTE)
    expect(await part(ui, 'countdown')).toMatch(/ ago$/)
  }
  await ui.unmount()
})

test('A7: the quarters and the new moon are named, half or not lit, each with its lore', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await open($, on, { now: at(FIRST_QUARTER) })
  const ui = await mount($)

  for (const [minute, name, note, lore] of [
    [FIRST_QUARTER, 'First quarter', '50% lit', 'Half lit. Decide what ships.'],
    [LAST_QUARTER, 'Last quarter', '50% lit', 'Let go of what did not work.'],
    [NEW_MOON, 'New moon', '0% lit', 'Dark sky. Start something.'],
  ] as const) {
    await jump($, world, at(minute))
    expect(await part(ui, 'name')).toBe(name)
    expect(await part(ui, 'note')).toBe(note)
    expect(await part(ui, 'lore')).toBe(lore)
  }
  await ui.unmount()
})

test('A8: south mirrors the bar and is saved, north brings it back', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await open($, on, { now: at(FIRST_QUARTER) })
  const ui = await mount($)
  expect(await part(ui, 'bar')).toBe(NORTH_HALF)

  expect((await $.command.run(run(NAME, 'south'))).text).toBe('Moon drawn for the southern sky.')
  expect(await part(ui, 'bar')).toBe(SOUTH_HALF)
  expect(world.store.get('isSouth')).toBe(true)

  expect((await $.command.run(run(NAME, 'north'))).text).toBe('Moon drawn for the northern sky.')
  expect(await part(ui, 'bar')).toBe(NORTH_HALF)
  expect(world.store.get('isSouth')).toBe(false)
  await ui.unmount()
})

test('A9: the terminal picture is drawn differently for each hemisphere', { plugins: [LAYOUT] }, async ($, on) => {
  await open($, on, { now: at(FIRST_QUARTER) })
  const ui = await mount($, 40, 'terminal')
  const north = (await ui.find({ type: 'Raster' }))?.props.cells
  expect(north).toBeDefined()

  await $.command.run(run(NAME, 'south'))
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(north)

  await $.command.run(run(NAME, 'north'))
  expect((await ui.find({ type: 'Raster' }))?.props.cells).toBe(north)
  await ui.unmount()
})

test('A10: a stored southern sky is drawn at session start with no command', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await open($, on, { now: at(FIRST_QUARTER), store: { isOn: true, isSouth: true } })
  const ui = await mount($)

  expect(await part(ui, 'bar')).toBe(SOUTH_HALF)
  expect(world.writes).toEqual([])
  await ui.unmount()
})

test('A11: while off, south is refused and nothing changes', { plugins: [LAYOUT] }, async ($, on) => {
  const world = ground(on, { now: at(FIRST_QUARTER) })
  await session($)
  await $.command.run(run('place', 'side'))
  const ui = await mount($)

  expect((await $.command.run(run(NAME, 'south'))).text).toBe('Moon is off; /moon-widget on shows it.')
  expect(world.writes).toEqual([])
  expect(await ui.find({ key: 'card' })).toBeUndefined()

  await $.command.run(run(NAME, 'on'))
  expect(await part(ui, 'bar')).toBe(NORTH_HALF)
  expect(world.store.has('isSouth')).toBe(false)
  await ui.unmount()
})

test('A12: an unknown word answers with the usage and changes nothing', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await open($, on, { now: at(FIRST_QUARTER) })
  const ui = await mount($)
  const before = world.writes.length

  expect((await $.command.run(run(NAME, 'sideways'))).text).toBe('Usage: /moon-widget [on|off|north|south]')
  expect(world.writes.slice(before)).toEqual([])
  expect(world.store.get('isOn')).toBe(true)
  expect(await part(ui, 'bar')).toBe(NORTH_HALF)
  await ui.unmount()
})

test('A13: the picture is sized to the card at every width', { plugins: [LAYOUT] }, async ($, on) => {
  await open($, on, { now: at(WORKING) })

  for (const [columns, size] of [
    [40, { columns: 14, rows: 7 }],
    [20, { columns: 10, rows: 5 }],
    [37, { columns: 10, rows: 5 }],
  ] as const) {
    const ui = await mount($, columns, 'terminal')
    expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject(size)
    await ui.unmount()
  }

  await $.command.run(run('widen', `${NAME} 60`))
  const wide = await mount($, 60, 'terminal')
  expect((await wide.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 18, rows: 9 })
  await wide.unmount()
})

test('A14: the narrow card puts the moon above a name and countdown that fit', { plugins: [LAYOUT] }, async ($, on) => {
  const moments = [
    ...FULL_MOONS.flatMap(moment => [at(moment) - 15 * MINUTE, at(moment) + 15 * MINUTE]),
    ...[WORKING, CRESCENT, BEST, AFTER_PEAK, MEAN_FULL, FIRST_QUARTER, LAST_QUARTER, NEW_MOON].map(at),
  ].sort((one, other) => one - other)
  const world = await open($, on, { now: moments[0] ?? 0 })
  const ui = await mount($, 20)

  for (const moment of moments) {
    await jump($, world, moment)
    const bar = await part(ui, 'bar')
    const name = await part(ui, 'name')
    const shown = (await ui.findAll({ type: 'Text' })).map(text => text.text)

    expect(bar).toHaveLength(10)
    expect(shown.indexOf(bar)).toBeLessThan(shown.indexOf(name))
    expect(name.length).toBeGreaterThan(0)
    expect(name.length).toBeLessThanOrEqual(16)
    expect((await part(ui, 'countdown')).length).toBeLessThanOrEqual(16)
  }
  await ui.unmount()

  const terminal = await mount($, 20, 'terminal')
  const drawn = JSON.stringify(await terminal.drawn())
  expect(drawn.indexOf('"Raster"')).toBeGreaterThan(-1)
  expect(drawn.indexOf('"Raster"')).toBeLessThan(drawn.indexOf(await part(terminal, 'name')))
  await terminal.unmount()
})

test('A15: off the terminal a bar as wide as the disc stands in for the picture', { plugins: [LAYOUT] }, async ($, on) => {
  await open($, on, { now: at(WORKING) })
  const ui = await mount($)

  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ text: 'no picture' })).toBeUndefined()
  expect(await part(ui, 'bar')).toHaveLength(14)
  await ui.unmount()

  await $.command.run(run('widen', `${NAME} 60`))
  const wide = await mount($, 60)
  expect(await wide.find({ type: 'Raster' })).toBeUndefined()
  expect(await part(wide, 'bar')).toHaveLength(18)
  await wide.unmount()
})

test('A16: the bar is all lit at full, all dark at new, and lit on the left when waning', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await open($, on, { now: at(FULL_MOONS[2] ?? '') })
  const ui = await mount($)

  expect(await part(ui, 'bar')).toBe('█'.repeat(14))
  await jump($, world, at(LAST_QUARTER))
  expect(await part(ui, 'bar')).toBe(SOUTH_HALF)
  await jump($, world, at(NEW_MOON))
  expect(await part(ui, 'bar')).toBe('░'.repeat(14))
  await ui.unmount()
})

test('A17: every lore line wraps to at most two rows on the narrow card', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await open($, on, { now: at(MEAN_FULL) })
  const ui = await mount($, 20)
  const lore = new Set<string>()

  for (const minute of [MEAN_FULL, CRESCENT, FIRST_QUARTER, WORKING, BEST, LAST_QUARTER, WANING_CRESCENT, NEW_MOON]) {
    await jump($, world, at(minute))
    lore.add(await part(ui, 'lore'))
  }
  await ui.unmount()

  expect(lore.size).toBe(8)
  for (const line of lore) {
    expect(line.length).toBeGreaterThan(0)
    expect(line.length).toBeLessThanOrEqual(30)
    expect(Math.max(...line.split(' ').map(word => word.length))).toBeLessThanOrEqual(16)
    expect(rows(line, 16)).toBeLessThanOrEqual(2)
  }
})

test('A18: the countdown moves with the clock while the card is mounted', { plugins: [LAYOUT] }, async ($, on) => {
  const world = await open($, on, { now: at(BEST) })
  const ui = await mount($)
  const before = world.writes.length
  expect(await part(ui, 'countdown')).toMatch(/^Peak in 5h \d\dm$/)

  await world.clock.advance(HOUR)
  expect(await part(ui, 'countdown')).toMatch(/^Peak in 4h \d\dm$/)
  expect(world.writes.slice(before)).toEqual([])
  await ui.unmount()
})

test('A19: after off the minute timer is gone: no write and no tick', { plugins: [LAYOUT] }, async ($, on) => {
  let ticks = 0
  on('state.set', { plugin: NAME, key: 'tick' }, (_$, e, next) => {
    ticks += 1

    return next(e)
  })
  const world = await open($, on, { now: at(WORKING) })

  await world.clock.advance(HOUR)
  expect(ticks).toBe(60)

  await $.command.run(run(NAME, 'off'))
  const before = world.writes.length
  await world.clock.advance(HOUR)
  expect(world.writes.slice(before)).toEqual([])
  expect(ticks).toBe(60)
})

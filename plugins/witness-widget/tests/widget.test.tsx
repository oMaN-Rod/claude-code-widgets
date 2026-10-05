import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { PromptSubmitResult } from 'claude-code'

import { tok } from '../hooks/register'
import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Drawn = { note: string; lines: string[]; wraps: unknown[] }
type Beneath = { blocks?: string[]; drop?: string }

const NAME = 'witness-widget'
const PROMPT = 'Fix the failing test'
const USAGE = 'Usage: /witness-widget [on|off|show|clear]'
const OFF = 'Witness is off.'
const NOTHING = 'No hidden context has entered with a prompt since Witness was switched on.'
const EMPTY = ['Nothing hidden yet.', 'When a widget adds context to a prompt, its words show here.']
const HINT = '/witness-widget show: all in full'
const COLLISION = 'collision-widget: src/sum.js is also open in another session; read it again before you edit.'
const LEDGER = 'ledger-widget: 3 decisions stand: use bun for every script, keep the kit stamped, no comments.'
const PARKING = 'parking-widget: 2 ideas are parked for later: a dark theme, a faster cold start.'
const LISTED = 'ledger-widget: 3 decisions stand:\n\t1. use bun for every script\n\t2. keep the kit stamped\n\n   3. no comments'

const ABOVE: Plugin = {
  name: 'stand-in-above',
  tier: 'prepend',
  register(on) {
    on('prompt.submit', async ($, e, next) => {
      const blocks = (await $.store.get('above')) as string[] | undefined

      return blocks === undefined ? next(e) : next({ ...e, context: [...(e.context ?? []), ...blocks] })
    })
  },
}

const BENEATH: Plugin = {
  name: 'stand-in-beneath',
  tier: 'append',
  register(on) {
    on('prompt.submit', async ($, e, next) => {
      const plan = ((await $.store.get('beneath')) ?? {}) as { blocks?: string[]; drop?: string }
      if ((await $.store.get('isWatched')) === true) await $.store.set('seen', [...(((await $.store.get('seen')) ?? []) as unknown[]), e])
      if (plan.drop !== undefined) return { drop: plan.drop }
      if (plan.blocks === undefined) return next(e)

      const context = [...(e.context ?? []), ...plan.blocks]

      return { ...(await next({ ...e, context })), context }
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, ABOVE, BENEATH] }

const weigh = (...blocks: string[]): string => tok(Math.ceil(blocks.reduce((sum, block) => sum + block.length, 0) / 4))

const flat = (block: string): string => block.replace(/\s+/g, ' ').trim()

const setup = async ($: Engine, world: Ground): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const watch = (world: Ground): void => {
  world.store.set('isWatched', true)
  world.store.delete('seen')
}

const written = (world: Ground): string[] => world.writes.filter(write => write !== 'store seen')

const attach = (world: Ground, above?: string[], beneath?: Beneath): void => {
  if (above === undefined) world.store.delete('above')
  else world.store.set('above', above)
  if (beneath === undefined) world.store.delete('beneath')
  else world.store.set('beneath', beneath)
}

const submit = ($: Engine, origin: object | undefined = { kind: 'composer' }, text = PROMPT): Promise<PromptSubmitResult> =>
  $.prompt.submit({ text, wait: false, ...(origin === undefined ? {} : { origin }) } as never)

const drawn = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const rows = (await ui.findAll({ type: 'Text' })).slice(3)
  await ui.unmount()

  return { note, lines: rows.map(row => row.text), wraps: rows.map(row => row.props.wrap) }
}

const card = async ($: Engine, columns = 40): Promise<{ note: string; lines: string[] }> => {
  const { note, lines } = await drawn($, columns)

  return { note, lines }
}

const told = async ($: Engine, verb = 'show'): Promise<string> => (await $.command.run(run(NAME, verb))).text ?? ''

test('A1: says nothing hidden yet until a prompt carries context, from a restored switch too', PLUGINS, async ($, on) => {
  const world = ground(on, { store: { isOn: true } })

  await session($)
  await $.command.run(run('place', 'side'))
  expect(await card($)).toEqual({ note: '', lines: EMPTY })

  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  expect(await card($)).toEqual({ note: '', lines: EMPTY })

  attach(world)
  await submit($)
  await submit($, { kind: 'composer' }, 'Now run the linter')
  expect(await card($)).toEqual({ note: '', lines: EMPTY })
  expect(await told($)).toBe(NOTHING)
})

test('A2: shows what hooks above and beneath attached, in the order it entered', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)

  attach(world, [COLLISION], { blocks: [LEDGER] })
  await submit($)
  expect(await card($)).toEqual({
    note: '+2',
    lines: [COLLISION, LEDGER, `Last prompt: about ${weigh(COLLISION, LEDGER)} tokens`, '2 additions over 1 prompt', `about ${weigh(COLLISION, LEDGER)} tokens in all`, HINT],
  })
  expect(weigh(COLLISION, LEDGER)).toBe(String(Math.ceil((COLLISION.length + LEDGER.length) / 4)))

  await $.command.run(run(NAME, 'clear'))
  attach(world, [COLLISION])
  await submit($)
  expect(COLLISION.length).toBe(92)
  expect(await card($)).toEqual({
    note: '+1',
    lines: [COLLISION, 'Last prompt: about 23 tokens', '1 addition over 1 prompt', 'about 23 tokens in all', HINT],
  })
})

test('A3: a prompt with nothing added reads quiet and the next addition replaces the rows', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)

  attach(world, [COLLISION], { blocks: [LEDGER] })
  await submit($)
  attach(world)
  await submit($, { kind: 'composer' }, 'Now run the linter')
  expect(await card($)).toEqual({
    note: 'quiet',
    lines: ['Last prompt: nothing added', '2 additions over 2 prompts', `about ${weigh(COLLISION, LEDGER)} tokens in all`],
  })

  attach(world, [PARKING])
  await submit($, { kind: 'composer' }, 'And commit it')
  expect(await card($)).toEqual({
    note: '+1',
    lines: [PARKING, `Last prompt: about ${weigh(PARKING)} tokens`, '3 additions over 3 prompts', `about ${weigh(COLLISION, LEDGER, PARKING)} tokens in all`, HINT],
  })
})

test('A4: passes the prompt on as received and answers what came back', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  watch(world)

  attach(world, [COLLISION], { blocks: [LEDGER] })
  expect(await submit($)).toEqual({ text: PROMPT, context: [COLLISION, LEDGER] })
  expect(world.store.get('seen')).toEqual([{ text: PROMPT, wait: false, origin: { kind: 'composer' }, context: [COLLISION] }])
  expect(world.contexts).toEqual([COLLISION, LEDGER])

  const before = await card($)
  attach(world, [PARKING])
  const entered = [...world.contexts]
  Object.defineProperty(world.contexts, 'push', {
    value: () => {
      throw new Error('the session refused the prompt')
    },
  })
  await expect(submit($)).rejects.toThrow('no implementation for prompt.submit')
  expect(await card($)).toEqual(before)
  expect(await told($)).not.toContain(PARKING)
  expect(entered).toEqual([COLLISION, LEDGER])
})

test('A5: a dropped prompt says so, counts nothing and takes no number', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)

  attach(world, [COLLISION], { drop: 'blocked' })
  expect(await submit($)).toEqual({ drop: 'blocked' })
  expect(await card($)).toEqual({ note: 'dropped', lines: ['Last prompt was dropped', 'Nothing reached Claude'] })
  expect(await card($, 20)).toEqual({ note: 'dropped', lines: ['prompt dropped', 'nothing sent'] })

  attach(world, [COLLISION])
  await submit($)
  attach(world, [LEDGER], { drop: 'blocked' })
  expect(await submit($)).toEqual({ drop: 'blocked' })
  expect(await card($)).toEqual({
    note: 'dropped',
    lines: ['Last prompt was dropped', 'Nothing reached Claude', '1 addition over 1 prompt', 'about 23 tokens in all'],
  })

  attach(world, [PARKING])
  await submit($)
  expect(await card($)).toEqual({
    note: '+1',
    lines: [PARKING, `Last prompt: about ${weigh(PARKING)} tokens`, '2 additions over 2 prompts', `about ${weigh(COLLISION, PARKING)} tokens in all`, HINT],
  })
  expect(await told($)).toContain(`[prompt 2] about ${weigh(PARKING)} tokens\n${PARKING}`)
  expect(world.contexts).toEqual([COLLISION, PARKING])
})

test('A6: records the prompts a person sent and leaves every other kind alone', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  attach(world, [COLLISION])

  const own = [{ kind: 'composer' }, { kind: 'bridge' }, { kind: 'sdk' }, undefined]
  for (const [at, origin] of own.entries()) {
    await submit($, origin)
    expect((await card($)).lines[2]).toBe(`${at + 1} addition${at === 0 ? '' : 's'} over ${at + 1} prompt${at === 0 ? '' : 's'}`)
  }

  const before = await card($)
  const others = [{ kind: 'task-notification' }, { kind: 'scheduled-trigger' }, { kind: 'peer' }, { kind: 'plugin', name: 'notes-widget' }]
  for (const origin of others) {
    watch(world)
    expect(await submit($, origin)).toEqual({ text: PROMPT })
    expect(world.store.get('seen')).toEqual([{ text: PROMPT, wait: false, origin, context: [COLLISION] }])
    expect(await card($)).toEqual(before)
  }
  expect(before.lines[2]).toBe('4 additions over 4 prompts')
})

test('A7: show prints every addition in full, oldest first', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  expect(await told($)).toBe(NOTHING)

  attach(world, [COLLISION], { blocks: [LISTED] })
  await submit($)
  attach(world, [PARKING])
  await submit($, { kind: 'composer' }, 'Now run the linter')

  expect(await told($)).toBe(
    [
      `3 additions over 2 prompts, about ${weigh(COLLISION, LISTED, PARKING)} tokens in all (4 characters a token).`,
      '',
      '[prompt 1] about 23 tokens',
      COLLISION,
      '',
      `[prompt 1] about ${weigh(LISTED)} tokens`,
      LISTED,
      '',
      `[prompt 2] about ${weigh(PARKING)} tokens`,
      PARKING,
    ].join('\n'),
  )
  expect(await told($)).toContain('stand:\n\t1. use bun for every script\n\t2. keep the kit stamped\n\n   3. no comments')
})

test('A8: holds the first 2,000 characters of a long block and the last 20 additions', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  const long = `diff-widget: the working tree against main.\n${'+ const total = items.reduce((sum, item) => sum + item.price, 0)\n'.repeat(200)}`.slice(0, 12_345)

  attach(world, [long])
  await submit($)
  expect((await card($)).lines.slice(1)).toEqual(['Last prompt: about 3,087 tokens', '1 addition over 1 prompt', 'about 3,087 tokens in all', HINT])
  expect(await told($)).toBe(
    [
      '1 addition over 1 prompt, about 3,087 tokens in all (4 characters a token).',
      '',
      '[prompt 1] about 3,087 tokens',
      long.slice(0, 2000),
      '[cut: the first 2,000 of 12,345 characters]',
    ].join('\n'),
  )

  await $.command.run(run(NAME, 'clear'))
  const notes = Array.from({ length: 25 }, (_, at) => `notes-widget: note ${at + 1} of 25, pinned to this project.`)
  for (let at = 0; at < 25; at += 5) {
    attach(world, notes.slice(at, at + 2), { blocks: notes.slice(at + 2, at + 5) })
    await submit($)
  }
  const lines = (await told($)).split('\n')
  expect(lines[0]).toBe(`25 additions over 5 prompts, about ${weigh(...notes)} tokens in all (4 characters a token).`)
  expect(lines.filter(line => line.startsWith('notes-widget:'))).toEqual(notes.slice(5))
  expect(lines.filter(line => line.startsWith('[prompt ')).map(line => line.slice(0, 10))).toEqual(
    [2, 3, 4, 5].flatMap(prompt => Array.from({ length: 5 }, () => `[prompt ${prompt}]`)),
  )
  expect(lines.at(-1)).toBe('Only the last 20 are kept.')
})

test('A9: shows three rows and counts the rest, each block on one truncated row', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  const five = [COLLISION, LEDGER, PARKING, 'notes-widget: 4 notes are pinned.', 'vows-widget: 1 vow stands: no force push.']

  attach(world, five.slice(0, 2), { blocks: five.slice(2) })
  await submit($)
  const wide = await card($)
  expect(wide.note).toBe('+5')
  expect(wide.lines.slice(0, 4)).toEqual([COLLISION, LEDGER, PARKING, 'and 2 more'])
  expect((await card($, 20)).lines.slice(0, 4)).toEqual([COLLISION, LEDGER, PARKING, '+2 more'])

  attach(world, Array.from({ length: 24 }, (_, at) => `notes-widget: note ${at + 1} of 24.`))
  await submit($)
  const many = await card($)
  expect(many.note).toBe('+24')
  expect(many.lines.slice(0, 4)).toEqual(['notes-widget: note 5 of 24.', 'notes-widget: note 6 of 24.', 'notes-widget: note 7 of 24.', 'and 21 more'])

  attach(world, [' \n\t ', LISTED])
  await submit($)
  const tidy = await card($)
  expect(tidy.note).toBe('+1')
  expect(tidy.lines[0]).toBe(flat(LISTED))
  expect(tidy.lines[0]).toBe('ledger-widget: 3 decisions stand: 1. use bun for every script 2. keep the kit stamped 3. no comments')
  expect(tidy.lines[1]).toBe(`Last prompt: about ${weigh(LISTED)} tokens`)

  const wordy = `pitfalls-widget: ${'this repo keeps its tests beside the kit; '.repeat(10)}`.slice(0, 300)
  attach(world, [wordy])
  await submit($)
  for (const [columns, inner] of [[40, 36], [20, 16]] as const) {
    const { lines, wraps } = await drawn($, columns)
    expect(lines[0]).toBe(flat(wordy))
    expect(lines.filter(line => line.startsWith('pitfalls-widget:')).length).toBe(1)
    expect(wraps.every(wrap => wrap === 'truncate-end')).toBe(true)
    expect(lines.slice(1).every(line => line.length <= inner)).toBe(true)
  }
})

test('A10: clear and switching off both wipe the record, and verbs do nothing while off', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  attach(world, [COLLISION], { blocks: [LEDGER] })

  await submit($)
  expect(await told($, 'clear')).toBe('Witness cleared.')
  expect(await card($)).toEqual({ note: '', lines: EMPTY })
  expect(await told($)).toBe(NOTHING)

  await submit($)
  expect((await card($)).note).toBe('+2')
  await $.command.run(run(NAME, 'off'))
  const before = world.writes.length
  expect(await told($)).toBe(OFF)
  expect(await told($, 'clear')).toBe(OFF)
  expect(world.store.get('isOn')).toBe(false)
  expect(world.writes.slice(before)).toEqual([])
  const ui = await $.ui.mount(target(NAME, 'Pane'))
  expect(await ui.find({ key: 'card' })).toBeUndefined()
  await ui.unmount()

  await $.command.run(run(NAME, 'on'))
  expect(await card($)).toEqual({ note: '', lines: EMPTY })
  expect(await told($)).toBe(NOTHING)
})

test('A11: off, a prompt passes through untouched and nothing is recorded', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  await $.command.run(run(NAME, 'off'))
  const before = written(world).length
  watch(world)

  attach(world, [COLLISION], { blocks: [LEDGER] })
  expect(await submit($)).toEqual({ text: PROMPT, context: [COLLISION, LEDGER] })
  expect(world.store.get('seen')).toEqual([{ text: PROMPT, wait: false, origin: { kind: 'composer' }, context: [COLLISION] }])
  attach(world, [COLLISION], { drop: 'blocked' })
  expect(await submit($)).toEqual({ drop: 'blocked' })
  expect(written(world).slice(before)).toEqual([])

  await $.command.run(run(NAME, 'on'))
  expect(await card($)).toEqual({ note: '', lines: EMPTY })
  expect(await told($)).toBe(NOTHING)
})

test('A12: an unknown verb answers the usage and one command is registered', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  attach(world, [COLLISION])
  await submit($)
  const before = await card($)
  const writes = world.writes.length

  for (const verb of ['copy', 'all', 'show all', 'reset']) {
    expect(await told($, verb)).toBe(USAGE)
    expect(world.store.get('isOn')).toBe(true)
    expect(await card($)).toEqual(before)
  }
  expect(world.writes.slice(writes)).toEqual([])

  await $.command.run(run(NAME, 'off'))
  expect(await told($, 'copy')).toBe(USAGE)
  expect(world.store.get('isOn')).toBe(false)
  expect(world.commands).toEqual([NAME])
})

test('A13: every state reads at every width with large totals', { ...PLUGINS, timeoutMs: 60_000 }, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  const blocks = [...Array.from({ length: 12_344 }, (_, at) => `notes-widget: note ${at + 1}. ${'x'.repeat(400)}`.slice(0, 400)), `ledger-widget: ${'y'.repeat(670)}`.slice(0, 670)]
  const rows = blocks.slice(-20, -17)
  const fits = async (columns: number, note: string, lines: string[], verbatim = 0): Promise<void> => {
    const limit = columns >= 40 ? 36 : 16
    const shown = await drawn($, columns)
    expect({ columns, note: shown.note, lines: shown.lines }).toEqual({ columns, note, lines })
    expect(`Witness ${note}`.trimEnd().length <= 16).toBe(true)
    for (const [at, line] of shown.lines.entries()) {
      if (shown.wraps[at] === 'wrap') expect(line.split(' ').every(word => word.length <= 16)).toBe(true)
      else if (at >= verbatim) expect(line.length <= limit).toBe(true)
    }
  }
  const quiet = async (count: number): Promise<void> => {
    attach(world)
    for (let at = 0; at < count; at += 1) await submit($)
  }

  expect(blocks.reduce((sum, block) => sum + block.length, 0)).toBe(4_938_270)
  for (const columns of [20, 39, 40, 60]) await fits(columns, '', EMPTY)

  await quiet(6787)
  attach(world, blocks.slice(0, 6000), { blocks: blocks.slice(6000) })
  await submit($)
  await quiet(1)
  for (const columns of [20, 39]) await fits(columns, 'quiet', ['nothing added', '12,345 added', 'all ~1,234k tok'])
  for (const columns of [40, 60]) await fits(columns, 'quiet', ['Last prompt: nothing added', '12,345 additions over 6,789 prompts', 'about 1,234k tokens in all'])

  await $.command.run(run(NAME, 'clear'))
  await quiet(6788)
  attach(world, blocks.slice(0, 6000), { blocks: blocks.slice(6000) })
  await submit($)
  for (const columns of [20, 39]) await fits(columns, '+12,345', [...rows, '+12,342 more', 'now ~1,234k tok', '12,345 added', 'all ~1,234k tok', 'show: in full'], 3)
  for (const columns of [40, 60]) {
    await fits(columns, '+12,345', [...rows, 'and 12,342 more', 'Last prompt: about 1,234k tokens', '12,345 additions over 6,789 prompts', 'about 1,234k tokens in all', HINT], 3)
  }

  attach(world, undefined, { drop: 'blocked' })
  await submit($)
  for (const columns of [20, 39]) await fits(columns, 'dropped', ['prompt dropped', 'nothing sent', '12,345 added', 'all ~1,234k tok'])
  for (const columns of [40, 60]) await fits(columns, 'dropped', ['Last prompt was dropped', 'Nothing reached Claude', '12,345 additions over 6,789 prompts', 'about 1,234k tokens in all'])

  expect([310, 9999, 10_000, 1_234_567].map(tok)).toEqual(['310', '9,999', '10k', '1,234k'])

  await $.command.run(run(NAME, 'clear'))
  attach(world, [COLLISION])
  await submit($)
  expect((await card($)).lines[2]).toBe('1 addition over 1 prompt')
  expect((await card($, 20)).lines.slice(1)).toEqual(['now ~23 tok', '1 added', 'all ~23 tok', 'show: in full'])
})

test('A14: draws the same card in each placement and nowhere else', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($, world)
  attach(world, [COLLISION], { blocks: [LEDGER] })
  await submit($)
  const wanted = await drawn($)
  expect(wanted.note).toBe('+2')

  for (const [place] of SITES) {
    await $.command.run(run('place', place))
    for (const [other, component] of SITES) {
      const ui = await $.ui.mount(target(NAME, component))
      const isDrawn = (await ui.find({ key: 'card' })) !== undefined
      await ui.unmount()
      expect(isDrawn).toBe(other === place)
      if (isDrawn) expect(await drawn($, 40, component)).toEqual(wanted)
    }
  }
})

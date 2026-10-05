import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Component = (typeof SITES)[number][1]
type Selection = { text: string; requestId?: string }
type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
type Card = { note: string; lines: string[]; dim: string[]; yellow: string[]; buttons: unknown[]; field: Record<string, unknown> | undefined }
type View = {
  see: () => Promise<Card | undefined>
  press: (key: 'mark' | 'send') => Promise<Card | undefined>
  type: (text: string, kind?: 'submit' | 'change') => Promise<Card | undefined>
  close: () => Promise<void>
}
type Desk = {
  world: Ground
  calls: string[]
  fills: { text: string; mode: unknown }[]
  at: {
    selection: Selection | 'reject' | undefined
    draft: string | 'reject'
    fill: 'take' | 'refuse' | 'empty' | 'reject'
  }
}

const NAME = 'margin-widget'
const PLUGINS = { plugins: [LAYOUT] }
const USAGE = 'Usage: /margin-widget [on|off|mark [remark]|drop <n>|send|clear]'
const OFF = 'Margin is off.'
const EMPTY = ['Select text in a reply with the', 'mouse, then press Mark.']
const BLANK: Card = { note: '', lines: EMPTY, dim: EMPTY, yellow: [], buttons: ['mark'], field: undefined }
const FULLSCREEN = 'Margin needs fullscreen: /tui fullscreen'
const TERMINAL = 'Margin works in the terminal only.'
const SENT = ['In the prompt box. Cleared when you', 'submit.']
const NOTHING = 'Nothing selected.'
const ONE_REPLY = 'Select inside one reply.'
const ALREADY = 'Already marked.'
const FULL = 'Margin is full: send or drop.'
const REFUSED = 'The prompt box took nothing. Marks kept.'
const KEPT = ['The prompt box took nothing. Marks', 'kept.']
const FILLED = 'In the prompt box: 2 marks. Read it, then submit.'
const TWO = '> line one\n> line two\nthe remark\n\n> bare passage\n'
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u

const LOOP = 'The loop in src/sum.js started at index 1, so the first item was never added.'
const FIXED = 'It starts at 0 now and the tests pass: 14 of 14 in test/sum.test.js.'
const NEVER = 'the first item was never added'
const NPM = 'npm test'
const REPLY = `${LOOP} ${FIXED} I also renamed the accumulator from t to total and left the empty-list case returning 0, which the README already promised. `
const PROSE = REPLY.repeat(6)
const WHOLE = `${[...PROSE].slice(4, 603).join('')}.`
const CODE = 'const total = 0\n\tfor (const item of list)\n\t\ttotal += item'
const ASKED = 'why does this loop start at one and not at zero like the others? '.repeat(4).slice(0, 199)
const TOKEN = `検索結果/${'sha512-Zm9vYmFyYmF6cXV4'.repeat(40)}`

const pick = (text: string, requestId = 'answer-1'): Selection => ({ text, requestId })

const letters = (text: string, count: number): string => [...text].slice(0, count).join('')

const across = (text: string): number => [...text].reduce((sum, letter) => sum + (WIDE.test(letter) ? 2 : 1), 0)

const open = (on: On, store?: Record<string, unknown>): Desk => {
  const calls: string[] = []
  const fills: Desk['fills'] = []
  const at: Desk['at'] = { selection: undefined, draft: '', fill: 'take' }
  const world = ground(on, {
    store,
    answers: {
      'ui.selection': () => {
        calls.push('ui.selection')
        if (at.selection === 'reject') throw new Error('no selection on this surface')

        return at.selection
      },
      'prompt.read': () => {
        calls.push('prompt.read')
        if (at.draft === 'reject') throw new Error('the prompt box is gone')

        return { text: at.draft, cursor: at.draft.length }
      },
    },
  })
  on('prompt.fill', (_$, e) => {
    calls.push('prompt.fill')
    fills.push({ text: e.text, mode: e.mode })
    if (at.fill === 'reject') throw new Error('the prompt box is gone')
    if (at.fill === 'refuse') return { isFilled: false }
    if (at.fill === 'empty') return {} as never

    return { isFilled: true }
  })

  return { world, calls, fills, at }
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const every = (node: unknown): Drawn[] => (typeof node === 'object' && node !== null ? [node as Drawn, ...((node as Drawn).children ?? []).flatMap(every)] : [])

const shown = (node: unknown): string =>
  typeof node === 'string' || typeof node === 'number' ? String(node) : typeof node === 'object' && node !== null ? ((node as Drawn).children ?? []).map(shown).join('') : ''

const read = (tree: unknown): Card | undefined => {
  const nodes = every(tree)
  if (!nodes.some(node => node.props?.key === 'card')) return undefined

  const rows = nodes.filter(node => node.type === 'Text' && node.props?.wrap === 'truncate-end')

  return {
    note: shown(nodes.find(node => node.props?.key === 'note')),
    lines: rows.map(shown),
    dim: rows.filter(row => row.props?.dimColor === true).map(shown),
    yellow: rows.filter(row => row.props?.color === 'yellow').map(shown),
    buttons: nodes.filter(node => node.type === 'Button').map(button => button.props?.key),
    field: nodes.find(node => node.type === 'Input')?.props,
  }
}

const view = async ($: Engine, component: Component = 'Pane', columns = 40, mounted: unknown = target(NAME, component, columns)): Promise<View> => {
  const ui = await $.ui.mount(mounted as never)
  const see = async (): Promise<Card | undefined> => read(await ui.drawn())

  return {
    see,
    press: async key => {
      await ui.press({ key })

      return see()
    },
    type: async (text, kind = 'submit') => {
      await ui.input({ key: 'remark', text, kind })

      return see()
    },
    close: () => ui.unmount(),
  }
}

const card = async ($: Engine, columns = 40, component: Component = 'Pane', mounted?: unknown): Promise<Card | undefined> => {
  const once = await view($, component, columns, mounted)
  const seen = await once.see()
  await once.close()

  return seen
}

const marked = async ($: Engine, desk: Desk, text: string, remark = ''): Promise<string | undefined> => {
  desk.at.selection = pick(text)

  return cmd($, remark === '' ? 'mark' : `mark ${remark}`)
}

const prompt = ($: Engine, kind: string, text = 'Is the accumulator rename needed?', context?: string[]): Promise<unknown> =>
  $.prompt.submit({ text, wait: false, origin: { kind }, ...(context === undefined ? {} : { context }) } as never)

test('A1: the empty card says how to mark, with only the mark button, and nothing is read before a press', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true })
  desk.at.selection = pick(LOOP)
  await session($)
  await $.command.run(run('place', 'side'))
  const pane = await view($)

  expect(await pane.see()).toEqual(BLANK)

  expect(await cmd($, 'off')).toBe('Margin off.')
  expect(await cmd($, 'on')).toBe('Margin on; /widgets places it.')
  expect(await pane.see()).toEqual(BLANK)
  expect(desk.calls).toEqual([])
})

test('A2: pressing mark reads the selection once, adds the mark and a focused remark field', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  desk.at.selection = pick(LOOP)

  const pane = await view($)
  const waiting = await pane.press('mark')
  await pane.close()
  expect(desk.calls).toEqual(['ui.selection'])
  expect(waiting).toMatchObject({ note: '1 mark', lines: ['1 The loop in src/sum.js started at…'], yellow: [], buttons: ['mark', 'send'] })
  expect(waiting?.field).toMatchObject({ key: 'remark', placeholder: 'remark on 1', submitLabel: 'save', autoFocus: true, value: '' })

  for (const [site, component] of [
    ['above', 'AbovePrompt'],
    ['below', 'PromptHint'],
  ] as const) {
    await cmd($, 'clear')
    await $.command.run(run('place', site))
    desk.calls.length = 0
    const placed = await view($, component)
    expect(await placed.press('mark')).toEqual(waiting)
    await placed.close()
    expect(desk.calls).toEqual(['ui.selection'])
  }
})

test('A3: a submitted remark is tidied, kept to 200 characters and stored under its passage; typing alone stores nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const pane = await view($)
  desk.at.selection = pick(LOOP)
  await pane.press('mark')

  expect(await pane.type('why only', 'change')).toMatchObject({ lines: ['1 The loop in src/sum.js started at…'], field: { placeholder: 'remark on 1' } })
  expect(await pane.type('  why   only here? ')).toMatchObject({ lines: ['1 The loop in src/sum.js started at…', '  why only here?'], field: undefined })

  const long = 'why does this loop start at one and not at zero like the others? '.repeat(5).slice(0, 300)
  desk.at.selection = pick(FIXED)
  await pane.press('mark')
  await pane.type(long)
  desk.at.selection = pick(NEVER)
  expect((await pane.press('mark'))?.field).toMatchObject({ placeholder: 'remark on 3' })
  const bare = await pane.type('')
  expect(bare).toMatchObject({ note: '3 marks', field: undefined })
  expect(bare?.lines.slice(-1)).toEqual([`3 ${NEVER}`])

  await cmd($, 'send')
  expect(desk.fills.at(-1)?.text).toBe(`> ${LOOP}\nwhy only here?\n\n> ${FIXED}\n${long.slice(0, 200)}\n\n> ${NEVER}\n`)
})

test('A4: the mark verb takes a remark with its case kept, draws the field only without one, and reads the selection once', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const pane = await view($)

  expect(await marked($, desk, LOOP, 'Is this the ONLY loop?')).toBe('Marked 1.')
  expect(await pane.see()).toMatchObject({ note: '1 mark', lines: ['1 The loop in src/sum.js started at…', '  Is this the ONLY loop?'], field: undefined })

  expect(await marked($, desk, FIXED)).toBe('Marked 2.')
  expect((await pane.see())?.field).toMatchObject({ placeholder: 'remark on 2' })

  desk.at.selection = pick(NPM)
  expect(await cmd($, 'MARK  run it   with coverage')).toBe('Marked 3.')
  expect((await pane.see())?.lines.slice(-2)).toEqual([`3 ${NPM}`, '  run it with coverage'])
  expect(desk.calls).toEqual(['ui.selection', 'ui.selection', 'ui.selection'])
})

test('A5: every refusal keeps the marks, answers its sentence from the verb and shows it on the card only after a press', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const pane = await view($)
  const refusals = [
    [undefined, NOTHING],
    [{ text: '  \n' }, NOTHING],
    ['reject', NOTHING],
    [{ text: LOOP }, ONE_REPLY],
  ] as const

  for (const [selection, sentence] of refusals) {
    desk.at.selection = selection
    expect(await cmd($, 'mark why here')).toBe(sentence)
  }
  expect(await pane.see()).toEqual(BLANK)

  for (const [selection, sentence] of [...refusals].reverse()) {
    desk.at.selection = selection
    expect(await pane.press('mark')).toEqual({ ...BLANK, lines: [...EMPTY, sentence], yellow: [sentence] })
  }

  desk.at.selection = pick(LOOP)
  const one = await pane.press('mark')
  expect(one).toMatchObject({ note: '1 mark', lines: ['1 The loop in src/sum.js started at…'], yellow: [], field: { placeholder: 'remark on 1' } })

  expect(await cmd($, 'mark')).toBe(ALREADY)
  expect(await pane.see()).toEqual(one)
  expect(await pane.press('mark')).toEqual({ ...one, lines: [...(one?.lines ?? []), ALREADY], yellow: [ALREADY] })

  for (let number = 2; number <= 9; number += 1) expect(await marked($, desk, `${number}. ${FIXED}`, 'which tests?')).toBe(`Marked ${number}.`)
  const nine = await pane.see()
  expect(nine).toMatchObject({ note: '9 marks', yellow: [] })

  desk.at.selection = pick(NEVER)
  expect(await cmd($, 'mark')).toBe(FULL)
  expect(await pane.see()).toEqual(nine)
  expect(await pane.press('mark')).toEqual({ ...nine, lines: [...(nine?.lines ?? []), FULL], yellow: [FULL] })
  expect(desk.calls.filter(call => call !== 'ui.selection')).toEqual([])
})

test('A6: a long passage is held as its first 600 characters, line ends lose their returns and the card shows one spaced row', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const head = `${letters(PROSE, 599)}😀`

  expect(await marked($, desk, `${head}${PROSE.slice(0, 100)}`, 'too long?')).toBe('Marked 1, cut to 600 characters.')
  expect([...WHOLE]).toHaveLength(600)
  expect(await marked($, desk, `  ${WHOLE}\n`, 'whole')).toBe('Marked 2.')
  expect(await marked($, desk, 'line one\r\nline two\r\n', 'returns')).toBe('Marked 3.')
  expect(await marked($, desk, CODE, 'tabs')).toBe('Marked 4.')

  expect((await card($))?.lines.slice(-4)).toEqual(['3 line one line two', '  returns', '4 const total = 0 for (const item o…', '  tabs'])
  expect((await card($, 60))?.lines.slice(-2)).toEqual(['4 const total = 0 for (const item o…', '  tabs'])

  await cmd($, 'send')
  expect(desk.fills[0]?.text).toBe(
    `> ${head}…\ntoo long?\n\n> ${WHOLE}\nwhole\n\n> line one\n> line two\nreturns\n\n> const total = 0\n> \tfor (const item of list)\n> \t\ttotal += item\ntabs\n`,
  )
})

test('A7: send appends every mark to the prompt box as quotes with remarks, after a blank line when a draft is there', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const pane = await view($)
  await marked($, desk, 'line one\r\nline two', 'the remark')
  await marked($, desk, 'bare passage')

  expect(await cmd($, 'send')).toBe(FILLED)
  expect(desk.fills).toEqual([{ text: TWO, mode: 'append' }])
  expect(desk.calls.slice(2, 4)).toEqual(['prompt.read', 'prompt.fill'])
  const sent = await pane.see()
  expect(sent).toMatchObject({ note: 'sent', lines: ['1 line one line two', '  the remark', '2 bare passage', ...SENT], dim: SENT, yellow: [], field: { placeholder: 'remark on 2' } })

  desk.at.draft = 'fix it'
  expect(await cmd($, 'send')).toBe(FILLED)
  expect(desk.fills[1]).toEqual({ text: `\n\n${TWO}`, mode: 'append' })

  desk.at.draft = 'reject'
  expect(await cmd($, 'send')).toBe(FILLED)
  expect(desk.fills[2]).toEqual({ text: TWO, mode: 'append' })

  desk.at.draft = '  \n'
  await cmd($, 'drop 2')
  await marked($, desk, 'bare passage')
  expect((await pane.see())?.note).toBe('2 marks')
  expect(await pane.press('send')).toEqual(sent)
  expect(desk.fills[3]).toEqual({ text: TWO, mode: 'append' })
  expect(desk.calls.filter(call => call === 'prompt.fill')).toHaveLength(4)

  await cmd($, 'clear')
  await marked($, desk, 'first\n\n  \nfourth', 'gaps')
  await cmd($, 'send')
  expect(desk.fills[4]?.text).toBe('> first\n>\n>\n> fourth\ngaps\n')
})

test('A8: a send with no marks or a prompt box that takes nothing says so and keeps the marks', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  expect(await cmd($, 'send')).toBe('No marks to send.')
  expect(desk.calls).toEqual([])

  await marked($, desk, LOOP, 'is this the only loop?')
  await marked($, desk, FIXED, 'which tests?')
  const pane = await view($)
  const held = await pane.see()
  expect(held).toMatchObject({ note: '2 marks', yellow: [] })

  for (const fill of ['refuse', 'empty', 'reject'] as const) {
    desk.at.fill = fill
    expect(await cmd($, 'send')).toBe(REFUSED)
    expect(await pane.see()).toEqual(held)

    expect(await pane.press('send')).toEqual({ ...held, lines: [...(held?.lines ?? []), ...KEPT], yellow: KEPT })
    await marked($, desk, NPM)
    await cmd($, 'drop 3')
  }
  expect(await pane.see()).toEqual(held)
  expect(desk.fills).toHaveLength(6)
})

test('A9: the marks are cleared by the next prompt of the person after a send that filled, and by nothing else', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const pane = await view($)

  for (const kind of ['composer', 'bridge', 'sdk']) {
    await marked($, desk, LOOP, 'is this the only loop?')
    await cmd($, 'send')
    desk.world.contexts.length = 0
    expect(await prompt($, kind, `${TWO}Answer both.`, ['git status: clean'])).toEqual({ text: `${TWO}Answer both.` })
    expect(desk.world.contexts).toEqual(['git status: clean'])
    expect(await pane.see()).toEqual(BLANK)
  }

  await marked($, desk, LOOP, 'is this the only loop?')
  await cmd($, 'send')
  const sent = await pane.see()
  await prompt($, 'task-notification', 'Background task finished: npm test')
  expect(await pane.see()).toEqual(sent)
  expect(sent?.note).toBe('sent')

  await cmd($, 'clear')
  await marked($, desk, LOOP, 'is this the only loop?')
  const unsent = await pane.see()
  await prompt($, 'composer')
  expect(await pane.see()).toEqual(unsent)
  expect(unsent?.note).toBe('1 mark')

  await cmd($, 'send')
  await marked($, desk, FIXED, 'which tests?')
  await prompt($, 'composer')
  expect((await pane.see())?.note).toBe('2 marks')

  await cmd($, 'send')
  expect(await cmd($, 'drop 1')).toBe('Dropped 1.')
  await prompt($, 'composer')
  expect(await pane.see()).toMatchObject({ note: '1 mark', lines: [`1 ${FIXED.slice(0, 33)}…`, '  which tests?'] })
})

test('A10: drop removes one mark and renumbers the rest, and clear leaves the empty card', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const pane = await view($)
  await marked($, desk, LOOP, 'is this the only loop?')
  await marked($, desk, NEVER, 'which item?')
  desk.at.selection = pick(NPM)
  expect((await pane.press('mark'))?.field).toMatchObject({ placeholder: 'remark on 3' })

  expect(await cmd($, 'drop 2')).toBe('Dropped 2.')
  expect(await pane.see()).toMatchObject({ note: '2 marks', lines: ['1 The loop in src/sum.js started at…', '  is this the only loop?', `2 ${NPM}`], field: undefined })

  expect(await cmd($, 'drop 7')).toBe('No mark 7.')
  expect(await cmd($, 'drop 0')).toBe('No mark 0.')
  expect(await cmd($, 'drop 03')).toBe('No mark 3.')
  expect((await pane.see())?.note).toBe('2 marks')
  expect(await cmd($, 'DROP 01')).toBe('Dropped 1.')
  expect((await pane.see())?.lines).toEqual([`1 ${NPM}`])

  desk.at.selection = undefined
  expect((await pane.press('mark'))?.yellow).toEqual([NOTHING])
  expect(await cmd($, 'clear')).toBe('Margin cleared.')
  expect(await pane.see()).toEqual(BLANK)
})

test('A11: outside a fullscreen terminal the card is one sentence and mark reads nothing; the marks return with fullscreen', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await marked($, desk, LOOP, 'is this the only loop?')
  desk.calls.length = 0

  const pane = target(NAME, 'Pane') as Record<string, unknown>
  const { viewport: _viewport, ...bare } = pane
  const needs = { note: '', lines: ['Margin needs fullscreen: /tui', 'fullscreen'], dim: ['Margin needs fullscreen: /tui', 'fullscreen'], yellow: [], buttons: [], field: undefined }
  const narrow = ['Margin needs', 'fullscreen: /tui', 'fullscreen']
  expect(await card($, 40, 'Pane', bare)).toEqual(needs)
  expect(await card($, 20, 'Pane', { ...(target(NAME, 'Pane', 20) as Record<string, unknown>), viewport: { columns: 20, rows: 40, isFullscreen: false } })).toEqual({
    ...needs,
    lines: narrow,
    dim: narrow,
  })

  for (const surface of ['desktop', 'vscode', 'mobile']) {
    expect(await card($, 40, 'Pane', target(NAME, 'Pane', 40, surface))).toEqual({ ...needs, lines: [TERMINAL], dim: [TERMINAL] })
  }

  desk.at.selection = pick(FIXED)
  expect((await $.command.run({ ...run(NAME, 'mark which tests?'), presentation: { isFullscreen: false, columns: 160 } })).text).toBe(FULLSCREEN)
  expect(desk.calls).toEqual([])
  expect(await card($)).toMatchObject({ note: '1 mark', lines: ['1 The loop in src/sum.js started at…', '  is this the only loop?'], buttons: ['mark', 'send'] })
})

test('A12: while off the verbs do nothing, a prompt passes untouched, and switching off forgets the marks', PLUGINS, async ($, on) => {
  const desk = open(on)
  await session($)
  await $.command.run(run('place', 'side'))
  desk.at.selection = pick(LOOP)

  for (const verb of ['mark', 'mark why here', 'drop 1', 'send', 'clear']) expect(await cmd($, verb)).toBe(OFF)
  expect(desk.calls).toEqual([])
  expect(desk.world.writes).toEqual([])
  expect(await prompt($, 'composer', 'Fix the failing test', ['git status: clean'])).toEqual({ text: 'Fix the failing test' })
  expect(desk.world.contexts).toEqual(['git status: clean'])

  await cmd($, 'on')
  const pane = await view($)
  await marked($, desk, LOOP)
  await pane.type('is this the only loop?')
  await cmd($, 'send')
  expect((await pane.see())?.note).toBe('sent')
  await cmd($, 'off')
  expect(await pane.see()).toBeUndefined()
  await cmd($, 'on')
  expect(await pane.see()).toEqual(BLANK)
  await prompt($, 'composer')
  expect(await pane.see()).toEqual(BLANK)

  await marked($, desk, FIXED, 'which tests?')
  await cmd($, 'send')
  await cmd($, 'clear')
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
  expect(new Set(desk.world.writes)).toEqual(new Set(['store isOn']))
})

test('A13: malformed verbs answer the usage line and change nothing, and one command is registered', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await marked($, desk, LOOP, 'is this the only loop?')
  const pane = await view($)
  const held = await pane.see()
  const writes = desk.world.writes.length
  desk.calls.length = 0

  for (const args of ['drop', 'drop x', 'drop 1.5', 'drop -1', 'drop 1 2', 'send now', 'clear all', 'jump 1', 'remark hi', 'on now']) {
    expect(await cmd($, args)).toBe(USAGE)
  }
  expect(await pane.see()).toEqual(held)
  expect(held?.note).toBe('1 mark')
  expect(desk.calls).toEqual([])
  expect(desk.world.writes).toHaveLength(writes)
  expect(desk.world.store.get('isOn')).toBe(true)
  expect(desk.world.commands).toEqual([NAME])
})

test('A14: six long marks with long remarks, a waiting field and a refusal fit the card at 20, 40 and 60 columns', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  for (let number = 1; number <= 5; number += 1) {
    await marked($, desk, number === 4 ? letters(TOKEN, 600) : letters(`${number}) ${PROSE}`, 600), ASKED)
  }
  desk.at.selection = pick(letters(`6) ${PROSE}`, 600))
  const pane = await view($)
  await pane.press('mark')
  await pane.press('mark')
  await pane.close()

  for (const [columns, inner, note] of [
    [20, 16, '6'],
    [40, 36, '6 marks'],
    [60, 36, '6 marks'],
  ] as const) {
    const drawn = await card($, columns)
    const lines = drawn?.lines ?? []
    expect(drawn?.note).toBe(note)
    expect(lines.filter(line => across(line) > inner)).toEqual([])
    expect(lines.map(line => line.slice(0, 2))).toEqual(['2 ', '3 ', '  ', '4 ', '  ', '5 ', '  ', '6 ', 'Al'])
    expect(lines[0]).toBe('2 earlier')
    expect(lines[3]?.startsWith('4 検索結果/sha')).toBe(true)
    expect(lines.slice(1, 8).every(line => line.endsWith('…') && across(line) >= inner - 1)).toBe(true)
    expect(drawn?.yellow).toEqual([ALREADY])
    expect(drawn?.field).toMatchObject({ placeholder: 'remark on 6' })
    expect(drawn?.buttons).toEqual(['mark', 'send'])
  }
})

test('A15: the card with marks is the same in all three placements and absent where the layout does not place it', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await marked($, desk, LOOP, 'is this the only loop?')
  await marked($, desk, FIXED)
  const views = [await view($, 'Pane'), await view($, 'AbovePrompt'), await view($, 'PromptHint')]
  const side = await views[0]?.see()
  expect(side).toMatchObject({ note: '2 marks', buttons: ['mark', 'send'], field: { placeholder: 'remark on 2' } })

  for (const [site] of SITES) {
    await $.command.run(run('place', site))
    expect(await Promise.all(views.map(held => held.see()))).toEqual(SITES.map(([placed]) => (placed === site ? side : undefined)))
  }
})

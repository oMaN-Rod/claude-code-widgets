import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { ModelForkResult, On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Desk = { world: Ground; prompts: string[]; replies: (ModelForkResult | Promise<ModelForkResult> | Error)[] }
type Drawn = { title: string; note: string; question: string | undefined; lines: string[]; isEmpty: boolean; wraps: unknown[]; colors: unknown[] }

const NAME = 'aside-widget'
const USAGE = 'Usage: /aside-widget [on|off|ask <question>|clear]'
const OFF = 'Aside is off.'
const BUSY = 'Still answering the last one; /aside-widget clear drops it.'
const DROPPED = 'Aside dropped the answer.'
const ANSWERED = 'Answered on the Aside card.'
const CLEARED = 'Aside cleared.'
const EMPTY = 'No side question yet. /aside-widget ask <question> asks about this conversation without adding a turn to it.'
const READING = 'Reading the conversation…'
const BRIEF =
  'This is a side question from the user about the conversation so far. Answer it in plain text, in under 280 characters. Use no tools and do not carry on with the task.'
const QUESTION = 'Why did the first test fail?'
const SHORT = 'The loop started at 1.'
const NOTHING = 'Nothing to ask about yet. Finish one turn first.'
const UNREACHED = 'The model could not be reached. Try again.'
const WORDLESS = 'The model gave no answer.'
const CUT = 'The question was cut short.'
const SPENT = { input_tokens: 9400, output_tokens: 30, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 }
const NONE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const REPORT = [
  'The first run failed in sum.test.js at the case named adds every item.',
  'The loop in src/sum.js started at index 1, so the first item was never added and the total came out 4 short.',
  'You asked for the smallest fix, so only the loop start changed: it began at 1 and now begins at 0.',
  'After that change npm test passed all 12 cases in about two seconds.',
  'Nothing else in the project was edited, and the lint step was not run because it was not asked for.',
  'The second run also printed a deprecation warning from the test runner about the old config key, which is unrelated to the failure and was left alone.',
  'If you want it gone, rename the key in package.json and run the suite once more to confirm.',
  'No files outside src and tests were read during this session at any point.',
].join('\n')
const FLAT = REPORT.replaceAll('\n', ' ')
const KANJI = '最初のテストが失敗したのは、ループが二番目から始まっていて、先頭の要素が合計に加えられていなかったためです。'
const HANGUL = '첫 번째 테스트는 src/sum.js 의 반복문이 인덱스 1에서 시작해서 첫 항목이 합계에 더해지지 않았기 때문에 실패했습니다.'
const PARTY = 'All 12 cases pass now 🎉 and the fix was one line 👍🏽 in src/sum.js, résumé of the run: ✅ 12, ❌ 0, ⚠️ 1 warning.'

const span = (text: string): number =>
  [...new Intl.Segmenter().segment(text)].reduce((sum, { segment }) => {
    const point = segment.codePointAt(0) ?? 0
    const isWide = (point >= 0x1100 && point <= 0x115f) || (point >= 0x2e80 && point <= 0xffe6) || point >= 0x1f000 || /[✅❌]|️/u.test(segment)

    return sum + (isWide ? 2 : 1)
  }, 0)

const WATCH: Plugin = {
  name: 'stand-in-menu',
  tier: 'append',
  register(on) {
    on('command.register', async ($, e, next) => {
      await $.ui.toast(JSON.stringify(e))

      return next(e)
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, WATCH] }

const said = (text: string): ModelForkResult => ({ isAnswered: true, text, usage: SPENT })

const open = (on: On, store: Record<string, unknown> = {}): Desk => {
  const desk: Desk = { world: ground(on, { store }), prompts: [], replies: [] }
  on('model.fork', async (_$, e) => {
    desk.prompts.push(e.prompt)
    const reply = desk.replies.shift()
    if (reply === undefined || reply instanceof Error) throw reply ?? new Error('no fork was expected')

    return { value: await reply } as never
  })

  return desk
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const ask = async ($: Engine, desk: Desk, reply: ModelForkResult | Error, question = QUESTION): Promise<string | undefined> => {
  desk.replies.push(reply)

  return cmd($, `ask ${question}`)
}

const held = async ($: Engine, desk: Desk): Promise<{ free: (reply: ModelForkResult) => void; answer: Promise<string | undefined> }> => {
  const gate = Promise.withResolvers<ModelForkResult>()
  const sent = desk.prompts.length
  desk.replies.push(gate.promise)
  const answer = cmd($, `ask ${QUESTION}`)
  for (let wait = 0; wait < 500 && desk.prompts.length === sent; wait += 1) await new Promise(done => setTimeout(done, 1))

  return { free: gate.resolve, answer }
}

const end = async ($: Engine, more: Record<string, unknown> = {}): Promise<unknown> =>
  $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId: 'turn-1', reason: 'answer', ...more } as never)

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const box = await ui.find({ key: 'card' })
  const title = (await ui.find({ key: 'title' }))?.text ?? ''
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const question = (await ui.find({ key: 'question' }))?.text
  const isEmpty = (await ui.find({ key: 'empty' })) !== undefined
  const texts = (await ui.findAll({ type: 'Text' })).slice(3)
  await ui.unmount()
  if (box === undefined) return undefined

  const rows = texts.slice(question === undefined ? 0 : 1)

  return { title, note, question, lines: rows.map(row => row.text), isEmpty, wraps: texts.map(row => row.props.wrap), colors: rows.map(row => row.props.color) }
}

const blank = (drawn: Drawn | undefined): void => {
  expect(drawn?.isEmpty).toBe(true)
  expect(drawn?.note).toBe('')
  expect(drawn?.question).toBeUndefined()
  expect(drawn?.lines.join(' ')).toBe(EMPTY)
}

test('A1: on with nothing asked shows the empty sentence, an empty note and no question row', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const drawn = await card($)
  blank(drawn)
  expect(drawn?.title).toBe('Aside')
  expect(drawn?.lines).toEqual(['No side question yet. /aside-widget', 'ask <question> asks about this', 'conversation without adding a turn', 'to it.'])
  expect((await card($, 20))?.lines).toEqual(['No side question', 'yet.', '/aside-widget', 'ask <question>', 'asks about this', 'conversation', 'without adding a', 'turn to it.'])
  expect(desk.prompts).toEqual([])
})

test('A2: ask makes one fork with the brief and the question and puts the answer on the card', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(await ask($, desk, said(SHORT))).toBe(ANSWERED)
  expect(desk.prompts).toEqual([`${BRIEF}\n\n${QUESTION}`])
  const drawn = await card($)
  expect(drawn?.question).toBe(QUESTION)
  expect(drawn?.lines).toEqual([SHORT])
  expect(drawn?.note).toBe('')
  expect(drawn?.isEmpty).toBe(false)
})

test('A3: while the fork is out the card says asking and a second ask is turned away', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const out = await held($, desk)
  const working = await card($)
  expect(working?.note).toBe('asking')
  expect(working?.question).toBe(QUESTION)
  expect(working?.lines).toEqual([READING])

  expect(await cmd($, 'ask And the second one?')).toBe(BUSY)
  expect(desk.prompts).toHaveLength(1)
  expect((await card($))?.question).toBe(QUESTION)

  out.free(said(SHORT))
  expect(await out.answer).toBe(ANSWERED)
  const drawn = await card($)
  expect(drawn?.note).toBe('')
  expect(drawn?.question).toBe(QUESTION)
  expect(drawn?.lines).toEqual([SHORT])
})

test('A4: every way a fork gives no answer shows its own sentence on the card and in the command', PLUGINS, async ($, on) => {
  const desk = open(on)
  const cases: [ModelForkResult | Error, string][] = [
    [{ isAnswered: false, reason: 'nothing-to-fork' }, NOTHING],
    [{ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: NONE } as ModelForkResult, UNREACHED],
    [{ isAnswered: false, reason: 'empty-reply', usage: SPENT }, WORDLESS],
    [{ isAnswered: false, reason: 'aborted', usage: SPENT }, CUT],
    [new Error('socket hang up'), UNREACHED],
    [said('  \n  '), WORDLESS],
  ]

  await start($)
  for (const [at, [reply, sentence]] of cases.entries()) {
    expect(await ask($, desk, reply, `${QUESTION} (${at})`)).toBe(sentence)
    const drawn = await card($)
    expect(drawn?.note).toBe('no answer')
    expect(drawn?.question).toBe(`${QUESTION} (${at})`)
    expect(drawn?.lines.join(' ')).toBe(sentence)
    expect(drawn?.colors.every(color => color === 'red')).toBe(true)
    expect(drawn?.lines.join(' ')).not.toMatch(/overloaded|529|socket/)
  }
  expect(desk.prompts).toHaveLength(cases.length)

  expect(await ask($, desk, said(SHORT))).toBe(ANSWERED)
  const drawn = await card($)
  expect(drawn?.note).toBe('')
  expect(drawn?.question).toBe(QUESTION)
  expect(drawn?.lines).toEqual([SHORT])
  expect(drawn?.colors).toEqual([undefined])
})

test('A5: main-thread turn ends age the answer, a subagent one does not, and a new ask starts over', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await ask($, desk, said(SHORT))
  expect(await end($)).toEqual({ text: 'Done.' })
  expect((await card($))?.note).toBe('1 turn ago')
  expect(await end($, { turnId: 'turn-2' })).toEqual({ text: 'Done.' })
  expect((await card($))?.note).toBe('2 turns ago')
  expect(await end($, { turnId: 'turn-3', answer: 'Cut.', isAborted: true, reason: 'aborted' })).toEqual({ text: 'Cut.' })
  expect((await card($))?.note).toBe('3 turns ago')
  expect(await end($, { turnId: 'turn-4', answer: 'Found it.', agentId: 'agent-7' })).toEqual({ text: 'Found it.' })
  expect((await card($))?.note).toBe('3 turns ago')
  expect((await card($))?.lines).toEqual([SHORT])

  expect(await ask($, desk, said('It began at 0 after the fix.'), 'And now?')).toBe(ANSWERED)
  const drawn = await card($)
  expect(drawn?.note).toBe('')
  expect(drawn?.question).toBe('And now?')
})

test('A6: turn ends while idle, asking or failed change nothing on the card', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const idle = await card($)
  expect(await end($)).toEqual({ text: 'Done.' })
  expect(await card($)).toEqual(idle)

  const out = await held($, desk)
  const asking = await card($)
  expect(asking?.note).toBe('asking')
  await end($, { turnId: 'turn-2' })
  expect(await card($)).toEqual(asking)
  out.free({ isAnswered: false, reason: 'aborted', usage: SPENT })
  expect(await out.answer).toBe(CUT)

  const failed = await card($)
  expect(failed?.note).toBe('no answer')
  await end($, { turnId: 'turn-3' })
  await end($, { turnId: 'turn-4', isAborted: true, reason: 'aborted' })
  expect(await card($)).toEqual(failed)
})

test('A7: questions and answers are flattened to one line and cut to 300 and 600 characters', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await ask($, desk, said(SHORT), '  why   did\n it fail?  ')
  expect(desk.prompts.at(-1)).toBe(`${BRIEF}\n\nwhy did it fail?`)
  expect((await card($))?.question).toBe('why did it fail?')

  desk.replies.push(said(SHORT))
  expect(await cmd($, 'ASK Why?')).toBe(ANSWERED)
  expect(desk.prompts.at(-1)).toBe(`${BRIEF}\n\nWhy?`)
  expect((await card($))?.question).toBe('Why?')

  const long = REPORT.slice(0, 400)
  expect(long).toHaveLength(400)
  await ask($, desk, said(SHORT), long)
  expect(desk.prompts.at(-1)).toBe(`${BRIEF}\n\n${FLAT.slice(0, 300)}`)
  expect((await card($))?.question).toBe(FLAT.slice(0, 300))

  const reply = REPORT.slice(0, 700)
  expect(reply).toHaveLength(700)
  expect(reply).toContain('\n')
  await ask($, desk, said(reply))
  await $.command.run(run('widen', `${NAME} 120`))
  const drawn = await card($, 200)
  expect(drawn?.lines.join(' ')).toBe(FLAT.slice(0, 600))
  expect(drawn?.lines.join(' ')).toHaveLength(600)
})

test('A8: clear empties the card, frees one stuck on asking and drops the late reply', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await ask($, desk, said(SHORT))
  await end($)
  expect((await card($))?.note).toBe('1 turn ago')
  expect(await cmd($, 'clear')).toBe(CLEARED)
  blank(await card($))
  await ask($, desk, said(SHORT))
  expect((await card($))?.note).toBe('')
  expect(await cmd($, 'CLEAR')).toBe(CLEARED)

  const out = await held($, desk)
  expect((await card($))?.note).toBe('asking')
  expect(await cmd($, 'clear')).toBe(CLEARED)
  blank(await card($))
  out.free(said('A reply nobody is waiting for.'))
  expect(await out.answer).toBe(DROPPED)
  blank(await card($))

  expect(await ask($, desk, said(SHORT), 'And now?')).toBe(ANSWERED)
  const drawn = await card($)
  expect(drawn?.question).toBe('And now?')
  expect(drawn?.lines).toEqual([SHORT])
  expect(drawn?.note).toBe('')
})

test('A9: off while the fork is out, then on, shows the empty card and the late reply changes nothing', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const out = await held($, desk)
  expect(await cmd($, 'off')).toBe('Aside off.')
  expect(await card($)).toBeUndefined()
  expect(await cmd($, 'on')).toBe('Aside on; /widgets places it.')
  blank(await card($))

  out.free(said('A reply nobody is waiting for.'))
  expect(await out.answer).toBe(DROPPED)
  blank(await card($))
  expect(desk.prompts).toHaveLength(1)
})

test('A10: while off, ask and clear say so, make no fork and write nothing', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await ask($, desk, said(SHORT))
  await cmd($, 'off')
  const before = desk.world.writes.length

  expect(await cmd($, 'ask why?')).toBe(OFF)
  expect(await cmd($, 'ask')).toBe(OFF)
  expect(await cmd($, 'clear')).toBe(OFF)
  expect(await end($)).toEqual({ text: 'Done.' })
  expect(desk.prompts).toHaveLength(1)
  expect(desk.world.writes.slice(before)).toEqual([])
  expect(desk.world.store.get('isOn')).toBe(false)
  expect(await card($)).toBeUndefined()

  await cmd($, 'on')
  blank(await card($))
  await ask($, desk, said(SHORT))
  expect((await card($))?.note).toBe('')
})

test('A11: ask with no question and an unknown verb answer with the usage line and change nothing', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await ask($, desk, said(SHORT))
  const before = await card($)
  const writes = desk.world.writes.length

  expect(await cmd($, 'ask')).toBe(USAGE)
  expect(await cmd($, 'ask    ')).toBe(USAGE)
  expect(await cmd($, 'explain')).toBe(USAGE)
  expect(await cmd($, 'clear everything')).toBe(USAGE)
  expect(desk.prompts).toHaveLength(1)
  expect(desk.world.writes.slice(writes)).toEqual([])
  expect(desk.world.store.get('isOn')).toBe(true)
  expect(await card($)).toEqual(before)
})

test('A12: session.start registers an immediate command and restores the switch without a fork', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true })

  await session($)
  await $.command.run(run('place', 'side'))
  const listed = desk.world.toasts.map(toast => JSON.parse(toast) as Record<string, unknown>)
  expect(listed).toHaveLength(1)
  expect(listed[0]).toMatchObject({ name: NAME, argumentHint: '[on|off|ask <question>|clear]', immediate: true })
  blank(await card($))
  expect(desk.prompts).toEqual([])
  expect(desk.world.writes).toEqual([])
})

test('A13: short forms at 20 columns, and an answer is cut at eight rows of the inner width', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await ask($, desk, said(FLAT.slice(0, 300)), `${QUESTION} And which file was it in?`)
  await end($)
  await end($, { turnId: 'turn-2' })

  const narrow = await card($, 20)
  expect(narrow?.note).toBe('2 ago')
  expect(narrow?.question).toBe(`${QUESTION} And which file was it in?`)
  expect(narrow?.wraps.every(wrap => wrap === 'truncate-end')).toBe(true)
  expect(narrow?.lines.join(' ')).toBe(`${FLAT.slice(0, 127)}…`)
  expect(narrow?.lines.every(line => line.length <= 16)).toBe(true)

  const normal = await card($)
  expect(normal?.note).toBe('2 turns ago')
  expect(normal?.lines.join(' ')).toBe(`${FLAT.slice(0, 287)}…`)

  await ask($, desk, said(FLAT.slice(0, 288)))
  expect((await card($))?.lines.join(' ')).toBe(FLAT.slice(0, 288))
  await ask($, desk, said(FLAT.slice(0, 289)))
  expect((await card($))?.lines.join(' ')).toBe(`${FLAT.slice(0, 287)}…`)
  expect((await card($))?.lines.every(line => line.length <= 36)).toBe(true)

  await ask($, desk, said(FLAT.slice(0, 300)))
  await $.command.run(run('widen', `${NAME} 60`))
  const wide = await card($, 90)
  expect(wide?.lines.join(' ')).toBe(FLAT.slice(0, 300))
  expect(wide?.lines.every(line => line.length <= 56)).toBe(true)

  await ask($, desk, said('See https://example.com/builds/2026/10/04/logs/sum-test-first-run-output.txt for it.'))
  const linked = await card($, 20)
  expect(linked?.lines.every(line => line.length <= 16)).toBe(true)
  expect(linked?.lines.join('')).toContain('sum-test-first-run-output.txt')
})

test('A13: an answer in a wide script is wrapped by terminal cells and no row is cut', PLUGINS, async ($, on) => {
  const desk = open(on)
  const packed = (text: string): string => text.replaceAll(' ', '')

  await start($)
  for (const answer of [KANJI, HANGUL, PARTY]) {
    await ask($, desk, said(answer))
    for (const [columns, inner] of [
      [20, 16],
      [40, 36],
    ] as const) {
      const drawn = await card($, columns)
      expect(packed(drawn?.lines.join('') ?? '')).toBe(packed(answer))
      expect(drawn?.lines.every(line => span(line) <= inner)).toBe(true)
      expect(drawn?.lines.some(line => line.endsWith('…'))).toBe(false)
      expect(drawn?.lines.every(line => line.isWellFormed())).toBe(true)
    }
  }

  await ask($, desk, said(KANJI))
  expect((await card($, 20))?.lines).toHaveLength(Math.ceil(span(KANJI) / 16))

  await ask($, desk, said(KANJI.repeat(4)))
  const narrow = await card($, 20)
  expect(narrow?.lines).toHaveLength(8)
  expect(narrow?.lines.join('')).toBe(`${KANJI.repeat(4).slice(0, 63)}…`)
  expect(narrow?.lines.every(line => span(line) <= 16)).toBe(true)
  const normal = await card($)
  expect(normal?.lines).toHaveLength(8)
  expect(normal?.lines.join('')).toBe(`${KANJI.repeat(4).slice(0, 143)}…`)

  await ask($, desk, said(SHORT))
  expect((await card($, 20))?.lines).toEqual(['The loop started', 'at 1.'])
})

test('A14: the answered card is the same in all three placements and absent while off', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await ask($, desk, said(SHORT))
  await end($)
  const drawn: (Drawn | undefined)[] = []
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    drawn.push(await card($, 40, component))
  }
  expect(drawn[0]).toMatchObject({ title: 'Aside', note: '1 turn ago', question: QUESTION, lines: [SHORT] })
  expect(drawn[1]).toEqual(drawn[0])
  expect(drawn[2]).toEqual(drawn[0])

  await cmd($, 'off')
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    expect(await card($, 40, component)).toBeUndefined()
  }
})

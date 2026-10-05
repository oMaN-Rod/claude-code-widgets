import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, TurnStepChunk, TurnStepResult } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Call = { id: string; tool: string; path: string; phase: 'writing' | 'written' | 'stopped'; lines: number; chars: number; pieces: number; tail: string[] }
type Held = Call | null
type Entry = TurnStepChunk | Error | number
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
type Card = { note: string; rows: string[]; dim: string[]; yellow: string[] }
type Desk = { world: Ground; script: Entry[]; copies: Held[]; pen: Held; result?: TurnStepResult }
type Stepped = { out: TurnStepChunk[]; result?: TurnStepResult; error?: unknown }
type Given = { agentId?: string; index?: number; take?: number; each?: (chunk: TurnStepChunk, at: number) => Promise<void> }

const NAME = 'pen-widget'
const USAGE = 'Usage: /pen-widget [on|off|show|clear]'
const OFF = 'Pen is off.'
const NOTHING = 'Nothing written yet.'
const EMPTY_ROWS = ['Nothing written yet. A file, edit or', 'command shows here line by line', 'while Claude is still writing it,', 'before it runs.']
const EMPTY_NARROW = ['Nothing written', 'yet. A file,', 'edit or command', 'shows here line', 'by line while', 'Claude is still', 'writing it,', 'before it runs.']
const EMPTY: Card = { note: '', rows: EMPTY_ROWS, dim: EMPTY_ROWS, yellow: [] }
const STOPPED = 'Stopped before it ran.'
const CURSOR = '▌'
const SPENT = { input_tokens: 2140, output_tokens: 96, cache_read_input_tokens: 18200, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
const CONFIG_PATH = '/work/app/src/config.ts'
const CONFIG_OPEN = ['export const config = {', '  port: 3000,', '  retries: 3,', '  timeoutMs: 5000,', "  apiUrl: 'http://localhost:8080"]
const CONFIG_LINES = [
  ...Array.from({ length: 136 }, (_, at) => `import { part${at} } from './parts/part${at}'`),
  '',
  ...CONFIG_OPEN.slice(0, 4),
  `${CONFIG_OPEN[4]}',`,
  '}',
  '',
  ...Array.from({ length: 62 }, (_, at) => `export const flag${at} = part${at}.isEnabled`),
  'export const merge = (extra: object) => {',
  '  const merged = { ...config, ...extra }',
  '  return merged',
  '}',
  'export const load = () => config',
  'export default config',
]
const CONFIG = `${CONFIG_LINES.join('\n')}\n`
const CONFIG_JSON = JSON.stringify({ file_path: CONFIG_PATH, content: CONFIG })
const CONFIG_CUT = CONFIG_JSON.indexOf('8080') + 4
const SETTLED_ROWS = [`Write ${CONFIG_PATH}`, '  const merged = { ...config, ...ex…', '  return merged', '}', 'export const load = () => config', 'export default config']
const ESCAPED = String.raw`{"file_path":"C:\\work\\caf\u00e9\\menu.md","content":"# Caf\u00e9 \ud83d\ude00\n\n\t- \"flat white\"\t3.50\n\t- path: C:\\menu\/today\r\n"}`

const WATCH: Plugin = {
  name: 'watch',
  register(on) {
    on('clock.after', async ($, e, next) => {
      await $.ui.toast('call clock.after')

      return next(e)
    })
    on('clock.every', async ($, e, next) => {
      await $.ui.toast('call clock.every')

      return next(e)
    })
    on('fs.write', async ($, e, next) => {
      await $.ui.toast('call fs.write')

      return next(e)
    })
    on('model.complete', async ($, e, next) => {
      await $.ui.toast('call model.complete')

      return next(e)
    })
  },
}
const PLUGINS = { plugins: [LAYOUT, WATCH], timeoutMs: 60_000 }

const pieces = (text: string, size: number): string[] => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? []

const tool = (index: number, name: string, id = `toolu_01${name}${index}`): TurnStepChunk => ({ kind: 'tool', index, id, name, ref: 100 + index }) as TurnStepChunk

const inputs = (index: number, parts: readonly string[], gapMs = 0): Entry[] =>
  parts.flatMap(json => [...(gapMs > 0 ? [gapMs] : []), { kind: 'input', index, json } as TurnStepChunk])

const paced = (index: number, parts: readonly string[]): Entry[] => [...inputs(index, parts.slice(0, -1)), ...inputs(index, parts.slice(-1), 120)]

const call = (index: number, name: string, input: unknown, size = 11): Entry[] => [
  tool(index, name),
  ...inputs(index, ['', ...pieces(typeof input === 'string' ? input : JSON.stringify(input), size)]),
]

const stop = (stopReason = 'tool_use'): TurnStepChunk => ({ kind: 'stop', stopReason, usage: SPENT }) as TurnStepChunk

const open = (on: On, store?: Record<string, unknown>): Desk => {
  const desk: Desk = { world: ground(on, { store }), script: [], copies: [], pen: null }
  on('state.set', async (_$, e, next) => {
    const write = e as { plugin: string; key: string; value: unknown }
    const landed = (await next(e)) as unknown as { value: { isSet: boolean } }
    if (write.plugin === NAME && write.key === 'pen' && landed.value.isSet) {
      desk.pen = write.value as Held
      desk.copies.push(desk.pen)
    }

    return landed as never
  })
  on('turn.step', async function* (_$, e) {
    let answer = ''
    for (const entry of desk.script) {
      if (typeof entry === 'number') continue
      if (entry instanceof Error) throw entry
      if (entry.kind === 'text') answer += entry.text
      yield entry
    }
    const tools = desk.script.filter(entry => typeof entry === 'object' && !(entry instanceof Error) && entry.kind === 'tool') as { name: string }[]
    desk.result = {
      turnId: e.turnId,
      index: e.index,
      answer,
      toolUses: tools.map(({ name }) => ({ name, input: {} })),
      stopReason: tools.length > 0 ? 'tool_use' : 'end_turn',
      usage: SPENT,
    }

    return desk.result
  })

  return desk
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const step = async ($: Engine, desk: Desk, script: Entry[], given: Given = {}): Promise<Stepped> => {
  desk.script = script
  desk.result = undefined
  const out: TurnStepChunk[] = []
  const stream = $.turn.step({
    turnId: 'turn-1',
    index: given.index ?? 0,
    model: 'claude-opus-5-5',
    effort: 'high',
    messageCount: 3 + (given.index ?? 0) * 2,
    ...(given.agentId === undefined ? {} : { agentId: given.agentId }),
  })
  const waits = gaps(script)
  try {
    for (;;) {
      if ((waits[out.length] ?? 0) > 0) await desk.world.clock.advance(waits[out.length] ?? 0)
      const pulled = await stream.next()
      if (pulled.done === true) return { out, result: pulled.value }
      out.push(pulled.value)
      await given.each?.(pulled.value, out.length - 1)
      if (out.length === given.take) {
        await stream.return(undefined as never)

        return { out }
      }
    }
  } catch (error) {
    return { out, error }
  }
}

const gaps = (script: readonly Entry[]): number[] => {
  const waits: number[] = []
  let wait = 0
  for (const entry of script) {
    if (typeof entry === 'number') wait += entry
    else if (!(entry instanceof Error)) {
      waits.push(wait)
      wait = 0
    }
  }

  return waits
}

const chunks = (script: readonly Entry[]): TurnStepChunk[] => script.filter((entry): entry is TurnStepChunk => typeof entry === 'object' && !(entry instanceof Error))

const every = (node: unknown): Node[] => (typeof node === 'object' && node !== null ? [node as Node, ...((node as Node).children ?? []).flatMap(every)] : [])

const shown = (node: unknown): string =>
  typeof node === 'string' || typeof node === 'number' ? String(node) : typeof node === 'object' && node !== null ? ((node as Node).children ?? []).map(shown).join('') : ''

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Card | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const nodes = every(await ui.drawn())
  await ui.unmount()
  if (!nodes.some(node => node.props?.key === 'card')) return undefined

  const rows = nodes.filter(node => node.type === 'Text' && node.props?.wrap === 'truncate-end')

  return {
    note: shown(nodes.find(node => node.props?.key === 'note')),
    rows: rows.map(shown),
    dim: rows.filter(row => row.props?.dimColor === true).map(shown),
    yellow: rows.filter(row => row.props?.color === 'yellow').map(shown),
  }
}

const settled = (rows: string[], note: string): Card => ({ note, rows, dim: rows, yellow: [] })

const stopped = (rows: string[], note: string, last = STOPPED): Card => ({ note, rows: [...rows, last], dim: rows, yellow: [last] })

const audit = (desk: Desk): void => {
  expect([...desk.world.store.keys()].filter(key => key !== 'isOn')).toEqual([])
  expect(desk.world.writes.filter(write => write !== 'store isOn')).toEqual([])
  expect(desk.world.toasts).toEqual([])
}

test('A1: switched on with no call, every placement shows the empty sentence and show says nothing is written', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  for (const [place, component] of SITES) {
    await $.command.run(run('place', place))
    expect(await card($, 40, component)).toEqual(EMPTY)
  }
  expect(await cmd($, 'show')).toBe(NOTHING)
  expect(desk.copies).toEqual([])
  audit(desk)
})

test('A2: every chunk and the result pass through unchanged, on, off, in a subagent and when the arguments are not JSON', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const script: Entry[] = [
    { kind: 'thinking', index: 0, text: 'The config needs a retry count.' } as TurnStepChunk,
    { kind: 'text', index: 1, text: 'I will write the config.' } as TurnStepChunk,
    ...call(2, 'Write', { file_path: CONFIG_PATH, content: 'export const retries = 3\n' }),
    ...call(3, 'mcp__github__create_issue', { title: 'Retries', content: 'never read' }),
    ...call(4, 'Read', { file_path: CONFIG_PATH }),
    stop(),
  ]
  const broken: Entry[] = [
    tool(0, 'Write'),
    ...inputs(0, ['}}]', '"\\u12', '\\', '{"content": tru', '\\uzzzz"', '[[[[{{{{', '\ud83d', '"content":"\\q\\', 'u00', '}]}]}]}]}]']),
    tool(1, 'Bash'),
    ...inputs(1, ['not json at all', '\u0000\u0007', '{"command"', ':', '"ls', '\\']),
    stop(),
  ]

  for (const [given, steps] of [
    [{}, [script, broken]],
    [{ agentId: 'agent-7' }, [script, broken]],
  ] as const) {
    for (const made of steps) {
      const { out, result, error } = await step($, desk, made, given)
      expect(error).toBeUndefined()
      expect(out.length).toBe(chunks(made).length)
      for (const [at, chunk] of chunks(made).entries()) expect(out[at]).toEqual(chunk)
      expect(result).toEqual(desk.result)
      expect(result?.toolUses.length).toBe(made === script ? 3 : 2)
    }
  }

  await step($, desk, call(0, 'Write', { file_path: CONFIG_PATH, content: 'export const retries = 3\n' }))
  const before = desk.pen
  const copies = desk.copies.length
  expect(before?.phase).toBe('written')
  const shownBefore = await card($)
  await step($, desk, call(0, 'Write', { file_path: '/work/app/src/agent.ts', content: 'export const agent = true\n' }), { agentId: 'agent-7' })
  expect(desk.copies.length).toBe(copies)
  expect(await card($)).toEqual(shownBefore)
  expect(await cmd($, 'show')).toBe(`Write ${CONFIG_PATH}: 1 line, 25 characters in 9 pieces, written.`)

  await cmd($, 'off')
  const quiet = desk.copies.length
  for (const made of [script, broken]) {
    const { out, result } = await step($, desk, made)
    for (const [at, chunk] of chunks(made).entries()) expect(out[at]).toEqual(chunk)
    expect(out.length).toBe(chunks(made).length)
    expect(result).toEqual(desk.result)
  }
  expect(desk.copies.length).toBe(quiet)
  audit(desk)
})

test('A3: a Write streamed in pieces draws the head, the line count, the last five lines and the cursor while unclosed', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const before = pieces(CONFIG_JSON.slice(0, CONFIG_CUT), 23)
  const script: Entry[] = [
    tool(0, 'Write'),
    ...paced(0, ['', ...before]),
    ...inputs(0, pieces(CONFIG_JSON.slice(CONFIG_CUT), 23)),
    stop(),
  ]
  const live: (Card | undefined)[] = []
  await step($, desk, script, {
    each: async (chunk, at) => {
      if (chunk.kind === 'tool' || at === 1 || at === 1 + before.length) live.push(await card($))
    },
  })

  const blank: Card = { note: '0 lines', rows: ['Write', CURSOR], dim: [], yellow: [] }
  expect(live[0]).toEqual(blank)
  expect(live[1]).toEqual(blank)
  expect(live[2]).toEqual({ note: '142 lines', rows: [`Write ${CONFIG_PATH}`, ...CONFIG_OPEN.slice(0, 4), `${CONFIG_OPEN[4]}${CURSOR}`], dim: [], yellow: [] })
  expect(desk.pen).toEqual({
    id: 'toolu_01Write0',
    tool: 'Write',
    path: CONFIG_PATH,
    phase: 'written',
    lines: 212,
    chars: CONFIG.length,
    pieces: 1 + pieces(CONFIG_JSON.slice(0, CONFIG_CUT), 23).length + pieces(CONFIG_JSON.slice(CONFIG_CUT), 23).length,
    tail: CONFIG_LINES.slice(-5),
  })
  audit(desk)
})

test('A4: the same arguments give the same call however they are split, with every escape decoded', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const wanted = JSON.parse(ESCAPED) as { file_path: string; content: string }
  expect(wanted.content).toBe('# Café \ud83d\ude00\n\n\t- "flat white"\t3.50\n\t- path: C:\\menu/today\r\n')
  const fed = async (parts: string[]): Promise<Held> => {
    await step($, desk, [tool(0, 'Write', 'toolu_01Menu'), ...inputs(0, parts), stop()])

    return desk.pen === null ? null : { ...desk.pen, pieces: 0 }
  }

  const whole = await fed([ESCAPED])
  expect(whole).toEqual({
    id: 'toolu_01Menu',
    tool: 'Write',
    path: 'C:\\work\\café\\menu.md',
    phase: 'written',
    lines: 4,
    chars: [...wanted.content].length,
    pieces: 0,
    tail: ['# Café \ud83d\ude00', '  - "flat white"  3.50', '  - path: C:\\menu/today'],
  })
  expect(await fed([...ESCAPED])).toEqual(whole)

  const afterBackslash = ESCAPED.indexOf('\\n') + 1
  const insideLetter = ESCAPED.indexOf('\\u00e9') + 4
  const betweenHalves = ESCAPED.indexOf('\\ude00')
  expect(ESCAPED.slice(0, afterBackslash).endsWith('\\')).toBe(true)
  expect(ESCAPED.slice(0, insideLetter).endsWith('\\u00')).toBe(true)
  expect(ESCAPED.slice(0, betweenHalves).endsWith('\\ud83d')).toBe(true)
  for (let at = 1; at < ESCAPED.length; at += 1) expect(await fed([ESCAPED.slice(0, at), ESCAPED.slice(at)])).toEqual(whole)

  const raw = JSON.stringify({ file_path: '/work/menu.md', content: 'tea \ud83c\udf75 time' })
  const split = raw.indexOf('\ud83c') + 1
  expect((await fed([raw.slice(0, split), raw.slice(split)]))?.tail).toEqual(['tea \ud83c\udf75 time'])
  audit(desk)
})

test('A5: the path may arrive after the text, and nested or quoted look-alike keys are not read', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const late = '{"content":"line one\\nline two","file_path":"/work/notes.txt"}'
  const cut = late.indexOf(',"file_path"')
  const live: (Card | undefined)[] = []
  await step($, desk, [tool(0, 'Write'), ...inputs(0, [late.slice(0, cut), late.slice(cut, -1)], 120), ...inputs(0, ['}'])], {
    each: async chunk => {
      if (chunk.kind === 'input') live.push(await card($))
    },
  })
  expect(live[0]).toEqual({ note: '2 lines', rows: ['Write', 'line one', `line two${CURSOR}`], dim: [], yellow: [] })
  expect(live[1]).toEqual({ note: '2 lines', rows: ['Write /work/notes.txt', 'line one', `line two${CURSOR}`], dim: [], yellow: [] })
  expect(await card($)).toEqual(settled(['Write /work/notes.txt', 'line one', 'line two'], '2 lines'))

  const nested = {
    metadata: { content: 'hidden in an object', file_path: '/wrong/path' },
    edits: [{ content: 'hidden in an array' }, 'content', 'also hidden'],
    description: 'says "content":"x" and "file_path":"/elsewhere" inside a string',
    file_path: '/work/a.txt',
  }
  await step($, desk, call(0, 'Write', nested))
  expect(desk.pen).toEqual({ id: 'toolu_01Write0', tool: 'Write', path: '/work/a.txt', phase: 'written', lines: 0, chars: 0, pieces: 1 + pieces(JSON.stringify(nested), 11).length, tail: [] })
  expect(await card($)).toEqual(settled(['Write /work/a.txt'], '0 lines'))
  audit(desk)
})

test('A6: each followed tool shows its own text field, and other tools leave a written call as it was', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  await step($, desk, call(0, 'Edit', { file_path: '/work/app/src/sum.js', old_string: 'for (let i = 0; i <= n; i++)', new_string: 'for (let i = 0; i < n; i++)', replace_all: false }))
  expect(await card($)).toEqual(settled(['Edit /work/app/src/sum.js', 'for (let i = 0; i < n; i++)'], '1 line'))

  await step($, desk, call(0, 'NotebookEdit', { notebook_path: '/work/nb/plot.ipynb', cell_id: 'c4', new_source: 'import pandas as pd\ndf = pd.read_csv("runs.csv")', cell_type: 'code' }))
  expect(await card($)).toEqual(settled(['NotebookEdit /work/nb/plot.ipynb', 'import pandas as pd', 'df = pd.read_csv("runs.csv")'], '2 lines'))

  await step($, desk, call(0, 'Bash', { command: 'git commit -am "Fix the off-by-one"', description: 'Commit the fix', file_path: '/not/a/path' }))
  expect(await card($)).toEqual(settled(['Bash', 'git commit -am "Fix the off-by-one"'], '1 line'))

  await step($, desk, call(0, 'PowerShell', { command: 'Get-ChildItem -Recurse |\n  Measure-Object', timeout: 5000 }))
  expect(await card($)).toEqual(settled(['PowerShell', 'Get-ChildItem -Recurse |', '  Measure-Object'], '2 lines'))

  const held = desk.pen
  const copies = desk.copies.length
  await step($, desk, [
    ...call(0, 'Read', { file_path: '/work/app/src/sum.js', content: 'not followed' }),
    ...call(1, 'mcp__github__create_issue', { title: 'Off by one', command: 'not followed', content: 'not followed' }),
    ...call(2, 'MultiEdit', { file_path: '/work/app/src/sum.js', edits: [{ old_string: 'a', new_string: 'b' }] }),
    ...call(3, 'toString', { command: 'not followed' }),
    stop(),
  ])
  expect(desk.copies.length).toBe(copies)
  expect(desk.pen).toBe(held)
  expect(await cmd($, 'show')).toBe('PowerShell: 2 lines, 41 characters in 8 pieces, written.')
  audit(desk)
})

test('A7: a closed call stays dim with no cursor until the next followed call replaces it', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const wanted = settled(SETTLED_ROWS, '212 lines')
  const live: (Card | undefined)[] = []
  await step(
    $,
    desk,
    [...call(0, 'Write', CONFIG_JSON, 64), { kind: 'text', index: 1, text: 'The config is written.' } as TurnStepChunk, { kind: 'thinking', index: 2, text: 'Next, the tests.' } as TurnStepChunk, stop()],
    {
      each: async chunk => {
        if (chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'stop') live.push(await card($))
      },
    },
  )
  expect(live).toEqual([wanted, wanted, wanted])
  expect(await card($)).toEqual(wanted)

  await step($, desk, [{ kind: 'text', index: 0, text: 'Reading the tests first.' } as TurnStepChunk, ...call(1, 'Read', { file_path: '/work/app/src/config.test.ts' }), stop()], { index: 1 })
  expect(await card($)).toEqual(wanted)
  expect(desk.pen?.phase).toBe('written')

  const fresh: (Card | undefined)[] = []
  await step($, desk, [tool(0, 'Bash'), ...inputs(0, ['{"command":"npm test"}']), stop()], {
    index: 2,
    each: async chunk => {
      if (chunk.kind === 'tool') fresh.push(await card($))
    },
  })
  expect(fresh).toEqual([{ note: '0 lines', rows: ['Bash', CURSOR], dim: [], yellow: [] }])
  expect(await card($)).toEqual(settled(['Bash', 'npm test'], '1 line'))
  audit(desk)
})

test('A8: an unclosed call is marked stopped when the stream ends, throws, is ended early or moves on', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const head: Entry[] = [tool(0, 'Write'), ...inputs(0, pieces(CONFIG_JSON.slice(0, CONFIG_CUT), 64))]
  const wanted = stopped([`Write ${CONFIG_PATH}`, ...CONFIG_OPEN], '142 lines')
  const failure = new Error('overloaded_error')

  const ended = await step($, desk, head)
  expect(ended.result).toEqual(desk.result)
  expect(desk.pen?.phase).toBe('stopped')
  expect(await card($)).toEqual(wanted)

  await cmd($, 'clear')
  const thrown = await step($, desk, [...head, failure])
  expect(thrown.error).toBeInstanceOf(Error)
  expect(thrown.out.length).toBe(chunks(head).length)
  expect(await card($)).toEqual(wanted)

  await cmd($, 'clear')
  const left = await step($, desk, [...head, ...inputs(0, pieces(CONFIG_JSON.slice(CONFIG_CUT), 64)), stop()], { take: chunks(head).length })
  expect(left.out.length).toBe(chunks(head).length)
  expect(await card($)).toEqual(wanted)

  for (const next of [
    { kind: 'text', index: 1, text: 'Let me reconsider.' },
    { kind: 'thinking', index: 1, text: 'That URL is wrong.' },
    tool(1, 'Read'),
    tool(1, 'mcp__github__create_issue'),
  ] as TurnStepChunk[]) {
    await cmd($, 'clear')
    const live: (Card | undefined)[] = []
    await step($, desk, [...head, next, ...inputs(0, ['",', '"more":"x"}']), stop()], {
      each: async (_chunk, at) => {
        if (at === chunks(head).length) live.push(await card($))
      },
    })
    expect(live).toEqual([wanted])
    expect(await card($)).toEqual(wanted)
  }

  await cmd($, 'clear')
  const from = desk.copies.length
  await step($, desk, [...head, tool(1, 'Bash'), ...inputs(1, ['{"command":"npm test"}']), stop()])
  expect(desk.copies.slice(from).map(held => `${held?.tool} ${held?.phase} ${held?.lines}`)).toEqual([
    'Write writing 0',
    'Write writing 1',
    'Write stopped 142',
    'Bash writing 0',
    'Bash written 1',
  ])
  expect(await cmd($, 'show')).toBe('Bash: 1 line, 8 characters in 1 piece, written.')
  audit(desk)
})

test('A9: a second tool chunk for the same index starts again, and inputs of another index are not read', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const live: Held[] = []
  await step(
    $,
    desk,
    [
      tool(1, 'Write', 'toolu_01First'),
      ...inputs(1, ['{"file_path":"/work/old.txt","content":"first try\\nsecond line\\n']),
      tool(1, 'Write', 'toolu_01Retry'),
      ...inputs(2, ['{"content":"from another block\\n"}']),
      ...inputs(0, ['{"content":"from another block\\n"}']),
      ...inputs(1, ['{"file_path":"/work/new.txt",', '"content":"retried\\n"}']),
      stop(),
    ],
    {
      each: async chunk => {
        if (chunk.kind === 'tool' || (chunk.kind === 'input' && chunk.index !== 1)) live.push(desk.pen)
      },
    },
  )
  const restarted = { id: 'toolu_01Retry', tool: 'Write', path: '', phase: 'writing', lines: 0, chars: 0, pieces: 0, tail: [] }
  expect(live).toEqual([{ ...restarted, id: 'toolu_01First' }, restarted, restarted, restarted])
  expect(desk.copies.some(held => held?.id === 'toolu_01First' && held.phase === 'stopped' && held.lines === 2)).toBe(true)
  expect(desk.pen).toEqual({ id: 'toolu_01Retry', tool: 'Write', path: '/work/new.txt', phase: 'written', lines: 1, chars: 8, pieces: 2, tail: ['retried'] })
  audit(desk)
})

test('A10: a 400-line Write of long lines keeps exact counts and a tail of five short, non-blank lines', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const lines = Array.from({ length: 400 }, (_, at) =>
    at === 396 ? '' : at === 398 ? ' \t\u0007 ' : `\tconst row${at} = '${'abcdefghij'.repeat(14)}' // \u0007bell\u001b[0m ${at}`,
  )
  const content = `${lines.join('\r\n')}\r\n`
  await step($, desk, call(0, 'Write', { file_path: '/work/app/src/rows.ts', content }, 509))

  const kept = [393, 394, 395, 397, 399].map(at => `  const row${at} = '${'abcdefghij'.repeat(14)}'`.slice(0, 120))
  expect(desk.pen?.lines).toBe(400)
  expect(desk.pen?.chars).toBe(content.length)
  expect(desk.pen?.tail).toEqual(kept)
  expect(kept.every(row => row.length === 120)).toBe(true)
  expect(JSON.stringify(desk.pen).length).toBeLessThan(900)

  await step($, desk, call(0, 'Write', { file_path: '/work/a.txt', content: 'a\nb\n' }))
  expect(desk.pen?.lines).toBe(2)
  await step($, desk, call(0, 'Write', { file_path: '/work/a.txt', content: 'a\nb\n ' }))
  expect(desk.pen?.lines).toBe(3)
  expect(desk.pen?.tail).toEqual(['a', 'b'])
  await step($, desk, call(0, 'Write', { file_path: '/work/a.txt', content: 'a\tb\r\n\u0000\u007f\u0085\n\n   \nc' }))
  expect(desk.pen).toEqual({ id: 'toolu_01Write0', tool: 'Write', path: '/work/a.txt', phase: 'written', lines: 5, chars: 15, pieces: 7, tail: ['a  b', 'c'] })
  audit(desk)
})

test('A11: the first piece is drawn at once, later pieces at most every 100 ms, and closing or stopping always', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const seen: (number | undefined)[] = []
  const notes: (string | undefined)[] = []
  const each = async (chunk: TurnStepChunk): Promise<void> => {
    if (chunk.kind !== 'input') return
    seen.push(desk.pen?.chars)
    notes.push((await card($))?.note)
  }
  await step(
    $,
    desk,
    [
      tool(0, 'Bash'),
      ...inputs(0, ['{"command":"a\\n']),
      40,
      ...inputs(0, ['b\\n']),
      60,
      ...inputs(0, ['c\\n']),
      99,
      ...inputs(0, ['d\\n']),
      ...inputs(0, ['e\\n"}']),
      stop(),
    ],
    { each },
  )
  expect(seen).toEqual([2, 2, 6, 6, 10])
  expect(notes).toEqual(['1 line', '1 line', '3 lines', '3 lines', '5 lines'])
  expect(desk.copies.map(held => held?.phase)).toEqual(['writing', 'writing', 'writing', 'written'])

  seen.length = 0
  await step($, desk, [tool(0, 'Bash'), ...inputs(0, ['{"command":"a\\n', 'b\\n', 'c\\n'])], { each })
  expect(seen).toEqual([2, 2, 2])
  expect(desk.pen).toEqual({ id: 'toolu_01Bash0', tool: 'Bash', path: '', phase: 'stopped', lines: 3, chars: 6, pieces: 3, tail: ['a', 'b', 'c'] })
  audit(desk)
})

test('A12: show answers the facts in each phase and never the content, clear empties the card, and an unknown verb answers the usage', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const answers: (string | undefined)[] = []
  const head: Entry[] = [tool(0, 'Write'), ...paced(0, pieces(CONFIG_JSON.slice(0, CONFIG_CUT), 64))]
  const count = chunks(head).length - 1
  await step($, desk, [...head, ...inputs(0, pieces(CONFIG_JSON.slice(CONFIG_CUT), 64)), stop()], {
    each: async (_chunk, at) => {
      if (at === count) answers.push(await cmd($, 'show'))
    },
  })
  answers.push(await cmd($, ' SHOW '))
  const total = pieces(CONFIG_JSON.slice(0, CONFIG_CUT), 64).length + pieces(CONFIG_JSON.slice(CONFIG_CUT), 64).length
  await step($, desk, head)
  answers.push(await cmd($, 'Show'))

  const typed = CONFIG_LINES.slice(0, 141).join('\n').length + 1 + (CONFIG_OPEN[4] ?? '').length
  expect(answers).toEqual([
    `Write ${CONFIG_PATH}: 142 lines, ${typed} characters in ${count} pieces, writing.`,
    `Write ${CONFIG_PATH}: 212 lines, ${CONFIG.length} characters in ${total} pieces, written.`,
    `Write ${CONFIG_PATH}: 142 lines, ${typed} characters in ${count} pieces, stopped before it ran.`,
  ])
  for (const answer of answers) {
    expect(answer?.includes('\n')).toBe(false)
    for (const line of new Set(CONFIG_LINES)) if (line.trim().length > 1) expect(answer?.includes(line.trim())).toBe(false)
  }

  expect(await cmd($, 'Clear')).toBe('Pen cleared.')
  expect(desk.pen).toBeNull()
  expect(await card($)).toEqual(EMPTY)
  expect(await cmd($, 'show')).toBe(NOTHING)

  const live: (Card | undefined)[] = []
  await step($, desk, [tool(0, 'Bash'), ...paced(0, ['{"command":"npm ', 'run']), ...inputs(0, [' build'])], {
    each: async (chunk, at) => {
      if (at === 1) expect(await cmd($, 'clear')).toBe('Pen cleared.')
      if (chunk.kind === 'input') live.push(await card($))
    },
  })
  const redrawn: Card = { note: '1 line', rows: ['Bash', `npm run${CURSOR}`], dim: [], yellow: [] }
  expect(live).toEqual([EMPTY, redrawn, redrawn])
  expect(await card($)).toEqual(stopped(['Bash', 'npm run build'], '1 line'))

  const held = desk.pen
  for (const word of ['what', 'show all', 'clear now', 'on off', 'shows']) expect(await cmd($, word)).toBe(USAGE)
  expect(desk.pen).toBe(held)
  expect(desk.world.store.get('isOn')).toBe(true)
  audit(desk)
})

test('A13: at 20, 40 and 60 columns every row of every state fits, with paths cut at the start and lines at the right', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await $.command.run(run('widen', `${NAME} 60`))

  const states: Record<string, Record<number, Card | undefined>> = {}
  const look = async (state: string): Promise<void> => {
    states[state] = { 20: await card($, 20), 28: await card($, 28), 40: await card($, 40), 60: await card($, 60) }
  }
  const head: Entry[] = [tool(0, 'Write'), ...paced(0, pieces(CONFIG_JSON.slice(0, CONFIG_CUT), 64))]

  await look('empty')
  await step($, desk, head, {
    each: async (chunk, at) => {
      if (chunk.kind === 'tool') await look('working')
      if (at === chunks(head).length - 1) await look('writing')
    },
  })
  await look('stopped')
  await step($, desk, call(0, 'Write', CONFIG_JSON, 64))
  await look('written')
  const deep = '/work/app/packages/server/src/features/billing/invoices/templates/quarterly-statement-with-a-very-long-name.component.tsx'
  const wide = "          const statement = await renderQuarterlyStatement(customer, { locale: 'en-GB', currency: 'GBP' })"
  const long = pieces(JSON.stringify({ file_path: deep, old_string: 'x', new_string: `        if (customer.isActive) {\n${wide}\n${' '.repeat(36)}` }).slice(0, -2), 64)
  await step($, desk, [tool(0, 'Edit'), ...paced(0, long)], {
    each: async (_chunk, at) => {
      if (at === long.length) await look('long')
    },
  })
  await step($, desk, call(0, 'NotebookEdit', { notebook_path: '/work/notebooks/analysis/plot.ipynb', new_source: '\u6f22\u5b57\u306e\u30b3\u30e1\u30f3\u30c8\u3092\u66f8\u304f\u3068\u5e45\u304c\u4e8c\u500d\u306b\u306a\u308b\u306e\u3067\u6ce8\u610f\u3057\u3066\u304f\u3060\u3055\u3044' }))
  await look('notebook')

  const cells = (row: string): number => [...row].reduce((sum, letter) => sum + (/[\u3000-\u9fff]/.test(letter) ? 2 : 1), 0)
  for (const [state, shots] of Object.entries(states)) {
    for (const [columns, shot] of Object.entries(shots)) {
      const inner = Math.min(Number(columns), 60) - 4
      expect(shot === undefined ? `${state} ${columns}` : '').toBe('')
      for (const row of shot?.rows ?? []) expect(cells(row) <= inner ? '' : `${state} ${columns}: ${row}`).toBe('')
      expect(`Pen ${shot?.note}`.length <= inner).toBe(true)
    }
  }

  expect(states.empty?.[20]?.rows).toEqual(EMPTY_NARROW)
  expect(states.working?.[20]).toEqual({ note: '0 lines', rows: ['Write', CURSOR], dim: [], yellow: [] })
  expect(states.writing?.[20]).toEqual({
    note: '142 lines',
    rows: ['…/src/config.ts', 'export const co…', '  port: 3000,', '  retries: 3,', '  timeoutMs: 50…', `  apiUrl: 'htt…${CURSOR}`],
    dim: [],
    yellow: [],
  })
  expect(states.stopped?.[20]).toEqual(stopped(['…/src/config.ts', 'export const co…', '  port: 3000,', '  retries: 3,', '  timeoutMs: 50…', "  apiUrl: 'http…"], '142 lines', 'Stopped.'))
  expect(states.stopped?.[28]?.rows[0]).toBe(CONFIG_PATH)
  expect(states.stopped?.[28]?.yellow).toEqual([STOPPED])
  expect(states.stopped?.[40]).toEqual(stopped([`Write ${CONFIG_PATH}`, ...CONFIG_OPEN], '142 lines'))
  expect(states.written?.[20]?.rows).toEqual(['…/src/config.ts', '  const merged …', '  return merged', '}', 'export const lo…', 'export default …'])
  expect(states.written?.[40]).toEqual(settled(SETTLED_ROWS, '212 lines'))
  expect(states.written?.[60]?.rows).toEqual([`Write ${CONFIG_PATH}`, ...CONFIG_LINES.slice(-5)])
  expect(states.long?.[20]?.rows).toEqual(['…e.component.tsx', 'if (customer.is…', `  const statem…${CURSOR}`])
  expect(states.long?.[40]?.rows).toEqual(['Edit …a-very-long-name.component.tsx', 'if (customer.isActive) {', `  const statement = await renderQu…${CURSOR}`])
  expect(states.long?.[60]?.rows).toEqual([
    'Edit …erly-statement-with-a-very-long-name.component.tsx',
    'if (customer.isActive) {',
    `  const statement = await renderQuarterlyStatement(cus…${CURSOR}`,
  ])
  expect(states.notebook?.[28]?.rows[0]).toBe('…/analysis/plot.ipynb')
  expect(states.notebook?.[40]?.rows[0]).toBe('NotebookEdit …/analysis/plot.ipynb')
  expect(states.notebook?.[20]?.rows[1]).toBe('\u6f22\u5b57\u306e\u30b3\u30e1\u30f3\u30c8…')
  audit(desk)
})

test('A14: while off the verbs change nothing, and switching off mid-step stops the copies but not the stream', PLUGINS, async ($, on) => {
  const desk = open(on)
  await session($)
  await $.command.run(run('place', 'side'))

  expect(await cmd($, 'show')).toBe(OFF)
  expect(await cmd($, 'clear')).toBe(OFF)
  expect(desk.copies).toEqual([])
  expect(desk.world.writes).toEqual([])

  await cmd($, 'on')
  const parts = pieces(CONFIG_JSON, 1024)
  const script: Entry[] = [tool(0, 'Write'), ...inputs(0, parts.slice(0, 1)), ...inputs(0, parts.slice(1, 3), 120), ...inputs(0, parts.slice(3, 5)), ...inputs(0, parts.slice(5, 6), 120), ...inputs(0, parts.slice(6)), stop()]
  const marks: number[] = []
  const first = await step($, desk, script, {
    each: async (_chunk, at) => {
      if (at !== 2) return
      expect(desk.pen?.phase).toBe('writing')
      expect(await cmd($, 'off')).toBe('Pen off.')
      expect(desk.pen).toBeNull()
      marks.push(desk.copies.length)
    },
  })
  expect(first.out.length).toBe(chunks(script).length)
  for (const [at, chunk] of chunks(script).entries()) expect(first.out[at]).toEqual(chunk)
  expect(first.result).toEqual(desk.result)
  expect(desk.copies.length).toBe(marks[0])
  expect(await card($)).toBeUndefined()
  expect(await cmd($, 'show')).toBe(OFF)
  expect(await cmd($, 'clear')).toBe(OFF)

  await cmd($, 'on')
  const again = await step($, desk, script, {
    each: async (_chunk, at) => {
      if (at === 2) await cmd($, 'off')
      if (at !== 4) return
      await cmd($, 'on')
      marks.push(desk.copies.length)
    },
  })
  expect(again.out.length).toBe(chunks(script).length)
  expect(desk.copies.length).toBe(marks[1])
  expect(desk.pen).toBeNull()
  expect(await card($)).toEqual(EMPTY)

  await step($, desk, call(0, 'Bash', { command: 'npm test' }), { index: 1 })
  expect(await card($)).toEqual(settled(['Bash', 'npm test'], '1 line'))
  expect([...desk.world.store.keys()]).toEqual(['isOn'])
  audit(desk)
})

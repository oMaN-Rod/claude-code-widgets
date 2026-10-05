import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, TurnStepChunk, TurnStepResult } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Block = readonly ['thinking' | 'text', string] | readonly ['tool', string, string]
type Item = { quote: string; gist: string; isSaid: boolean }
type Held = { id: string; phase: 'idle' | 'live' | 'settled'; sawThinking: boolean; isBroken: boolean; found: Item[] }
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
type Card = { note: string; lines: string[]; dim: string[]; red: string[] }
type Desk = {
  world: Ground
  turn: Held
  sets: string[]
  ids: string[]
  fills: string[]
  order: string[]
  at: { script: (TurnStepChunk | Error)[]; box: 'take' | 'refuse'; isSpoiled: boolean; plant: (held: Held) => Held; reads: number; trip?: () => Promise<void> }
}
type Stepped = { out: TurnStepChunk[]; result: TurnStepResult }
type Given = { turnId?: string; index?: number; agentId?: string; each?: (chunk: TurnStepChunk, at: number) => Promise<void> }

const NAME = 'premise-widget'
const BLANK: Held = { id: '', phase: 'idle', sawThinking: false, isBroken: false, found: [] }
const USAGE = 'Usage: /premise-widget [on|off|show|fix <n>|clear]'
const OFF = 'Premise is off.'
const EMPTY = 'What Claude takes for granted in its thinking and does not say appears here while it thinks.'
const EMPTY_ROWS = ['What Claude takes for granted in its', 'thinking and does not say appears', 'here while it thinks.']
const READING = "Reading Claude's thinking…"
const NONE = 'The thinking shown words nothing as an assumption.'
const NONE_ROWS = ['The thinking shown words nothing as', 'an assumption.']
const LIMIT =
  'Premise reads only the summary of the thinking, for sentences that name something not given and a choice made anyway. Claude may have assumed more than that.'
const UNSEEN = 'No thinking text reached this card.'
const UNSEEN_ROWS = [UNSEEN, '/premise-widget show says why.']
const WHY =
  'No thinking text reached Premise this turn. Claude Code sends it only when settings.json has "showThinkingSummaries": true (headless: --thinking-display summarized). Set it, and restart Claude Code if it does not take effect. If it is set, Claude did not think this turn.'
const BROKEN = "Could not read this turn's thinking."
const DUMP = "Since the database type isn't specified, I'll default to pg_dump."
const PG = "Since the database type isn't specified, I'll default to a PostgreSQL pg_dump example with placeholder names."
const PHONE = "Since no country is specified, I'll go with a permissive E.164-style pattern that matches most numbers."
const WEB = "They didn't specify which web server, so I'll just give the restart command."
const FOLDER = "I'll give a one-liner for the current directory, since no specific path was given."
const POWER = "Without knowing the shell, I'll give a PowerShell one-liner for it."
const STACK = "Since they didn't specify a stack, I'll assume Node.js as the most common case."
const NODE_NOTE = '# NOTE: written without inspecting the project, so this assumes a Node.js app'
const CRON = '0 2 * * * pg_dump mydb > /var/backups/mydb.sql'
const BEST = ["1 I'll default to a PostgreSQL", '  pg_dump example with placeholder …', "2 I'll go with a permissive", '  E.164-style pattern that matches …']
const SPENT = { input_tokens: 2140, output_tokens: 96, cache_read_input_tokens: 18200, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }

const WATCH: Plugin = {
  name: 'watch',
  register(on) {
    on('model.complete', async ($, e, next) => {
      await $.ui.toast('call model.complete')

      return next(e)
    })
    on('model.classify', async ($, e, next) => {
      await $.ui.toast('call model.classify')

      return next(e)
    })
    on('model.fork', async ($, e, next) => {
      await $.ui.toast('call model.fork')

      return next(e)
    })
    on('fs.read', async ($, e, next) => {
      await $.ui.toast('call fs.read')

      return next(e)
    })
    on('fs.write', async ($, e, next) => {
      await $.ui.toast('call fs.write')

      return next(e)
    })
    on('fs.list', async ($, e, next) => {
      await $.ui.toast('call fs.list')

      return next(e)
    })
    on('fs.exists', async ($, e, next) => {
      await $.ui.toast('call fs.exists')

      return next(e)
    })
    on('fs.stat', async ($, e, next) => {
      await $.ui.toast('call fs.stat')

      return next(e)
    })
    on('process.run', async ($, e, next) => {
      await $.ui.toast('call process.run')

      return next(e)
    })
    on('clock.after', async ($, e, next) => {
      await $.ui.toast('call clock.after')

      return next(e)
    })
    on('clock.every', async ($, e, next) => {
      await $.ui.toast('call clock.every')

      return next(e)
    })
    on('clock.sleep', async ($, e, next) => {
      await $.ui.toast('call clock.sleep')

      return next(e)
    })
    on('clock.now', async ($, e, next) => {
      await $.ui.toast('call clock.now')

      return next(e)
    })
    on('http.fetch', async ($, e, next) => {
      await $.ui.toast('call http.fetch')

      return next(e)
    })
  },
}
const STREAM: Plugin = {
  name: 'stream-widget',
  register(on) {
    on('turn.step', async function* ($, e, next) {
      const stream = next(e)
      try {
        for await (const chunk of stream) {
          await $.ui.toast(`below chunk ${JSON.stringify(chunk)}`)
          yield chunk
        }
      } catch (error) {
        await $.ui.toast(`below failed ${String(error)}`)
        throw error
      }
      const result = await stream.result
      await $.ui.toast(`below result ${JSON.stringify(result)}`)

      return result
    })
  },
}
const ABOVE: Plugin = {
  name: 'stand-in-above',
  tier: 'prepend',
  register(on) {
    on('turn.step', async function* ($, e, next) {
      const stream = next(e)
      for await (const chunk of stream) {
        await $.ui.toast(`above chunk ${JSON.stringify(chunk)}`)
        yield chunk
      }
      const result = await stream.result
      await $.ui.toast(`above result ${JSON.stringify(result)}`)

      return result
    })
  },
}
const SPOIL: Plugin = {
  name: 'stand-in-spoil',
  tier: 'append',
  register(on) {
    on('state.get', async ($, e, next) => {
      const held = await next(e)
      if (e.plugin !== 'premise-widget' || e.key !== 'turn' || (await $.session.id()) !== 'spoiled') return held

      return { ...held, value: null } as never
    })
  },
}
const PLUGINS = { plugins: [LAYOUT, WATCH, SPOIL], timeoutMs: 60_000 }
const CHAINED = { plugins: [LAYOUT, WATCH, SPOIL, ABOVE, STREAM], timeoutMs: 60_000 }

const pieces = (text: string, size: number): string[] => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? []

const response = (blocks: readonly Block[], size = 7, stopReason = 'end_turn'): TurnStepChunk[] =>
  [
    ...blocks.flatMap((block, index) => [
      ...(block[0] === 'tool'
        ? [{ kind: 'tool', index, id: `toolu_01${index}`, name: block[1] }, ...pieces(block[2], size).map(json => ({ kind: 'input', index, json }))]
        : pieces(block[1], size).map(text => ({ kind: block[0], index, text }))),
    ]),
    { kind: 'stop', stopReason, usage: SPENT },
  ] as TurnStepChunk[]

const open = (on: On, store?: Record<string, unknown>): Desk => {
  const desk: Desk = {
    world: ground(on, {
      store,
      answers: {
        'session.id': () => {
          const id = desk.at.isSpoiled ? 'spoiled' : 'session-1'
          desk.at.isSpoiled = false

          return id
        },
      },
    }),
    turn: BLANK,
    sets: [],
    ids: [],
    fills: [],
    order: [],
    at: { script: [], box: 'take', isSpoiled: false, plant: write => write, reads: 0 },
  }
  on('state.get', async (_$, e, next) => {
    if (e.plugin !== NAME || e.key !== 'isOn' || desk.at.trip === undefined) return next(e)

    desk.at.reads += 1
    if (desk.at.reads === 2) {
      const { trip } = desk.at
      desk.at.trip = undefined
      await trip()
    }

    return next(e)
  })
  on('state.set', async (_$, e, next) => {
    const write = e as { plugin: string; key: string; value: unknown }
    if (write.plugin !== NAME) return next(e)

    const value = write.key === 'turn' ? desk.at.plant(write.value as Held) : write.value
    const landed = (await next({ ...write, value } as never)) as unknown as { value: { isSet: boolean } }
    if (!landed.value.isSet) return landed as never
    desk.sets.push(write.key)
    if (write.key === 'turn') {
      desk.turn = value as Held
      desk.ids.push(desk.turn.id)
    }

    return landed as never
  })
  on('prompt.fill', (_$, e) => {
    desk.fills.push(e.text)

    return { isFilled: desk.at.box === 'take' }
  })
  on('turn.step', async function* (_$, e) {
    let answer = ''
    for (const [at, chunk] of desk.at.script.entries()) {
      if (chunk instanceof Error) throw chunk
      if (chunk.kind === 'text') answer += chunk.text
      desk.order.push(`made ${at}`)
      yield chunk
    }
    const tools = desk.at.script.filter(chunk => !(chunk instanceof Error) && chunk.kind === 'tool') as { name: string }[]

    return {
      turnId: e.turnId,
      index: e.index,
      answer,
      toolUses: tools.map(({ name }) => ({ name, input: { command: 'npm test' } })),
      stopReason: tools.length > 0 ? 'tool_use' : 'end_turn',
      usage: SPENT,
    }
  })

  return desk
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string | undefined> => (await $.command.run(run(NAME, args))).text

const begin = ($: Engine, turnId = 'turn-1'): Promise<unknown> => $.turn.start({ text: 'Fix the failing test', turnId })

const finish = ($: Engine, turnId = 'turn-1', reason: 'answer' | 'aborted' = 'answer', agentId?: string): Promise<unknown> =>
  $.turn.complete({ answer: 'Done.', durationMs: 4200, isAborted: reason === 'aborted', turnId, reason, ...(agentId === undefined ? {} : { agentId }) } as never)

const step = async ($: Engine, desk: Desk, script: (TurnStepChunk | Error)[], given: Given = {}): Promise<Stepped> => {
  desk.at.script = script
  desk.order = []
  const out: TurnStepChunk[] = []
  const stream = $.turn.step({
    turnId: given.turnId ?? 'turn-1',
    index: given.index ?? 0,
    model: 'claude-opus-5-5',
    effort: 'high',
    messageCount: 3 + (given.index ?? 0) * 2,
    ...(given.agentId === undefined ? {} : { agentId: given.agentId }),
  })
  for (let pulled = await stream.next(); ; pulled = await stream.next()) {
    if (pulled.done === true) return { out, result: pulled.value }
    desk.order.push(`got ${out.length}`)
    out.push(pulled.value)
    await given.each?.(pulled.value, out.length - 1)
  }
}

const spoilAt = (desk: Desk, count: number): (() => Promise<void>) => {
  let isArmed = false

  return async () => {
    if (isArmed || desk.turn.found.length !== count) return
    isArmed = true
    desk.at.isSpoiled = true
  }
}

const think = ($: Engine, desk: Desk, thinking: string, reply = '', given: Given = {}): Promise<Stepped> =>
  step($, desk, response(reply === '' ? [['thinking', thinking]] : [['thinking', thinking], ['text', reply]]), given)

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
    lines: rows.map(shown),
    dim: rows.filter(row => row.props?.dimColor === true).map(shown),
    red: rows.filter(row => row.props?.color === 'red').map(shown),
  }
}

const audit = (desk: Desk): void => {
  expect([...desk.world.store.keys()].filter(key => key !== 'isOn')).toEqual([])
  expect(desk.world.writes.filter(write => write !== 'store isOn')).toEqual([])
  expect(desk.world.toasts.filter(toast => toast.startsWith('call '))).toEqual([])
}


test('A1: the empty sentence before any turn, then the live note once a turn starts', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  expect(await card($)).toEqual({ note: '', lines: EMPTY_ROWS, dim: EMPTY_ROWS, red: [] })

  await begin($)
  expect(await card($)).toEqual({ note: 'live', lines: [READING], dim: [READING], red: [] })
  expect(desk.turn).toEqual({ ...BLANK, id: 'turn-1', phase: 'live' })
  audit(desk)
})

test('A2: sentences are assembled from chunks that split words, listed live, and the tail is listed at the step end', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await begin($)

  const script = response([['thinking', `${DUMP} Now write it.`]], 5)
  expect(script.filter(chunk => chunk.kind === 'thinking').map(chunk => (chunk as { text: string }).text).slice(0, 3)).toEqual(['Since', ' the ', 'datab'])
  const live: (Card | undefined)[] = []
  await step($, desk, script, {
    each: async chunk => {
      if (chunk.kind === 'thinking') live.push(await card($))
    },
  })
  expect(live[0]).toEqual({ note: 'live', lines: [READING], dim: [READING], red: [] })
  expect(live.at(-1)).toEqual({ note: '1 so far', lines: ["1 I'll default to pg_dump"], dim: [], red: [] })
  expect(desk.turn.found).toEqual([{ quote: DUMP, gist: "I'll default to pg_dump", isSaid: false }])

  const tail = WEB.slice(0, -1)
  const during: number[] = []
  await think($, desk, `The cron line is short. ${tail}`, '', {
    index: 1,
    each: async () => {
      during.push(desk.turn.found.length)
    },
  })
  expect(new Set(during)).toEqual(new Set([1]))
  expect(desk.turn.found[1]).toEqual({ quote: tail, gist: "I'll just give the restart command", isSaid: false })

  await think($, desk, 'Plan:\n-   since  no\tcountry   is specified, I will go with E.164.\n1. Without specifics I need to pick a shell!\n', '', { index: 2 })
  expect(desk.turn.found.slice(2)).toEqual([
    { quote: 'since no country is specified, I will go with E.164.', gist: 'I will go with E.164', isSaid: false },
    { quote: 'Without specifics I need to pick a shell!', gist: 'I need to pick a shell', isSaid: false },
  ])

  const shell = "I don't know the OS, e.g. Ubuntu or Debian, so I'll write POSIX sh."
  const init = "Without knowing the init system, i.e. systemd vs. OpenRC etc. on that box, I'll use systemctl."
  await step($, desk, response([['thinking', `${shell} ${init} Done.`]], 3), { index: 3 })
  expect(desk.turn.found.slice(4)).toEqual([
    { quote: shell, gist: "I'll write POSIX sh", isSaid: false },
    { quote: init, gist: "I'll use systemctl", isSaid: false },
  ])
  expect((await card($))?.note).toBe('6 so far')
  audit(desk)
})

test('A3: every gap with every choice lists its sentence; a gap alone, a choice alone and a question list nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  const gaps = [
    "The database type isn't specified",
    "The port wasn't specified",
    "The paths aren't specified",
    "The hosts weren't specified",
    "They didn't specify a shell",
    'Since no country is specified',
    'Since no specific path was given',
    'No port is given',
    'No start time was specified',
    "I don't know the stack",
    'Without specifics',
    'Without knowing the framework',
  ]
  const choices = ["I'll use the common default", 'I will use the common default', 'I need to pick something reasonable']
  for (const [at, choice] of choices.entries()) {
    const turnId = `turn-${at + 1}`
    await begin($, turnId)
    await think($, desk, gaps.map(gap => `${gap}, so ${choice}.`).join(' '), '', { turnId })
    expect(desk.turn.found).toEqual(gaps.map(gap => ({ quote: `${gap}, so ${choice}.`, gist: choice, isSaid: false })))
  }

  const varied = [
    ['Since the database type isn’t specified, I’ll default to pg_dump.', 'I’ll default to pg_dump'],
    ['THEY DIDN’T SPECIFY A SHELL, SO I WILL WRITE POSIX SH.', 'I WILL WRITE POSIX SH'],
    ['I DON’T KNOW THE STACK, SO I NEED TO PICK ONE.', 'I NEED TO PICK ONE'],
    [FOLDER, `${FOLDER.slice(0, 79)}…`],
    ["I'll use port 8080, since no port was given.", "I'll use port 8080, since no port was given"],
  ] as const
  await begin($, 'turn-4')
  await think($, desk, varied.map(([sentence]) => sentence).join('\n'), '', { turnId: 'turn-4' })
  expect(desk.turn.found).toEqual(varied.map(([quote, gist]) => ({ quote, gist, isSaid: false })))

  const silent = [
    "I don't actually know what this project uses to run its tests, so guessing a command would just be fabricating something.",
    "They haven't shared any examples, and I have no way to look that up.",
    'I could use a generic placeholder instead of assuming Postgres, but that feels less useful.',
    "Since the project only has a README, there's nothing concrete to test yet.",
    "I'll assume the migration has already been run.",
    "The stack isn't specified, so what will I pick?",
    "I don't know the stack, so I should ask.",
    'Since no port is given, the default applies.',
    "I know one is given in the README, so I'll use it.",
    'The file is probably stale and likely unused, assuming nobody imports it.',
  ]
  await begin($, 'turn-5')
  await think($, desk, silent.join(' '), '', { turnId: 'turn-5' })
  expect(desk.turn).toEqual({ ...BLANK, id: 'turn-5', phase: 'live', sawThinking: true })
  audit(desk)
})

test('A4: a finished turn keeps its unsaid assumptions numbered, however it ended, until the next turn starts', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  for (const [turnId, reason] of [['turn-1', 'answer'], ['turn-2', 'aborted']] as const) {
    await begin($, turnId)
    await think($, desk, `The cron line can be short. ${PG} ${PHONE}`, CRON, { turnId })
    await finish($, turnId, reason)
    expect(await card($)).toEqual({ note: '2 unspoken', lines: BEST, dim: [], red: [] })
    expect(desk.turn.phase).toBe('settled')
  }

  await begin($, 'turn-3')
  expect(desk.turn).toEqual({ ...BLANK, id: 'turn-3', phase: 'live' })
  expect(await card($)).toEqual({ note: 'live', lines: [READING], dim: [READING], red: [] })
  audit(desk)
})

test('A5: nothing worded as an assumption, no thinking shown and no turn yet are three different sentences, none a clean bill', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const told = [EMPTY, (await cmd($, 'show')) ?? '']

  await begin($)
  await think($, desk, 'The test imports sum from src/sum.js. Edit the file.', 'Fixed the off-by-one in src/sum.js.')
  await finish($)
  expect(await card($)).toEqual({ note: '', lines: NONE_ROWS, dim: NONE_ROWS, red: [] })
  expect((await card($, 20))?.lines).toEqual(['The thinking', 'shown words', 'nothing as an', 'assumption.'])
  told.push(NONE, (await cmd($, 'show')) ?? '')

  await begin($, 'turn-2')
  await step($, desk, response([['text', "Since no number is given, I'll say 91 is 7 times 13."]]), { turnId: 'turn-2' })
  await finish($, 'turn-2')
  expect(await card($)).toEqual({ note: '', lines: UNSEEN_ROWS, dim: UNSEEN_ROWS, red: [] })
  told.push(...UNSEEN_ROWS, (await cmd($, 'show')) ?? '')

  await begin($, 'turn-3')
  await step($, desk, response([['thinking', ' \n\n  '], ['text', 'No.']], 2), { turnId: 'turn-3' })
  await finish($, 'turn-3')
  expect(desk.turn).toEqual({ ...BLANK, id: 'turn-3', phase: 'settled' })
  expect((await card($))?.lines).toEqual(UNSEEN_ROWS)
  expect((await card($, 20))?.lines).toEqual(['No thinking text', 'reached this', 'card.', '/premise-widget', 'show says why.'])

  expect(new Set([NONE, UNSEEN, EMPTY]).size).toBe(3)
  for (const sentence of told) expect(sentence).not.toMatch(/\bno\b[^.]*\bassum|\bnothing (?:was |is )?(?:unspoken|assumed)|\bassumed nothing/i)
  audit(desk)
})

test('A6: an assumption the reply flags is dropped; one the reply only uses, or flags in other words, is kept', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const said = async (turnId: string, thinking: string, reply: string): Promise<boolean[]> => {
    await begin($, turnId)
    await think($, desk, thinking, reply, { turnId })
    await finish($, turnId)

    return desk.turn.found.map(item => item.isSaid)
  }

  await begin($)
  await think($, desk, STACK, `FROM node:22-alpine\n${NODE_NOTE}\nCMD ["node", "server.js"]`)
  expect(await card($)).toEqual({ note: 'live', lines: [READING], dim: [READING], red: [] })
  await finish($)
  expect(await card($)).toEqual({ note: '', lines: [...NONE_ROWS, '1 was said in the reply.'], dim: [...NONE_ROWS, '1 was said in the reply.'], red: [] })

  expect(await said('turn-2', `${STACK} ${DUMP}`, `${NODE_NOTE}\n# Database type unknown, so pg_dump is a best guess.`)).toEqual([true, true])
  expect((await card($))?.lines).toEqual([...NONE_ROWS, '2 were said in the reply.'])
  expect((await card($, 20))?.lines).toEqual(['The thinking', 'shown words', 'nothing as an', 'assumption.', '2 were said in', 'the reply.'])

  expect(await said('turn-3', STACK, 'FROM node:22-alpine')).toEqual([false])
  expect(await said('turn-4', STACK, 'FROM node:22-alpine\nReplace the port if yours differs.')).toEqual([false])
  expect(await said('turn-5', DUMP, CRON)).toEqual([false])
  expect((await card($))?.note).toBe('1 unspoken')

  const flagged = [
    'Assuming a Postgres database here.',
    'The database name is a placeholder.',
    'Both database names are placeholders.',
    'Replace mydb with your database name.',
    'Adjust the database name to yours.',
    'Database unknown.',
    'This is my best guess at your database.',
    'The database was not specified.',
    'The database wasn’t specified.',
  ]
  for (const [at, reply] of flagged.entries()) expect(await said(`turn-flag-${at}`, DUMP, reply)).toEqual([true])
  for (const [at, reply] of ['The database is replaced nightly.', 'A guess at your database.', 'The database is specified in the cron line.'].entries()) {
    expect(await said(`turn-plain-${at}`, DUMP, reply)).toEqual([false])
  }

  await begin($, 'turn-6')
  await step($, desk, response([['thinking', STACK], ['text', 'This assumes a Node.js app, so I will read the lockfile.'], ['tool', 'Bash', '{"command":"npm test"}']]), { turnId: 'turn-6' })
  expect(desk.turn.found.map(item => item.isSaid)).toEqual([true])
  await think($, desk, DUMP, 'The image builds and the backup runs.', { turnId: 'turn-6', index: 1 })
  await finish($, 'turn-6')
  expect(desk.turn.found.map(item => item.isSaid)).toEqual([true, false])

  await begin($, 'turn-7')
  await think($, desk, 'Read the Dockerfile first.', 'This assumes a Node.js app.', { turnId: 'turn-7' })
  await think($, desk, STACK, 'The image builds and node starts.', { turnId: 'turn-7', index: 1 })
  await finish($, 'turn-7')
  expect(desk.turn.found.map(item => item.isSaid)).toEqual([false])
  audit(desk)
})

test('A7: every chunk leaves the hook unchanged and in step with the stream, beside another pass-through hook', CHAINED, async ($, on) => {
  const desk = open(on)
  await start($)
  await begin($)

  const script = response([['thinking', `${DUMP} Run the tests.`], ['text', 'Running the tests now.'], ['tool', 'Bash', '{"command":"npm test"}']], 6, 'tool_use')
  expect([...new Set(script.map(chunk => chunk.kind))].sort()).toEqual(['input', 'stop', 'text', 'thinking', 'tool'])

  const { out, result } = await step($, desk, script)
  const wanted = { turnId: 'turn-1', index: 0, answer: 'Running the tests now.', toolUses: [{ name: 'Bash', input: { command: 'npm test' } }], stopReason: 'tool_use', usage: SPENT }
  expect(out).toEqual(script)
  expect(desk.order).toEqual(script.flatMap((_chunk, at) => [`made ${at}`, `got ${at}`]))
  expect(result).toEqual(wanted)
  expect(desk.turn.found.map(item => item.quote)).toEqual([DUMP])

  const seen = (lead: string): unknown[] => desk.world.toasts.filter(toast => toast.startsWith(lead)).map(toast => JSON.parse(toast.slice(lead.length)))
  for (const side of ['above', 'below']) {
    expect(seen(`${side} chunk `)).toEqual(script)
    expect(seen(`${side} result `)).toEqual([wanted])
  }
  audit(desk)
})

test('A8: a subagent step is forwarded whole and unread, and its end does not settle the main turn', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await begin($)
  const before = desk.sets.length

  const script = response([['thinking', DUMP], ['text', 'Found three callers.']])
  const { out, result } = await step($, desk, script, { turnId: 'agent-turn-1', agentId: 'agent-7' })
  expect(out).toEqual(script)
  expect(result.answer).toBe('Found three callers.')
  await finish($, 'agent-turn-1', 'answer', 'agent-7')
  await finish($, 'turn-1', 'answer', 'agent-7')

  expect(desk.sets.slice(before)).toEqual([])
  expect(desk.turn).toEqual({ ...BLANK, id: 'turn-1', phase: 'live' })
  audit(desk)
})

test('A9: a repeated assumption is listed once, the 21st pushes the oldest out, and an unannounced turn starts afresh', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await begin($)

  await think($, desk, DUMP, 'This assumes a Postgres database.')
  await think($, desk, `${DUMP} ${PHONE}`, '', { index: 1 })
  await step($, desk, response([['thinking', PHONE], ['thinking', `- ${PHONE.toUpperCase()}`]]), { index: 2 })
  expect(desk.turn.found.map(item => [item.quote, item.isSaid])).toEqual([[DUMP, true], [PHONE, false]])

  const modules = Array.from({ length: 19 }, (_, at) => `Since no path is given for module ${at + 1}, I'll load it from src.`)
  await think($, desk, modules.join(' '), '', { index: 3 })
  const full = desk.turn.found
  expect(full).toHaveLength(20)
  expect(full.map(item => item.quote)).toEqual([PHONE, ...modules])
  await finish($)
  expect((await card($))?.note).toBe('20 unspoken')
  expect(await cmd($, 'show')).not.toMatch(/said in the reply/)

  await think($, desk, WEB, '', { turnId: 'turn-2' })
  expect(desk.turn).toEqual({ ...BLANK, id: 'turn-2', phase: 'live', sawThinking: true, found: [{ quote: WEB, gist: "I'll just give the restart command", isSaid: false }] })
  audit(desk)
})

test('A10: a reader that fails never costs the stream a chunk, and says so in red under what it had found', CHAINED, async ($, on) => {
  const desk = open(on)
  await start($)
  await begin($)

  const script = response([['thinking', `${DUMP} ${PHONE} ${WEB}`], ['text', CRON]])
  const { out, result } = await step($, desk, script, { each: spoilAt(desk, 1) })
  expect(out).toEqual(script)
  expect(result).toMatchObject({ turnId: 'turn-1', index: 0, answer: CRON })
  await finish($)
  expect(desk.turn).toMatchObject({ phase: 'settled', isBroken: true, found: [{ quote: DUMP }] })
  expect(await card($)).toEqual({ note: '1 unspoken', lines: ["1 I'll default to pg_dump", BROKEN], dim: [], red: [BROKEN] })

  await begin($, 'turn-2')
  const lost = new Error('the connection dropped')
  const cut = response([['thinking', `Read the crontab. ${WEB.slice(0, -1)}`]]).slice(0, -1)
  const got: TurnStepChunk[] = []
  const thrown = await step($, desk, [...cut, lost], {
    turnId: 'turn-2',
    each: async chunk => {
      got.push(chunk)
    },
  }).catch((error: unknown) => error)
  expect(String(thrown)).toContain('turn.step')
  expect(desk.world.toasts.filter(toast => toast.startsWith('below failed '))).toEqual([`below failed ${String(thrown)}`])
  expect(got).toEqual(cut)
  expect(desk.turn).toMatchObject({ isBroken: false, found: [{ quote: WEB.slice(0, -1) }] })
  audit(desk)
})

test('A11: show lists every unflagged quote in full, or says what the card says and what Premise cannot see', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  expect(await cmd($, 'show')).toBe(EMPTY)

  await begin($)
  expect(await cmd($, 'show')).toBe(READING)
  await step($, desk, response([['text', 'No.']]))
  expect(await cmd($, 'show')).toBe(READING)
  await finish($)
  expect(await cmd($, 'show')).toBe(WHY)
  expect(WHY).toContain('"showThinkingSummaries": true')
  expect(WHY).toContain('--thinking-display summarized')

  await begin($, 'turn-2')
  await think($, desk, 'Seven times thirteen is 91.', 'No.', { turnId: 'turn-2' })
  await finish($, 'turn-2')
  expect(await cmd($, 'show')).toBe(`${NONE}\n${LIMIT}`)

  await begin($, 'turn-2b')
  await think($, desk, STACK, NODE_NOTE, { turnId: 'turn-2b' })
  await finish($, 'turn-2b')
  expect(await cmd($, 'show')).toBe(`${NONE}\n1 was said in the reply.\n${LIMIT}`)

  await begin($, 'turn-3')
  desk.at.isSpoiled = true
  await think($, desk, 'Seven times thirteen is 91.', 'No.', { turnId: 'turn-3' })
  await finish($, 'turn-3')
  expect(await cmd($, 'show')).toBe(BROKEN)
  expect(await card($)).toEqual({ note: '', lines: [BROKEN], dim: [], red: [BROKEN] })

  const long = `Since the layout isn't specified, I'll ${'read every file under the settings folder and '.repeat(2)}touch nothing else.`
  await begin($, 'turn-4')
  await think($, desk, `${STACK} ${long} ${PHONE}`, NODE_NOTE, { turnId: 'turn-4' })
  await finish($, 'turn-4')
  const listed = [
    'Premise: 2 assumptions in the thinking shown that the reply does not flag. Claude may have checked them since.',
    `1. "${long}"`,
    `2. "${PHONE}"`,
    '1 more said in the reply.',
  ].join('\n')
  expect(await cmd($, 'show')).toBe(listed)
  expect(await cmd($, 'SHOW')).toBe(listed)
  expect(await cmd($, 'show all')).toBe(USAGE)

  await begin($, 'turn-5')
  await think($, desk, `${DUMP} ${PHONE}`, '', { turnId: 'turn-5', each: spoilAt(desk, 1) })
  await finish($, 'turn-5')
  expect(await cmd($, 'show')).toBe(
    ['Premise: 1 assumption in the thinking shown that the reply does not flag. Claude may have checked them since.', `1. "${DUMP}"`, BROKEN].join('\n'),
  )
  audit(desk)
})

test('A12: fix fills the prompt box with one clean line for the numbered assumption and sends nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await begin($)
  const quoted = 'Since the "prod" flag isn\'t specified, I\'ll default to staging.'
  const clean = `You assumed: "Since the 'prod' flag isn't specified, I'll default to staging.". That is wrong: `
  await think($, desk, `${STACK} ${quoted} ${PHONE}`, NODE_NOTE)
  await finish($)

  expect(await cmd($, 'fix 2')).toBe('Filled the prompt with assumption 2. Finish the sentence and send it.')
  expect(desk.fills).toEqual([`You assumed: "${PHONE}". That is wrong: `])
  expect(await cmd($, 'FIX 1')).toBe('Filled the prompt with assumption 1. Finish the sentence and send it.')
  expect(desk.fills[1]).toBe(clean)

  // A streamed quote never holds a newline (a newline ends the sentence), so one is planted in the held value as it is written.
  await begin($, 'turn-1b')
  desk.at.plant = write => ({ ...write, found: write.found.map(item => ({ ...item, quote: item.quote.replace('"prod" flag', '"prod"\n  flag') })) })
  await think($, desk, quoted, '', { turnId: 'turn-1b' })
  desk.at.plant = write => write
  expect(desk.turn.found[0]?.quote).toBe('Since the "prod"\n  flag isn\'t specified, I\'ll default to staging.')
  await cmd($, 'fix 1')
  expect(desk.fills[2]).toBe(clean)

  await begin($, 'turn-2')
  await think($, desk, `${DUMP} ${PHONE}`, '', { turnId: 'turn-2' })
  desk.at.box = 'refuse'
  expect(await cmd($, 'fix 2')).toBe(`Could not fill the prompt box. Assumption 2: "${PHONE}"`)
  desk.at.box = 'take'
  expect(desk.fills).toHaveLength(4)

  expect(await cmd($, 'fix 9')).toBe('No assumption 9. /premise-widget show lists them.')
  expect(await cmd($, 'fix 0')).toBe('No assumption 0. /premise-widget show lists them.')
  for (const typed of ['fix', 'fix x', 'fix 99999999999999999999999', 'fix 1000', 'what', 'fix -1', 'fix 1.5', 'fix 2 extra']) expect(await cmd($, typed)).toBe(USAGE)
  for (const verb of ['on', 'off', 'show', 'fix <n>', 'clear']) expect(USAGE).toContain(verb)
  expect(desk.fills).toHaveLength(4)
  expect(desk.world.contexts).toEqual([])
  audit(desk)
})

test('A13: clear and off wipe the quotes, and off reads, fills and writes nothing', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await begin($)
  await think($, desk, DUMP)

  expect(await cmd($, 'clear')).toBe('Premise cleared.')
  expect(desk.turn).toEqual(BLANK)
  expect(await card($)).toEqual({ note: '', lines: EMPTY_ROWS, dim: EMPTY_ROWS, red: [] })
  await think($, desk, PHONE, '', { index: 1 })
  expect(desk.turn).toMatchObject({ id: 'turn-1', phase: 'live', found: [{ quote: PHONE }] })

  const script = response([['thinking', `${DUMP} ${WEB} ${FOLDER}`], ['text', CRON]])
  let after = -1
  const flight = await step($, desk, script, {
    index: 2,
    each: async () => {
      if (after < 0 && desk.turn.found.length === 2) {
        expect(await cmd($, 'off')).toBe('Premise off.')
        after = desk.sets.length
      }
    },
  })
  expect(after).toBeGreaterThan(0)
  expect(flight.out).toEqual(script)
  expect(flight.result.answer).toBe(CRON)
  expect(desk.sets.slice(after)).toEqual([])
  expect(desk.turn).toEqual(BLANK)

  for (const typed of ['show', 'fix 1', 'clear']) expect(await cmd($, typed)).toBe(OFF)
  expect(desk.fills).toEqual([])
  await begin($, 'turn-2')
  const off = await think($, desk, DUMP, 'Done.', { turnId: 'turn-2' })
  await finish($, 'turn-2')
  expect(off.out).toEqual(desk.at.script)
  expect(off.result.answer).toBe('Done.')
  expect(desk.sets.slice(after)).toEqual([])
  expect(await card($)).toBeUndefined()

  await cmd($, 'on')
  desk.at.reads = 0
  desk.at.trip = async () => {
    await cmd($, 'off')
  }
  const late = await think($, desk, DUMP, 'Done.', { turnId: 'turn-3' })
  expect(desk.at.trip).toBeUndefined()
  expect(late.out).toEqual(desk.at.script)
  expect(late.result.answer).toBe('Done.')
  expect(desk.ids).not.toContain('turn-3')
  expect(desk.turn).toEqual(BLANK)
  audit(desk)
})

test('A14: every state fits the card at 20, 40 and 60 columns and the busiest card keeps its last three', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  const sizes = [[20, 16], [40, 36], [60, 56]] as const
  const fits = async (): Promise<void> => {
    for (const [columns, inner] of sizes) {
      await $.command.run(run('widen', `${NAME} ${columns}`))
      const drawn = await card($, columns)
      for (const line of drawn?.lines ?? []) expect(line.length).toBeLessThanOrEqual(inner)
      expect(drawn?.lines.length).toBeLessThanOrEqual(7)
      expect(`Premise ${drawn?.note}`.trimEnd().length).toBeLessThanOrEqual(inner)
    }
    await $.command.run(run('widen', `${NAME} 40`))
  }

  await fits()
  expect((await card($, 20))?.lines).toEqual(['What Claude', 'takes for', 'granted in its', 'thinking and', 'does not say', 'appears here', 'while it thinks.'])
  await begin($)
  await fits()

  const five = [WEB, FOLDER, PG, PHONE, POWER]
  await think($, desk, five.join(' '), CRON)
  await fits()
  expect((await card($, 20))?.note).toBe('5')
  expect((await card($))?.note).toBe('5 so far')
  await finish($)
  await fits()
  expect(await card($, 20)).toEqual({
    note: '5',
    lines: ["3 I'll default", '  to a PostgreS…', "4 I'll go with a", '  permissive E.…', "5 I'll give a", '  PowerShell on…', '+2 earlier'],
    dim: ['+2 earlier'],
    red: [],
  })
  const wide = await card($)
  expect(wide?.note).toBe('5 unspoken')
  expect(wide?.lines.at(-1)).toBe('+2 earlier · show lists all')
  expect(wide?.lines.slice(0, 2)).toEqual(["3 I'll default to a PostgreSQL", '  pg_dump example with placeholder …'])

  await begin($, 'turn-2')
  await think($, desk, five.join(' '), '', { turnId: 'turn-2', each: spoilAt(desk, 4) })
  await finish($, 'turn-2')
  await fits()
  expect(await card($, 20)).toEqual({
    note: '4',
    lines: ["4 I'll go with a", '  permissive E.…', '+3 earlier', 'Could not read', "this turn's", 'thinking.'],
    dim: ['+3 earlier'],
    red: ['Could not read', "this turn's", 'thinking.'],
  })

  await begin($, 'turn-3')
  await think($, desk, `${STACK} ${DUMP}`, `${NODE_NOTE}\n# Database type unknown, so pg_dump is a best guess.`, { turnId: 'turn-3' })
  await finish($, 'turn-3')
  expect((await card($))?.lines.at(-1)).toBe('2 were said in the reply.')
  await fits()
  await begin($, 'turn-4')
  await step($, desk, response([['text', 'No.']]), { turnId: 'turn-4' })
  await finish($, 'turn-4')
  await fits()

  const pathed = "Since no entry point is given, I'll treat packages/api/src/routes/authentication/refresh-session-handler.ts as the only caller of it."
  await begin($, 'turn-5')
  await think($, desk, `${pathed} ${PG} ${PHONE}`, '', { turnId: 'turn-5' })
  await finish($, 'turn-5')
  await fits()
  for (const [columns] of sizes.slice(0, 2)) {
    const rows = (await card($, columns))?.lines ?? []
    expect(rows.filter(row => /^\d /.test(row))).toHaveLength(3)
    expect(rows[1]).toMatch(/^ {2}.*…$/)
    expect(rows[2]).toMatch(/^2 /)
  }

  await begin($, 'turn-6')
  await think($, desk, `${PG} ${PHONE}`, '', { turnId: 'turn-6' })
  await finish($, 'turn-6')
  for (const [place, component] of SITES) {
    await $.command.run(run('place', place))
    expect(await card($, 40, component)).toEqual({ note: '2 unspoken', lines: BEST, dim: [], red: [] })
  }
  audit(desk)
})

test('A15: a long assumption is held cut, and nothing but the switch is ever stored', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)
  await begin($)

  const long = `Since the layout isn't specified, I'll assume ${'the config loader reads every file under the settings folder and '.repeat(4)}nothing else.`
  expect(long.length).toBeGreaterThanOrEqual(300)
  await think($, desk, long, 'Fixed the off-by-one in src/sum.js.')
  await finish($)

  const [item] = desk.turn.found
  expect(item?.quote).toHaveLength(240)
  expect(item?.quote).toBe(`${long.slice(0, 239)}…`)
  expect(item?.gist).toHaveLength(80)
  expect(item?.gist).toBe(`${long.slice(long.indexOf("I'll assume")).slice(0, 79)}…`)

  await cmd($, 'show')
  await cmd($, 'fix 1')
  await cmd($, 'clear')
  await cmd($, 'off')
  expect([...desk.world.store.entries()]).toEqual([['isOn', false]])
  audit(desk)
})

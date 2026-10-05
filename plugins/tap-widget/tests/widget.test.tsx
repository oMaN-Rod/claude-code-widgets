import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { McpToolResult, On, ToolInfo } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Asked = { server: string; tool: string; args: Record<string, unknown> }
type Reply = McpToolResult | Error | 'hang'
type Desk = {
  world: Ground
  calls: Asked[]
  minutes: number[]
  replies: Map<string, Reply>
  hung: ((result: McpToolResult) => void)[]
  tools: ToolInfo[]
  lists: number
}
type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] }
type Row = { name: string; age: string; line: string; color: unknown; isDim: boolean; star: unknown }
type Drawn = { title: string; note: string; width: unknown; rows: Row[]; count: number; empty: string[] }

const NAME = 'tap-widget'
const HINT = '[on|off|list [word]|add <server> <tool> [json] [anyway]|run <n>|show <n>|drop <n>|clear]'
const USAGE = `Usage: /tap-widget ${HINT}`
const OFF = 'Tap is off.'
const NOT_JSON = 'The arguments are not a JSON object'
const EMPTY = ['Name a server and a tool:', '/tap-widget add <server> <tool>', '/tap-widget list shows them.']
const T0 = 1_700_000_000_000
const MINUTE = 60_000
const HOUR = 3_600_000
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

const texted = (value: unknown): McpToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  isError: false,
})

const shaped = (value: unknown, text?: string): McpToolResult => ({
  content: text === undefined ? [] : [{ type: 'text', text }],
  isError: false,
  structuredContent: value,
})

const refused = (text?: string): McpToolResult => ({ content: text === undefined ? [] : [{ type: 'text', text }], isError: true })

const pull = (number: number, title: string, updated = '2026-10-04T09:12:44Z') => ({
  id: `PR_kwDOJ${number}`,
  number,
  title,
  state: 'open',
  draft: false,
  user: { login: 'ada' },
  updated_at: updated,
})

const issue = (id: string, title: string, count: number) => ({ id, title, culprit: 'app/checkout', count, lastSeen: '2026-10-04T09:20:01Z' })

const PULLS = [pull(412, 'Fix the login redirect'), pull(409, 'Bump bun'), pull(398, 'Add dark mode')]
const MORE_PULLS = [pull(415, 'Add retry to the uploader'), ...PULLS]
const ISSUES = [issue('4501', 'TypeError in checkout.js', 12), issue('4488', 'Timeout in /api/cart', 3)]
const MORE_ISSUES = [issue('4510', 'Null user in session.js', 1), ...ISSUES]
const EVENTS = [
  { id: 'e1', summary: 'Standup', start: { dateTime: '2026-10-05T09:00:00+02:00' } },
  { id: 'e2', summary: 'Design review', start: { dateTime: '2026-10-05T13:00:00+02:00' } },
  { id: 'e3', summary: 'Retro', start: { dateTime: '2026-10-05T16:00:00+02:00' } },
]
const GITHUB = { server: 'github', tool: 'list_pull_requests', args: {} }
const SENTRY = { server: 'sentry', tool: 'list_issues', args: {} }
const CAL = { server: 'cal', tool: 'list_events', args: { calendarId: 'primary', max: 2 } }

const WATCH: Plugin = {
  name: 'stand-in-watch',
  tier: 'append',
  register(on) {
    on('command.run', { command: 'peek' }, async $ => ({
      text: JSON.stringify((await $.state.get({ plugin: 'tap-widget', key: 'reads' } as const)).value ?? {}),
    }))
  },
}

const PLUGINS = { plugins: [LAYOUT, WATCH] }
const LONG = { ...PLUGINS, timeoutMs: 30_000 }

const open = (on: On, store: Record<string, unknown> = {}): Desk => {
  const desk: Desk = {
    world: undefined as never,
    calls: [],
    minutes: [],
    replies: new Map<string, Reply>([
      ['list_pull_requests', texted(PULLS)],
      ['list_issues', shaped({ issues: ISSUES })],
      ['list_events', shaped({ events: EVENTS, nextPageToken: null })],
    ]),
    hung: [],
    tools: [],
    lists: 0,
  }
  desk.world = ground(on, {
    now: T0,
    store,
    answers: {
      'tool.list': () => {
        desk.lists += 1

        return desk.tools.map(tool => ({ ...tool }))
      },
    },
  })
  on('mcp.call', async (_$, e) => {
    desk.calls.push({ server: e.server, tool: e.tool, args: e.args })
    desk.minutes.push(Math.round((desk.world.clock.now() - T0) / MINUTE))
    const reply = desk.replies.get(e.tool) ?? texted('ok')
    if (reply instanceof Error) return { deny: reply.message }
    if (reply === 'hang') return { value: await new Promise<McpToolResult>(settle => void desk.hung.push(settle)) }

    return { value: reply }
  })

  return desk
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const say = async ($: Engine, args = ''): Promise<string> => (await $.command.run(run(NAME, args))).text ?? ''

const idle = async (): Promise<void> => {
  await new Promise(done => setTimeout(done, 5))
}

const pass = async (desk: Desk, ms: number): Promise<void> => {
  await desk.world.clock.advance(ms)
  await idle()
}

const settle = async (desk: Desk, result: McpToolResult): Promise<void> => {
  desk.hung.shift()?.(result)
  await idle()
}

const peek = async ($: Engine): Promise<Record<string, { reading: string; raw: string; fault: string }>> =>
  JSON.parse((await $.command.run(run('peek'))).text ?? '{}') as Record<string, { reading: string; raw: string; fault: string }>

const readingIn = (answer: string): string => answer.slice(answer.indexOf(': ') + 2, answer.indexOf('. It will be called'))

const flat = (node: Node | string | undefined): string => (typeof node === 'string' ? node : (node?.children ?? []).map(flat).join(''))

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const box = await ui.find({ key: 'card' })
  const title = (await ui.find({ key: 'title' }))?.text ?? ''
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const empty = ((await ui.find({ key: 'empty' }))?.children ?? []) as Node[]
  const body = ((await ui.find({ key: 'taps' }))?.children ?? []) as Node[]
  const rows = Array.from({ length: Math.floor(body.length / 2) }, (_, at): Row => {
    const [name, age] = body[at * 2]?.children ?? []
    const line = body[at * 2 + 1]
    const [lead] = line?.children ?? []

    return {
      name: flat(name),
      age: flat(age),
      line: flat(line),
      color: line?.props?.color,
      isDim: line?.props?.dimColor === true,
      star: typeof lead === 'object' ? lead.props?.color : undefined,
    }
  })
  await ui.unmount()
  if (box === undefined) return undefined

  return { title, note, width: box.props.width, rows, count: body.length, empty: empty.map(flat) }
}

test('A1: on with no taps the card says how to add one and carries no note', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const drawn = await card($)
  expect(drawn?.title).toBe('Tap')
  expect(drawn?.note).toBe('')
  expect(drawn?.empty).toEqual(EMPTY)
  expect(drawn?.rows).toEqual([])
  expect((await card($, 20))?.empty).toEqual(['Name a server', 'and a tool:', '/tap-widget add', '<server> <tool>', '/tap-widget list', 'shows them.'])
  await pass(desk, HOUR)
  expect(desk.calls).toEqual([])
})

test('A1: restored taps wait unread until the first tick, which calls each once in order', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, taps: [GITHUB, SENTRY] })

  await session($)
  await $.command.run(run('place', 'side'))
  const waiting = await card($)
  expect(waiting?.note).toBe('2 taps')
  expect(waiting?.rows.map(row => row.name)).toEqual(['1 list_pull_requests', '2 list_issues'])
  expect(waiting?.rows.map(row => row.age)).toEqual(['…', '…'])
  expect(waiting?.rows.map(row => row.line)).toEqual(['  not read yet', '  not read yet'])
  expect(waiting?.rows.every(row => row.isDim)).toBe(true)

  await pass(desk, MINUTE - 1)
  expect(desk.calls).toEqual([])
  await pass(desk, 1)
  expect(desk.calls).toEqual([GITHUB, SENTRY])
  const read = await card($)
  expect(read?.rows.map(row => row.line)).toEqual(['  3 items: Fix the login redirect', '  2 issues: TypeError in checkout.js'])
  expect(read?.rows.map(row => row.age)).toEqual(['0s', '0s'])
  expect(read?.rows.some(row => row.isDim)).toBe(false)
})

test('A1: a store written by hand keeps only well-formed taps, four at most', PLUGINS, async ($, on) => {
  const desk = open(on, {
    isOn: true,
    taps: [null, 'github list', { server: 'github' }, { server: 7, tool: 'list', args: {} }, { server: 'a', tool: 'list', args: [] }, GITHUB, GITHUB, SENTRY, CAL, { ...CAL, args: {} }, { ...SENTRY, args: { q: 1 } }],
  })

  await session($)
  await $.command.run(run('place', 'side'))
  expect((await card($))?.rows.map(row => row.name)).toEqual(['1 list_pull_requests', '2 list_issues', '3 list_events', '4 list_events'])
  await pass(desk, MINUTE)
  expect(desk.calls).toEqual([GITHUB, SENTRY, CAL, { ...CAL, args: {} }])
})

test('A1: a store whose taps are not a list starts with none', PLUGINS, async ($, on) => {
  open(on, { isOn: true, taps: 'github list_pull_requests' })

  await session($)
  await $.command.run(run('place', 'side'))
  expect((await card($))?.empty).toEqual(EMPTY)
})

test('A2: add calls the tool once at once, saves the tap and draws what came back', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  expect(await say($, 'add github list_pull_requests')).toBe(
    'Tap 1: 3 items: Fix the login redirect. It will be called every 10m without asking; /tap-widget drop 1 stops it.',
  )
  expect(desk.calls).toEqual([GITHUB])
  expect(desk.world.store.get('taps')).toEqual([GITHUB])
  const drawn = await card($)
  expect(drawn?.note).toBe('1 tap')
  expect(drawn?.rows).toEqual([{ name: '1 list_pull_requests', age: '0s', line: '  3 items: Fix the login redirect', color: undefined, isDim: false, star: undefined }])

  expect(await say($, 'add cal list_events {"calendarId":"primary","max":2}')).toMatch(/^Tap 2: 3 events: Standup\. /)
  expect(desk.calls).toEqual([GITHUB, CAL])
  expect(desk.world.store.get('taps')).toEqual([GITHUB, CAL])
})

test('A3: the reading of a result follows the fixed rule', PLUGINS, async ($, on) => {
  const desk = open(on)
  const long = 'checkout '.repeat(56).trim()
  const cases: [McpToolResult, string][] = [
    [shaped({ issues: ISSUES }, 'Found 2 issues'), '2 issues: TypeError in checkout.js'],
    [texted(PULLS), '3 items: Fix the login redirect'],
    [texted(['main', 'release/2.4']), '2 items: main'],
    [texted([]), '0 items'],
    [texted([{ id: 77, labels: [] }]), '1 item'],
    [shaped({ events: EVENTS, nextPageToken: null }), '3 events: Standup'],
    [shaped({ events: EVENTS.slice(0, 1) }), '1 event: Standup'],
    [shaped({ progress: ['compiling'] }), '1 progress: compiling'],
    [texted({ login: 'ada', bio: 'Maintainer of the checkout service and three of its clients.', plan: { name: 'pro' }, public_repos: 14, followers: 9 }), 'login ada, public_repos 14'],
    [texted({ owner: { login: 'ada' }, license: { key: 'mit' } }), '2 fields'],
    [texted('\n\n  Build 512 passed\n3 warnings\n'), 'Build 512 passed'],
    [texted('42'), '42'],
    [texted('null'), 'nothing'],
    [{ content: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }], isError: false }, 'an image block'],
    [{ content: [{ type: 'resource_link', uri: 'file:///work/project/report.pdf' }], isError: false }, 'a resource_link block'],
    [{ content: [], isError: false }, 'nothing came back'],
  ]

  await start($)
  for (const [result, wanted] of cases) {
    desk.replies.set('get_thing', result)
    expect(readingIn(await say($, 'add acme get_thing'))).toBe(wanted)
    expect(await say($, 'clear')).toBe('Tap cleared.')
  }

  expect(long.length).toBe(503)
  desk.replies.set('get_thing', texted(long))
  const held = readingIn(await say($, 'add acme get_thing'))
  expect(held.length).toBe(120)
  expect(held).toBe(`${long.slice(0, 119)}…`)
})

test('A4: control characters never reach the state, an answer or the card, and show answers the whole value', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, taps: [{ server: 'ci', tool: 'get_status', args: {} }] })
  const dirty = '\u001b[31mFAIL\u001b[0m\u0007 2 of 14\tchecks\u009b failed\r\nsee the log'
  const wanted = '[31mFAIL [0m 2 of 14 checks failed'

  await session($)
  await $.command.run(run('place', 'side'))
  expect(await say($, 'show 1')).toBe('Tap 1 has no reading yet.')

  desk.replies.set('get_status', texted(dirty))
  expect(await say($, 'run 1')).toBe(`Tap 1: ${wanted}`)
  const stored = Object.values(await peek($))[0]
  expect(stored?.reading).toBe(wanted)
  expect((await card($))?.rows[0]?.line).toBe(`  ${wanted}`)
  const shown = await say($, 'show 1')
  expect(shown).toBe('[31mFAIL [0m  2 of 14 checks  failed \nsee the log')
  for (const text of [stored?.reading ?? '', stored?.raw.replaceAll('\n', '') ?? '', shown.replaceAll('\n', '')]) expect(CONTROL.test(text)).toBe(false)

  const value = { issues: MORE_ISSUES.map(found => ({ ...found, title: `${found.title}\u009b` })) }
  desk.replies.set('get_status', shaped(value))
  await say($, 'run 1')
  expect(await say($, 'show 1')).toBe(JSON.stringify(value, null, 1).replaceAll('\u009b', ' '))
  expect(await say($, 'show 1')).toContain('\n "issues": [\n  {\n   "id": "4510",')

  const many = Array.from({ length: 300 }, (_, at) => issue(`${4000 + at}`, `Timeout in /api/cart/${at}`, at))
  desk.replies.set('get_status', texted(many))
  await say($, 'run 1')
  const cutShown = await say($, 'show 1')
  expect(cutShown.length).toBe(2000)
  expect(cutShown).toBe(JSON.stringify(many, null, 1).slice(0, 2000))
})

test('A5: a tap is called again ten minutes after it was asked, and only a new reading stars the row and toasts', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await say($, 'add github list_pull_requests')
  for (let minute = 1; minute <= 9; minute += 1) {
    await pass(desk, MINUTE)
    expect(desk.calls.length).toBe(1)
  }
  await pass(desk, MINUTE)
  expect(desk.calls.length).toBe(2)
  expect(desk.world.toasts).toEqual([])
  expect((await card($))?.rows[0]).toEqual({ name: '1 list_pull_requests', age: '0s', line: '  3 items: Fix the login redirect', color: undefined, isDim: false, star: undefined })

  desk.replies.set('list_pull_requests', texted(MORE_PULLS))
  await pass(desk, 9 * MINUTE)
  expect(desk.calls.length).toBe(2)
  expect((await card($))?.rows[0]?.age).toBe('9m 00s')
  await pass(desk, MINUTE)
  expect(desk.calls.length).toBe(3)
  expect(desk.world.toasts).toEqual(['Tap 1 changed: 4 items: Add retry to the uploader'])
  const starred = (await card($))?.rows[0]
  expect(starred?.line).toBe('* 4 items: Add retry to the uploader')
  expect(starred?.star).toBe('yellow')
  expect(starred?.color).toBeUndefined()

  await pass(desk, 10 * MINUTE)
  expect(desk.calls.length).toBe(4)
  expect(desk.world.toasts.length).toBe(1)
  const calm = (await card($))?.rows[0]
  expect(calm?.line).toBe('  4 items: Add retry to the uploader')
  expect(calm?.star).toBeUndefined()

  const title = 'Move the session store behind an interface so the tests can swap it'
  desk.replies.set('list_pull_requests', texted([pull(420, title), ...MORE_PULLS]))
  await pass(desk, 10 * MINUTE)
  expect(desk.world.toasts[1]).toBe(`Tap 1 changed: ${`5 items: ${title}`.slice(0, 59)}…`)
  expect(desk.world.toasts.length).toBe(2)
})

test('A6: a payload that differs only where the reading does not look is no change, nor is a first reading', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: true, taps: [GITHUB] })

  await session($)
  await $.command.run(run('place', 'side'))
  await pass(desk, MINUTE)
  expect(desk.calls.length).toBe(1)
  expect((await card($))?.rows[0]?.line).toBe('  3 items: Fix the login redirect')

  desk.replies.set('list_pull_requests', texted(PULLS.map(found => ({ ...found, updated_at: '2026-10-04T09:31:07Z' }))))
  await pass(desk, 10 * MINUTE)
  expect(desk.calls.length).toBe(2)
  expect((await card($))?.rows[0]?.line).toBe('  3 items: Fix the login redirect')

  await say($, 'off')
  await say($, 'on')
  desk.replies.set('list_pull_requests', texted(MORE_PULLS))
  await pass(desk, MINUTE)
  expect(desk.calls.length).toBe(3)
  expect((await card($))?.rows[0]?.line).toBe('  4 items: Add retry to the uploader')
  expect(desk.world.toasts).toEqual([])
})

test('A7: a fault is drawn in words in place of the reading and ages from when it was asked', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await say($, 'add github list_pull_requests')
  desk.replies.set('list_pull_requests', new Error('server github is not connected'))
  await pass(desk, 10 * MINUTE)
  const failing = await card($)
  expect(failing?.rows[0]?.line).toBe('  call failed: server github is not…')
  expect(failing?.rows[0]?.color).toBe('yellow')
  expect(failing?.rows[0]?.star).toBeUndefined()
  expect(JSON.stringify(failing)).not.toContain('Fix the login')
  expect((await card($, 90))?.rows[0]?.line).toBe('  call failed: server github is not…')
  await $.command.run(run('widen', `${NAME} 60`))
  expect((await card($, 90))?.rows[0]?.line).toBe('  call failed: server github is not connected')
  expect(await say($, 'show 1')).toBe('Tap 1: call failed: server github is not connected')
  await pass(desk, 2 * MINUTE)
  expect((await card($))?.rows[0]?.age).toBe('2m 00s')
  expect(desk.world.toasts).toEqual([])

  desk.replies.set('list_pull_requests', refused('rate limited\nretry after 60s'))
  expect(await say($, 'run 1')).toBe('Tap 1: server error: rate limited')
  expect((await card($, 90))?.rows[0]?.line).toBe('  server error: rate limited')
  await pass(desk, MINUTE)
  expect((await card($))?.rows[0]?.age).toBe('1m 00s')

  desk.replies.set('list_pull_requests', refused())
  expect(await say($, 'run 1')).toBe('Tap 1: server error')
  expect((await card($))?.rows[0]?.line).toBe('  server error')
  expect(Object.values(await peek($))[0]?.reading).toBe('3 items: Fix the login redirect')
})

test('A8: a failing tap is asked after 20, 40, then every 80 minutes, and a good answer returns it to 10', LONG, async ($, on) => {
  const desk = open(on)

  await start($)
  await say($, 'add github list_pull_requests')
  desk.replies.set('list_pull_requests', refused('rate limited'))
  await pass(desk, 229 * MINUTE)
  expect(desk.minutes).toEqual([0, 10, 30, 70, 150])

  desk.replies.set('list_pull_requests', texted(PULLS))
  await pass(desk, 26 * MINUTE)
  expect(desk.minutes).toEqual([0, 10, 30, 70, 150, 230, 240, 250])
  expect(desk.world.toasts).toEqual([])
  expect((await card($))?.rows[0]?.line).toBe('  3 items: Fix the login redirect')
})

test('A9: an unsettled call is not repeated, due taps go one after the other, and a late answer to a gone tap is thrown away', LONG, async ($, on) => {
  const desk = open(on, { isOn: true, taps: [GITHUB, SENTRY] })

  await session($)
  await $.command.run(run('place', 'side'))
  desk.replies.set('list_pull_requests', 'hang')
  await pass(desk, MINUTE)
  expect(desk.calls).toEqual([GITHUB])
  await pass(desk, 3 * MINUTE)
  expect(desk.calls).toEqual([GITHUB])
  expect(await say($, 'run 1')).toBe('Tap 1 is still being read.')
  expect(await say($, 'run 2')).toBe('Tap 2: 2 issues: TypeError in checkout.js')
  expect(desk.calls).toEqual([GITHUB, SENTRY])
  expect((await card($))?.rows.map(row => row.line)).toEqual(['  not read yet', '  2 issues: TypeError in checkout.js'])
  await settle(desk, texted(PULLS))
  expect(desk.calls).toEqual([GITHUB, SENTRY])
  expect((await card($))?.rows[0]?.line).toBe('  3 items: Fix the login redirect')

  await pass(desk, 10 * MINUTE)
  expect(desk.calls).toEqual([GITHUB, SENTRY, GITHUB])
  await pass(desk, 2 * MINUTE)
  expect(desk.calls).toEqual([GITHUB, SENTRY, GITHUB])
  expect((await card($))?.rows[0]?.line).toBe('  3 items: Fix the login redirect')
  await settle(desk, texted(PULLS))
  expect(desk.calls).toEqual([GITHUB, SENTRY, GITHUB, SENTRY])

  await pass(desk, 10 * MINUTE)
  expect(desk.calls.length).toBe(5)
  expect(await say($, 'drop 1')).toBe('Dropped 1.')
  await settle(desk, texted(MORE_PULLS))
  expect(Object.keys(await peek($))).toEqual(['sentry list_issues {}'])
  expect((await card($))?.rows.map(row => row.name)).toEqual(['1 list_issues'])

  desk.replies.set('list_issues', 'hang')
  await pass(desk, 10 * MINUTE)
  expect(desk.calls.length).toBe(6)
  expect(await say($, 'clear')).toBe('Tap cleared.')
  await settle(desk, shaped({ issues: MORE_ISSUES }))
  expect(await peek($)).toEqual({})

  desk.replies.set('list_issues', shaped({ issues: ISSUES }))
  await say($, 'add sentry list_issues')
  desk.replies.set('list_issues', 'hang')
  await pass(desk, 10 * MINUTE)
  expect(desk.calls.length).toBe(8)
  expect(await say($, 'off')).toBe('Tap off.')
  await settle(desk, shaped({ issues: MORE_ISSUES }))
  expect(await peek($)).toEqual({})
  expect(desk.world.toasts).toEqual([])

  desk.replies.set('list_issues', shaped({ issues: ISSUES }))
  await say($, 'on')
  await pass(desk, MINUTE)
  expect(desk.calls.length).toBe(9)
  expect((await card($))?.rows[0]?.line).toBe('  2 issues: TypeError in checkout.js')
})

test('A10: add refuses bad arguments, a tap already held and a fifth tap without calling or saving, and a faulting first call adds nothing', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  const before = desk.world.writes.length
  expect(await say($, 'add github list_pull_requests {"a":')).toMatch(new RegExp(`^${NOT_JSON}: \\S`))
  expect(await say($, 'add github list_pull_requests [1]')).toBe(`${NOT_JSON}.`)
  expect(await say($, 'add github list_pull_requests 5')).toBe(`${NOT_JSON}.`)
  desk.replies.set('list_pull_requests', new Error('server github is not connected\n    at dial'))
  expect(await say($, 'add github list_pull_requests')).toBe('Not added: call failed: server github is not connected')
  desk.replies.set('list_pull_requests', refused('Bad credentials'))
  expect(await say($, 'add github list_pull_requests')).toBe('Not added: server error: Bad credentials')
  expect(desk.calls.length).toBe(2)
  expect(desk.world.writes.length).toBe(before)
  expect((await card($))?.empty).toEqual(EMPTY)
  expect(await peek($)).toEqual({})

  desk.replies.set('list_pull_requests', texted(PULLS))
  await say($, 'add github list_pull_requests')
  for (const state of ['open', 'closed', 'merged']) await say($, `add github list_pull_requests {"state":"${state}"}`)
  expect(desk.calls.length).toBe(6)
  const saved = desk.world.writes.length
  expect(await say($, 'add github list_pull_requests')).toBe('Already tap 1.')
  expect(await say($, 'add github list_pull_requests {"state":"closed"}')).toBe('Already tap 3.')
  expect(await say($, 'add sentry list_issues')).toBe('Tap holds 4: drop one first.')
  expect(desk.calls.length).toBe(6)
  expect(desk.world.writes.length).toBe(saved)
  expect((await card($))?.note).toBe('4 taps')
})

test('A11: a tool that does not look read-only is added only with a last word anyway', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  for (const tool of ['send_message', 'createDraft', 'events', 'get_and_delete']) {
    expect(await say($, `add mail ${tool}`)).toBe(
      `${tool} does not look read-only. Tap would call it every 10m without asking. To add it all the same, end the line with: anyway`,
    )
  }
  expect(await say($, 'add mail send_message {"to":"ada@example.com"}')).toMatch(/^send_message does not look read-only\./)
  expect(desk.calls).toEqual([])
  expect(desk.world.store.has('taps')).toBe(false)

  for (const tool of ['createDraft', 'events', 'get_and_delete']) expect(await say($, `add mail ${tool} anyway`)).toMatch(/^Tap \d: ok\. It will be called/)
  expect(await say($, 'add mail send_message {"to":"ada@example.com"} anyway')).toMatch(/^Tap 4: ok\. /)
  expect(desk.calls.map(asked => asked.tool)).toEqual(['createDraft', 'events', 'get_and_delete', 'send_message'])
  expect(desk.calls[3]?.args).toEqual({ to: 'ada@example.com' })
  expect((desk.world.store.get('taps') as unknown[]).length).toBe(4)

  await say($, 'clear')
  for (const tool of ['list_updates_feed', 'searchIssues', 'get-status']) expect(await say($, `add acme ${tool}`)).toMatch(/^Tap \d: ok\. /)
  expect(desk.calls.length).toBe(7)
})

test('A12: list prints the MCP tools on offer as server and tool, and calls none of them', PLUGINS, async ($, on) => {
  const desk = open(on)
  const tool = (name: string, mcp = true): ToolInfo => ({ name, description: 'Does one thing.', mcp })

  await start($)
  expect(await say($, 'list')).toBe('No MCP tools in this session.')
  desk.tools = [tool('Bash', false), tool('Read', false)]
  expect(await say($, 'list')).toBe('No MCP tools in this session.')
  expect(desk.lists).toBe(2)

  desk.tools = [
    tool('Bash', false),
    tool('mcp__claude_ai_Gmail__search_threads'),
    tool('mcp__github__list_pull_requests'),
    tool('mcp__sentry__list_issues'),
    tool('mcp__plugin_done-widget__tick__twice'),
    tool('mcp__broken'),
  ]
  expect(await say($, 'list')).toBe('claude_ai_Gmail search_threads\ngithub list_pull_requests\nsentry list_issues\nplugin_done-widget tick__twice')
  expect(desk.lists).toBe(3)
  expect(await say($, 'list GMAIL')).toBe('claude_ai_Gmail search_threads')
  expect(await say($, 'LIST issues')).toBe('sentry list_issues')
  expect(await say($, 'list zzz')).toBe('No MCP tool matches zzz.')
  expect(await say($, 'list a  b')).toBe('No MCP tool matches a b.')
  expect(await say($, `list ${'z'.repeat(80)}`)).toBe(`No MCP tool matches ${'z'.repeat(40)}.`)

  desk.tools = Array.from({ length: 45 }, (_, at) => tool(`mcp__linear__get_view_${at + 1}`))
  const rows = (await say($, 'list')).split('\n')
  expect(rows.length).toBe(31)
  expect(rows[0]).toBe('linear get_view_1')
  expect(rows[29]).toBe('linear get_view_30')
  expect(rows[30]).toBe('and 15 more: /tap-widget list <word>')
  expect(desk.calls).toEqual([])
})

test('A13: run calls at once, drop renumbers and keeps the other readings, and clear empties the card and the store', PLUGINS, async ($, on) => {
  const desk = open(on)

  await start($)
  await say($, 'add github list_pull_requests')
  await say($, 'add sentry list_issues')
  await say($, 'add cal list_events {"calendarId":"primary","max":2}')
  await pass(desk, 2 * MINUTE)
  expect(desk.calls.length).toBe(3)

  expect(await say($, 'run 2')).toBe('Tap 2: 2 issues: TypeError in checkout.js')
  expect(desk.calls).toEqual([GITHUB, SENTRY, CAL, SENTRY])
  desk.replies.set('list_issues', shaped({ issues: MORE_ISSUES }))
  expect(await say($, 'RUN 2')).toBe('Tap 2: 3 issues: Null user in session.js (changed)')
  const starred = await card($)
  expect(starred?.rows[1]?.line).toBe('* 3 issues: Null user in session.js')
  expect(starred?.rows[1]?.star).toBe('yellow')
  expect(starred?.rows.map(row => row.age)).toEqual(['2m 00s', '0s', '2m 00s'])
  expect(desk.world.toasts).toEqual([])
  desk.replies.set('list_issues', refused('rate limited'))
  expect(await say($, 'run 2')).toBe('Tap 2: server error: rate limited')
  desk.replies.set('list_issues', shaped({ issues: MORE_ISSUES }))
  await say($, 'run 2')

  for (const args of ['run 9', 'show 9', 'drop 0']) expect(await say($, args)).toBe(`No tap ${args.slice(-1)}.`)
  for (const args of ['run 1.5', 'run 1 x', 'show 01', 'drop -1']) expect(await say($, args)).toBe(USAGE)
  expect(desk.calls.length).toBe(7)

  expect(await say($, 'drop 1')).toBe('Dropped 1.')
  const kept = await card($)
  expect(kept?.note).toBe('2 taps')
  expect(kept?.rows.map(row => row.name)).toEqual(['1 list_issues', '2 list_events'])
  expect(kept?.rows.map(row => row.line)).toEqual(['  3 issues: Null user in session.js', '  3 events: Standup'])
  expect(desk.world.store.get('taps')).toEqual([SENTRY, CAL])
  expect(Object.keys(await peek($)).length).toBe(2)
  expect(desk.calls.length).toBe(7)

  expect(await say($, 'clear')).toBe('Tap cleared.')
  expect((await card($))?.empty).toEqual(EMPTY)
  expect((await card($))?.note).toBe('')
  expect(desk.world.store.has('taps')).toBe(false)
  expect(await peek($)).toEqual({})
  expect(await say($, 'run 1')).toBe('No tap 1.')
})

test('A14: off answers that it is off and reaches nothing, switching off stops the clock, and malformed lines answer the usage', PLUGINS, async ($, on) => {
  const desk = open(on, { isOn: false, taps: [GITHUB, SENTRY] })
  desk.tools = [{ name: 'mcp__github__list_pull_requests', description: 'Lists pull requests.', mcp: true }]

  await session($)
  await $.command.run(run('place', 'side'))
  expect(desk.world.commands).toEqual([NAME])
  for (const args of ['list', 'add a b', 'run 1', 'show 1', 'drop 1', 'clear']) expect(await say($, args)).toBe(OFF)
  await pass(desk, HOUR)
  expect(desk.calls).toEqual([])
  expect(desk.lists).toBe(0)
  expect(desk.world.writes).toEqual([])
  expect(desk.world.store.get('taps')).toEqual([GITHUB, SENTRY])
  expect(await card($)).toBeUndefined()

  await say($, 'on')
  await pass(desk, MINUTE)
  expect(desk.calls).toEqual([GITHUB, SENTRY])
  expect((await card($))?.rows.map(row => row.line)).toEqual(['  3 items: Fix the login redirect', '  2 issues: TypeError in checkout.js'])

  const written = desk.world.writes.length
  for (const args of ['add', 'add github', 'run', 'drop x', 'clear all', 'peek 1', 'on now']) expect(await say($, args)).toBe(USAGE)
  expect(desk.calls.length).toBe(2)
  expect(desk.world.writes.length).toBe(written)
  expect((await card($))?.note).toBe('2 taps')

  expect(await say($, 'off')).toBe('Tap off.')
  expect(desk.world.writes.slice(written)).toEqual(['store isOn'])
  await pass(desk, HOUR)
  expect(desk.calls.length).toBe(2)
  expect(desk.world.toasts).toEqual([])

  await say($, 'on')
  const fresh = await card($)
  expect(fresh?.rows.map(row => row.line)).toEqual(['  not read yet', '  not read yet'])
  expect(fresh?.rows.map(row => row.age)).toEqual(['…', '…'])
})

test('A15: four busy taps fit 20, 40 and 60 columns, two rows each, the age whole at the right edge', PLUGINS, async ($, on) => {
  const desk = open(on)
  const longTool = `get_${'deployment_status_'.repeat(4)}`.slice(0, 60)
  const longTitle = 'Unhandled promise rejection while refreshing the cart totals after a currency switch on the checkout page of the storefront'

  await start($)
  desk.replies.set(longTool, shaped({ state: 'success', environment: 'production' }))
  desk.replies.set('get_build_status', texted('passing'))
  await say($, 'add github list_pull_requests')
  await say($, 'add sentry list_issues')
  await say($, `add deploys ${longTool}`)
  await say($, 'add ci get_build_status')
  await pass(desk, 4 * MINUTE)
  desk.replies.set('list_issues', shaped({ issues: [issue('4512', longTitle, 1), ...ISSUES] }))
  desk.replies.set('get_build_status', refused('rate limited'))
  await say($, 'run 2')
  await say($, 'run 4')
  await pass(desk, MINUTE)
  expect(Object.values(await peek($)).map(seen => seen.reading.length)).toContain(120)

  const check = (drawn: Drawn | undefined, width: number, note: string): void => {
    const inner = width - 4
    expect(drawn?.width).toBe(width)
    expect(drawn?.note).toBe(note)
    expect(drawn?.count).toBe(8)
    expect(drawn?.rows.map(row => row.age)).toEqual(['5m 00s', '1m 00s', '5m 00s', '1m 00s'])
    for (const row of drawn?.rows ?? []) {
      expect(row.name.length + 1 + row.age.length).toBeLessThanOrEqual(inner)
      expect(row.line.length).toBeLessThanOrEqual(inner)
    }
    expect(drawn?.rows[1]?.line.startsWith('* 3 issues: Unh')).toBe(true)
    expect(drawn?.rows[1]?.line.endsWith('…')).toBe(true)
    expect(drawn?.rows[2]?.name.endsWith('…')).toBe(true)
    expect(drawn?.rows[3]?.color).toBe('yellow')
  }

  const narrow = await card($, 20)
  check(narrow, 20, '4')
  expect(narrow?.rows.map(row => row.name)).toEqual(['1 list_p…', '2 list_i…', '3 get_de…', '4 get_bu…'])
  expect(narrow?.rows.map(row => row.line)).toEqual(['  3 items: Fix …', '* 3 issues: Unh…', '  state success…', '  server error:…'])
  check(await card($, 40), 40, '4 taps')
  check(await card($, 60), 40, '4 taps')
  await $.command.run(run('widen', `${NAME} 60`))
  check(await card($, 60), 60, '4 taps')
  await $.command.run(run('widen', `${NAME} 40`))

  const side = await card($, 40)
  for (const [place, component] of SITES) {
    await $.command.run(run('place', place))
    expect(await card($, 40, component)).toEqual(side)
  }
})

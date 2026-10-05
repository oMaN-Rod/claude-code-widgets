import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, PluginState, ProcessRunInit } from 'claude-code'

import { folder, hash } from '../hooks/lib'
import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Proc = { pid: number; parent: number; born: number; image: string; command: string }
type Asked = { argv: readonly string[]; init?: ProcessRunInit }
type Call = { tool: string; command?: string }
type Rig = {
  world: Ground
  os: 'windows' | 'posix'
  root: string
  procs: Proc[]
  ports: [port: number, pid: number][]
  asked: Asked[]
  calls: object[]
  listing: string | undefined
  facts: string | undefined
  fail: { listing: '' | 'exit' | 'reject'; isBlind: boolean; kill: '' | 'refused' | 'deaf' }
  during: ((call: Call) => void | Promise<void>) | undefined
}
type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] }
type Drawn = { width: unknown; title: string; note: string; lines: string[]; red: string[] }
type Watch = PluginState['strays-widget']['watch']

const NAME = 'strays-widget'
const USAGE = 'Usage: /strays-widget [on|off|stop <port>|forget <port>|clear]'
const OFF = 'Strays is off.'
const EMPTY = 'Nothing left running. A server this session starts and leaves listening on a port shows here.'
const T0 = 1_700_000_000_000
const TICK = 1000
const NOTHING = "Nothing of this session's is on port"
const HOUR = 3_600_000
const DAY = 24 * HOUR
const HOST = 900
const SELF = 950
const SHELL = 2000
const WIN = 'C:\\Work\\P'
const NIX = '/work/project'
const RESULT = { result: { stdout: '', stderr: '', interrupted: false }, text: '' }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const VITE = 'node C:\\p\\node_modules\\vite\\bin\\vite.js'
const HINTED = ['node', 'bun', 'deno', 'python', 'python3', 'py', 'ruby', 'java', 'dotnet', 'php'].map(name => `${name}.exe`)
// What the facts script printed on this machine for pid 3920, unedited: a bun server a Claude Code Bash call left on port 47614, three bash.exe deep,
// asked from a PowerShell that the session reached through cmd.exe.
const LIVE_SERVER = 'bun -e "Bun.serve({port:47614,fetch:()=>new Response(String(1))})"'
const LIVE_CALL = 1_791_179_123_900
const LIVE_FACTS = [
  'self\t11916',
  '6952\t9676\t1791179124312\tbash.exe\t',
  '2548\t8604\t1791179827845\tcmd.exe\t',
  '10944\t8148\t1791161096760\tWindowsTerminal.exe\t',
  '11916\t2548\t1791179831608\tpowershell.exe\t',
  '3920\t12364\t1791179126341\tbun.exe\tC:\\Users\\O\\.bun\\bin\\bun.exe -e "Bun.serve({port:47614,fetch:()=>new Response(String(1))})"',
  '12364\t6952\t1791179125655\tbash.exe\t',
  '5784\t10944\t1791161097954\tpowershell.exe\t',
  '9676\t8604\t1791179123995\tbash.exe\t',
  '8604\t5784\t1791161100956\tclaude.exe\t',
  '',
].join('\r\n')

const keyOf = (root: string): string => `rows:${hash(folder(root))}`

// A plugin runs in an environment of its own, so the test drives this one by command. `hold` makes every netstat and lsof wait on a promise that only
// `release` settles: a listing that never answers. Every command answers what was started (before any wait), the timer waits seen, and the widget's state.
const WATCHER: Plugin = {
  name: 'watcher',
  register(on) {
    let gate: Promise<void> | undefined
    let release = (): void => undefined
    let started: string[] = []
    let waits = 0
    on('command.run', { command: 'watcher' }, async ($, e) => {
      if (e.args === 'hold') gate = new Promise<void>(done => void (release = done))
      if (e.args === 'release') {
        gate = undefined
        release()
      }
      if (e.args === 'reset') {
        started = []
        waits = 0
      }

      return { text: JSON.stringify({ started, waits, watch: (await $.state.get({ plugin: 'strays-widget', key: 'watch' } as const)).value }) }
    })
    on('process.run', async (_$, e, next) => {
      const [tool = ''] = e.argv
      started.push(tool)
      if (gate !== undefined && (tool === 'netstat' || tool === 'lsof')) await gate

      return next(e)
    })
    on('clock.every', async (_$, e, next) => {
      waits += 1

      return next(e)
    })
  },
}

const LOADED = { plugins: [LAYOUT, WATCHER], timeoutMs: 20_000 }

const ran = (exitCode: number, stdout = '', stderr = '') => ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

const netstat = (ports: readonly (readonly [number, number])[], state = 'LISTENING'): string =>
  [
    '',
    'Active Connections',
    '',
    '  Proto  Local Address          Foreign Address        State           PID',
    ...ports.map(([port, pid]) => `  TCP    ${`0.0.0.0:${port}`.padEnd(23)}${'0.0.0.0:0'.padEnd(23)}${state.padEnd(16)}${pid}`),
    '  TCP    127.0.0.1:49710        127.0.0.1:49711        ESTABLISHED     7300',
    ...ports.map(([port, pid]) => `  TCP    ${`[::]:${port}`.padEnd(23)}${'[::]:0'.padEnd(23)}${state.padEnd(16)}${pid}`),
    '',
  ].join('\r\n')

const lsof = (ports: readonly (readonly [number, number])[]): string =>
  [...new Set(ports.map(([, pid]) => pid))]
    .flatMap(pid => [`p${pid}`, ...ports.filter(([, owner]) => owner === pid).flatMap(([port], at) => [`f${20 + at * 2}`, `n*:${port}`, `f${21 + at * 2}`, `n[::1]:${port}`])])
    .join('\n')
    .concat('\n')

const lstart = (born: number): string => {
  const at = new Date(born)
  const two = (value: number): string => String(value).padStart(2, '0')

  return `${WEEKDAYS[at.getDay()]} ${MONTHS[at.getMonth()]} ${String(at.getDate()).padStart(2)} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())} ${at.getFullYear()}`
}

const ps = (procs: readonly Proc[]): string =>
  [`self ${HOST}`, ...procs.map(proc => `${String(proc.pid).padStart(5)} ${String(proc.parent).padStart(5)} ${lstart(proc.born)} ${proc.command}`), ''].join('\n')

const cim = (procs: readonly Proc[], script: string): string => {
  const asked = (/foreach\(\$id in @\(([\d,]*)\)\+\$PID\)/.exec(script)?.[1] ?? '').split(',').filter(Boolean).map(Number)
  const all = [...procs, { pid: SELF, parent: HOST, born: T0, image: 'powershell.exe', command: '' }]
  const kept = new Set<number>()
  for (const pid of [...asked, SELF]) {
    for (let at = all.find(made => made.pid === pid), step = 0; at !== undefined && at.pid > 4 && !kept.has(at.pid) && step < 9; step += 1) {
      kept.add(at.pid)
      const up = at.parent
      at = all.find(made => made.pid === up)
    }
  }
  const said = (made: Proc): string => (script.includes('.CommandLine') && asked.includes(made.pid) && HINTED.includes(made.image) ? made.command : '')

  return [`self\t${SELF}`, ...all.filter(made => kept.has(made.pid)).map(made => [made.pid, made.parent, made.born, made.image, said(made)].join('\t')), ''].join('\r\n')
}

const answer = (rig: Rig, { argv, init }: Asked) => {
  rig.asked.push({ argv, ...(init === undefined ? {} : { init }) })
  const [tool = '', ...rest] = argv
  if (tool === 'netstat' || tool === 'lsof') {
    if (rig.fail.listing === 'reject') throw new Error(`${tool} could not start`)
    if (rig.fail.listing === 'exit') return ran(1, '', `${tool}: failed`)

    return ran(0, rig.listing ?? (tool === 'netstat' ? netstat(rig.ports) : lsof(rig.ports)))
  }
  if (tool === 'powershell' || tool === 'sh') {
    if (rig.fail.isBlind) return ran(1, '', 'Access denied')

    return ran(0, rig.facts ?? (tool === 'sh' ? ps(rig.procs) : cim(rig.procs, rest.at(-1) ?? '')))
  }

  const pid = Number(tool === 'taskkill' ? rest[1] : rest[0])
  if (rig.fail.kill === 'refused') return ran(1, '', tool === 'taskkill' ? `ERROR: The process with PID ${pid} could not be terminated.\r\nReason: Access is denied.\r\n` : '')
  if (rig.fail.kill !== 'deaf') {
    rig.procs = rig.procs.filter(proc => proc.pid !== pid)
    rig.ports = rig.ports.filter(([, owner]) => owner !== pid)
  }

  return ran(0, tool === 'taskkill' ? `SUCCESS: The process with PID ${pid} has been terminated.\r\n` : '')
}

const bench = (on: On, os: Rig['os'] = 'windows', store: Readonly<Record<string, unknown>> = {}): Rig => {
  const root = os === 'windows' ? WIN : NIX
  const rig: Rig = {
    world: ground(on, { now: T0, store, answers: { 'session.cwd': () => rig.root, 'session.root': () => rig.root, 'process.run': (e: Asked) => answer(rig, e) } }),
    os,
    root,
    procs: [
      { pid: 1, parent: 0, born: T0 - 2 * DAY, image: 'launchd', command: '/sbin/launchd' },
      { pid: HOST, parent: 1, born: T0 - DAY, image: 'claude.exe', command: 'claude' },
      { pid: 1188, parent: 1, born: T0 - DAY, image: 'svchost.exe', command: os === 'windows' ? 'C:\\WINDOWS\\system32\\svchost.exe -k RPCSS -p' : '/usr/libexec/rapportd' },
    ],
    ports: [[135, 1188]],
    asked: [],
    calls: [],
    listing: undefined,
    facts: undefined,
    fail: { listing: '', isBlind: false, kill: '' },
    during: undefined,
  }
  on('tool.call', async (_$, e) => {
    rig.calls.push(e)
    await rig.during?.(e as Call)

    return RESULT
  })

  return rig
}

const flat = (node: Node | string | undefined): string => (typeof node === 'string' ? node : (node?.children ?? []).map(flat).join(''))

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const box = await ui.find({ key: 'card' })
  const title = (await ui.find({ key: 'title' }))?.text ?? ''
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const body = ((await ui.find({ key: 'strays' }))?.children ?? []) as Node[]
  await ui.unmount()
  if (box === undefined) return undefined

  return { width: box.props.width, title, note, lines: body.map(flat), red: body.filter(line => line.props?.color === 'red').map(flat) }
}

const say = async ($: Engine, args: string): Promise<string> => (await $.command.run(run(NAME, args))).text ?? ''

const tick = (rig: Rig): Promise<void> => rig.world.clock.advance(TICK)

const watched = async ($: Engine, verb = ''): Promise<{ started: string[]; waits: number; watch: Watch }> =>
  JSON.parse((await $.command.run(run('watcher', verb))).text ?? '{}')

const begin = async ($: Engine, rig: Rig): Promise<void> => {
  await session($, rig.root)
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  await tick(rig)
}

const moveTo = async ($: Engine, rig: Rig, os: Rig['os'], root = os === 'windows' ? WIN : NIX): Promise<void> => {
  await say($, 'off')
  rig.os = os
  rig.root = root
  rig.asked = []
  await say($, 'on')
  await tick(rig)
}

const proc = (rig: Rig, pid: number, parent: number, command: string, born = rig.world.clock.now()): Proc => {
  const [, quoted, plain = ''] = /^(?:"([^"]+)"|(\S+))/.exec(command) ?? []
  const image = (quoted ?? plain).split(/[\\/]/).at(-1) ?? ''
  const made = { pid, parent, born, image: rig.os === 'windows' && !image.endsWith('.exe') ? `${image}.exe` : image, command }
  rig.procs.push(made)

  return made
}

const serve = (rig: Rig, port: number, pid: number, command = VITE, parent = SHELL, born = rig.world.clock.now()): void => {
  if (!rig.procs.some(made => made.pid === pid)) proc(rig, pid, parent, command, born)
  rig.ports.push([port, pid])
}

const bash = async ($: Engine, rig: Rig, command: string, during: () => void, tool = 'Bash'): Promise<unknown> => {
  rig.during = () => {
    if (!rig.procs.some(made => made.pid === SHELL)) proc(rig, SHELL, HOST, rig.os === 'windows' ? 'bash.exe -c' : '/bin/zsh -c')
    during()
  }
  const result = await $.tool.call({ tool, tool_use_id: `use-${rig.calls.length}`, command, run_in_background: true } as never)
  rig.during = undefined
  await tick(rig)

  return result
}

const start = ($: Engine, turnId: string) => $.turn.start({ text: 'Start the dev server', turnId })

const complete = ($: Engine, turnId: string, agentId?: string): Promise<unknown> =>
  $.turn.complete({ answer: 'ok', durationMs: 1200, isAborted: false, turnId, reason: 'answer', ...(agentId === undefined ? {} : { agentId }) } as never)

const end = async ($: Engine, rig: Rig, turnId: string, agentId?: string): Promise<unknown> => {
  const result = await complete($, turnId, agentId)
  await tick(rig)

  return result
}

const tools = (rig: Rig): string[] => rig.asked.map(({ argv }) => argv[0] ?? '')

const count = (rig: Rig, ...names: string[]): number => tools(rig).filter(tool => names.includes(tool)).length

test('A1: an empty card says what will appear, the first listing is only a baseline, and off runs no process', LOADED, async ($, on) => {
  const rig = bench(on, 'posix')

  await begin($, rig)
  const drawn = await card($)
  expect(drawn?.title).toBe('Strays')
  expect(drawn?.note).toBe('')
  expect(drawn?.lines.join(' ')).toBe(EMPTY)
  expect(drawn?.red).toEqual([])

  await start($, 'turn-1')
  await bash($, rig, 'bun test', () => undefined)
  await end($, rig, 'turn-1')
  expect((await card($))?.lines.join(' ')).toBe(EMPTY)
  expect(tools(rig)).toEqual(['lsof', 'lsof', 'lsof'])

  await say($, 'off')
  await watched($, 'reset')
  await session($, rig.root)
  await rig.world.clock.advance(5 * TICK)
  expect((await watched($)).started).toEqual([])
  expect((await watched($)).waits).toBe(0)
})

test('A2: a server a Bash call left listening becomes a row, on Windows and on POSIX', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await begin($, rig)

  for (const os of ['windows', 'posix'] as const) {
    rig.procs = rig.procs.filter(made => made.pid !== SHELL)
    await moveTo($, rig, os)
    await start($, `turn-${os}`)
    await rig.world.clock.advance(5000)
    await bash($, rig, 'npm run dev', () => serve(rig, 3000, 1234, os === 'windows' ? VITE : 'node /p/node_modules/vite/bin/vite.js'))

    const drawn = await card($)
    expect(drawn?.note).toBe('1 running')
    expect(drawn?.lines).toHaveLength(1)
    expect(drawn?.lines[0]).toMatch(/^:3000 node \(vite\) +1s {2}turn 1$/)
    expect(drawn?.lines[0]).toHaveLength(36)

    const [first, , facts] = rig.asked
    if (os === 'windows') {
      expect(first).toEqual({ argv: ['netstat', '-ano', '-p', 'TCP'], init: { timeoutMs: 15_000 } })
      expect(facts?.argv.slice(0, 4)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-Command'])
      expect(facts?.argv).toHaveLength(5)
      expect(facts?.argv[4]).toContain("'self'+$t+$PID")
      expect(facts?.argv[4]).toContain('foreach($id in @(1234)+$PID)')
      expect(facts?.argv[4]).toContain('.CommandLine')
      expect(facts?.argv[4]).not.toContain('"')
      expect(facts?.init).toEqual({ timeoutMs: 45_000 })
    } else {
      expect(first).toEqual({ argv: ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], init: { timeoutMs: 15_000 } })
      expect(facts).toEqual({ argv: ['sh', '-c', 'echo "self $PPID"; exec ps -axo pid=,ppid=,lstart=,args='], init: { env: { LC_ALL: 'C' }, timeoutMs: 45_000 } })
    }
    expect(tools(rig)).toHaveLength(3)

    rig.procs = rig.procs.filter(made => made.pid !== 1234)
    rig.ports = [[135, 1188]]
    await complete($, `turn-${os}`)
    await rig.world.clock.settle()
    expect((await card($))?.note).toBe('1 running')
    await tick(rig)
    const after = await card($)
    expect(after?.note).toBe('')
    expect(after?.lines.join(' ')).toBe(EMPTY)
    expect(rig.world.store.get(keyOf(rig.root))).toEqual({ session: 'session-1', rows: [] })
  }

  rig.ports = [[135, 1188]]
  await say($, 'off')
  await rig.world.clock.advance(LIVE_CALL - TICK - rig.world.clock.now())
  await moveTo($, rig, 'windows')
  await start($, 'turn-live')
  await bash($, rig, LIVE_SERVER, () => undefined)
  await rig.world.clock.advance(4000)
  rig.ports.push([47_614, 3920])
  rig.facts = LIVE_FACTS
  await end($, rig, 'turn-live')
  expect((await card($))?.lines).toEqual([':47614 bun                4s  turn 1'])
  expect(await say($, 'stop 47614')).toBe('Stopped bun on :47614 (pid 3920).')
  expect(rig.asked.at(-1)?.argv).toEqual(['taskkill', '/PID', '3920', '/T', '/F'])
  expect(await say($, 'stop 47614')).toBe("Nothing of this session's is on port 47614.")
  rig.facts = undefined

  await moveTo($, rig, 'windows', '\\\\server\\share\\p')
  expect(tools(rig)).toEqual(['netstat'])
  await moveTo($, rig, 'posix', '/mnt/c/work/p')
  expect(tools(rig)).toEqual(['lsof'])
})

test('A3: detached servers, late children, PowerShell calls, subagent calls and running calls all tie a listener to the session', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await session($, rig.root)
  await start($, 'turn-0')
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  await tick(rig)

  await start($, 'turn-1')
  await bash($, rig, 'start /b node server.js', () => serve(rig, 3000, 3001, 'node server.js', 7777))
  expect((await card($))?.lines[0]).toMatch(/^:3000 node \(server\) .* turn 1$/)

  await bash($, rig, 'npm run watch', () => void proc(rig, 2100, HOST, 'cmd.exe /c npm run watch'))
  await rig.world.clock.advance(10_000)
  serve(rig, 3100, 2101, 'node C:\\p\\scripts\\watch.mjs', 2100, rig.world.clock.now() + 1000)
  await end($, rig, 'turn-1')
  expect((await card($))?.lines[1]).toMatch(/^:3100 node \(watch\) +0s {2}turn 1$/)

  await start($, 'turn-2')
  await rig.world.clock.advance(10_000)
  await bash($, rig, 'Start-Process bun -ArgumentList dev', () => serve(rig, 5173, 3200, 'bun dev', 7778), 'PowerShell')
  expect((await card($))?.lines[2]).toMatch(/^:5173 bun \(dev\) .* turn 2$/)

  await rig.world.clock.advance(10_000)
  rig.during = () => serve(rig, 8000, 3300, 'python -m http.server 8000', 7779)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'sub-1', command: 'python -m http.server 8000 &', agentId: 'agent-7' } as never)
  await tick(rig)
  expect((await card($))?.lines[3]).toMatch(/^:8000 python \(http\.serv… +1s {2}turn 2$/)

  const listings = count(rig, 'netstat')
  await end($, rig, 'turn-2', 'agent-7')
  expect(count(rig, 'netstat')).toBe(listings)
  expect(((await watched($)).watch).isQueued).toBe(false)

  await rig.world.clock.advance(10_000)
  let release = (): void => undefined
  rig.during = () => new Promise<void>(done => void (release = done))
  const running = $.tool.call({ tool: 'Bash', tool_use_id: 'long-1', command: 'docker-less long build' } as never)
  await rig.world.clock.advance(3 * TICK)
  serve(rig, 9229, 3400, 'deno run main.ts', 7780)
  await rig.world.clock.advance(3 * TICK)
  await end($, rig, 'turn-2')
  const drawn = await card($)
  expect(drawn?.note).toBe('5 running')
  expect(drawn?.lines[4]).toMatch(/^:9229 deno \(run\) +4s {2}turn 2$/)
  release()
  expect(await running).toBeDefined()
})

test('A4: a listener the session did not start is never a row and is examined once', LOADED, async ($, on) => {
  const rig = bench(on, 'posix')
  await begin($, rig)

  proc(rig, 3990, 1, '/Applications/iTerm.app/Contents/MacOS/iTerm2', T0 - 5 * HOUR)
  proc(rig, 4000, 3990, '-zsh', T0 - 4 * HOUR)
  await start($, 'turn-1')
  await bash($, rig, 'bun test', () => {
    serve(rig, 4001, 4001, 'node server.js', 4000)
    serve(rig, 4101, 4101, 'node /opt/mcp/server.js', HOST, T0 - HOUR)
    rig.ports.push([7000, HOST])
    proc(rig, 4200, HOST, '/bin/zsh -c sleep 1')
    serve(rig, 4201, 4201, 'node old.js', 4200, T0 - HOUR)
  })

  const drawn = await card($)
  expect(drawn?.note).toBe('')
  expect(drawn?.lines.join(' ')).toBe(EMPTY)
  expect(count(rig, 'sh')).toBe(1)

  await end($, rig, 'turn-1')
  expect(count(rig, 'lsof')).toBe(3)
  expect(count(rig, 'sh')).toBe(1)
  expect((await card($))?.lines.join(' ')).toBe(EMPTY)
})

test('A5: hooks only ask for a refresh, and one timer runs them one at a time off Claude\'s path', LOADED, async ($, on) => {
  const rig = bench(on, 'windows', { isOn: true })
  await session($, rig.root)
  await $.command.run(run('place', 'side'))
  await rig.world.clock.settle()
  expect(((await watched($)).watch).isQueued).toBe(true)

  rig.during = () => {
    proc(rig, SHELL, HOST, 'bash.exe -c')
    serve(rig, 3000, 1234)
  }
  const sent = { tool: 'Bash', tool_use_id: 'use-a', command: 'npm run dev', run_in_background: true }
  expect(await $.tool.call({ ...sent } as never)).toEqual(RESULT)
  expect(rig.calls).toEqual([sent])
  expect(await complete($, 'turn-1')).toEqual({ text: 'ok' })

  rig.during = () => {
    throw new Error('the shell could not start')
  }
  let thrown = ''
  try {
    await $.tool.call({ tool: 'Bash', tool_use_id: 'use-b', command: 'npm test' } as never)
  } catch (error) {
    thrown = String(error)
  }
  expect(thrown).toContain('tool.call')
  rig.during = undefined
  await rig.world.clock.settle()
  expect((await watched($)).started).toEqual([])
  expect(((await watched($)).watch).isQueued).toBe(true)
  expect(((await watched($)).watch).calls.every(call => call.to > 0)).toBe(true)

  await watched($, 'hold')
  await tick(rig)
  expect((await watched($)).started).toEqual(['netstat'])
  for (const tool of ['Bash', 'PowerShell', 'Bash']) await $.tool.call({ tool, tool_use_id: `held-${rig.calls.length}`, command: 'echo ok' } as never)
  await rig.world.clock.advance(5 * TICK)
  expect((await watched($)).started).toEqual(['netstat'])
  expect((await watched($)).watch).toMatchObject({ isBusy: true, isQueued: true })

  await watched($, 'release')
  await rig.world.clock.settle()
  expect((await watched($)).started).toEqual(['netstat', 'powershell'])
  expect((await watched($)).watch).toMatchObject({ isBusy: false, isQueued: true })
  expect((await card($))?.lines).toEqual([':3000 node (vite)         6s  turn 0'])
  await tick(rig)
  expect((await watched($)).started).toEqual(['netstat', 'powershell', 'netstat'])
  await rig.world.clock.advance(5 * TICK)
  expect((await watched($)).started).toEqual(['netstat', 'powershell', 'netstat'])

  const beats = async (): Promise<number> => {
    const before = (await watched($)).waits
    await rig.world.clock.advance(4 * TICK)

    return (await watched($)).waits - before
  }
  const steady = await beats()
  expect(steady).toBe(4)
  await say($, 'on')
  await say($, 'on')
  expect(await beats()).toBe(steady)
  await say($, 'off')
  await rig.world.clock.settle()
  expect(await beats()).toBe(0)
})

test('A6: stop answers while a refresh is out, and runs one of its own only when nothing is asked or in flight', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await begin($, rig)
  await start($, 'turn-1')
  await bash($, rig, 'npm run dev', () => serve(rig, 3000, 1234))
  expect((await card($))?.note).toBe('1 running')

  await watched($, 'hold')
  await end($, rig, 'turn-1')
  expect(((await watched($)).watch).isBusy).toBe(true)
  await watched($, 'reset')
  expect(await say($, 'stop 3000')).toBe('Stopped node (vite) on :3000 (pid 1234).')
  expect((await watched($)).started).toEqual(['powershell', 'taskkill'])
  expect(await say($, 'stop 135')).toBe(`${NOTHING} 135.`)
  expect(await say($, 'stop 4000')).toBe('Still checking ports; try stop 4000 again in a moment.')
  expect(await say($, 'stop :4000')).toBe('Still checking ports; try stop 4000 again in a moment.')
  expect((await watched($)).started).toEqual(['powershell', 'taskkill'])

  rig.listing = netstat([[135, 1188], [3000, 1234]])
  await watched($, 'release')
  await rig.world.clock.settle()
  rig.listing = undefined
  expect((await watched($)).watch).toMatchObject({ isBusy: false, isQueued: false })
  expect((await card($))?.lines.join(' ')).toBe(EMPTY)
  expect(rig.world.store.get(keyOf(WIN))).toEqual({ session: 'session-1', rows: [] })

  await complete($, 'turn-1')
  await watched($, 'reset')
  expect(await say($, 'stop 4000')).toBe('Still checking ports; try stop 4000 again in a moment.')
  expect((await watched($)).started).toEqual([])
  await tick(rig)

  await watched($, 'reset')
  await watched($, 'hold')
  const stopping = say($, 'stop 4000')
  await rig.world.clock.settle()
  expect((await watched($)).watch).toMatchObject({ isBusy: true, isQueued: false })
  await complete($, 'turn-1')
  await rig.world.clock.advance(3 * TICK)
  expect((await watched($)).started).toEqual(['netstat'])
  await watched($, 'release')
  expect(await stopping).toBe(`${NOTHING} 4000.`)
  expect(((await watched($)).watch).isBusy).toBe(false)
  await tick(rig)
  expect((await watched($)).started).toEqual(['netstat', 'netstat'])

  rig.fail.listing = 'reject'
  expect(await say($, 'stop 4001')).toBe('Could not check port 4001: cannot list ports: netstat failed.')
  expect(((await watched($)).watch).isBusy).toBe(false)
  expect(count(rig, 'taskkill')).toBe(1)
})

test('A7: the survivors of an earlier session are on the card when the next one opens', LOADED, async ($, on) => {
  const row = { port: 3000, pid: 1234, born: T0 - 2 * HOUR, name: 'node', hint: 'vite', turn: 4, isEarlier: false, isShared: false }
  const reused = { ...row, port: 5173, pid: 2222, born: T0 - 3 * HOUR, hint: 'dev', name: 'bun' }
  const dead = { ...row, port: 8000, pid: 3333, name: 'python', hint: 'http.server' }
  const rig = bench(on, 'windows', { isOn: true, [keyOf(WIN)]: { session: 'session-0', rows: [row, reused, dead] } })
  serve(rig, 3000, 1234, VITE, 7777, row.born)
  serve(rig, 5173, 2222, 'bun dev', 7778, T0 - HOUR)

  await session($, rig.root)
  await $.command.run(run('place', 'side'))
  await tick(rig)
  const drawn = await card($)
  expect(drawn?.note).toBe('1 from earlier')
  expect(drawn?.lines).toEqual([':3000 node (vite)    2h 00m  earlier'])
  expect((await card($, 20))?.note).toBe('1 earlier')
  expect(rig.world.store.get(keyOf(WIN))).toEqual({ session: 'session-1', rows: [{ ...row, isEarlier: true }] })
  expect(tools(rig)).toEqual(['netstat', 'powershell'])

  await say($, 'off')
  rig.world.store.set(keyOf(WIN), { session: 'session-1', rows: [row] })
  await say($, 'on')
  await tick(rig)
  const mine = await card($)
  expect(mine?.note).toBe('1 running')
  expect(mine?.lines).toEqual([':3000 node (vite)     2h 00m  turn 4'])

  await say($, 'off')
  rig.root = 'c:/work/p/'
  await say($, 'on')
  await tick(rig)
  expect((await card($))?.lines).toEqual([':3000 node (vite)     2h 00m  turn 4'])
  expect([...rig.world.store.keys()].sort()).toEqual(['isOn', keyOf(WIN)].sort())
})

test('A8: stop checks the process is the same one, kills it and takes every row of that pid', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await begin($, rig)

  for (const [os, typed] of [['windows', 'stop 3000'], ['posix', 'Stop :3000']] as const) {
    await moveTo($, rig, os)
    await start($, `turn-${os}`)
    await bash($, rig, 'npm run dev', () => {
      proc(rig, 1234, SHELL, os === 'windows' ? VITE : 'node /p/node_modules/vite/bin/vite.js')
      proc(rig, 1300, SHELL, 'postgres -D data')
      rig.ports.push([3000, 1234], [3001, 1234], [5432, 1300])
    })
    expect((await card($))?.note).toBe('3 running')

    rig.asked = []
    expect(await say($, typed)).toBe('Stopped node (vite) on :3000 (pid 1234).')
    if (os === 'windows') {
      expect(tools(rig)).toEqual(['powershell', 'taskkill'])
      expect(rig.asked[0]?.argv[4]).toContain('foreach($id in @(1234)+$PID)')
      expect(rig.asked[0]?.argv[4]).not.toContain('.CommandLine')
      expect(rig.asked[0]?.init).toEqual({ timeoutMs: 45_000 })
      expect(rig.asked[1]).toEqual({ argv: ['taskkill', '/PID', '1234', '/T', '/F'], init: { timeoutMs: 15_000 } })
    } else {
      expect(tools(rig)).toEqual(['sh', 'kill', 'lsof'])
      expect(rig.asked[1]).toEqual({ argv: ['kill', '1234'], init: { timeoutMs: 15_000 } })
    }
    const drawn = await card($)
    expect(drawn?.note).toBe('1 running')
    expect(drawn?.lines).toHaveLength(1)
    expect(drawn?.lines[0]).toMatch(/^:5432 postgres /)
    expect((rig.world.store.get(keyOf(rig.root)) as { rows: { port: number }[] }).rows.map(row => row.port)).toEqual([5432])

    rig.procs = rig.procs.filter(made => made.pid !== 1300 && made.pid !== SHELL)
    rig.ports = [[135, 1188]]
  }
})

test('A9: stop kills nothing it cannot vouch for and says why', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await begin($, rig)
  await start($, 'turn-1')
  await bash($, rig, 'docker compose up -d && npm run dev', () => {
    serve(rig, 3000, 1234)
    serve(rig, 3100, 1300, 'node api.js')
    serve(rig, 3200, 1400, 'node worker.js')
    serve(rig, 5432, 6000, '"C:\\Program Files\\Docker\\Docker\\resources\\com.docker.backend.exe" -addr unix:///run/backend.sock', 5990, T0 - DAY)
  })
  expect((await card($))?.note).toBe('4 running')

  expect(await say($, 'stop 4000')).toBe("Nothing of this session's is on port 4000.")
  expect(await say($, 'stop 5432')).toBe("Port 5432 is held by Docker's shared process (com.docker.backend); stop the container instead.")

  rig.procs = rig.procs.filter(made => made.pid !== 1300 && made.pid !== 1400)
  proc(rig, 1400, 1, 'notepad.exe', T0 + 5000)
  expect(await say($, 'stop 3100')).toBe('Port 3100: that process has already gone.')
  expect(await say($, 'stop 3200')).toBe('Port 3200: that process has already gone.')
  expect((await card($))?.lines.map(line => line.slice(0, 5))).toEqual([':3000', ':5432'])
  expect(count(rig, 'taskkill', 'kill')).toBe(0)

  rig.fail.kill = 'refused'
  expect(await say($, 'stop 3000')).toBe('Could not stop pid 1234: ERROR: The process with PID 1234 could not be terminated.')
  expect(count(rig, 'taskkill')).toBe(1)
  expect((await card($))?.lines.map(line => line.slice(0, 5))).toEqual([':3000', ':5432'])

  await moveTo($, rig, 'posix')
  rig.procs = rig.procs.filter(made => made.pid !== SHELL)
  await bash($, rig, 'node deaf.js &', () => serve(rig, 3300, 1500, 'node deaf.js'))
  rig.fail.kill = 'deaf'
  expect(await say($, 'stop 3300')).toBe('Could not stop pid 1500: kill was sent but :3300 is not seen free.')
  rig.fail.kill = 'refused'
  expect(await say($, 'stop 3300')).toBe('Could not stop pid 1500: exit 1')
  expect((await card($))?.lines[0]).toMatch(/^:3300 node \(deaf\) /)
})

test('A10: a port held by Docker\'s shared process is shown only right after a docker call, and marked shared', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await begin($, rig)
  proc(rig, 6000, 5990, '"C:\\Program Files\\Docker\\Docker\\resources\\com.docker.backend.exe" -addr unix:///run/backend.sock', T0 - DAY)

  await start($, 'turn-1')
  await bash($, rig, 'npm test', () => void rig.ports.push([5433, 6000]))
  expect((await card($))?.note).toBe('')

  await bash($, rig, 'docker compose up -d db', () => void rig.ports.push([5432, 6000]))
  const drawn = await card($)
  expect(drawn?.note).toBe('1 running')
  expect(drawn?.lines).toEqual([':5432 docker           1d 0h  shared'])
  expect((await card($, 20))?.lines).toEqual([':5432 docker'])

  await rig.world.clock.advance(61_000)
  rig.ports.push([5434, 6000])
  await end($, rig, 'turn-1')
  expect((await card($))?.lines).toHaveLength(1)
  expect(count(rig, 'taskkill')).toBe(0)
})

test('A11: forget leaves the server running and off the card for good, and clear wipes the card and the store key', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await begin($, rig)
  await start($, 'turn-1')
  await bash($, rig, 'npm run dev', () => serve(rig, 3000, 1234))

  expect(await say($, 'forget 3000')).toBe('Forgot :3000 (node, pid 1234); it is left running.')
  expect(rig.world.store.get(keyOf(WIN))).toEqual({ session: 'session-1', rows: [] })
  expect(await say($, 'forget 3000')).toBe("Nothing of this session's is on port 3000.")
  await end($, rig, 'turn-1')
  expect((await card($))?.lines.join(' ')).toBe(EMPTY)
  expect(rig.ports).toContainEqual([3000, 1234])

  await start($, 'turn-2')
  await bash($, rig, 'npm run api', () => {
    serve(rig, 3100, 1300, 'node api.js')
    serve(rig, 3200, 1400, 'node worker.js')
  })
  expect((await card($))?.note).toBe('2 running')
  expect(await say($, 'CLEAR')).toBe('Cleared 2 strays from the card; nothing was stopped.')
  expect(rig.world.store.has(keyOf(WIN))).toBe(false)
  await end($, rig, 'turn-2')
  expect((await card($))?.lines.join(' ')).toBe(EMPTY)
  expect(await say($, 'clear')).toBe('No strays on the card; nothing was stopped.')
  expect(count(rig, 'taskkill', 'kill')).toBe(0)
})

test('A12: a failed listing or process query is said in red above the rows still held', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await begin($, rig)
  await start($, 'turn-1')
  await bash($, rig, 'npm run dev', () => serve(rig, 3000, 1234))

  for (const failure of ['exit', 'reject'] as const) {
    rig.fail.listing = failure
    await end($, rig, 'turn-1')
    const failed = await card($)
    expect(failed?.red).toEqual(['Cannot list ports: netstat failed.'])
    expect(failed?.lines[0]).toBe('Cannot list ports: netstat failed.')
    expect(failed?.lines[1]).toMatch(/^:3000 node \(vite\) /)
    expect(failed?.note).toBe('1 running')
    expect(await say($, 'stop 4000')).toBe('Could not check port 4000: cannot list ports: netstat failed.')

    rig.fail.listing = ''
    await end($, rig, 'turn-1')
    expect((await card($))?.red).toEqual([])
  }

  rig.fail.isBlind = true
  await bash($, rig, 'npm run api', () => serve(rig, 3100, 1300, 'node api.js'))
  const blind = await card($)
  expect(blind?.red).toEqual(['Cannot read processes.'])
  expect(blind?.lines).toHaveLength(2)
  expect(await say($, 'stop 3100')).toBe('Could not check port 3100: cannot read processes.')
  expect(count(rig, 'taskkill')).toBe(0)
  const asked = count(rig, 'powershell')

  rig.fail.isBlind = false
  await end($, rig, 'turn-1')
  expect(count(rig, 'powershell')).toBe(asked + 1)
  const healed = await card($)
  expect(healed?.red).toEqual([])
  expect(healed?.lines[1]).toMatch(/^:3100 node \(api\) /)

  rig.fail.listing = 'exit'
  await moveTo($, rig, 'posix')
  const alone = await card($)
  expect(alone?.lines).toEqual(['Cannot list ports: lsof failed.'])
  expect(alone?.red).toEqual(alone?.lines)
  expect((await card($, 20))?.lines).toEqual(['Cannot list', 'ports: lsof', 'failed.'])
})

test('A13: real netstat and lsof output yields each listener once, and commands label as people know them', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  const quiet = [
    '',
    'Aktive Verbindungen',
    '',
    '  Proto  Lokale Adresse         Remoteadresse          Status           PID',
    '  TCP    0.0.0.0:135            0.0.0.0:0              ABHÖREN         1188',
    '  TCP    127.0.0.1:49710        127.0.0.1:49711        HERGESTELLT     7300',
    '  TCP    [::]:135               [::]:0                 ABHÖREN         1188',
    '  UDP    0.0.0.0:5353           *:*                                    2400',
  ]
  rig.listing = quiet.join('\r\n')
  await begin($, rig)

  await start($, 'turn-1')
  await bash($, rig, 'npm run all', () => {
    proc(rig, 1234, SHELL, VITE)
    proc(rig, 1300, SHELL, 'python -m http.server 8000')
    proc(rig, 1400, SHELL, '"C:\\Program Files\\nodejs\\node.exe" server.js')
    proc(rig, 1500, SHELL, 'postgres -D data')
    proc(rig, 7300, SHELL, 'node client.js')
    proc(rig, 2400, SHELL, 'node mdns.js')
    rig.listing = [
      ...quiet,
      '  TCP    0.0.0.0:3000           0.0.0.0:0              ABHÖREN         1234',
      '  TCP    127.0.0.1:8000         0.0.0.0:0              ABHÖREN         1300',
      '  TCP    0.0.0.0:8080           0.0.0.0:0              ABHÖREN         1400',
      '  TCP    127.0.0.1:5432         0.0.0.0:0              ABHÖREN         1500',
      '  TCP    [::]:3000              [::]:0                 ABHÖREN         1234',
      '  TCP    [::1]:5432             [::]:0                 ABHÖREN         1500',
      '',
    ].join('\r\n')
  })
  await $.command.run(run('widen', `${NAME} 60`))
  const drawn = await card($, 90)
  expect(drawn?.note).toBe('4 running')
  expect(drawn?.lines.map(line => line.replace(/ {2,}.*$/, ''))).toEqual([':3000 node (vite)', ':8000 python (http.server)', ':8080 node (server)', ':5432 postgres'])
  expect(rig.asked.at(-1)?.argv[4]).toContain('foreach($id in @(1234,1300,1400,1500))')

  rig.listing = 'p1188\nf7\nn*:135\n'
  await moveTo($, rig, 'posix')
  rig.procs = rig.procs.filter(made => made.pid === 1 || made.pid === HOST || made.pid === 1188)
  await bash($, rig, 'npm run all', () => {
    proc(rig, 1234, SHELL, 'node /p/node_modules/vite/bin/vite.js')
    proc(rig, 1300, SHELL, '/usr/bin/python3 -m http.server 8000')
    rig.listing = 'p1188\nf7\nn*:135\np1234\nf23\nn*:3000\nf24\nn[::1]:3000\np1300\nf3\nn127.0.0.1:8000\n'
  })
  expect((await card($, 90))?.lines.map(line => line.replace(/ {2,}.*$/, ''))).toEqual([':3000 node (vite)', ':8000 python3 (http.server)'])
})

test('A14: every state fits its card at 20, 40 and 60 columns', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await begin($, rig)
  const fits = async (): Promise<void> => {
    for (const [columns, inner] of [[20, 16], [33, 29], [34, 30], [40, 36], [90, 56]] as const) {
      await $.command.run(run('widen', `${NAME} ${columns === 90 ? 60 : 40}`))
      const drawn = await card($, columns)
      expect(drawn?.width).toBe(inner + 4)
      expect(`${drawn?.title} ${drawn?.note}`.trim().length <= inner).toBe(true)
      expect(drawn?.lines.filter(line => line.length > inner)).toEqual([])
    }
    await $.command.run(run('widen', `${NAME} 40`))
  }
  await fits()

  await start($, 'turn-1')
  const commands = [VITE, 'long-running-background-service.exe --port 3001', ...['server', 'dev', 'api', 'worker', 'queue', 'mailer', 'cron', 'docs'].map(name => `node ${name}.js`)]
  await bash($, rig, 'npm run all', () => commands.slice(0, 6).forEach((command, at) => serve(rig, 3000 + at, 1200 + at, command)))
  await rig.world.clock.advance(12 * 60_000 + 3 * TICK)
  await end($, rig, 'turn-1')
  await fits()

  expect((await card($, 20))?.lines).toEqual([':3000 node (vit…', ':3001 long-runn…', ':3002 node (ser…', ':3003 node (dev)', ':3004 node (api)', '+1 more'])
  expect((await card($, 20))?.note).toBe('6 running')
  expect((await card($, 33))?.lines[1]).toBe(':3001 long-running-backgroun…')
  const wide = await card($, 40)
  expect(wide?.lines).toEqual([
    ':3000 node (vite)    12m 05s  turn 1',
    ':3001 long-running…  12m 05s  turn 1',
    ':3002 node (server)  12m 05s  turn 1',
    ':3003 node (dev)     12m 05s  turn 1',
    ':3004 node (api)     12m 05s  turn 1',
    '+1 more',
  ])
  expect((await card($, 34))?.lines[1]).toBe(':3001 long-r…  12m 05s  turn 1')
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    expect(await card($, 40, component)).toEqual(wide)
  }
  await $.command.run(run('place', 'side'))

  await bash($, rig, 'npm run more', () => commands.slice(6).forEach((command, at) => serve(rig, 3006 + at, 1206 + at, command)))
  const full = await card($)
  expect(full?.note).toBe('9 running')
  expect(full?.lines.at(-1)).toBe('+4 more')
  expect((rig.world.store.get(keyOf(WIN)) as { rows: unknown[] }).rows).toHaveLength(9)

  rig.fail.listing = 'exit'
  await end($, rig, 'turn-1')
  await fits()
  expect((await card($, 20))?.lines.slice(0, 3)).toEqual(['Cannot list', 'ports: netstat', 'failed.'])
})

test('A15: off is inert, unknown input answers the usage, and nothing but the two store keys is written', LOADED, async ($, on) => {
  const rig = bench(on, 'windows')
  await session($, rig.root)
  await $.command.run(run('place', 'side'))

  for (const typed of ['stop 3000', 'forget 3000', 'clear']) expect(await say($, typed)).toBe(OFF)
  await start($, 'turn-0')
  expect(await bash($, rig, 'npm run dev', () => serve(rig, 2900, 1100))).toEqual(RESULT)
  await end($, rig, 'turn-0')
  expect(rig.calls).toHaveLength(1)
  expect(rig.asked).toEqual([])
  expect(rig.world.writes).toEqual([])
  expect(await card($)).toBeUndefined()

  await say($, 'on')
  await tick(rig)
  for (const typed of ['what', 'stop', 'stop abc', 'stop 70000', 'stop 0', 'stop :', 'stop 3000 extra', 'forget', 'clear all']) expect(await say($, typed)).toBe(USAGE)
  expect(await say($, 'STOP 00003000')).toBe("Nothing of this session's is on port 3000.")
  expect((await card($))?.lines.join(' ')).toBe(EMPTY)

  await start($, 'turn-1')
  await bash($, rig, 'npm run dev', () => serve(rig, 3000, 1234))
  expect((await card($))?.note).toBe('1 running')

  await watched($, 'hold')
  rig.ports = [[135, 1188]]
  await end($, rig, 'turn-1')
  expect(((await watched($)).watch).isBusy).toBe(true)
  const before = rig.world.writes.length
  expect(await say($, 'off')).toBe('Strays off.')
  expect(await card($)).toBeUndefined()
  expect((await watched($)).watch).toMatchObject({ turn: 0, at: 0, fault: '', isBusy: false, isQueued: false, seen: null, calls: [], rows: [] })
  await say($, 'on')
  await watched($, 'release')
  await rig.world.clock.settle()
  expect((await watched($)).started.at(-1)).toBe('netstat')
  expect(rig.world.writes.slice(before)).toEqual(['store isOn', 'store isOn'])
  expect((await watched($)).watch).toMatchObject({ isBusy: false, isQueued: true, seen: null, rows: [] })
  expect((rig.world.store.get(keyOf(WIN)) as { rows: unknown[] }).rows).toHaveLength(1)

  await tick(rig)
  const blank = await card($)
  expect(blank?.note).toBe('')
  expect(blank?.lines.join(' ')).toBe(EMPTY)

  expect([...rig.world.store.keys()].sort()).toEqual(['isOn', keyOf(WIN)].sort())
  expect(rig.world.writes.filter(write => write.startsWith('file'))).toEqual([])
  expect(rig.world.files.size).toBe(0)
})

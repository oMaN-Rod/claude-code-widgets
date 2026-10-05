;(function (root) {
  const ROOT = '/demo/project'
  const HOME = '/demo/home'
  const HOUR = 3_600_000
  const DAY = 24 * HOUR
  const FILES = {
    'README.md': '# demo\n\nA small project for the widgets to look at.\n',
    'CLAUDE.md': '# Notes for Claude\n\n- Run the tests with `npm test`.\n',
    'package.json': '{\n  "name": "demo",\n  "scripts": { "test": "node test.js" }\n}\n',
    'src/sum.js': 'export const sum = list => {\n  let total = 0\n  // TODO: handle an empty list\n  for (let i = 1; i < list.length; i += 1) total += list[i]\n\n  return total\n}\n',
    'src/format.js': "export const money = value => `$${value.toFixed(2)}`\n// FIXME: negative values\n",
    'src/index.js': "import { sum } from './sum.js'\nimport { money } from './format.js'\n\nconsole.log(money(sum([1, 2, 3])))\n",
    'test.js': "import assert from 'node:assert'\nimport { sum } from './src/sum.js'\n\nassert.strictEqual(sum([1, 2, 3]), 6)\nconsole.log('passed')\n",
    'docs/guide.md': '# Guide\n\nNothing here yet.\n',
  }
  const COMMITS = [
    ['Fix rounding in money()', 'Ada', 0.2],
    ['Add format helpers', 'Sam', 3],
    ['Sum a list', 'Ada', 40],
    ['Add the test runner', 'Sam', 365],
    ['Start the project', 'Ada', 730],
  ]
  const TURN = [
    { tool: 'Read', input: { file_path: `${ROOT}/src/sum.js` }, ms: 500 },
    { tool: 'Bash', input: { command: 'cat .env' }, ms: 400, text: `STRIPE_SECRET=sk_live_${'Demo'.repeat(6)}\nDATABASE_URL=postgres://app:made-up-pass@db/app\n` },
    { tool: 'Bash', input: { command: 'npm test', description: 'Run the tests' }, ms: 1400, isError: true, text: 'AssertionError: 5 !== 6\n1 failing' },
    { tool: 'Bash', input: { command: 'git checkout -- src/sum.js' }, ms: 500, text: '', isAsked: true },
    {
      tool: 'Edit',
      input: { file_path: `${ROOT}/src/sum.js`, old_string: '  for (let i = 1; i < list.length; i += 1) total += list[i]', new_string: '  for (let i = 0; i < list.length; i += 1) total += list[i]' },
      ms: 700,
    },
    { tool: 'Bash', input: { command: 'npm test', description: 'Run the tests' }, ms: 1400, text: 'passed' },
    { tool: 'mcp__done-widget__tick', input: { item: 1, evidence: 'npm test: passed' }, ms: 300 },
    { tool: 'mcp__notebook-widget__jot', input: { text: 'sum() skipped the first item: its loop began at 1. Loops over list start at 0.' }, ms: 300 },
    { tool: 'Bash', input: { command: 'git commit -am "Fix the off-by-one in sum"' }, ms: 600, text: '[main 3f2a1c9] Fix the off-by-one in sum' },
    { tool: 'mcp__done-widget__tick', input: { item: 2, evidence: 'commit 3f2a1c9 on main' }, ms: 300 },
  ]
  const LIVE = {
    [`${HOME}/.claude/collision-widget/demo-other.json`]: () => {
      const file = `${ROOT}/src/sum.js`
      const at = Date.now()

      return JSON.stringify({ id: 'demo-other', cwd: '/demo/api', at, files: { [file]: { path: file, at } } })
    },
    ...Object.fromEntries(
      [
        ['demo-first', 12, 3.1],
        ['demo-second', 5, 2.75],
        ['demo-third', 1, 1.42],
      ].map(([id, ago, usd]) => [
        `${HOME}/.claude/projects/-demo-project/${id}.jsonl`,
        () => `${JSON.stringify({ cwd: ROOT, timestamp: new Date(Date.now() - ago * DAY).toISOString() })}\n${JSON.stringify({ type: 'cost-state', totalCostUSD: usd })}\n`,
      ]),
    ),
  }
  const TRAFFIC = [
    { tool: 'Read', input: { file_path: `${ROOT}/src/sum.js` }, line: '  for (let i = 1; i < list.length; i += 1) total += list[i]', chars: 6000 },
    { tool: 'Grep', input: { pattern: 'money', path: ROOT }, line: 'src/index.js:4:console.log(money(sum([1, 2, 3])))', chars: 3000 },
    { tool: 'Bash', input: { command: 'npm test', description: 'Run the tests' }, line: 'AssertionError: 5 !== 6', chars: 4500, isError: true },
    { tool: 'Edit', input: { file_path: `${ROOT}/src/sum.js` }, line: 'The file has been updated.', chars: 200 },
    { tool: 'Bash', input: { command: 'npm test', description: 'Run the tests' }, line: 'ok - sum adds every item', chars: 4500 },
    { tool: 'Bash', input: { command: 'git diff' }, line: '+  for (let i = 0; i < list.length; i += 1) total += list[i]', chars: 1800 },
  ].map(({ line, chars, ...call }) => ({ ...call, text: `${line}\n`.repeat(Math.ceil(chars / (line.length + 1))).slice(0, chars) }))
  const PAST = ['Add a helper that formats money', 'Write a test for sum', 'Set up the npm test script', 'Why is the total one short?']
  const SUMMARY = 'Summary of the conversation so far: sum() skipped the first item of a list; the loop was fixed and the tests pass.'
  const ANSWER = 'The loop in `src/sum.js` started at index 1, so the first item was never added. It starts at 0 now and the tests pass.'
  const THOUGHT = "The test imports sum from src/sum.js. Since the test runner isn't specified, I'll default to node --test. Edit the file."
  const REPLY = 'Fixed the off-by-one in src/sum.js.'
  const SPENT = { input_tokens: 2140, output_tokens: 96, cache_read_input_tokens: 18200, cache_creation_input_tokens: 0, model: 'claude-demo' }
  const SAID = {
    'critic-widget': '- src/sum.js:4: total starts at list[0] and the loop now starts at 0, so the first item is added twice',
  }
  const OPENING = {
    'queue-widget': { lines: ['until npm test', 'add update the changelog', 'add bump the version'], settleMs: 900 },
    'done-widget': { lines: ['add the tests pass', 'add the fix is committed'] },
    'ledger-widget': { lines: ['scan'] },
    'trial-widget': { lines: [], settleMs: 300 },
    'critic-widget': { lines: ['review'] },
    'aside-widget': { lines: ['ask Why did the first test fail?'] },
    'tap-widget': { lines: ['add github list_pull_requests', 'add sentry list_issues'] },
    'margin-widget': { lines: ['mark is this the only loop?', 'send'] },
    'loupe-widget': { lines: ['look sum'], settleMs: 600 },
    'strays-widget': { lines: [], isSettled: state => state.get('strays-widget/watch')?.isQueued === false && state.get('strays-widget/watch')?.isBusy === false },
    'earpiece-widget': { lines: ['/whisper 2 leave tests alone'], settleMs: 300 },
  }
  const CREW = {
    'earpiece-widget': [
      { id: 'demo-agent-audit', description: 'audit the auth module', said: 'Two callers skip the token check.', use: { tool: 'Grep', input: { pattern: 'verifyToken', path: ROOT } }, last: 'Two callers skip the token check.' },
      {
        id: 'demo-agent-tests',
        description: 'rewrite tests',
        said: 'Now rewriting the tests folder.',
        use: { tool: 'Edit', input: { file_path: `${ROOT}/test.js` } },
        noted: { said: 'Understood, leaving tests alone.', use: { tool: 'Read', input: { file_path: `${ROOT}/src/sum.js` } } },
        last: 'Left tests alone; fixed src/sum.js instead.',
      },
    ],
  }
  const PULLS = ['Fix the login redirect', 'Bump bun', 'Add dark mode']
  const ISSUES = ['Null user in session.js', 'TypeError in checkout.js', 'Timeout in /api/cart']
  const SELECTED = { text: 'The loop in src/sum.js started at index 1, so the first item was never added.', requestId: 'answer-1' }
  const PICKED = { 'loupe-widget': turnId => ({ text: 'src/sum.js', requestId: `${turnId}-${TURN.findIndex(call => call.tool === 'Edit')}` }) }
  const arm = (isWith, turns, clean) => ({ isWith, turns, clean })
  const HELD = {
    'trial-widget': {
      'trial.json': JSON.stringify({
        subject: 'moon-widget',
        runs: { a: arm(true, 10, 9), b: arm(true, 10, 9), c: arm(true, 9, 9), d: arm(false, 10, 7), e: arm(false, 10, 6), f: arm(false, 10, 7) },
      }),
    },
  }
  const SERVERS = [
    { port: 3000, pid: 4101, parent: 1, args: 'node /demo/project/node_modules/.bin/vite' },
    { port: 5173, pid: 4188, parent: 4187, args: 'bun dev' },
  ]
  const KEPT = {
    'strays-widget': at => ({
      [`rows:${hash(ROOT)}`]: { session: 'demo-earlier', rows: [{ port: 3000, pid: 4101, born: at, name: 'node', hint: 'vite', turn: 4, isEarlier: false, isShared: false }] },
    }),
  }
  const BESIDE = { 'trial-widget': ['moon-widget'] }
  const HIDDEN = { 'witness-widget': 'collision-widget: src/sum.js is also open in another session; read it again before you edit.' }

  const flat = kids => kids.flat(Infinity).filter(kid => kid !== null && kid !== undefined && kid !== false && kid !== true)
  const tag = type => props => {
    const { children, ...rest } = props || {}

    return { type, props: rest, children: flat([children === undefined ? [] : children]) }
  }
  const ELEMENTS = Object.fromEntries(['Box', 'Text', 'Code', 'Button', 'Client', 'Input', 'Select', 'Link', 'Spacer'].map(name => [name, tag(name)]))
  ELEMENTS.Input = props => ({ type: 'Input', props: props || {}, children: [{ type: 'Text', props: { dimColor: true, wrap: 'truncate-end' }, children: [String(props?.value || props?.placeholder || '')] }] })
  root.h = (type, props, ...children) => (typeof type === 'function' ? type({ ...(props || {}), children: flat(children) }) : { type, props: props || {}, children: flat(children) })
  root.Fragment = tag('Fragment')

  const sleep = ms => new Promise(done => setTimeout(done, ms))
  const hash = text => {
    let held = 2166136261
    for (const letter of text) held = Math.imul(held ^ letter.codePointAt(0), 16777619)

    return held >>> 0
  }
  const lstart = at => {
    const [week, month, date, year, time] = String(new Date(at)).split(' ')

    return `${week} ${month} ${date} ${time} ${year}`
  }
  const ran = (exitCode, stdout) => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const day = at => new Date(at).toISOString().slice(0, 10)
  const spoken = (id, prompt, answer) => [
    { role: 'user', text: prompt, toolUses: [] },
    ...TRAFFIC.flatMap(({ isError, ...call }, at) => {
      const use = { tool_use_id: `${id}-${at}`, ...call, ...(isError ? { isError: true } : {}) }

      return [
        { role: 'assistant', text: '', toolUses: [use] },
        { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: use.tool_use_id, text: use.text, isError: isError === true }] },
      ]
    }),
    { role: 'assistant', text: answer, toolUses: [] },
  ]
  const worked = (id, at, { said, use }, isAnswered) => {
    const call = { tool_use_id: `${id}-${at}`, ...use, ...(isAnswered ? { text: 'ok' } : {}) }

    return [
      { role: 'assistant', text: said, toolUses: [call] },
      ...(isAnswered ? [{ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: call.tool_use_id, text: 'ok', isError: false }] }] : []),
    ]
  }
  const pieces = (text, size) => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? []
  const weight = messages => messages.reduce((sum, message) => sum + message.text.length + message.toolUses.reduce((held, use) => held + JSON.stringify(use.input).length + (use.text ?? '').length, 0), 0)

  const create = (name, { onChange = () => {}, onToast = () => {}, onPrint = () => {}, pace = 1, widths = {} } = {}) => {
    const mod = root.DEMO_MODS.mods[name]
    const hooks = []
    const state = new Map([['widgets/site', 'side'], ['widgets/widths', widths]])
    const earlier = Math.floor((Date.now() - 2 * HOUR - 3 * 60_000) / 1000) * 1000
    const store = new Map(Object.entries(KEPT[name]?.(earlier) ?? {}))
    const killed = new Set()
    const files = new Map([
      ...Object.entries(FILES).map(([path, text]) => [`${ROOT}/${path}`, text]),
      ...Object.entries(HELD[name] ?? {}).map(([path, text]) => [`/demo/plugins/${name}/${path}`, text]),
    ])
    const commands = []
    const tools = new Set()
    const calls = new Map()
    const timers = new Set()
    const born = Date.now()
    const usage = { tokens: 46_000, usd: 0.38, five: 12, seven: 31 }
    const crew = (CREW[name] ?? []).map(agent => ({ ...agent, status: 'running', reads: undefined }))
    const talk = agent => {
      const isOver = agent.status !== 'running'
      const steps = [agent, ...(agent.noted !== undefined && agent.reads >= 2 ? [agent.noted] : [])]

      return [
        { role: 'user', text: agent.description, toolUses: [] },
        ...steps.flatMap((step, at) => worked(agent.id, at, step, isOver || at < steps.length - 1)),
        ...(isOver ? [{ role: 'assistant', text: agent.last, toolUses: [] }] : []),
      ]
    }
    const transcript = PAST.flatMap((prompt, at) => spoken(`past-${at}`, prompt, 'Done, and the tests pass.'))
    let turns = 0
    let isBusy = false
    let isDirty = false
    let selected = PICKED[name] === undefined ? SELECTED : undefined
    let shelledAt

    const changed = () => {
      if (isDirty) return
      isDirty = true
      queueMicrotask(() => {
        isDirty = false
        onChange()
      })
    }
    const settle = async () => {
      await sleep(OPENING[name]?.settleMs ?? 0)
      for (let waits = 0; waits < 100 && OPENING[name]?.isSettled?.(state) === false; waits += 1) await sleep(50)
    }
    const matches = (filter, e) => Object.entries(filter || {}).every(([key, want]) => {
      const got = e[key] ?? (e.props || {})[key]

      return want instanceof RegExp ? want.test(String(got)) : got === want
    })
    const dispatch = (event, e, core) => {
      const chain = hooks.filter(hook => hook.event === event && matches(hook.filter, e))
      const step = (at, input) => (at < 0 ? Promise.resolve(core(input)) : Promise.resolve(chain[at].run($, input, next => step(at - 1, next ?? input))))

      return step(chain.length - 1, e)
    }
    const flow = (event, e, core) => {
      const chain = hooks.filter(hook => hook.event === event && matches(hook.filter, e))
      const step = (at, input) => {
        let below
        const made = at < 0 ? core(input) : chain[at].run($, input, next => (below = step(at - 1, next ?? input)))
        let settle
        let fail
        const result = new Promise((done, failed) => {
          settle = done
          fail = failed
        })
        result.catch(() => {})
        const walk = (async function* () {
          try {
            const value = (yield* made) ?? (await below?.result)
            settle(value)

            return value
          } catch (error) {
            fail(error)
            throw error
          }
        })()

        return Object.assign(walk, { result })
      }

      return step(chain.length - 1, e)
    }
    const usageNow = withBreakdown => ({
      startedAt: born,
      context: {
        window: 200_000,
        tokens: usage.tokens,
        percent: Math.round((usage.tokens / 200_000) * 100),
        ...(withBreakdown ? { breakdown: breakdown() } : {}),
      },
      rateLimits: [
        { kind: 'five_hour', percentUsed: usage.five, resetsAt: new Date(born + 3 * HOUR).toISOString() },
        { kind: 'seven_day', percentUsed: usage.seven, resetsAt: new Date(born + 2 * DAY).toISOString() },
      ],
      cost: { usd: usage.usd },
    })
    const breakdown = () => {
      const row = (label, tokens, color, kind) => ({ name: label, tokens, percentage: (tokens / 200_000) * 100, color, kind })
      const messages = Math.max(2000, usage.tokens - 30_000)
      const used = 30_000 + messages

      return {
        categories: [
          row('System prompt', 6000, 'promptBorder', 'used'),
          row('System tools', 16_000, 'inactive', 'used'),
          row('Memory files', 3000, 'claude', 'used'),
          row('Skills', 5000, 'warning', 'used'),
          row('Messages', messages, 'permission', 'used'),
          row('Free space', Math.max(0, 200_000 - used - 33_000), 'inactive', 'free'),
          row('Autocompact buffer', 33_000, 'inactive', 'buffer'),
        ],
        totalTokens: used,
        maxTokens: 200_000,
        rawMaxTokens: 200_000,
        autocompactSource: 'auto',
        percentage: Math.round((used / 200_000) * 100),
        gridRows: [],
        model: 'claude-demo',
        memoryFiles: [],
        mcpTools: [],
        agents: [],
        isAutoCompactEnabled: true,
        apiUsage: null,
      }
    }
    const git = argv => {
      const args = argv.slice(1).filter(arg => arg !== '--no-optional-locks')
      const now = Date.now()
      const tracked = [...files.keys()].filter(path => path.startsWith(`${ROOT}/`)).map(path => path.slice(ROOT.length + 1)).sort()
      if (args[0] === 'ls-files') return ran(0, `${tracked.join('\n')}\n`)
      if (args[0] === 'status') {
        const isV2 = args.includes('--porcelain=v2')

        return ran(0, isV2 ? '# branch.oid 3f2a1c9\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -0\n1 .M N... 100644 100644 100644 a b src/sum.js\n? notes.txt\n' : '## main...origin/main [ahead 1]\n M src/sum.js\n?? notes.txt\n')
      }
      if (args[0] === 'rev-parse') return ran(0, args.includes('--abbrev-ref') ? 'main\n' : `${ROOT}/.git\n`)
      if (args[0] === 'diff' && args.includes('--name-only')) return ran(0, 'src/sum.js\n')
      if (args[0] === 'diff') return ran(0, 'diff --git a/src/sum.js b/src/sum.js\n--- a/src/sum.js\n+++ b/src/sum.js\n@@ -3,3 +3,3 @@\n-  for (let i = 1; i < list.length; i += 1) total += list[i]\n+  for (let i = 0; i < list.length; i += 1) total += list[i]\n')
      if (args[0] === 'grep') {
        if (args.includes('-F') && args.includes('-e')) {
          const word = args[args.indexOf('-e') + 1] ?? ''
          const isWhole = line => line.split(word).slice(0, -1).some((before, at, parts) => !/[\w]$/.test(before) && !/^[\w]/.test(line.slice(parts.slice(0, at + 1).join(word).length + word.length)))
          const rows = word === '' ? [] : tracked.flatMap(path => files.get(`${ROOT}/${path}`).split('\n').map((line, at) => [path, at + 1, line]).filter(([, , line]) => isWhole(line)))

          return rows.length === 0 ? ran(1, '') : ran(0, `${rows.map(([path, at, line]) => `${path}:${at}:${line}`).join('\n')}\n`)
        }
        if (args.includes('-cI') || args.includes('-c')) {
          const isTodo = args.includes('TODO')
          const rows = tracked.map(path => [path, isTodo ? (files.get(`${ROOT}/${path}`).match(/TODO/g) || []).length : files.get(`${ROOT}/${path}`).split('\n').length - 1])

          return ran(0, `${rows.filter(([, count]) => count > 0).map(([path, count]) => `${path}:${count}`).join('\n')}\n`)
        }
        const rows = tracked.flatMap(path => files.get(`${ROOT}/${path}`).split('\n').map((line, at) => [path, at + 1, line]).filter(([, , line]) => /TODO|FIXME|HACK|XXX/.test(line)))

        return ran(0, `${rows.map(([path, at, line]) => `${path}:${at}:${line}`).join('\n')}\n`)
      }
      if (args[0] === 'log') {
        if (args.includes('--max-parents=0')) return ran(0, `${day(now - 730 * DAY)}\n`)
        if (args.includes('--format=%h%x00%s')) return ran(0, `3f2a1c9\x00${COMMITS[0][0]}\n`)
        if (args.includes('--format=%s')) return ran(0, `${COMMITS[0][0]}\n`)
        if (args.includes('--format=%ct')) return ran(0, `${Math.floor((now - COMMITS[0][2] * DAY) / 1000)}\n`)
        const since = args.find(arg => arg.startsWith('--since='))
        if (since !== undefined) return ran(0, since.includes(String(new Date(now).getFullYear() - 1)) ? 'Sam\x02Add format helpers\n' : since.includes(String(new Date(now).getFullYear() - 2)) ? 'Ada\x02Start the project\n' : '')
        const format = args.find(arg => arg.startsWith('--format=')) || ''
        if (format.includes('%x01')) {
          return ran(0, COMMITS.map(([subject, , ago], at) => `\x01${day(now - ago * DAY)}\x02${subject}\n\nM\t${tracked[at % tracked.length]}\nA\t${tracked[(at + 2) % tracked.length]}\n`).join(''))
        }

        return ran(0, COMMITS.map(([subject, author, ago], at) => `${'3f2a1c9'.slice(0, 6)}${at} ${subject} (${author}, ${Math.round(ago)}d)`).join('\n'))
      }

      return ran(1, '')
    }
    const listening = () => SERVERS.slice(0, shelledAt === undefined ? 1 : 2).filter(server => !killed.has(server.pid))
    const lsof = () => ran(0, listening().map(server => `p${server.pid}\nn*:${server.port}\n`).join(''))
    const ps = () => {
      const rows = [
        [1, 0, earlier - DAY, '/sbin/init'],
        [900, 1, born - 1000, 'claude'],
        ...(shelledAt === undefined ? [] : [[4187, 900, shelledAt, '/bin/zsh -c bun dev']]),
        ...listening().map(server => [server.pid, server.parent, server.pid === 4101 ? earlier : shelledAt, server.args]),
      ]

      return ran(0, `self 900\n${rows.map(([pid, parent, at, args]) => `${String(pid).padStart(5)} ${String(parent).padStart(5)} ${lstart(at)} ${args}`).join('\n')}\n`)
    }
    const textOf = path => (LIVE[path] === undefined ? files.get(path) : LIVE[path]())
    const listOf = path => {
      const base = `${path.replace(/[\\/]$/, '')}/`
      const seen = new Map()
      for (const file of [...files.keys(), ...Object.keys(LIVE)]) {
        if (!file.startsWith(base)) continue
        const [head, ...rest] = file.slice(base.length).split('/')
        seen.set(head, rest.length > 0 ? { name: head, kind: 'dir', size: 0, mtimeMs: 0 } : { name: head, kind: 'file', size: textOf(file).length, mtimeMs: Date.now() })
      }
      if (seen.size === 0) throw new Error(`no such directory: ${path}`)

      return [...seen.values()]
    }
    const quiet = label =>
      new Proxy(
        {},
        {
          get: (_target, method) => async () => {
            console.debug(`demo engine: ${label}.${String(method)} is not simulated`)

            return undefined
          },
        },
      )
    const nouns = {
      plugin: { name, root: `/demo/plugins/${name}` },
      state: {
        get: async ref => ({ value: state.get(`${ref.plugin}/${ref.key}`) }),
        set: async (ref, value) => {
          state.set(`${ref.plugin}/${ref.key}`, value)
          changed()
        },
      },
      store: {
        get: async key => store.get(key),
        set: async (key, value) => void store.set(key, value),
        delete: async key => void store.delete(key),
      },
      clock: {
        now: async () => Date.now(),
        every: (ms, run) => {
          const id = setInterval(run, Math.max(30, ms))
          timers.add(id)

          return { cancel: () => (clearInterval(id), timers.delete(id)) }
        },
        after: (ms, run) => {
          const id = setTimeout(run, Math.min(ms, ms > 60_000 ? 4000 : ms))
          timers.add(id)

          return { cancel: () => (clearTimeout(id), timers.delete(id)) }
        },
      },
      command: {
        register: async entry => {
          if (!commands.some(known => known.name === entry.name)) commands.push(entry)

          return { command: entry.name }
        },
        run: e => dispatch('command.run', e, () => ({})),
        list: async () => [...commands.map(entry => ({ ...entry, plugin: name })), ...(BESIDE[name] ?? []).map(other => ({ name: other, description: '', plugin: other }))],
      },
      ui: {
        resolve: () => ELEMENTS,
        toast: text => void onToast(String(text)),
        copy: async text => {
          onToast('Copied to the clipboard')
          try {
            await root.navigator?.clipboard?.writeText(String(text))
          } catch {}

          return { isCopied: true }
        },
        panes: async () => [],
        open: async () => ({}),
        close: async () => ({}),
        invalidate: async () => void changed(),
        notice: async () => ({}),
        selection: async () => (selected === undefined ? undefined : { ...selected }),
        focus: async () => ({}),
      },
      widgets: root.DEMO_MODS.kit,
      process: {
        run: async argv => {
          await sleep(20)
          if (argv[0] === 'git') return git(argv)
          if (argv[0] === 'lsof') return lsof()
          if (argv[0] === 'sh' && String(argv[2]).includes('exec ps ')) return ps()
          if (argv[0] === 'kill') killed.add(Number(argv[1]))

          return ran(0, '')
        },
      },
      fs: {
        read: async path => {
          const text = textOf(String(path).replaceAll('\\', '/'))
          if (text === undefined) throw new Error(`no such file: ${path}`)

          return text
        },
        stat: async (path, options) => {
          const text = textOf(String(path).replaceAll('\\', '/'))
          if (text === undefined) throw new Error(`no such file: ${path}`)

          return { kind: 'file', size: text.length, mtimeMs: 0, isLink: false, ...(options?.resolve === true ? { realPath: String(path).replaceAll('\\', '/') } : {}) }
        },
        exists: async path => textOf(String(path).replaceAll('\\', '/')) !== undefined,
        write: async (path, text) => void files.set(String(path).replaceAll('\\', '/'), String(text)),
        list: async path => listOf(String(path).replaceAll('\\', '/')),
      },
      session: {
        usage: async options => usageNow(options?.breakdown !== undefined),
        messages: async args => {
          if (args?.agentId === undefined) return transcript.map(message => ({ ...message }))
          const agent = crew.find(known => known.id === args.agentId)
          if (agent === undefined) return { deny: `no agent ${args.agentId}` }
          if (agent.reads !== undefined) agent.reads += 1

          return talk(agent)
        },
        append: async args => {
          const agent = crew.find(known => known.id === args?.agentId && known.status === 'running')
          if (agent === undefined) return { deny: 'that id names no running loop' }
          agent.reads = 0

          return { uuid: `demo-note-${agent.id}` }
        },
        root: async () => ROOT,
        cwd: async () => ROOT,
        id: async () => 'demo-session',
        send: async () => ({}),
        model: async () => ({ id: 'claude-demo', name: 'Claude' }),
        repo: async () => ({ root: ROOT, branch: 'main' }),
      },
      tool: {
        register: async entry => {
          tools.add(`mcp__${name}__${entry.name}`)

          return { tool: `mcp__${name}__${entry.name}` }
        },
        check: async () => ({ decision: 'allow' }),
        list: async () => [],
      },
      model: {
        complete: async () => {
          await sleep(900 * pace)

          return SAID[name] === undefined ? { isAnswered: false } : { isAnswered: true, text: SAID[name], usage: { input_tokens: 400, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
        },
        fork: async () => {
          await sleep(900 * pace)

          return { isAnswered: true, text: 'Only the loop start in src/sum.js changed: it began at 1 and now begins at 0.', usage: { input_tokens: 400, output_tokens: 30, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 } }
        },
      },
      ...(crew.length === 0 ? {} : { agent: { list: async () => crew.map(({ id, description, status }) => ({ id, type: 'general-purpose', description, status })) } }),
      prompt: { suggest: async () => ({ isShown: true }), submit: async () => ({}), fill: async () => ({ isFilled: true, text: '', cursor: 0 }), read: async () => ({ text: 'fix src/formt.js and test.js', cursor: 28 }) },
      http: { fetch: async () => ({ ok: true, status: 200, text: 'ok' }) },
      env: { get: async key => (key === 'HOME' ? HOME : undefined) },
      audio: { play: async () => ({}) },
      turn: { abort: async () => ({}) },
      mcp: {
        call: async (server, tool) => {
          await sleep(20)
          const asked = (calls.get(`${server} ${tool}`) ?? 0) + 1
          calls.set(`${server} ${tool}`, asked)
          if (tool === 'list_pull_requests') return { content: [{ type: 'text', text: JSON.stringify(PULLS.map(title => ({ title }))) }], isError: false }
          if (tool === 'list_issues') return { content: [], isError: false, structuredContent: { issues: ISSUES.slice(asked === 1 ? 1 : 0).map(title => ({ title })) } }
          throw new Error(`server ${server} is not connected`)
        },
      },
    }
    const $ = new Proxy(nouns, { get: (target, noun) => target[noun] ?? (typeof noun === 'string' ? quiet(noun) : undefined) })

    if (HIDDEN[name] !== undefined) hooks.push({ event: 'prompt.submit', filter: {}, run: (_$, e, next) => next({ ...e, context: [...(e.context ?? []), HIDDEN[name]] }) })
    mod.register((event, filter, run) => hooks.push(typeof filter === 'function' ? { event, filter: {}, run: filter } : { event, filter, run }))

    const command = async (word, args) => {
      const result = await dispatch('command.run', { command: word, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } }, () => ({}))

      return result?.text
    }
    const measure = moved => dispatch('session.measure', { ...usageNow(false), changed: moved }, e => ({ changed: e.changed }))
    const compact = async instructions => {
      const before = weight(transcript)
      const messages = transcript.map((message, at) => ({ ...message, handle: `message-${at}` }))
      const result = await dispatch('session.compact', { trigger: 'manual', messages, ...(instructions ? { instructions } : {}) }, () => ({ messages: [{ role: 'user', text: SUMMARY, toolUses: [] }] }))
      if (result?.messages !== undefined) {
        const talk = Math.max(0, usage.tokens - 30_000)
        transcript.splice(0, transcript.length, ...result.messages.map(({ handle, ...message }) => message))
        usage.tokens = Math.round(usage.tokens - talk + (before === 0 ? 0 : (talk * weight(transcript)) / before))
      }
      changed()
    }
    const turn = async text => {
      if (isBusy) return
      isBusy = true
      turns += 1
      const turnId = `turn-${turns}`
      const startedAt = Date.now()
      try {
        await dispatch('prompt.submit', { text, wait: false, origin: { kind: 'composer' } }, e => ({ text: e.text, ...(e.context === undefined ? {} : { context: e.context }) }))
        await dispatch('turn.start', { text, turnId }, e => ({ turnId: e.turnId }))
        for (const [at, call] of TURN.entries()) {
          if (call.tool.startsWith('mcp__') && !tools.has(call.tool)) continue
          const id = `${turnId}-${at}`
          await dispatch('tool.check', { tool: call.tool, input: call.input, tool_use_id: id }, () => ({ decision: call.isAsked ? 'ask' : 'allow' }))
          await dispatch('tool.call', { tool: call.tool, tool_use_id: id, ...call.input }, async e => {
            if (e.tool === 'Bash') shelledAt ??= Math.floor(Date.now() / 1000) * 1000
            await sleep(call.ms * pace)
            if (e.tool === 'Edit') {
              const before = files.get(e.file_path) ?? ''
              files.set(e.file_path, before.includes(e.old_string) ? before.replace(e.old_string, e.new_string) : before)
            }
            if (e.tool === 'Read') {
              const content = files.get(e.file_path) ?? ''

              return { result: { type: 'text', file: { filePath: e.file_path, content, numLines: content.split('\n').length - 1, startLine: 1, totalLines: content.split('\n').length - 1 } }, text: content }
            }
            const said = call.text ?? 'ok'

            return { result: e.tool === 'Bash' ? { stdout: said, stderr: '', interrupted: false } : said, text: said, ...(call.isError ? { isError: true } : {}) }
          })
          usage.tokens += 1800
        }
        const stream = flow('turn.step', { turnId, index: 0, model: 'claude-demo', messageCount: transcript.length + 1 }, async function* (e) {
          for (const [index, [kind, said]] of [['thinking', THOUGHT], ['text', REPLY]].entries()) {
            for (const text of pieces(said, 7)) {
              await sleep(30 * pace)
              yield { kind, index, text }
            }
          }
          yield { kind: 'stop', stopReason: 'end_turn', usage: SPENT }

          return { turnId: e.turnId, index: e.index, answer: REPLY, toolUses: [], stopReason: 'end_turn', usage: SPENT }
        })
        for await (const chunk of stream) void chunk
        await stream.result
        usage.tokens += 2500
        usage.usd += 0.06
        usage.five = Math.min(100, usage.five + 1)
        transcript.push(...spoken(turnId, text, ANSWER))
        await measure(['context', 'rateLimits', 'cost'])
        for (const agent of crew) {
          agent.status = 'completed'
          await dispatch('turn.complete', { answer: agent.last, durationMs: Date.now() - startedAt, isAborted: false, turnId, reason: 'answer', agentId: agent.id }, e => ({ text: e.answer }))
        }
        await dispatch('turn.complete', { answer: ANSWER, durationMs: Date.now() - startedAt, isAborted: false, turnId, reason: 'answer' }, e => ({ text: e.answer }))
        if (PICKED[name] !== undefined) selected = PICKED[name](turnId)
        files.set(`${ROOT}/src/sum.js`, FILES['src/sum.js'])
        await settle()
      } finally {
        isBusy = false
        changed()
      }
    }

    return {
      name,
      commands,
      clients: mod.clients,
      get isBusy() {
        return isBusy
      },
      start: async () => {
        await dispatch('session.start', { cwd: ROOT, surface: 'terminal', isInteractive: true }, e => ({ cwd: e.cwd }))
        await measure(['context', 'rateLimits', 'cost'])
        await command(name, 'on')
        if (state.get(`${name}/isOn`) !== true) await command(name, '')
        for (const line of OPENING[name]?.lines ?? []) {
          const [word, ...rest] = line.startsWith('/') ? line.slice(1).split(' ') : [name, line]
          await command(word, rest.join(' '))
        }
        await settle()
        changed()
      },
      run: async line => {
        const text = line.trim()
        if (text === '') return
        if (!text.startsWith('/')) return turn(text)

        const [word, ...rest] = text.slice(1).split(' ')
        if (word === 'compact') return compact(rest.join(' ').trim())
        if (!commands.some(entry => entry.name === word)) return onPrint(`Unknown command: /${word}`)

        const said = await command(word, rest.join(' '))
        if (typeof said === 'string' && said !== '') onPrint(said)
        changed()
      },
      turn: () => turn('Fix the failing test'),
      compact: () => compact(''),
      message: data => dispatch('ui.message', { data }, () => ({})),
      render: columns =>
        dispatch(
          'ui.render',
          { component: 'Pane', requestId: 'widgets', surface: 'terminal', viewport: { isFullscreen: true }, props: { title: 'Widgets', isFocused: false, bodyColumns: columns, placement: 'dock' } },
          () => ({ type: 'Box', props: {}, children: [] }),
        ),
      stop: () => {
        for (const id of timers) (clearInterval(id), clearTimeout(id))
        timers.clear()
      },
    }
  }

  root.DemoEngine = { create, elements: ELEMENTS }
})(globalThis)

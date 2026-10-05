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
  const SAID = {}
  const OPENING = {
    'queue-widget': { lines: ['until npm test', 'add update the changelog', 'add bump the version'], settleMs: 900 },
    'done-widget': { lines: ['add the tests pass', 'add the fix is committed'] },
    'ledger-widget': { lines: ['scan'] },
    'trial-widget': { lines: [], settleMs: 300 },
  }
  const arm = (isWith, turns, clean) => ({ isWith, turns, clean })
  const HELD = {
    'trial-widget': {
      'trial.json': JSON.stringify({
        subject: 'moon-widget',
        runs: { a: arm(true, 10, 9), b: arm(true, 10, 9), c: arm(true, 9, 9), d: arm(false, 10, 7), e: arm(false, 10, 6), f: arm(false, 10, 7) },
      }),
    },
  }
  const BESIDE = { 'trial-widget': ['moon-widget'] }
  const HIDDEN = { 'witness-widget': 'collision-widget: src/sum.js is also open in another session; read it again before you edit.' }

  const flat = kids => kids.flat(Infinity).filter(kid => kid !== null && kid !== undefined && kid !== false && kid !== true)
  const tag = type => props => {
    const { children, ...rest } = props || {}

    return { type, props: rest, children: flat([children === undefined ? [] : children]) }
  }
  const ELEMENTS = Object.fromEntries(['Box', 'Text', 'Code', 'Button', 'Client', 'Input', 'Select', 'Link', 'Spacer'].map(name => [name, tag(name)]))
  root.h = (type, props, ...children) => (typeof type === 'function' ? type({ ...(props || {}), children: flat(children) }) : { type, props: props || {}, children: flat(children) })
  root.Fragment = tag('Fragment')

  const sleep = ms => new Promise(done => setTimeout(done, ms))
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
  const weight = messages => messages.reduce((sum, message) => sum + message.text.length + message.toolUses.reduce((held, use) => held + JSON.stringify(use.input).length + (use.text ?? '').length, 0), 0)

  const create = (name, { onChange = () => {}, onToast = () => {}, onPrint = () => {}, pace = 1, widths = {} } = {}) => {
    const mod = root.DEMO_MODS.mods[name]
    const hooks = []
    const state = new Map([['widgets/site', 'side'], ['widgets/widths', widths]])
    const store = new Map()
    const files = new Map([
      ...Object.entries(FILES).map(([path, text]) => [`${ROOT}/${path}`, text]),
      ...Object.entries(HELD[name] ?? {}).map(([path, text]) => [`/demo/plugins/${name}/${path}`, text]),
    ])
    const commands = []
    const tools = new Set()
    const timers = new Set()
    const born = Date.now()
    const usage = { tokens: 46_000, usd: 0.38, five: 12, seven: 31 }
    const transcript = PAST.flatMap((prompt, at) => spoken(`past-${at}`, prompt, 'Done, and the tests pass.'))
    let turns = 0
    let isBusy = false
    let isDirty = false

    const changed = () => {
      if (isDirty) return
      isDirty = true
      queueMicrotask(() => {
        isDirty = false
        onChange()
      })
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
      },
      widgets: root.DEMO_MODS.kit,
      process: {
        run: async argv => {
          await sleep(20)
          if (argv[0] === 'git') return git(argv)

          return ran(0, '')
        },
      },
      fs: {
        read: async path => {
          const text = textOf(String(path).replaceAll('\\', '/'))
          if (text === undefined) throw new Error(`no such file: ${path}`)

          return text
        },
        stat: async path => {
          const text = textOf(String(path).replaceAll('\\', '/'))
          if (text === undefined) throw new Error(`no such file: ${path}`)

          return { kind: 'file', size: text.length, mtimeMs: 0, isLink: false }
        },
        exists: async path => textOf(String(path).replaceAll('\\', '/')) !== undefined,
        write: async (path, text) => void files.set(String(path).replaceAll('\\', '/'), String(text)),
        list: async path => listOf(String(path).replaceAll('\\', '/')),
      },
      session: {
        usage: async options => usageNow(options?.breakdown !== undefined),
        messages: async () => transcript.map(message => ({ ...message })),
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
      prompt: { suggest: async () => ({ isShown: true }), submit: async () => ({}), fill: async () => ({}) },
      http: { fetch: async () => ({ ok: true, status: 200, text: 'ok' }) },
      env: { get: async key => (key === 'HOME' ? HOME : undefined) },
      audio: { play: async () => ({}) },
      turn: { abort: async () => ({}) },
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
        usage.tokens += 2500
        usage.usd += 0.06
        usage.five = Math.min(100, usage.five + 1)
        transcript.push(...spoken(turnId, text, ANSWER))
        await measure(['context', 'rateLimits', 'cost'])
        await dispatch('turn.complete', { answer: ANSWER, durationMs: Date.now() - startedAt, isAborted: false, turnId, reason: 'answer' }, e => ({ text: e.answer }))
        files.set(`${ROOT}/src/sum.js`, FILES['src/sum.js'])
        await sleep(OPENING[name]?.settleMs ?? 0)
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
        for (const line of OPENING[name]?.lines ?? []) await command(name, line)
        await sleep(OPENING[name]?.settleMs ?? 0)
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
          { component: 'Pane', requestId: 'widgets', surface: 'terminal', props: { title: 'Widgets', isFocused: false, bodyColumns: columns, placement: 'dock' } },
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

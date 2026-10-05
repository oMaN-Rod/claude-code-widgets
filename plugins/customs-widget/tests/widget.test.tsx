import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, ToolCheckResult } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type Reply = { status: number; text: string } | 'refused'
type Notice = { tool_use_id: string; text: string | undefined }
type Desk = { world: Ground; web: Record<string, Reply>; urls: string[]; notices: Notice[] }
type Row = { text: string; color: unknown; isDim: boolean }
type Drawn = { note: string; rows: Row[]; marks: Row[] }
type Given = { store?: Record<string, unknown>; files?: Record<string, string>; isRefused?: boolean }

const NAME = 'customs-widget'
const USAGE = 'Usage: /customs-widget [on|off|show|trust <name>|clear]'
const NOW = 1_700_000_000_000
const DAY = 86_400_000
const LIMIT = 4000
const NPM = 'https://registry.npmjs.org/'
const WEEK = 'https://api.npmjs.org/downloads/point/last-week/'
const NPMRC = '/work/project/.npmrc'
const ALLOW: ToolCheckResult = { decision: 'allow', reason: 'Allowed by a rule', rule: 'Bash' }
const ASK: ToolCheckResult = { decision: 'ask', reason: 'This command needs approval', hook: 'PreToolUse' }
const DENY: ToolCheckResult = { decision: 'deny', reason: 'Denied by a rule', rule: 'Bash(npm:*)' }
const MARKS = ['✗', '!', '✓', '?', '·', '…']
const EMPTY = [
  'Nothing checked yet. Each package',
  'Claude installs is looked up on npm',
  'or PyPI first; a missing or brand',
  'new name is held for your yes.',
]
const SKIPPED = 'not looked up: private scope or registry'

const STAND_IN: Plugin = {
  name: 'stand-in-beneath',
  tier: 'append',
  register(on) {
    on('tool.check', async ($, e, next) => ((await $.store.get('verdict')) as ToolCheckResult | undefined) ?? next(e))
    on('http.fetch', async ($, e, next) => {
      if (e.url.includes('.org/slow-')) await $.clock.sleep(5000)
      if (e.url.includes('.org/tardy-')) await $.clock.sleep(1000)

      return next(e)
    })
    on('fs.read', async ($, e, next) => {
      await $.store.set('reads', [...(((await $.store.get('reads')) ?? []) as string[]), e.path])

      return next(e)
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, STAND_IN] }

const pypiUrl = (name: string): string => `https://pypi.org/pypi/${name}/json`

const stamp = (days: number): string => new Date(NOW - days * DAY).toISOString()

const open = (on: On, given: Given = {}): Desk => {
  const web: Record<string, Reply> = {}
  const urls: string[] = []
  const notices: Notice[] = []
  const world = ground(on, {
    now: NOW,
    store: { verdict: ALLOW, ...given.store },
    ...(given.files === undefined ? {} : { files: given.files }),
    answers: {
      'http.fetch': (e: { url: string }) => {
        urls.push(e.url)
        const reply = web[e.url]
        if (reply === undefined || reply === 'refused') throw new Error('fetch failed')

        return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, headers: { 'content-type': 'application/json' }, text: reply.text }
      },
      'ui.notice': (e: Notice) => {
        notices.push(e)
        if (given.isRefused === true) throw new Error(`no open call ${e.tool_use_id}`)
      },
    },
  })

  return { world, web, urls, notices }
}

const npm = (desk: Desk, name: string, days: number, latest: string, downloads?: number): void => {
  desk.web[`${NPM}${name}`] = {
    status: 200,
    text: JSON.stringify({
      _id: name,
      name,
      'dist-tags': { latest },
      versions: { [latest]: { name, version: latest, dist: { tarball: `${NPM}${name}/-/${name}-${latest}.tgz` } } },
      time: { created: stamp(days), modified: stamp(0), [latest]: stamp(0) },
      readme: 'x'.repeat(2000),
    }),
  }
  if (downloads !== undefined) {
    desk.web[`${WEEK}${name}`] = { status: 200, text: JSON.stringify({ downloads, start: '2023-11-07', end: '2023-11-13', package: name }) }
  }
}

const pypi = (desk: Desk, name: string, latest: string, releases: Record<string, number[]>): void => {
  desk.web[pypiUrl(name)] = {
    status: 200,
    text: JSON.stringify({
      info: { name, version: latest, summary: 'A package' },
      releases: Object.fromEntries(
        Object.entries(releases).map(([version, days]) => [
          version,
          days.map(ago => ({ filename: `${name}-${version}.tar.gz`, upload_time: stamp(ago).slice(0, 19), upload_time_iso_8601: stamp(ago) })),
        ]),
      ),
      urls: [],
    }),
  }
}

const gone = (desk: Desk, url: string): void => {
  desk.web[url] = { status: 404, text: url.startsWith(NPM) ? '{"error":"Not found"}' : '{"message": "Not Found"}' }
}

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const ask = ($: Engine, command: unknown, id = 'toolu_01', tool = 'Bash'): Promise<ToolCheckResult> =>
  $.tool.check({ tool, input: { command, description: 'Install' }, tool_use_id: id })

const fetched = async ($: Engine, desk: Desk, command: string): Promise<string[]> => {
  desk.urls.length = 0
  await ask($, command)

  return [...desk.urls].sort()
}

const drawn = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const texts = (await ui.findAll({ type: 'Text' })).slice(3).map(found => ({ text: found.text, color: found.props.color, isDim: found.props.dimColor === true }))
  await ui.unmount()

  return { note, rows: texts.filter(row => !MARKS.includes(row.text)), marks: texts.filter(row => MARKS.includes(row.text)) }
}

const wide = (mark: string, name: string, fact: string, inner = 36): string => `${mark} ${name}${fact.padStart(inner - 2 - name.length)}`

const lines = async ($: Engine, columns = 40): Promise<string[]> => (await drawn($, columns)).rows.map(row => row.text)

const shown = async ($: Engine): Promise<string> => (await $.command.run(run(NAME, 'show'))).text ?? ''

test('A1: the empty card says what it does in every placement and show says nothing is checked', PLUGINS, async ($, on) => {
  open(on)
  await start($)

  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    const card = await drawn($, 40, component)
    expect(card.note).toBe('')
    expect(card.rows.map(row => row.text)).toEqual(EMPTY)
    expect(card.rows.every(row => row.isDim)).toBe(true)
  }
  expect(await shown($)).toBe('Nothing checked yet.')
})

test('A2: every install form yields its keys and the versions asked', PLUGINS, async ($, on) => {
  const desk = open(on)
  npm(desk, 'a', 900, '2.0.0', 5000)
  npm(desk, 'b', 900, '2.0.0', 5000)
  pypi(desk, 'a', '1.4.0', { '1.0.0': [900], '1.4.0': [40] })
  pypi(desk, 'requests', '2.31.0', { '0.2.0': [4600], '2.31.0': [170, 170] })
  pypi(desk, 'flask-login', '1.0.0', { '0.1.0': [4400], '1.0.0': [50] })
  await start($)

  expect(await fetched($, desk, 'npm i a b@1.2.3')).toEqual([`${WEEK}a`, `${WEEK}b`, `${NPM}a`, `${NPM}b`])
  expect(await lines($)).toEqual([wide('✓', 'a', '2.0.0'), 'on npm 2 years, 5k downloads last', 'week, latest 2.0.0', wide('!', 'b', '1.2.3 → 2.0.0')])
  expect(await shown($)).toContain('b (npm): asked 1.2.3, latest is 2.0.0')

  for (const command of ['npm install a', 'npm add a', 'pnpm add a', 'pnpm install a', 'pnpm i a', 'yarn add a', 'bun add a', 'bun install a', 'bun i a']) {
    expect(await fetched($, desk, command)).toEqual([`${WEEK}a`, `${NPM}a`])
  }
  expect(await fetched($, desk, 'cd app && sudo FOO=1 npm i a')).toEqual([`${WEEK}a`, `${NPM}a`])

  expect(await fetched($, desk, "pip install 'requests>=2' Flask_Login[extra]==0.6.0")).toEqual([pypiUrl('flask-login'), pypiUrl('requests')])
  const text = await shown($)
  expect(text).toContain('requests (PyPI): on PyPI 12 years, latest 2.31.0')
  expect(text).toContain('flask-login (PyPI): asked 0.6.0, latest is 1.0.0')

  for (const command of [
    'pip install a',
    'pip3 install a',
    'python -m pip install a',
    'python3 -m pip install a',
    'py -m pip install a',
    'uv add a',
    'uv pip install a',
    'pip install -t out a',
    'cd app && sudo FOO=1 pip install a',
  ]) {
    expect(await fetched($, desk, command)).toEqual([pypiUrl('a')])
  }

  npm(desk, 'lodash', 4000, '4.17.21', 38_000_000)
  for (const command of [
    'npm install lodash > out.log 2>&1',
    'npm i lodash &>log',
    'npm install lodash@4 # add lodash; npm i evil',
    'npm i lodash & echo done',
    'npm install lodash --loglevel error',
    'npm i lodash>out.log',
    'npm i lodash >> out.log 2>/dev/null',
    'npm i "lodash@>=4" 1>&2 <in.txt',
    'npm i lodash <<EOF\nevil\nEOF',
    'npm i --loglevel=error lodash',
  ]) {
    expect(await fetched($, desk, command)).toEqual([`${WEEK}lodash`, `${NPM}lodash`])
  }
  for (const command of [
    'pip install requests 2>&1 | tail -5',
    'pip install requests > install.log',
    'pip install requests>=2',
    'uv add --group dev requests',
    'pip install --python-version 3.12 requests',
    'pip install --python-version=3.12 requests 2> err.log',
    'pip install "requests" # the "http" one',
  ]) {
    expect(await fetched($, desk, command)).toEqual([pypiUrl('requests')])
  }
  expect((await shown($)).split('\n')).toHaveLength(6)
})

test('A3: commands that name no registry package fetch nothing and leave the card alone', PLUGINS, async ($, on) => {
  const desk = open(on)
  await start($)

  for (const command of [
    'npm install',
    'npm test',
    'npm ci',
    'npx cowsay',
    'cargo add serde',
    'yarn global add a',
    'pip install -r requirements.txt',
    'pip install ./pkg',
    'npm i git+https://x/y.git',
    'npm i user/repo',
    'npm i ./a.tgz',
    'npm i $(cat names)',
    'npm i React',
    'npm i # lodash',
    'npm i > lodash',
    'npm i 2>&1',
    'npm i >lodash 2> express',
    'npm i <<< "lodash"',
    'pip install 3.12',
    'pip install --platform linux --abi cp312',
    'pip install & requests',
    42,
  ]) {
    expect(await ask($, command)).toEqual(ALLOW)
  }
  expect(desk.urls).toEqual([])
  expect(desk.world.store.get('reads')).toBeUndefined()
  expect(await drawn($)).toMatchObject({ note: '', rows: EMPTY.map(text => ({ text })) })
})

test('A4: an old name passes with a green row, its age and its downloads', PLUGINS, async ($, on) => {
  const desk = open(on)
  npm(desk, 'left-pad', 45, '1.3.0', 30)
  npm(desk, 'zod', 14 * 30 + 3, '3.22.4', 12_400)
  npm(desk, 'lodash', 11 * 365 + 40, '4.17.21', 38_000_000)
  npm(desk, 'solo', 400, '1.0.0', 1)
  await start($)

  expect(await ask($, 'npm install left-pad')).toEqual(ALLOW)
  const card = await drawn($)
  expect(card.note).toBe('1 package')
  expect(card.marks).toEqual([{ text: '✓', color: 'green', isDim: false }])
  expect(card.rows).toEqual([
    { text: wide('✓', 'left-pad', '1.3.0'), color: undefined, isDim: false },
    { text: 'on npm 45 days, 30 downloads last', color: 'green', isDim: false },
    { text: 'week, latest 1.3.0', color: 'green', isDim: false },
  ])

  await ask($, 'npm install zod lodash solo')
  expect((await shown($)).split('\n')).toEqual([
    'zod (npm): on npm 14 months, 12k downloads last week, latest 3.22.4',
    'lodash (npm): on npm 11 years, 38M downloads last week, latest 4.17.21',
    'solo (npm): on npm 13 months, 1 download last week, latest 1.0.0',
    'left-pad (npm): on npm 45 days, 30 downloads last week, latest 1.3.0',
  ])
  expect(desk.notices).toEqual([])

  npm(desk, 'edge-a', 59, '1.0.0', 999)
  npm(desk, 'edge-b', 60, '1.0.0', 999_999)
  npm(desk, 'edge-c', 719, '1.0.0', 1_000_000)
  npm(desk, 'edge-d', 720, '1.0.0', 1000)
  await ask($, 'npm install edge-a edge-b edge-c edge-d')
  expect((await shown($)).split('\n').slice(0, 4)).toEqual([
    'edge-a (npm): on npm 59 days, 999 downloads last week, latest 1.0.0',
    'edge-b (npm): on npm 2 months, 999k downloads last week, latest 1.0.0',
    'edge-c (npm): on npm 23 months, 1M downloads last week, latest 1.0.0',
    'edge-d (npm): on npm 1 year, 1k downloads last week, latest 1.0.0',
  ])
})

test('A5: a name the registry does not have turns an allow into an ask', PLUGINS, async ($, on) => {
  const desk = open(on)
  gone(desk, `${NPM}sum-utils-fast`)
  gone(desk, pypiUrl('sum-utils-fast'))
  await start($)

  expect(await ask($, 'npm install sum-utils-fast')).toEqual({ decision: 'ask', reason: 'sum-utils-fast: no package named sum-utils-fast on npm' })
  expect(desk.urls).toEqual([`${NPM}sum-utils-fast`])
  const card = await drawn($)
  expect(card.note).toBe('1 held')
  expect(card.marks).toEqual([{ text: '✗', color: 'red', isDim: false }])
  expect(card.rows).toEqual([
    { text: wide('✗', 'sum-utils-fast', 'not found'), color: undefined, isDim: false },
    { text: 'no package named sum-utils-fast on', color: 'red', isDim: false },
    { text: 'npm', color: 'red', isDim: false },
  ])
  expect(desk.notices).toEqual([])

  expect(await ask($, 'pip install Sum_Utils.Fast')).toEqual({ decision: 'ask', reason: 'sum-utils-fast: no package named sum-utils-fast on PyPI' })
  expect((await shown($)).split('\n')).toEqual([
    'sum-utils-fast (PyPI): no package named sum-utils-fast on PyPI [held]',
    'sum-utils-fast (npm): no package named sum-utils-fast on npm [held]',
  ])
  expect((await drawn($)).note).toBe('2 held')
})

test('A6: a name under 30 days old is held and one of 30 days is not', PLUGINS, async ($, on) => {
  const desk = open(on)
  npm(desk, 'sum-utils-fast', 29, '0.1.0', 30)
  npm(desk, 'month-old', 30, '0.1.0', 30)
  pypi(desk, 'fresh-lib', '0.3.0', { '0.3.0': [2, 1], '0.1.0': [4], '0.2.0': [3], '0.0.1': [] })
  pypi(desk, 'requests', '2.31.0', { '2.31.0': [3], '0.2.0': [4600] })
  await start($)

  expect(await ask($, 'npm install sum-utils-fast')).toEqual({
    decision: 'ask',
    reason: 'sum-utils-fast: first published 29 days ago, 30 downloads last week',
  })
  expect(await lines($)).toEqual([wide('✗', 'sum-utils-fast', '29 days'), 'first published 29 days ago, 30', 'downloads last week'])
  expect((await drawn($)).marks).toEqual([{ text: '✗', color: 'red', isDim: false }])

  expect(await ask($, 'npm install month-old')).toEqual(ALLOW)
  expect((await shown($)).split('\n')[0]).toBe('month-old (npm): on npm 30 days, 30 downloads last week, latest 0.1.0')

  expect(await ask($, 'pip install fresh-lib requests')).toEqual({ decision: 'ask', reason: 'fresh-lib: first published 4 days ago' })
  expect((await shown($)).split('\n').slice(0, 2)).toEqual([
    'fresh-lib (PyPI): first published 4 days ago [held]',
    'requests (PyPI): on PyPI 12 years, latest 2.31.0',
  ])
  expect(desk.urls.filter(url => url.startsWith(WEEK))).toEqual([`${WEEK}sum-utils-fast`, `${WEEK}month-old`])
})

test('A7: under an ask the finding goes on the dialog, and under a deny nothing is looked up', PLUGINS, async ($, on) => {
  const desk = open(on, { store: { verdict: ASK }, isRefused: true })
  gone(desk, `${NPM}sum-utils-fast`)
  npm(desk, 'lodash', 4000, '4.17.21', 38_000_000)
  await start($)

  expect(await ask($, 'npm install lodash sum-utils-fast', 'toolu_ask')).toEqual(ASK)
  expect(desk.notices).toEqual([{ tool_use_id: 'toolu_ask', text: 'sum-utils-fast: no package named sum-utils-fast on npm' }])
  const card = await drawn($)
  expect(card.note).toBe('2 packages')
  expect(card.rows.at(-1)?.text).toBe(wide('✗', 'sum-utils-fast', 'not found'))
  expect((await shown($)).split('\n').at(-1)).toBe('sum-utils-fast (npm): no package named sum-utils-fast on npm')

  expect(await ask($, 'npm install lodash', 'toolu_fine')).toEqual(ASK)
  expect(desk.notices).toHaveLength(1)

  await $.command.run(run(NAME, 'clear'))
  desk.world.store.set('verdict', DENY)
  desk.urls.length = 0
  expect(await ask($, 'npm install sum-utils-fast')).toEqual(DENY)
  expect(desk.urls).toEqual([])
  expect(desk.notices).toHaveLength(1)
  expect(await shown($)).toBe('Nothing checked yet.')
})

test('A8: a major version behind the latest is amber and never held', PLUGINS, async ($, on) => {
  const desk = open(on)
  npm(desk, 'lodash', 4000, '4.17.21', 38_000_000)
  npm(desk, 'nightly', 4000, 'next-7', 10)
  pypi(desk, 'requests', '2.31.0', { '0.2.0': [4600], '2.31.0': [170] })
  await start($)

  expect(await ask($, 'npm install lodash@3.10.1')).toEqual(ALLOW)
  const card = await drawn($)
  expect(card.note).toBe('1 package')
  expect(card.marks).toEqual([{ text: '!', color: 'yellow', isDim: false }])
  expect(card.rows).toEqual([
    { text: wide('!', 'lodash', '3.10.1 → 4.17.21'), color: undefined, isDim: false },
    { text: 'asked 3.10.1, latest is 4.17.21', color: 'yellow', isDim: false },
  ])

  for (const command of ['npm install lodash@^4.17.0', 'npm install lodash@latest', 'npm install lodash@1.x', 'npm install lodash', 'npm install nightly@1.0.0']) {
    expect(await ask($, command)).toEqual(ALLOW)
    expect((await drawn($)).marks[0]).toEqual({ text: '✓', color: 'green', isDim: false })
  }
  expect(await ask($, "pip install 'requests>=2'")).toEqual(ALLOW)
  expect((await shown($)).split('\n')[0]).toBe('requests (PyPI): on PyPI 12 years, latest 2.31.0')
  expect(await ask($, 'npm install lodash@v2.4.2')).toEqual(ALLOW)
  expect((await shown($)).split('\n')[0]).toBe('lodash (npm): asked 2.4.2, latest is 4.17.21')
  expect(desk.notices).toEqual([])
})

test('A9: a registry that fails is unchecked, never missing, and the command goes through', PLUGINS, async ($, on) => {
  const desk = open(on)
  desk.web[`${NPM}five-hundred`] = { status: 500, text: 'Internal Server Error' }
  desk.web[`${NPM}rate-limited`] = { status: 429, text: '{"error":"rate limited"}' }
  desk.web[`${NPM}refused`] = 'refused'
  desk.web[`${NPM}not-json`] = { status: 200, text: '<html>Sign in to the proxy</html>' }
  desk.web[`${NPM}no-date`] = { status: 200, text: JSON.stringify({ name: 'no-date', 'dist-tags': { latest: '1.0.0' }, time: { modified: stamp(3) } }) }
  desk.web[`${NPM}unpublished`] = { status: 200, text: JSON.stringify({ name: 'unpublished', time: { created: stamp(300), unpublished: { time: stamp(3) } } }) }
  desk.web[pypiUrl('down')] = { status: 503, text: 'Service Unavailable' }
  await start($)

  for (const name of ['five-hundred', 'rate-limited', 'refused', 'not-json', 'no-date', 'unpublished']) {
    expect(await ask($, `npm install ${name}`)).toEqual(ALLOW)
    expect((await shown($)).split('\n')[0]).toBe(`${name} (npm): unchecked: npm did not answer`)
  }
  expect(await ask($, 'pip install down')).toEqual(ALLOW)
  const card = await drawn($)
  expect(card.marks[0]).toEqual({ text: '?', color: undefined, isDim: false })
  expect(card.rows.slice(0, 2)).toEqual([
    { text: wide('?', 'down', 'unchecked'), color: undefined, isDim: true },
    { text: 'unchecked: PyPI did not answer', color: undefined, isDim: true },
  ])
  expect(card.note).toBe('7 packages')
  expect(desk.notices).toEqual([])

  npm(desk, 'slow-pkg', 4000, '1.0.0', 500)
  const pending = ask($, 'npm install slow-pkg')
  await desk.world.clock.advance(LIMIT - 1)
  expect((await lines($))[1]).toBe('looking up on npm')
  await desk.world.clock.advance(1)
  expect(await pending).toEqual(ALLOW)
  expect((await lines($))[1]).toBe('unchecked: npm did not answer')
  await desk.world.clock.advance(5000)
  expect((await lines($))[1]).toBe('unchecked: npm did not answer')

  npm(desk, 'lodash', 4000, '4.17.21')
  desk.web[`${WEEK}lodash`] = { status: 500, text: 'Internal Server Error' }
  npm(desk, 'brand-new', 4, '0.1.0')
  expect(await ask($, 'npm install lodash')).toEqual(ALLOW)
  expect((await shown($)).split('\n')[0]).toBe('lodash (npm): on npm 10 years, latest 4.17.21')
  expect(await ask($, 'npm install brand-new')).toEqual({ decision: 'ask', reason: 'brand-new: first published 4 days ago' })

  await $.command.run(run(NAME, 'clear'))
  const names = Array.from({ length: 9 }, (_, at) => `pkg-${at + 1}`)
  for (const name of names.slice(0, 8)) npm(desk, name, 900, '1.0.0', 100)
  gone(desk, `${NPM}pkg-9`)
  desk.urls.length = 0
  expect(await ask($, `npm install ${names.join(' ')}`)).toEqual(ALLOW)
  expect(desk.urls.filter(url => url.endsWith('pkg-9'))).toEqual([])
  expect(desk.urls).toHaveLength(16)
  expect((await shown($)).split('\n')).toHaveLength(8)
})

test('A10: private scopes and registries are listed as skipped and never looked up', PLUGINS, async ($, on) => {
  const desk = open(on)
  npm(desk, 'express', 4000, '4.21.2', 30_000_000)
  await start($)

  for (const [command, name, registry] of [
    ['npm install @acme/billing', '@acme/billing', 'npm'],
    ['npm install --registry https://npm.acme.dev/ express', 'express', 'npm'],
    ['npm install --registry=https://npm.acme.dev/ express', 'express', 'npm'],
    ['pip install -f https://wheels.acme.dev/ billing-core', 'billing-core', 'PyPI'],
    ['pip install --extra-index-url https://pypi.acme.dev/simple billing-core', 'billing-core', 'PyPI'],
    ['pip install -i https://pypi.acme.dev/simple billing-core', 'billing-core', 'PyPI'],
    ['pip install --index-url https://pypi.acme.dev/simple billing-core', 'billing-core', 'PyPI'],
  ] as const) {
    await $.command.run(run(NAME, 'clear'))
    expect(await ask($, command)).toEqual(ALLOW)
    expect(await shown($)).toBe(`${name} (${registry}): ${SKIPPED}`)
  }
  expect(desk.urls).toEqual([])
  const card = await drawn($)
  expect(card.note).toBe('1 package')
  expect(card.marks[0]).toEqual({ text: '·', color: undefined, isDim: false })
  expect(card.rows[0]).toEqual({ text: wide('·', 'billing-core', 'skipped'), color: undefined, isDim: true })

  desk.world.files.set(NPMRC, '; the company mirror\nregistry=https://npm.acme.dev/\n')
  expect(await ask($, 'npm install express && pip install billing-core')).toEqual(ALLOW)
  expect(desk.urls).toEqual([pypiUrl('billing-core')])
  expect((await shown($)).split('\n')[0]).toBe(`express (npm): ${SKIPPED}`)

  desk.world.files.set(NPMRC, 'registry=https://registry.npmjs.org/\nsave-exact=true\n')
  expect(await fetched($, desk, 'npm install express')).toEqual([`${WEEK}express`, `${NPM}express`])
  desk.world.files.delete(NPMRC)
  expect(await fetched($, desk, 'npm install express')).toEqual([`${WEEK}express`, `${NPM}express`])
  expect((await shown($)).split('\n')[0]).toBe('express (npm): on npm 10 years, 30M downloads last week, latest 4.21.2')
})

test('A11: a trusted name is still looked up and drawn but never held, in this session and the next', PLUGINS, async ($, on) => {
  const desk = open(on, { store: { verdict: ASK, isOn: true, trusted: ['left-pad-pro'] } })
  gone(desk, `${NPM}sum-utils-fast`)
  gone(desk, `${NPM}left-pad-pro`)
  pypi(desk, 'sum-utils-fast', '0.1.0', { '0.1.0': [4] })
  await session($)
  await $.command.run(run('place', 'side'))

  expect(await ask($, 'npm install left-pad-pro')).toEqual(ASK)
  expect(desk.notices).toEqual([])

  expect((await $.command.run(run(NAME, 'TRUST Sum_Utils.Fast'))).text).toBe('Customs trusts sum-utils-fast.')
  expect(desk.world.store.get('trusted')).toEqual(['left-pad-pro', 'sum-utils-fast'])
  expect((await $.command.run(run(NAME, 'trust sum-utils-fast'))).text).toBe('Customs trusts sum-utils-fast.')
  expect(desk.world.store.get('trusted')).toEqual(['left-pad-pro', 'sum-utils-fast'])

  await $.command.run(run(NAME, 'clear'))
  await $.command.run(run(NAME, 'trust sum_utils_fast'))
  desk.urls.length = 0
  expect(await ask($, 'npm install sum-utils-fast')).toEqual(ASK)
  desk.world.store.set('verdict', ALLOW)
  expect(await ask($, 'npm install sum-utils-fast')).toEqual(ALLOW)
  expect(await ask($, 'pip install sum-utils-fast')).toEqual(ALLOW)
  expect(desk.urls).toEqual([`${NPM}sum-utils-fast`, `${NPM}sum-utils-fast`, pypiUrl('sum-utils-fast')])
  expect(desk.notices).toEqual([])
  const card = await drawn($)
  expect(card.note).toBe('2 packages')
  expect(card.marks).toEqual([
    { text: '✗', color: 'red', isDim: false },
    { text: '✗', color: 'red', isDim: false },
  ])
  expect(await shown($)).toBe(
    'sum-utils-fast (PyPI): first published 4 days ago\nsum-utils-fast (npm): no package named sum-utils-fast on npm\nTrusted: sum-utils-fast',
  )

  for (const args of ['trust', 'trust ../x', 'trust a b', 'trust @acme/x']) expect((await $.command.run(run(NAME, args))).text).toBe(USAGE)
  expect(desk.world.store.get('trusted')).toEqual(['sum-utils-fast'])

  for (let at = 1; at <= 100; at += 1) await $.command.run(run(NAME, `trust name-${at}`))
  const names = desk.world.store.get('trusted') as string[]
  expect(names).toHaveLength(100)
  expect(names[0]).toBe('name-1')
  expect(names.at(-1)).toBe('name-100')
  expect(await ask($, 'npm install sum-utils-fast')).toEqual({ decision: 'ask', reason: 'sum-utils-fast: no package named sum-utils-fast on npm' })
})

test('A12: show lists, clear wipes, the usage names every verb, and verbs do nothing while off', PLUGINS, async ($, on) => {
  const desk = open(on)
  gone(desk, `${NPM}sum-utils-fast`)
  npm(desk, 'express', 4000, '4.21.2', 30_000_000)
  await start($)

  await $.command.run(run(NAME, 'trust express'))
  expect(await shown($)).toBe('Trusted: express')
  await ask($, 'npm install sum-utils-fast express')
  expect((await $.command.run(run(NAME, 'SHOW'))).text).toBe(
    'sum-utils-fast (npm): no package named sum-utils-fast on npm [held]\nexpress (npm): on npm 10 years, 30M downloads last week, latest 4.21.2\nTrusted: express',
  )
  expect((await $.command.run(run(NAME, 'what'))).text).toBe(USAGE)
  expect((await $.command.run(run(NAME, 'show all'))).text).toBe(USAGE)
  for (const verb of ['on', 'off', 'show', 'trust <name>', 'clear']) expect(USAGE).toContain(verb)

  expect((await $.command.run(run(NAME, 'clear'))).text).toBe('Customs cleared.')
  expect(desk.world.store.get('trusted')).toEqual([])
  expect(await shown($)).toBe('Nothing checked yet.')
  expect(await drawn($)).toMatchObject({ note: '', rows: EMPTY.map(text => ({ text })) })

  await $.command.run(run(NAME, 'trust express'))
  await $.command.run(run(NAME, 'off'))
  const before = desk.world.writes.length
  for (const args of ['show', 'trust x', 'clear']) expect((await $.command.run(run(NAME, args))).text).toBe('Customs is off.')
  expect(desk.world.writes.slice(before)).toEqual([])
  expect(desk.world.store.get('trusted')).toEqual(['express'])
  expect(desk.world.store.get('isOn')).toBe(false)
})

test('A13: the gate line counts the others, the list keeps one row per key and eight entries', PLUGINS, async ($, on) => {
  const desk = open(on)
  gone(desk, `${NPM}sum-utils-fast`)
  npm(desk, 'color-string-utils', 6, '0.0.2', 12)
  for (let at = 1; at <= 7; at += 1) npm(desk, `pkg-${at}`, 900, `1.0.${at}`, 100)
  await start($)

  expect(await ask($, 'npm install sum-utils-fast pkg-1 color-string-utils')).toEqual({
    decision: 'ask',
    reason: 'sum-utils-fast: no package named sum-utils-fast on npm (+1 more)',
  })
  expect((await drawn($)).note).toBe('2 held')
  expect((await shown($)).split('\n')).toEqual([
    'sum-utils-fast (npm): no package named sum-utils-fast on npm [held]',
    'pkg-1 (npm): on npm 2 years, 100 downloads last week, latest 1.0.1',
    'color-string-utils (npm): first published 6 days ago, 12 downloads last week [held]',
  ])

  await ask($, 'npm install pkg-1')
  expect((await shown($)).split('\n').map(text => text.split(' ')[0])).toEqual(['pkg-1', 'sum-utils-fast', 'color-string-utils'])

  await $.command.run(run(NAME, 'trust color-string-utils'))
  expect(await shown($)).toContain('downloads last week [held]')
  await ask($, 'npm install color-string-utils')
  expect(await shown($)).not.toContain('downloads last week [held]')
  expect((await drawn($)).note).toBe('1 held')

  for (let at = 2; at <= 7; at += 1) await ask($, `npm install pkg-${at}`)
  const names = (await shown($)).split('\n').slice(0, -1).map(text => text.split(' ')[0])
  expect(names).toEqual(['pkg-7', 'pkg-6', 'pkg-5', 'pkg-4', 'pkg-3', 'pkg-2', 'color-string-utils', 'pkg-1'])

  const card = await drawn($)
  expect(card.note).toBe('8 packages')
  expect(card.marks).toHaveLength(6)
  expect(card.rows.map(row => row.text)).toEqual([
    wide('✓', 'pkg-7', '1.0.7'),
    'on npm 2 years, 100 downloads last',
    'week, latest 1.0.7',
    wide('✓', 'pkg-6', '1.0.6'),
    wide('✓', 'pkg-5', '1.0.5'),
    wide('✓', 'pkg-4', '1.0.4'),
    wide('✓', 'pkg-3', '1.0.3'),
    wide('✓', 'pkg-2', '1.0.2'),
  ])
})

test('A14: every state fits the card at 20, 40 and 60 columns', PLUGINS, async ($, on) => {
  const desk = open(on)
  const long = 'a-remarkably-long-package-name-that-keeps-going-and-going'
  gone(desk, `${NPM}${long}`)
  npm(desk, 'sum-utils-fast', 4, '0.1.0', 30)
  npm(desk, 'lodash', 4000, '4.17.21', 38_000_000)
  npm(desk, 'express', 4000, '4.21.2', 30_000_000)
  desk.web[pypiUrl('requests')] = { status: 502, text: 'Bad Gateway' }
  await start($)

  await ask($, 'pip install requests')
  await ask($, 'npm install express @acme/billing lodash@3.10.1')
  await ask($, 'npm install sum-utils-fast')

  expect(await lines($, 20)).toEqual([
    '✗ sum-utils-fast',
    'first published',
    '4 days ago, 30',
    'downloads last',
    'week',
    '✓ express',
    '· @acme/billing',
    '! lodash',
    '? requests',
  ])
  expect((await drawn($, 20)).note).toBe('1 held')
  expect((await lines($, 29))[0]).toBe('✗ sum-utils-fast')
  expect((await lines($, 30))[0]).toBe(wide('✗', 'sum-utils-fast', '4 days', 26))
  expect(await lines($, 40)).toEqual([
    wide('✗', 'sum-utils-fast', '4 days'),
    'first published 4 days ago, 30',
    'downloads last week',
    wide('✓', 'express', '4.21.2'),
    wide('·', '@acme/billing', 'skipped'),
    wide('!', 'lodash', '3.10.1 → 4.17.21'),
    wide('?', 'requests', 'unchecked'),
  ])

  await ask($, `npm install ${long}`)
  await $.command.run(run('widen', `${NAME} 60`))
  for (const [columns, inner] of [
    [20, 16],
    [40, 36],
    [60, 56],
  ] as const) {
    const card = await drawn($, columns)
    expect(card.rows.filter(row => row.text.length > inner)).toEqual([])
    expect(card.rows.filter(row => row.color === 'red').map(row => row.text)).toEqual(['no package named', `${long.slice(0, inner - 1)}…`, 'on npm'])
  }
  expect((await lines($, 60))[0]).toBe(`✗ ${long.slice(0, 43)}… not found`)
  expect((await lines($, 40))[0]).toBe(`✗ ${long.slice(0, 23)}… not found`)
  expect((await lines($, 20))[0]).toBe(`✗ ${long.slice(0, 13)}…`)

  await $.command.run(run(NAME, 'clear'))
  await ask($, 'npm install express')
  expect((await drawn($, 20)).note).toBe('1')
  expect((await drawn($, 40)).note).toBe('1 package')
})

test('A15: the card shows the lookup in flight, PowerShell counts, and off stops everything', PLUGINS, async ($, on) => {
  const desk = open(on, { files: { [NPMRC]: 'registry=https://registry.npmjs.org/\n' } })
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))
  gone(desk, `${NPM}ghost-pkg`)
  npm(desk, 'tardy-lib', 4000, '2.0.0', 700)
  npm(desk, 'slow-lib', 4000, '2.0.0', 700)
  npm(desk, 'express', 4000, '4.21.2', 30_000_000)
  await start($)

  const pending = ask($, 'npm install tardy-lib express')
  await desk.world.clock.settle()
  const card = await drawn($)
  expect(card.note).toBe('2 packages')
  expect(card.marks).toEqual([
    { text: '…', color: undefined, isDim: false },
    { text: '…', color: undefined, isDim: false },
  ])
  expect(card.rows).toEqual([
    { text: wide('…', 'tardy-lib', 'checking'), color: undefined, isDim: true },
    { text: 'looking up on npm', color: undefined, isDim: true },
    { text: wide('…', 'express', 'checking'), color: undefined, isDim: true },
  ])
  await desk.world.clock.advance(1000)
  expect(await pending).toEqual(ALLOW)
  expect(await lines($)).toEqual([wide('✓', 'tardy-lib', '2.0.0'), 'on npm 10 years, 700 downloads last', 'week, latest 2.0.0', wide('✓', 'express', '4.21.2')])

  gone(desk, `${NPM}sum-utils-fast`)
  expect(await ask($, 'npm install sum-utils-fast', 'toolu_ps', 'PowerShell')).toEqual({
    decision: 'ask',
    reason: 'sum-utils-fast: no package named sum-utils-fast on npm',
  })

  desk.urls.length = 0
  expect(await $.tool.check({ tool: 'Bash', input: { command: 'npm install ghost-pkg' } })).toEqual(ALLOW)
  expect(desk.urls).toEqual([])

  const late = ask($, 'npm install slow-lib sum-utils-fast')
  await desk.world.clock.settle()
  await $.command.run(run(NAME, 'off'))
  await desk.world.clock.advance(LIMIT)
  expect(await late).toEqual(ALLOW)
  await $.command.run(run(NAME, 'on'))
  expect(await shown($)).toBe('Nothing checked yet.')

  await $.command.run(run(NAME, 'off'))
  desk.urls.length = 0
  const reads = (desk.world.store.get('reads') as string[]).length
  await turn($)
  expect(await ask($, 'npm install sum-utils-fast')).toEqual(ALLOW)
  expect(desk.urls).toEqual([])
  expect(desk.world.store.get('reads')).toHaveLength(reads)
  expect(desk.notices).toEqual([])
})

import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

import { scrub } from '../hooks/register'
import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Shown = { type: string; props?: Record<string, unknown>; children?: (Shown | string)[] }
type Card = { note: string; rows: string[] }
type Answer = Record<string, unknown>

const NAME = 'redact-widget'
const USAGE = 'Usage: /redact-widget [on|off|clear]'
const EMPTY = ['Nothing kept out yet. A key, token', 'or password in command output or a', 'file read is replaced before Claude', 'reads it, and counted here.']
const EMPTY_SHORT = ['Nothing kept out', 'yet. A key or', 'password in a', 'result is hidden', 'from Claude and', 'counted here.']
const BLANK: Card = { note: '', rows: EMPTY }
const OWN = 'stand-in-above: the working tree has uncommitted changes.'

const GITHUB = `ghp_${'a1B2c3'.repeat(6)}`
const GITHUB_OTHER = `github_pat_${'9zY8x_'.repeat(4)}`
const AWS = `AKIA${'Q7'.repeat(8)}`
const API = `sk-ant-${'x9Y8'.repeat(6)}`
const SLACK = `xoxb-${'12345'.repeat(2)}-${'abcde'.repeat(2)}`
const STRIPE = `sk_live_${'4eC3'.repeat(6)}`
const GOOGLE = `AIza${'Sy0-_'.repeat(7)}`
const JWT = `eyJ${'hbGc'.repeat(3)}.${'eyJz'.repeat(4)}.${'SflK'.repeat(5)}`
const KEY_BLOCK = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEow'.repeat(10), 'IBAAKC'.repeat(10), '-----END RSA PRIVATE KEY-----'].join('\n')
const KEY_BODY = 'MIIEow'.repeat(10)

const CORE: Plugin = {
  name: 'stand-in-core',
  tier: 'append',
  register(on) {
    on('tool.call', async ($, e) => {
      if ((await $.store.get('isWatched')) === true) await $.store.set('seen', e)

      return (await $.store.get('answer')) as never
    })
  },
}

const PLUGINS = { plugins: [LAYOUT, CORE] }

const note = (count: number): string =>
  `redact-widget replaced ${count} secret value${count === 1 ? '' : 's'} in this result with [redacted ...] placeholders before you read it. The real values are unchanged on disk. Never write a placeholder into a file or a command, and do not try to read the values another way.`

const ran = (stdout: string, stderr = ''): Answer => ({
  ref: 7,
  result: { stdout, stderr, interrupted: false },
  text: [stdout, stderr].filter(part => part !== '').join('\n'),
})

const file = (content: string, filePath = '/work/project/.env'): Answer => {
  const numLines = content.split('\n').length

  return { ref: 8, result: { type: 'text', file: { filePath, content, numLines, startLine: 1, totalLines: numLines } }, text: content }
}

const setup = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const call = async ($: Engine, world: Ground, input: Answer, answer: Answer): Promise<Answer> => {
  world.store.set('answer', answer)

  return (await $.tool.call({ tool_use_id: 'toolu_01', ...input } as never)) as Answer
}

const bash = ($: Engine, world: Ground, command: string, answer: Answer): Promise<Answer> => call($, world, { tool: 'Bash', command }, answer)

const readFile = ($: Engine, world: Ground, path: string, answer: Answer): Promise<Answer> => call($, world, { tool: 'Read', file_path: path }, answer)

const body = async ($: Engine, columns: number, component: (typeof SITES)[number][1]): Promise<{ note: string; rows: Shown[] }> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const found = await ui.find({ key: 'body' })
  const shown = (await ui.find({ key: 'note' }))?.text ?? ''
  await ui.unmount()
  const column = found?.children[0] as Shown | undefined

  return { note: shown, rows: (column?.children ?? []) as Shown[] }
}

const line = (row: Shown | string): string =>
  typeof row === 'string' ? row : (row.children ?? []).map(line).join(row.type === 'Box' ? ' ' : '')

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Card | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const isDrawn = (await ui.find({ key: 'card' })) !== undefined
  await ui.unmount()
  if (!isDrawn) return undefined
  const drawn = await body($, columns, component)

  return { note: drawn.note, rows: drawn.rows.map(line) }
}

test('A1: an empty card says what will appear, and other tools pass untouched', PLUGINS, async ($, on) => {
  const world = ground(on, { store: { isOn: true } })

  await session($)
  await $.command.run(run('place', 'side'))
  expect(await card($)).toEqual(BLANK)
  expect(EMPTY.join(' ')).toMatch(/^Nothing kept out yet\. .* replaced before Claude reads it, and counted here\.$/)

  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  expect(await card($)).toEqual(BLANK)

  const edited = {
    ref: 3,
    result: { filePath: '/work/project/src/auth.ts', oldString: 'const token = ""', newString: `const token = "${GITHUB}"`, replaceAll: false, userModified: false },
    text: `The file /work/project/src/auth.ts has been updated. const token = "${GITHUB}"`,
  }
  expect(await call($, world, { tool: 'Edit', file_path: '/work/project/src/auth.ts', old_string: 'const token = ""', new_string: `const token = "${GITHUB}"` }, edited)).toEqual(edited)

  const fetched = { ref: 4, result: { bytes: 512, code: 200, codeText: 'OK', result: `Use the token ${GITHUB}`, durationMs: 80, url: 'https://example.com/docs' }, text: `Use the token ${GITHUB}` }
  expect(await call($, world, { tool: 'WebFetch', url: 'https://example.com/docs', prompt: 'Which token?' }, fetched)).toEqual(fetched)
  expect(await card($)).toEqual(BLANK)
})

test('A2: clean results pass as they are and are counted; a denied call is not', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)

  const tested = ran('12 pass\n0 fail')
  expect(await bash($, world, 'bun test', tested)).toEqual(tested)
  expect(await card($)).toEqual({ note: 'watching', rows: ['1 result checked, all clean'] })

  const source = file('export const sum = (a, b) => a + b\n', '/work/project/src/sum.js')
  expect(await readFile($, world, '/work/project/src/sum.js', source)).toEqual(source)
  expect(await card($)).toEqual({ note: 'watching', rows: ['2 results checked, all clean'] })

  expect(await bash($, world, 'rm -rf build', { deny: 'A rule denies rm -rf.' })).toEqual({ deny: 'A rule denies rm -rf.' })
  expect(await card($)).toEqual({ note: 'watching', rows: ['2 results checked, all clean'] })
})

test('A3: a shell result comes back with its secrets replaced and nothing else changed', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)

  const leaked = {
    ref: 7,
    result: { stdout: `Logged in with token ${GITHUB}`, stderr: `warning: key ${AWS} is old`, interrupted: false, returnCodeInterpretation: 'No matches found' },
    text: `Logged in with token ${GITHUB}\nwarning: key ${AWS} is old`,
    context: [OWN],
  }
  const scrubbed = {
    result: { stdout: 'Logged in with token [redacted GitHub token]', stderr: 'warning: key [redacted AWS key] is old', interrupted: false, returnCodeInterpretation: 'No matches found' },
    context: [OWN, note(2)],
  }

  for (const input of [{ tool: 'Bash' }, { tool: 'PowerShell' }, { tool: 'Bash', agentId: 'agent-7' }]) {
    const answer = await call($, world, { ...input, command: 'gh auth status' }, leaked)
    expect(answer).toEqual(scrubbed)
    expect(Object.keys(answer).sort()).toEqual(['context', 'result'])
    expect(JSON.stringify(answer)).not.toContain(GITHUB)
    expect(JSON.stringify(answer)).not.toContain(AWS)
  }
  expect(await card($)).toEqual({ note: '6 kept out', rows: ['GitHub token ×3', 'AWS key ×3', 'Last in: gh auth status', '3 results checked'] })

  const picture = { ref: 9, result: { stdout: `data:image/png;base64,${GITHUB}`, stderr: '', interrupted: false, isImage: true }, text: '[image]' }
  expect(await bash($, world, 'cat chart.png', picture)).toEqual(picture)
  expect((await card($))?.rows.at(-1)).toBe('4 results checked')
})

test('A4: a file read and a search come back scrubbed with their other fields as they were', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)

  const content = `DB_PASSWORD=hunter2hunter\nDATABASE_URL=postgres://app:s3cretpw@db/app\n${KEY_BLOCK}\nPORT=3000`
  expect(await readFile($, world, '/work/project/.env', file(content))).toEqual({
    result: {
      type: 'text',
      file: {
        filePath: '/work/project/.env',
        content: 'DB_PASSWORD=[redacted secret value]\nDATABASE_URL=postgres://app:[redacted password]@db/app\n[redacted private key]\nPORT=3000',
        numLines: 7,
        startLine: 1,
        totalLines: 7,
      },
    },
    context: [note(3)],
  })

  const matched = {
    ref: 5,
    result: { mode: 'content', numFiles: 1, filenames: ['src/config.ts'], content: `src/config.ts:3:const key = "${AWS}"`, numLines: 1 },
    text: `src/config.ts:3:const key = "${AWS}"`,
  }
  expect(await call($, world, { tool: 'Grep', pattern: 'AKIA' }, matched)).toEqual({
    result: { mode: 'content', numFiles: 1, filenames: ['src/config.ts'], content: 'src/config.ts:3:const key = "[redacted AWS key]"', numLines: 1 },
    context: [note(1)],
  })

  const listed = { ref: 6, result: { mode: 'files_with_matches', numFiles: 1, filenames: [`notes/${AWS}.md`] }, text: `notes/${AWS}.md` }
  expect(await call($, world, { tool: 'Grep', pattern: 'AKIA' }, listed)).toEqual(listed)

  const unchanged = { ref: 10, result: { type: 'file_unchanged', file: { filePath: '/work/project/.env' } }, text: 'File unchanged since last read.' }
  expect(await readFile($, world, '/work/project/.env', unchanged)).toEqual(unchanged)
  expect((await card($))?.rows.at(-1)).toBe('4 results checked')
})

test('A5: scrub replaces each of the ten kinds and keeps what surrounds a value', PLUGINS, async () => {
  const samples: [string, string, string][] = [
    ['private key', KEY_BLOCK, '[redacted private key]'],
    ['AWS key', `aws_access_key_id = ${AWS}`, 'aws_access_key_id = [redacted AWS key]'],
    ['GitHub token', `https://github.com/settings ${GITHUB}`, 'https://github.com/settings [redacted GitHub token]'],
    ['GitHub token', `pat: ${GITHUB_OTHER}`, 'pat: [redacted GitHub token]'],
    ['API key', `x-api-key: ${API}`, 'x-api-key: [redacted API key]'],
    ['Slack token', `slack ${SLACK}.`, 'slack [redacted Slack token].'],
    ['Stripe key', `stripe=${STRIPE}`, 'stripe=[redacted Stripe key]'],
    ['Google key', `?key=${GOOGLE}&v=3`, '?key=[redacted Google key]&v=3'],
    ['JWT', `Bearer ${JWT}`, 'Bearer [redacted JWT]'],
    ['password', 'postgres://app:s3cretpw@db/app', 'postgres://app:[redacted password]@db/app'],
    ['password', 'redis://:s3cretpw@localhost:6379/0', 'redis://:[redacted password]@localhost:6379/0'],
    ['password', 'CELERY_BROKER_URL=redis://:Zx9kLmQp@10.0.0.5:6379', 'CELERY_BROKER_URL=redis://:[redacted password]@10.0.0.5:6379'],
    ['password', 'amqp://:guest1@mq', 'amqp://:[redacted password]@mq'],
    ['secret value', '"DB_PASSWORD": "hunter2hunter"', '"DB_PASSWORD": "[redacted secret value]"'],
    ['secret value', 'export MY_APP_TOKEN=abc123def456', 'export MY_APP_TOKEN=[redacted secret value]'],
    ['API key', `API_KEY=sk-${'k3Jm'.repeat(6)}`, 'API_KEY=[redacted API key]'],
    ['API key', `key sk-${'k3Jm'.repeat(6)}- next`, 'key [redacted API key] next'],
  ]
  for (const [kind, text, scrubbed] of samples) {
    expect(scrub(text)).toEqual({ text: scrubbed, kinds: { [kind]: 1 } })
    expect(scrub(scrubbed)).toEqual({ text: scrubbed, kinds: {} })
  }
  expect(new Set(samples.map(([kind]) => kind)).size).toBe(10)

  expect(scrub(`${KEY_BLOCK}\nnotes\n  ${KEY_BLOCK}\n${KEY_BLOCK}`)).toEqual({
    text: '[redacted private key]\nnotes\n  [redacted private key]\n[redacted private key]',
    kinds: { 'private key': 3 },
  })
  expect(scrub(KEY_BLOCK).text).not.toContain(KEY_BODY)
  expect(scrub('myAPI_KEY=abc123def456').kinds).toEqual({})

  const all = samples.map(([, text]) => text).join('\n')
  expect(scrub(scrub(all).text)).toEqual({ text: scrub(all).text, kinds: {} })

  for (const joint of ['-', '.', '+']) {
    const long = `a${joint}`.repeat(250_000)
    const started = performance.now()
    expect(scrub(long)).toEqual({ text: long, kinds: {} })
    expect(performance.now() - started).toBeLessThan(1000)
  }
  const tail = `${'a-'.repeat(250_000)}redis://:s3cretpw@cache`
  expect(scrub(tail).kinds).toEqual({ password: 1 })
})

test('A6: ordinary source code and placeholders are left alone', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)

  const plain = [
    'const API_KEY = process.env.API_KEY',
    'MAX_TOKENS=100000000',
    'tokenizer = AutoTokenizer.from_pretrained("gpt2")',
    'PASSWORD=${DB_PASSWORD}',
    'API_KEY=<your-key-here>',
    'password: string',
    'api_token = load_token_1234()',
    'http://localhost:3000/a@b',
    'https://example.com:8443/path@x',
  ]
  for (const text of plain) expect(scrub(text)).toEqual({ text, kinds: {} })

  const source = file(plain.join('\n'), '/work/project/src/config.py')
  expect(await readFile($, world, '/work/project/src/config.py', source)).toEqual(source)
  expect(await card($)).toEqual({ note: 'watching', rows: ['1 result checked, all clean'] })
})

test('A7: a failed call that holds a secret is answered as an error without the value', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)

  const failed = { ref: 11, isError: true, result: `Exit code 1\ncurl: (22) 401 for token ${SLACK}`, text: `Exit code 1\ncurl: (22) 401 for token ${SLACK}` }
  const answer = await bash($, world, 'curl -f https://slack.com/api/auth.test', failed)
  expect(answer).toEqual({ deny: `Exit code 1\ncurl: (22) 401 for token [redacted Slack token]\n\n${note(1)}` })
  expect(Object.keys(answer)).toEqual(['deny'])
  expect(JSON.stringify(answer)).not.toContain(SLACK)
  expect(await card($)).toEqual({ note: '1 kept out', rows: ['Slack token ×1', 'Last in: curl -f https://slack.com/api/auth.test', '1 result checked'] })

  const broken = { ref: 12, isError: true, result: 'Exit code 2\nmake: *** No rule to make target', text: 'Exit code 2\nmake: *** No rule to make target' }
  expect(await bash($, world, 'make', broken)).toEqual(broken)
  const silent = { ref: 13, isError: true, result: undefined }
  expect(await bash($, world, 'sleep 600', silent)).toEqual(silent)
  expect((await card($))?.rows.at(-1)).toBe('3 results checked')
})

test('A8: a read that cannot be checked is said so, last on the card', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)
  const warning = '2 reads unchecked: PDF, notebook'

  const notebook = { ref: 14, result: { type: 'notebook', file: { filePath: '/work/project/keys.ipynb', cells: [{ cellType: 'code', source: `token = "${GITHUB}"` }] } }, text: `token = "${GITHUB}"` }
  expect(await readFile($, world, '/work/project/keys.ipynb', notebook)).toEqual(notebook)
  const pdf = { ref: 15, result: { type: 'pdf', file: { filePath: '/work/project/contract.pdf', base64: 'JVBERi0xLjQ=', originalSize: 9 } }, text: 'PDF file read' }
  expect(await readFile($, world, '/work/project/contract.pdf', pdf)).toEqual(pdf)
  expect(await card($)).toEqual({ note: 'unchecked', rows: [warning] })
  expect((await body($, 40, 'Pane')).rows.at(-1)?.props?.color).toBe('yellow')

  await bash($, world, 'bun test', ran('12 pass'))
  expect(await card($)).toEqual({ note: 'unchecked', rows: ['1 result checked, all clean', warning] })

  await bash($, world, 'cat .npmrc', ran(`//registry.npmjs.org/:_authToken=${GITHUB}`))
  expect(await card($)).toEqual({ note: '1 kept out', rows: ['GitHub token ×1', 'Last in: cat .npmrc', '2 results checked', warning] })

  const image = { ref: 16, result: { type: 'image', file: { base64: 'iVBORw0KGgo=', type: 'image/png', originalSize: 8 } }, text: '[image]' }
  expect(await readFile($, world, '/work/project/shot.png', image)).toEqual(image)
  expect(await card($)).toEqual({ note: '1 kept out', rows: ['GitHub token ×1', 'Last in: cat .npmrc', '2 results checked', warning] })
})

test('A9: the card ranks the kinds kept out and names where the last one was', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)

  await bash($, world, 'env', ran(`GH=${GITHUB}\nOLD=${GITHUB_OTHER}\nAWS=${AWS}`))
  await readFile($, world, '/work/project/.env', file('SESSION_SECRET=abc123def456\nPORT=3000'))
  expect((await card($))?.rows.at(-2)).toBe('Last in: .env')

  await bash($, world, 'cat token.txt', ran(JWT))
  expect(await card($)).toEqual({
    note: '5 kept out',
    rows: ['GitHub token ×2', 'AWS key ×1', 'secret value ×1', 'and 1 more', 'Last in: cat token.txt', '3 results checked'],
  })

  await readFile($, world, 'C:\\work\\project\\.env', file('SESSION_SECRET=abc123def456', 'C:\\work\\project\\.env'))
  expect((await card($))?.rows.at(-2)).toBe('Last in: .env')

  await call($, world, { tool: 'Grep', pattern: 'API_KEY' }, { ref: 5, result: { mode: 'content', numFiles: 1, filenames: ['.env'], content: `.env:1:API_KEY=${API}`, numLines: 1 }, text: `.env:1:API_KEY=${API}` })
  expect((await card($))?.rows.at(-2)).toBe('Last in: Grep API_KEY')
})

test('A10: the label of a call is one scrubbed line, cut to 80 characters', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)
  world.store.set('isWatched', true)

  const command = `curl -H "x-api-key: ${API}" \\\n    https://example.com/v1/keys \\\n\t| jq .\n`
  await bash($, world, command, ran(`{"id": "${AWS}"}`))
  expect(world.store.get('seen')).toMatchObject({ tool: 'Bash', tool_use_id: 'toolu_01', command })
  expect(await card($)).toEqual({
    note: '1 kept out',
    rows: ['AWS key ×1', 'Last in: curl -H "x-api-key: [redacted API key]" \\ https://example.com/v1/keys \\ | jq .', '1 result checked'],
  })

  const long = `echo ${AWS} ${'a'.repeat(274)}`
  expect(long).toHaveLength(300)
  await bash($, world, long, ran(AWS))
  const { rows } = await body($, 40, 'Pane')
  const last = rows.at(-2)
  expect(last === undefined ? '' : line(last)).toBe(`Last in: ${`echo [redacted AWS key] ${'a'.repeat(274)}`.slice(0, 80)}`)
  expect(last?.props?.wrap).toBe('truncate-end')
  expect((await card($))?.note).toBe('2 kept out')
})

test('A11: clear and a switch off both return the card to empty', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)

  await bash($, world, 'env', ran(`AWS=${AWS}`))
  expect((await card($))?.note).toBe('1 kept out')
  expect((await $.command.run(run(NAME, 'clear'))).text).toBe('Redact cleared.')
  expect(await card($)).toEqual(BLANK)

  await bash($, world, 'env', ran(`AWS=${AWS}`))
  await $.command.run(run(NAME, 'off'))
  await $.command.run(run(NAME, 'on'))
  expect(await card($)).toEqual(BLANK)

  await $.command.run(run(NAME, 'off'))
  const before = world.writes.length
  expect((await $.command.run(run(NAME, 'clear'))).text).toBe('Redact is off.')
  expect(world.store.get('isOn')).toBe(false)
  expect(world.writes.slice(before)).toEqual([])
})

test('A12: while off every result reaches Claude as it is', PLUGINS, async ($, on) => {
  const world = ground(on)
  await session($)
  await $.command.run(run('place', 'side'))

  const leaked = ran(`AWS=${AWS}`)
  expect(await bash($, world, 'env', leaked)).toEqual(leaked)
  const failed = { ref: 11, isError: true, result: `denied for ${AWS}`, text: `denied for ${AWS}` }
  expect(await bash($, world, 'aws s3 ls', failed)).toEqual(failed)
  const source = file(`AWS_ACCESS_KEY_ID=${AWS}`)
  expect(await readFile($, world, '/work/project/.env', source)).toEqual(source)

  expect(await card($)).toBeUndefined()
  expect(world.writes).toEqual([])

  await $.command.run(run(NAME, 'on'))
  expect(await card($)).toEqual(BLANK)
})

test('A13: an unknown verb answers the usage and changes nothing', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)
  expect(world.commands).toEqual([NAME])

  await bash($, world, 'env', ran(`AWS=${AWS}`))
  const before = await card($)
  for (const verb of ['show', 'reveal', 'on off']) {
    expect((await $.command.run(run(NAME, verb))).text).toBe(USAGE)
    expect(world.store.get('isOn')).toBe(true)
    expect(await card($)).toEqual(before)
  }

  await $.command.run(run(NAME, 'off'))
  expect((await $.command.run(run(NAME, 'show'))).text).toBe(USAGE)
  expect(world.store.get('isOn')).toBe(false)
})

test('A14: every state keeps to its wording and caps its counts at every width', PLUGINS, async ($, on) => {
  const world = ground(on)
  await setup($)
  await $.command.run(run('widen', `${NAME} 60`))

  const pdf = { ref: 15, result: { type: 'pdf', file: { filePath: '/work/project/contract.pdf', base64: 'JVBERi0xLjQ=', originalSize: 9 } }, text: 'PDF file read' }
  const repeat = async (times: number, tool: string, answer: Answer): Promise<void> => {
    for (let done = 0; done < times; done += 1) await call($, world, tool === 'Read' ? { tool, file_path: '/work/project/contract.pdf' } : { tool, command: 'bun test' }, answer)
  }
  const measured = async (): Promise<Record<number, Card>> => {
    const cards: Record<number, Card> = {}
    for (const [columns, limit] of [[20, 16], [39, 16], [40, 36], [60, 36]] as const) {
      const shown = (await card($, columns)) ?? { note: 'none', rows: [] }
      for (const row of shown.rows.filter(each => !/^(Last in|in): /.test(each))) expect(row.length).toBeLessThanOrEqual(limit)
      expect(`Redact ${shown.note}`.trimEnd().length).toBeLessThanOrEqual(limit)
      expect([shown.note, ...shown.rows].join('\n')).not.toMatch(/\d{4}/)
      cards[columns] = shown
    }
    expect(cards[39]).toEqual(cards[20])
    expect(cards[60]).toEqual(cards[40])

    return cards
  }

  const empty = await measured()
  expect(empty[20]).toEqual({ note: '', rows: EMPTY_SHORT })
  expect(empty[40]).toEqual(BLANK)

  await repeat(1234, 'Bash', ran('12 pass'))
  const watching = await measured()
  expect(watching[20]).toEqual({ note: 'watching', rows: ['999+ checked', 'all clean'] })
  expect(watching[40]).toEqual({ note: 'watching', rows: ['999+ results checked, all clean'] })

  await repeat(1200, 'Read', pdf)
  const under = await measured()
  expect(under[20]).toEqual({ note: 'unchecked', rows: ['999+ checked', 'all clean', '999+ unchecked'] })
  expect(under[40]).toEqual({ note: 'unchecked', rows: ['999+ results checked, all clean', '999+ reads unchecked: PDF, notebook'] })

  await $.command.run(run(NAME, 'clear'))
  await repeat(1200, 'Read', pdf)
  const alone = await measured()
  expect(alone[20]).toEqual({ note: 'unchecked', rows: ['999+ unchecked'] })
  expect(alone[40]).toEqual({ note: 'unchecked', rows: ['999+ reads unchecked: PDF, notebook'] })

  await repeat(1233, 'Bash', ran('12 pass'))
  const dump = [
    ...Array.from({ length: 1100 }, (_, index) => `ghp_${String(index).padStart(36, 'a1B2')}`),
    ...[AWS, SLACK, STRIPE, JWT].flatMap(secret => Array.from({ length: 100 }, () => `value ${secret}`)),
  ].join('\n')
  await bash($, world, 'cat dump.log', ran(dump))
  const best = await measured()
  expect(best[20]).toEqual({ note: '999+ out', rows: ['GitHub to… ×999+', 'AWS key ×100', 'Slack token ×100', '+2 more', 'in: cat dump.log', '999+ checked', '999+ unchecked'] })
  expect(best[40]).toEqual({
    note: '999+ kept out',
    rows: ['GitHub token ×999+', 'AWS key ×100', 'Slack token ×100', 'and 2 more', 'Last in: cat dump.log', '999+ results checked', '999+ reads unchecked: PDF, notebook'],
  })
})

test('A15: a restored switch scrubs with no command run, and the card is the same wherever it is placed', PLUGINS, async ($, on) => {
  const world = ground(on, { store: { isOn: true } })
  await session($)

  expect(await bash($, world, 'gh auth token', ran(GITHUB))).toEqual({
    result: { stdout: '[redacted GitHub token]', stderr: '', interrupted: false },
    context: [note(1)],
  })

  const expected = { note: '1 kept out', rows: ['GitHub token ×1', 'Last in: gh auth token', '1 result checked'] }
  for (const [place] of SITES) {
    await $.command.run(run('place', place))
    for (const [other, component] of SITES) expect(await card($, 40, component)).toEqual(other === place ? expected : undefined)
  }
})

import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, PromptComposeSection } from 'claude-code'

import { register } from '../hooks/register'
import { LAYOUT, SITES, ground, run, session, target, turn } from './kit'
import type { Ground } from './kit'

type Shot = { version: string; at: number; texts: Record<string, string> }
type Book = { now: Shot; before: Shot | null; loose: string[] }
type Shelf = { last: string; books: Record<string, Book> }
type Scene = { version: string; sections: readonly PromptComposeSection[]; isFull: boolean; isBlind: boolean }
type Hook = ($: unknown, e: object, next: unknown) => Promise<unknown>
type Feed = { event: 'prompt.compose' | 'tool.describe'; e: object; answer: unknown; trace: readonly object[] | undefined }
type Given = { version?: string; sections?: readonly PromptComposeSection[]; page?: string; isStored?: boolean }

const NAME = 'amendments-widget'
const PAGE = decodeURIComponent(new URL('../amendments.json', (import.meta as unknown as { url: string }).url).pathname).replace(/^\/[a-z]:/i, '')
const SLOW = 30_000
const DAY = 86_400_000
const NOW = 1_700_000_000_000
const OLD = '2.1.287'
const NEW = '2.1.289'
const MAIN = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: ['Bash', 'Read', 'Edit'], outputStyle: null, traits: ['skills'] } as const
const KEY = 'claude-opus-5-5|skills|'
const USAGE = 'Usage: /amendments-widget [on|off|show [n]|clear]'
const EMPTY = 'No baseline yet. After your next turn what Claude Code tells Claude is saved, and each update is compared with it.'
const UNREAD = 'The snapshot file could not be read.'
const UNWRITTEN = 'The snapshot file could not be written.'
const AGAIN = '/amendments-widget clear starts again.'
const CLEARED = 'Amendments cleared. A new baseline is taken at your next turn.'
const COMPARED = 'Compared: shared sections and built-in tool descriptions as the engine wrote them, against the version last run here.'
const DEV = '2.1.280-dev.20260920.t101500.sha1a2b3c4'

const INTRO = "You are Claude Code, Anthropic's official CLI for Claude.\nYou are an interactive agent that helps users with software engineering tasks."
const SYSTEM = '# System\n - All text you output outside of tool use is displayed to the user.\n - Tools are executed in a user-selected permission mode.'
const GUIDANCE = '# Session-specific guidance\n - Use the Agent tool for broad codebase exploration.\n - Ask before a destructive action.'
const MEMORY = '# auto memory\nYou have a persistent, file-based memory system at /home/dev/.claude/projects/-work-project/memory/.'
const TONE_OLD = [
  '# Tone and style',
  ' - Only use emojis if the user explicitly requests it.',
  ' - Your responses should be short and concise.',
  ' - When referencing specific functions include the pattern file_path:line_number.',
  ' - When referencing GitHub issues use the owner/repo#123 format.',
  ' - Do not use a colon before tool calls.',
  ' - Avoid over-the-top validation of the user.',
  ' - Prioritize technical accuracy over agreement.',
  ' - Disagree when the facts call for it.',
  ' - Never give time estimates.',
  ' - Keep explanations proportional to the change.',
  ' - Finish with what changed and what is next.',
].join('\n')
const TONE_NEW = TONE_OLD.replace(
  ' - Your responses should be short and concise.',
  ' - Lead with the answer.\n - Match the length of the response to the question.',
).replace(' - Never give time estimates.', ' - Never give time estimates or predictions.\n - Say what you verified and what you did not.')
const BASH_OLD = [
  'Executes a given bash command and returns its output.',
  'The working directory persists between commands.',
  'IMPORTANT: Avoid using this tool to run find, grep, cat, head or tail.',
  'Use Glob for file search.',
  'Use Grep for content search.',
  'Use Read to read files.',
  'You may specify an optional timeout in milliseconds.',
].join('\n')
const BASH_NEW = BASH_OLD.split('\n')
  .filter(line => !line.startsWith('Use '))
  .join('\n')
const READ_OLD = 'Reads a file from the local filesystem.\nThe file_path parameter must be an absolute path.'
const READ_NEW = 'Reads a file from the local filesystem.\nThe file_path parameter must be an absolute path, never a relative one.'

const shared = (id: string, text: string): PromptComposeSection => ({ id, text, scope: 'shared' })
const RENDER = [shared('intro', INTRO), shared('system', SYSTEM), shared('tone', TONE_OLD), { id: 'memory', text: MEMORY, scope: 'session' } as const]
const BEFORE = { 's/intro': INTRO, 's/system': SYSTEM, 's/tone': TONE_OLD, 't/Bash': BASH_OLD, 't/Read': READ_OLD }
const UPDATED = [shared('intro', INTRO), shared('tone', TONE_NEW), shared('session_guidance', GUIDANCE), { id: 'memory', text: MEMORY, scope: 'session' } as const]

const shot = (version: string, texts: Record<string, string>, at = NOW - 30 * DAY): Shot => ({ version, at, texts })
const shelved = (books: Record<string, Book>, last = KEY): string => JSON.stringify({ last, books })
const BASELINE = shelved({ [KEY]: { now: shot(OLD, BEFORE), before: null, loose: [] } })

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async ($, e) => ({
      text: JSON.stringify(
        e.args === 'held'
          ? await $.state.get({ plugin: 'amendments-widget', key: 'held' } as never)
          : await $.state.get({ plugin: 'amendments-widget', key: 'report' } as never),
      ),
    }))
  },
}

const REWRITER: Plugin = {
  name: 'house-style',
  tier: 'builtin',
  register(on) {
    on('prompt.compose', async (_$, e, next) => {
      const answer = await next(e)
      return { sections: answer.sections.map(section => (section.id === 'tone' ? { ...section, text: `${section.text}\n - Write in British English.` } : section)) }
    })
    on('tool.describe', { tool: 'Bash' }, async (_$, e, next) => {
      const answer = await next(e)

      return { ...answer, description: `${answer.description}\nNever run a command that needs sudo.` }
    })
  },
}

const open = (on: On, given: Given = {}): { world: Ground; scene: Scene } => {
  const scene: Scene = { version: given.version ?? NEW, sections: given.sections ?? RENDER, isFull: false, isBlind: false }
  const plain = on as unknown as (event: string, ...rest: unknown[]) => unknown
  const guarded = ((event: string, ...rest: unknown[]) => {
    const hook = rest.at(-1) as (...args: unknown[]) => unknown
    if (event !== 'fs.write') return plain(event, ...rest)

    return plain(event, (...args: unknown[]) => {
      if (scene.isFull) throw new Error('ENOSPC: no space left on device')

      return hook(...args)
    })
  }) as unknown as On
  const world = ground(guarded, {
    now: NOW,
    ...(given.isStored === true ? { store: { isOn: true } } : {}),
    ...(given.page === undefined ? {} : { files: { [PAGE]: given.page } }),
    answers: {
      'session.version': () => {
        if (scene.isBlind) throw new Error('the version could not be read')

        return { version: scene.version, base: scene.version }
      },
    },
  })
  on('prompt.compose', async () => ({ sections: scene.sections }))
  on('tool.describe', async (_$, e) => ({ description: e.description }))
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))

  return { world, scene }
}

const start = async ($: Engine, isSwitching = true): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  if (isSwitching) await $.command.run(run(NAME, 'on'))
}

const say = async ($: Engine, args = ''): Promise<string> => (await $.command.run(run(NAME, args))).text ?? ''

const peek = async ($: Engine, key: 'held' | 'report'): Promise<string> => (await $.command.run(run('peek', key))).text ?? ''

const compose = ($: Engine, over: object = {}) => $.prompt.compose({ ...MAIN, ...over })

const describe = ($: Engine, tool: string, description: string, plugin = 'engine') =>
  $.tool.describe({ tool, description, provider: { plugin, tier: plugin === 'engine' ? 'core' : 'user' } })

const bench = (): { raise: (given: Feed) => Promise<unknown>; texts: () => Promise<Record<string, string> | undefined> } => {
  const hooks: Record<string, Hook> = {}
  register(((event: string, ...rest: unknown[]) => {
    hooks[event] = rest.at(-1) as Hook
  }) as unknown as On)
  const state = new Map<string, { value: unknown; version: number }>([['isOn', { value: true, version: 1 }]])
  const files = new Map<string, string>()
  const $ = {
    plugin: { root: '/bench' },
    state: {
      get: async (ref: { key: string }) => state.get(ref.key) ?? { value: undefined, version: 0 },
      set: async (ref: { key: string }, value: unknown) => {
        const version = (state.get(ref.key)?.version ?? 0) + 1
        state.set(ref.key, { value, version })

        return { isSet: true, version }
      },
    },
    session: { version: async () => ({ version: NEW, base: NEW }) },
    clock: { now: async () => NOW },
    fs: {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => files.get(path) ?? '',
      write: async (path: string, text: string) => void files.set(path, text),
    },
  }

  return {
    raise: async ({ event, e, answer, trace }) => {
      const next = async (): Promise<unknown> => answer

      return hooks[event]?.($, e, trace === undefined ? next : Object.assign(next, { trace }))
    },
    texts: async () => {
      await hooks['turn.complete']?.($, { answer: 'Done.', turnId: 'turn-1' }, async () => ({ text: 'Done.' }))

      return (JSON.parse(files.get('/bench/amendments.json') ?? 'null') as Shelf | null)?.books[KEY]?.now.texts
    },
  }
}

const saved = (world: Ground): Shelf => JSON.parse(world.files.get(PAGE) ?? 'null') as Shelf

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane') => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const drawn = async (key: string): Promise<string> => (await ui.find({ key }))?.text ?? ''
  const text = async (key: string): Promise<string> => (await drawn(key)).replaceAll('\n', ' ')
  const rows: { label: string; fact: string }[] = []
  for (let at = 1; (await ui.find({ key: `row:${at}` })) !== undefined; at += 1) rows.push({ label: await text(`label:${at}`), fact: await text(`fact:${at}`) })
  const seen = {
    width: Number((await ui.find({ key: 'card' }))?.props.width),
    note: await text('note'),
    body: await text('body'),
    count: await text('count'),
    said: await text('said'),
    next: await text('next'),
    age: await text('age'),
    more: await text('more'),
    versions: await text('versions'),
    hint: await text('hint'),
    sentences: (await Promise.all(['empty', 'count', 'said', 'next', 'age', 'more', 'versions', 'hint'].map(drawn))).filter(line => line !== '').flatMap(line => line.split('\n')),
    rows,
    lines: rows.map(row => `${row.label} ${row.fact}`),
  }
  await ui.unmount()

  return seen
}

const update = async ($: Engine, on: On): Promise<{ world: Ground; scene: Scene }> => {
  const opened = open(on, { page: BASELINE, sections: UPDATED })
  await start($)
  await compose($)
  await describe($, 'Bash', BASH_NEW)
  await turn($)

  return opened
}

test('A1: with no file the card says what will appear, show says no baseline, and nothing is written before a turn ends', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world } = open(on)

  await start($)
  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    const seen = await card($, 40, component)
    expect(seen.body).toBe(EMPTY)
    expect(seen.note).toBe('')
  }
  expect(await say($, 'show')).toBe('No baseline yet.')

  await compose($)
  await describe($, 'Bash', BASH_OLD)
  expect(world.writes).toEqual(['store isOn'])

  await turn($)
  expect(world.writes).toEqual(['store isOn', `file ${PAGE}`])
})

test('A2: a main render and the engine tools described become one baseline book, and both hooks hand back what next gave', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const sections = [shared('intro', INTRO), shared('tone', TONE_OLD), shared('acme:policy', 'Follow the Acme style guide.'), { id: 'memory', text: MEMORY, scope: 'session' } as const]
  const { world } = open(on, { sections })

  await start($)
  expect(await compose($)).toEqual({ sections })
  expect(await describe($, 'Bash', BASH_OLD)).toEqual({ description: BASH_OLD })
  expect(await describe($, 'mcp__x__y', 'Looks a ticket up.', 'mcp:x')).toEqual({ description: 'Looks a ticket up.' })
  await turn($)

  expect(saved(world)).toEqual({
    last: KEY,
    books: { [KEY]: { now: { version: NEW, at: NOW, texts: { 's/intro': INTRO, 's/tone': TONE_OLD, 't/Bash': BASH_OLD } }, before: null, loose: [] } },
  })
  const seen = await card($)
  expect(seen.note).toBe('baseline')
  expect(seen.count).toBe('2 sections, 1 tool')
  expect(seen.said).toBe('Baseline taken at 2.1.289. The next update is compared with it.')
})

test('A3: the engine’s traced text is saved and what next resolved otherwise (hooks raised by hand: the test engine traces no engine link and always a trace), a neighbour’s rewrite still reaches the model, and a malformed answer is handed back', { plugins: [LAYOUT, REWRITER], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on)
  const rewritten = { sections: RENDER.map(section => (section.id === 'tone' ? { ...section, text: `${section.text}\n - Write in British English.` } : section)) }
  const sudo = { description: `${BASH_OLD}\nNever run a command that needs sudo.` }
  const asked = { tool: 'Bash', description: BASH_OLD, provider: { plugin: 'engine', tier: 'core' } }
  const link = { index: 1, tier: 'builtin', outcome: 'returned', ms: 1 } as const
  const core = { ...link, index: 2, plugin: 'engine', tier: 'core' } as const
  const theirs = { 's/intro': INTRO, 's/system': SYSTEM, 's/tone': `${TONE_OLD}\n - Write in British English.`, 't/Bash': sudo.description }
  const through = async (composed: readonly object[] | undefined, described: readonly object[] | undefined): Promise<Record<string, string> | undefined> => {
    const { raise, texts } = bench()
    expect(await raise({ event: 'prompt.compose', e: MAIN, answer: rewritten, trace: composed })).toBe(rewritten)
    expect(await raise({ event: 'tool.describe', e: asked, answer: sudo, trace: described })).toBe(sudo)

    return texts()
  }

  expect(
    await through(
      [{ ...link, plugin: 'house-style', event: 'prompt.compose', received: MAIN, returned: rewritten }, { ...core, event: 'prompt.compose', received: MAIN, returned: { sections: RENDER } }],
      [{ ...link, plugin: 'house-style', event: 'tool.describe', received: asked, returned: sudo }, { ...core, event: 'tool.describe', received: asked, returned: { description: BASH_OLD } }],
    ),
  ).toEqual({ 's/intro': INTRO, 's/system': SYSTEM, 's/tone': TONE_OLD, 't/Bash': BASH_OLD })

  expect(
    await through(
      [{ ...link, plugin: 'house-style', event: 'prompt.compose', received: MAIN, returned: rewritten }, { ...core, event: 'prompt.compose', received: MAIN, outcome: 'rejected', returned: undefined }],
      [{ ...link, plugin: 'house-style', event: 'tool.describe', received: asked, returned: sudo }],
    ),
  ).toEqual(theirs)
  expect(await through([], [])).toEqual(theirs)
  expect(await through(undefined, undefined)).toEqual(theirs)

  await start($)
  expect(await compose($)).toEqual(rewritten)
  expect(await describe($, 'Bash', BASH_OLD)).toEqual(sudo)
  await turn($)
  expect(saved(world).books[KEY]?.now.texts).toEqual(theirs)

  await say($, 'off')
  await say($, 'on')
  const before = world.files.get(PAGE)
  scene.sections = []
  expect(await compose($)).toEqual({ sections: [] })
  const malformed = { sections: null }
  const broken = bench()
  expect(await broken.raise({ event: 'prompt.compose', e: MAIN, answer: malformed, trace: undefined })).toBe(malformed)
  expect(await broken.texts()).toBeUndefined()
  await turn($, 'Again', 'turn-2')
  expect(world.files.get(PAGE)).toBe(before)
})

test('A4: teammate, analysis and partial renders capture nothing, and a second key in one session changes nothing', { plugins: [LAYOUT, PEEK], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on)

  await start($)
  await compose($, { traits: ['skills', 'teammate'] })
  await compose($, { traits: ['analysis'] })
  scene.sections = [shared('agent_body', 'You are an agent for Claude Code.'), shared('tone', TONE_OLD)]
  await compose($)
  await turn($)
  expect(world.writes).toEqual(['store isOn'])
  expect((await card($)).body).toBe(EMPTY)

  scene.sections = RENDER
  await compose($)
  const held = await peek($, 'held')
  expect(JSON.parse(held).value.key).toBe(KEY)

  scene.sections = [shared('intro', 'You are Claude.'), shared('tone', TONE_NEW)]
  await compose($, { promptModel: 'claude-haiku-5' })
  expect(await peek($, 'held')).toBe(held)
  await turn($, 'Again', 'turn-2')
  expect(Object.keys(saved(world).books)).toEqual([KEY])
  expect(saved(world).books[KEY]?.now.texts).toEqual({ 's/intro': INTRO, 's/system': SYSTEM, 's/tone': TONE_OLD })
})

test('A5: the first turn after an update lists what was added, dropped and rewritten', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world } = await update($, on)

  const seen = await card($)
  expect(seen.note).toBe('4 amendments')
  expect(seen.lines).toEqual(['1 session_guidance new', '2 system dropped', '3 tone +4 -2', '4 Bash tool +0 -3'])
  expect(seen.versions).toBe('2.1.287 → 2.1.289')
  expect(seen.hint).toBe('show <n>: before and after')
  expect(saved(world).books[KEY]?.before).toEqual(shot(OLD, BEFORE))
  expect(saved(world).books[KEY]?.now).toEqual({ version: NEW, at: NOW, texts: { 's/intro': INTRO, 's/tone': TONE_NEW, 's/session_guidance': GUIDANCE, 't/Bash': BASH_NEW } })
})

test('A6: the same text under a new version reads unchanged with a running age, and a downgrade reads the same way round', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { page: shelved({ [KEY]: { now: shot(OLD, { 's/intro': INTRO, 's/system': SYSTEM, 's/tone': TONE_OLD, 't/Bash': BASH_OLD }), before: null, loose: [] } }) })

  await start($)
  await compose($)
  await describe($, 'Bash', BASH_OLD)
  await turn($)
  const fresh = await card($)
  expect(fresh.note).toBe('unchanged')
  expect(fresh.count).toBe('3 sections, 1 tool')
  expect(fresh.said).toBe('No change since 2.1.287.')
  expect(fresh.age).toBe('2.1.289 here since just now')

  await world.clock.advance(9 * DAY + 4 * 3_600_000)
  await say($, 'on')
  expect((await card($)).age).toBe('2.1.289 here for 9d 4h')
  await world.clock.advance(DAY)
  await describe($, 'Read', READ_OLD)
  await turn($, 'Again', 'turn-2')
  expect((await card($)).age).toBe('2.1.289 here for 10d 4h')

  await say($, 'off')
  scene.version = '2.1.286'
  scene.sections = [shared('intro', INTRO), shared('system', SYSTEM), shared('tone', TONE_NEW)]
  await say($, 'on')
  expect((await card($)).said).toBe('2.1.286 is new here (was 2.1.289).')
  await compose($)
  await turn($, 'Once more', 'turn-3')
  const back = await card($)
  expect(back.lines).toEqual(['1 tone +4 -2'])
  expect(back.versions).toBe('2.1.289 → 2.1.286')
})

test('A7: a session that opens on an unseen version says so, a seen one draws its report, and an unknown version leaves the empty card', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { page: BASELINE, isStored: true })

  await start($, false)
  const opened = await card($)
  expect(opened.note).toBe('new')
  expect(opened.said).toBe('2.1.289 is new here (was 2.1.287).')
  expect(opened.next).toBe('Compared after your next turn.')

  await say($, 'off')
  await say($, 'on')
  expect((await card($)).said).toBe('2.1.289 is new here (was 2.1.287).')

  world.files.set(PAGE, shelved({ [KEY]: { now: shot(NEW, { ...BEFORE, 's/tone': TONE_NEW }, NOW - 2 * DAY), before: shot(OLD, BEFORE), loose: [] } }))
  await say($, 'on')
  const known = await card($)
  expect(known.note).toBe('1 amendment')
  expect(known.lines).toEqual(['1 tone +4 -2'])
  expect(known.versions).toBe('2.1.287 → 2.1.289')

  scene.isBlind = true
  await say($, 'on')
  const blind = await card($)
  expect(blind.body).toBe(EMPTY)
  expect(blind.note).toBe('')
  expect(world.writes.filter(write => write.startsWith('file'))).toEqual([])
})

test('A8: a tool on one side only makes no row until it is described under both versions, and an idle turn touches no file', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world } = open(on, { page: BASELINE })

  await start($)
  await compose($)
  await describe($, 'Grep', 'A powerful search tool built on ripgrep.')
  await turn($)
  const first = await card($)
  expect(first.note).toBe('unchanged')
  expect(first.count).toBe('3 sections, 1 tool')

  await describe($, 'Read', READ_NEW)
  await turn($, 'Read it', 'turn-2')
  const second = await card($)
  expect(second.note).toBe('1 amendment')
  expect(second.lines).toEqual(['1 Read tool +1 -1'])

  world.files.set(PAGE, 'nope')
  const writes = world.writes.length
  await turn($, 'Nothing new', 'turn-3')
  expect(world.writes.length).toBe(writes)
  expect((await card($)).note).toBe('1 amendment')
})

test('A9: text that varies inside one build becomes loose, stays loose over the next update and is listed by show', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const stored = { 's/intro': INTRO, 's/system': SYSTEM, 's/tone': TONE_OLD, 't/Bash': BASH_OLD }
  const { world, scene } = open(on, {
    page: shelved({ [KEY]: { now: shot(NEW, stored), before: null, loose: [] } }),
    sections: [shared('intro', INTRO), shared('tone', TONE_NEW), shared('session_guidance', GUIDANCE)],
  })

  await start($)
  await compose($)
  await describe($, 'Read', READ_OLD)
  await turn($)
  const book = saved(world).books[KEY]
  expect([...(book?.loose ?? [])].sort()).toEqual(['s/session_guidance', 's/system', 's/tone'])
  expect(book?.now).toEqual(shot(NEW, { ...stored, 't/Read': READ_OLD }))
  expect((await card($)).note).toBe('baseline')

  await say($, 'off')
  scene.version = '2.1.290'
  scene.sections = [shared('intro', `${INTRO}\nAnswer in the language the user writes in.`), shared('tone', `${TONE_OLD}\n - Be brief.`), shared('session_guidance', GUIDANCE)]
  await say($, 'on')
  await compose($)
  await turn($, 'After the update', 'turn-2')

  const later = saved(world).books[KEY]
  expect(later?.before?.version).toBe(NEW)
  expect([...(later?.loose ?? [])].sort()).toEqual(['s/session_guidance', 's/system', 's/tone'])
  expect((await card($)).lines).toEqual(['1 intro +1 -0'])
  expect(await say($, 'show')).toBe(
    ['2.1.289 → 2.1.290 (claude-opus-5-5|skills): 1 amendment', '1  intro  +1 -0', 'Left out, varies within one build: session_guidance, system, tone', COMPARED].join('\n'),
  )
})

test('A10: another model, trait set or output style opens its own book, and a fifth book drops the oldest', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const kept = { now: shot(OLD, BEFORE, NOW - 4 * DAY), before: null, loose: [] }
  const { world } = open(on, {
    isStored: true,
    page: shelved({
      'claude-haiku-5|skills|': { now: shot(OLD, BEFORE, NOW - 9 * DAY), before: null, loose: [] },
      'claude-sonnet-5|skills|': { now: shot(OLD, BEFORE, NOW - 6 * DAY), before: null, loose: [] },
      'claude-opus-5-5|print+skills|': { now: shot(OLD, BEFORE, NOW - 5 * DAY), before: null, loose: [] },
      [KEY]: kept,
    }),
  })
  const mine = 'claude-opus-5-5|send-user-message+skills|Learning'

  await start($, false)
  expect((await card($)).said).toBe('2.1.289 is new here (was 2.1.287).')

  await compose($, { traits: ['skills', 'send-user-message'], outputStyle: { name: 'Learning', isKeepingCodingInstructions: true } })
  await turn($)
  const shelf = saved(world)
  expect(shelf.last).toBe(mine)
  expect(Object.keys(shelf.books).sort()).toEqual([mine, 'claude-opus-5-5|print+skills|', KEY, 'claude-sonnet-5|skills|'].sort())
  expect(shelf.books[mine]).toEqual({ now: shot(NEW, { 's/intro': INTRO, 's/system': SYSTEM, 's/tone': TONE_OLD }, NOW), before: null, loose: [] })
  expect(shelf.books[KEY]).toEqual(kept)
  const seen = await card($)
  expect(seen.note).toBe('baseline')
  expect(seen.count).toBe('3 sections, 0 tools')
})

test('A11: show <n> prints the before and after of one amendment, cut at 200 lines', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = await update($, on)

  expect(await say($, 'show 3')).toBe(
    [
      '3 tone: +4 -2, 2.1.287 → 2.1.289',
      '  # Tone and style',
      '   - Only use emojis if the user explicitly requests it.',
      '-  - Your responses should be short and concise.',
      '+  - Lead with the answer.',
      '+  - Match the length of the response to the question.',
      '   - When referencing specific functions include the pattern file_path:line_number.',
      '   - When referencing GitHub issues use the owner/repo#123 format.',
      '…',
      '   - Prioritize technical accuracy over agreement.',
      '   - Disagree when the facts call for it.',
      '-  - Never give time estimates.',
      '+  - Never give time estimates or predictions.',
      '+  - Say what you verified and what you did not.',
      '   - Keep explanations proportional to the change.',
      '   - Finish with what changed and what is next.',
    ].join('\n'),
  )
  expect(await say($, 'show 1')).toBe(['1 session_guidance: new, 2.1.287 → 2.1.289', ...GUIDANCE.split('\n').map(line => `+ ${line}`)].join('\n'))
  expect(await say($, 'show 2')).toBe(['2 system: dropped, 2.1.287 → 2.1.289', ...SYSTEM.split('\n').map(line => `- ${line}`)].join('\n'))

  const numbered = (count: number, word: string): string[] => Array.from({ length: count }, (_, at) => ` - ${word} rule ${at + 1}`)
  const common = numbered(598, 'Shared')
  await say($, 'off')
  world.files.set(
    PAGE,
    shelved({
      [KEY]: {
        now: shot(OLD, { 's/intro': INTRO, 's/doing_tasks': numbered(300, 'Old').join('\n'), 's/tools': ['# Using your tools', ...common, 'Old closing line.'].join('\n') }),
        before: null,
        loose: [],
      },
    }),
  )
  scene.sections = [
    shared('intro', INTRO),
    shared('doing_tasks', numbered(300, 'New').join('\n')),
    shared('tools', ['# Using the tools', ...common, 'New closing line.'].join('\n')),
  ]
  await say($, 'on')
  await compose($)
  await turn($, 'After the update', 'turn-2')

  expect((await card($)).lines).toEqual(['1 doing_tasks +300 -300', '2 tools +600 -600'])
  const long = (await say($, 'show 1')).split('\n')
  expect(long.length).toBe(202)
  expect(long[0]).toBe('1 doing_tasks: +300 -300, 2.1.287 → 2.1.289')
  expect(long[200]).toBe('-  - Old rule 200')
  expect(long[201]).toBe('… 400 more lines')
  expect((await say($, 'show 2')).split('\n')[0]).toBe('2 tools: +600 -600, 2.1.287 → 2.1.289')
})

test('A12: show answers for a number it does not hold, and everything else that is not a verb answers the usage', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  await update($, on)

  expect(await say($, 'show 9')).toBe('No amendment 9. There are 4.')
  expect(await say($, 'show 999999')).toBe('No amendment 999999. There are 4.')
  for (const args of ['show 0', 'show x', 'show 1.5', 'show 1 2', 'show 100000000000000000000', 'show 1000000', 'what', 'clear now']) expect(await say($, args)).toBe(USAGE)
  for (const verb of ['on', 'off', 'show', 'clear']) expect(USAGE).toContain(verb)
  expect(await say($, 'SHOW')).toBe(
    [
      '2.1.287 → 2.1.289 (claude-opus-5-5|skills): 4 amendments',
      '1  session_guidance  new',
      '2  system  dropped',
      '3  tone  +4 -2',
      '4  Bash tool  +0 -3',
      COMPARED,
    ].join('\n'),
  )
  expect(await say($, 'Show 04')).toMatch(/^4 Bash tool: \+0 -3, 2\.1\.287 → 2\.1\.289\n/)
  expect((await card($)).note).toBe('4 amendments')
})

test('A13: a file the widget did not write is an error no flush overwrites, a failed write says so, and clear starts again', { plugins: [LAYOUT], timeoutMs: SLOW }, async ($, on) => {
  const { world, scene } = open(on, { page: 'nope', isStored: true })

  await start($, false)
  const broken = await card($)
  expect(broken.note).toBe('error')
  expect(broken.said).toBe(UNREAD)
  expect(broken.next).toBe(AGAIN)
  expect(await say($, 'show')).toBe(`${UNREAD} ${AGAIN}`)
  await compose($)
  await describe($, 'Bash', BASH_OLD)
  await turn($)
  expect(world.files.get(PAGE)).toBe('nope')
  expect((await card($)).said).toBe(UNREAD)

  world.files.set(PAGE, '{}')
  await say($, 'on')
  expect((await card($)).note).toBe('error')
  expect(await say($, 'show 1')).toBe(`${UNREAD} ${AGAIN}`)

  expect(await say($, 'clear')).toBe(CLEARED)
  expect(world.files.get(PAGE)).toBe('{"last":"","books":{}}')
  expect((await card($)).body).toBe(EMPTY)
  await compose($)
  await turn($, 'After the clear', 'turn-2')
  const fresh = await card($)
  expect(fresh.note).toBe('baseline')
  expect(fresh.count).toBe('3 sections, 0 tools')
  expect(saved(world).books[KEY]?.before).toBe(null)

  scene.isFull = true
  const full = world.files.get(PAGE)
  await describe($, 'Read', READ_OLD)
  await turn($, 'On a full disk', 'turn-3')
  const failed = await card($)
  expect(failed.note).toBe('error')
  expect(failed.said).toBe(UNWRITTEN)
  expect(failed.next).toBe(AGAIN)
  expect(world.files.get(PAGE)).toBe(full)
  expect(await say($, 'clear')).toBe(`${UNWRITTEN} ${AGAIN}`)

  scene.isFull = false
  expect(await say($, 'clear')).toBe(CLEARED)
  expect((await card($)).body).toBe(EMPTY)
})

test('A14: while off the verbs answer that it is off and nothing is kept, and switching off forgets the session but not the file', { plugins: [LAYOUT, PEEK], timeoutMs: SLOW }, async ($, on) => {
  const { world } = open(on, { page: BASELINE })

  await start($, false)
  expect(await say($, 'show')).toBe('Amendments is off.')
  expect(await say($, 'show 1')).toBe('Amendments is off.')
  expect(await say($, 'clear')).toBe('Amendments is off.')
  await compose($)
  await describe($, 'Bash', BASH_NEW)
  await turn($)
  expect(world.writes).toEqual([])
  expect(JSON.parse(await peek($, 'held')).value).toBeUndefined()
  expect(JSON.parse(await peek($, 'report')).value).toBeUndefined()

  await say($, 'on')
  await compose($)
  await describe($, 'Bash', BASH_NEW)
  expect(JSON.parse(await peek($, 'held')).value.key).toBe(KEY)
  expect(JSON.parse(await peek($, 'report')).value.kind).toBe('new')

  expect(await say($, 'off')).toBe('Amendments off.')
  expect(JSON.parse(await peek($, 'held')).value).toEqual({ key: '', texts: {} })
  expect(JSON.parse(await peek($, 'report')).value.kind).toBe('none')
  await turn($, 'While off', 'turn-2')
  expect(world.files.get(PAGE)).toBe(BASELINE)
  expect(world.writes).toEqual(['store isOn', 'store isOn'])
})

test('A15: every row of every state fits the card at 20, 40 and 60 columns and none starts with a space, with long labels cut and facts whole', { plugins: [LAYOUT, PEEK], timeoutMs: SLOW }, async ($, on) => {
  const rules = (word: string, count: number): string => Array.from({ length: count }, (_, at) => ` - ${word} rule ${at + 1}`).join('\n')
  const before = {
    's/intro': INTRO,
    's/system': SYSTEM,
    's/doing_tasks': rules('Task', 9),
    's/actions': rules('Action', 4),
    's/tools': rules('Tool', 5),
    's/tone': TONE_OLD,
    't/Bash': BASH_OLD,
    't/Read': READ_OLD,
  }
  const { world, scene } = open(on, {
    version: NEW,
    page: shelved({ [KEY]: { now: shot(DEV, before), before: null, loose: [] } }),
    sections: [
      shared('intro', INTRO),
      shared('doing_tasks', `${rules('Task', 8)}\n${rules('Scope', 9)}`),
      shared('actions', `${rules('Action', 2)}\n${rules('Care', 2)}`),
      shared('tools', rules('Tool', 4)),
      shared('tone', TONE_NEW),
      shared('session_guidance', GUIDANCE),
      shared('output_efficiency_and_formatting_guidance', 'Keep output short.'),
    ],
  })

  const tidy = async (kind: string): Promise<void> => {
    expect(JSON.parse(await peek($, 'report')).value.kind).toBe(kind)
    for (const [columns, width] of [[20, 20], [28, 28], [40, 40], [90, 60]] as const) {
      const { sentences } = await card($, columns)
      expect(sentences.length).toBeGreaterThan(0)
      for (const line of sentences) {
        expect(line).toBe(line.trim())
        expect([...line].length).toBeLessThanOrEqual(width - 4)
      }
    }
  }

  await start($)
  await compose($)
  await describe($, 'Bash', BASH_NEW)
  await describe($, 'Read', READ_NEW)
  await turn($)
  await $.command.run(run('widen', `${NAME} 60`))
  await tidy('changed')

  for (const [columns, width] of [[20, 20], [28, 28], [40, 40], [90, 60]] as const) {
    const seen = await card($, columns)
    const inner = width - 4
    expect(seen.width).toBe(width)
    expect(seen.rows.length).toBe(6)
    for (const row of seen.rows) expect([...row.label].length + 1 + row.fact.length).toBeLessThanOrEqual(inner)
    expect(seen.rows.map(row => row.fact)).toEqual(['+2 -2', '+9 -1', 'new', 'new', 'dropped', '+4 -2'])
    expect(seen.rows[2]?.label).toBe(width === 60 ? '3 output_efficiency_and_formatting_guidance' : width === 40 ? '3 output_efficiency_and_formatt…' : width === 28 ? '3 output_efficiency…' : '3 output_ef…')
    expect(seen.note).toBe(width < 30 ? '9' : '9 amendments')
    expect(seen.more).toBe(width < 30 ? '… 3 more' : '… 3 more in show')
    expect(seen.hint).toBe(width < 30 ? 'show <n>' : 'show <n>: before and after')
    expect([...seen.versions].length).toBeLessThanOrEqual(inner)
    expect(seen.versions.endsWith('→2.1.289') || seen.versions.endsWith('→ 2.1.289')).toBe(true)
  }

  await say($, 'off')
  scene.version = DEV
  world.files.set(PAGE, shelved({ [KEY]: { now: shot(NEW, before), before: null, loose: [] } }))
  await say($, 'on')
  await compose($)
  await turn($, 'On a development build', 'turn-2')
  for (const [columns, width] of [[20, 20], [40, 40], [90, 60]] as const) {
    const seen = await card($, columns)
    expect([...seen.versions].length).toBeLessThanOrEqual(width - 4)
    expect(seen.versions).toContain('→')
    expect(seen.note).toBe(width < 30 ? '7' : '7 amendments')
  }

  await tidy('changed')

  await say($, 'off')
  world.files.set(PAGE, 'nope')
  await say($, 'on')
  expect((await card($, 20)).note).toBe('')
  expect((await card($, 20)).next).toBe('clear starts again.')
  expect((await card($, 40)).note).toBe('error')
  await tidy('fault')

  await say($, 'clear')
  await tidy('none')
  await compose($)
  await turn($, 'A baseline on a development build', 'turn-3')
  await tidy('baseline')

  await say($, 'off')
  scene.version = NEW
  await say($, 'on')
  await tidy('new')
  await compose($)
  await turn($, 'Nothing moved', 'turn-4')
  await tidy('same')
  expect((await card($, 20)).age).toBe('2.1.289 here since just now')
  await world.clock.advance(9 * DAY + 4 * 3_600_000)
  await say($, 'on')
  await tidy('same')
  expect((await card($, 20)).age).toBe('2.1.289 here for 9d 4h')

  scene.isFull = true
  await describe($, 'Read', READ_NEW)
  await turn($, 'On a full disk', 'turn-5')
  await tidy('fault')
})

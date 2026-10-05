import { mock } from 'claude-code/testing'
import type { MockClock, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

export type Ground = {
  clock: MockClock
  store: Map<string, unknown>
  files: Map<string, string>
  writes: string[]
  contexts: string[]
  commands: string[]
  toasts: string[]
}

export type Given = {
  now?: number
  store?: Readonly<Record<string, unknown>>
  files?: Readonly<Record<string, string>>
  answers?: Readonly<Record<string, (e: never) => unknown>>
}

export const SITES = [
  ['side', 'Pane'],
  ['above', 'AbovePrompt'],
  ['below', 'PromptHint'],
] as const

export const LAYOUT: Plugin = {
  name: 'widgets',
  register(on) {
    on('engine.create', async (_$, e, next) => ({
      ...(await next(e)),
      widgets: {
        stack: async ({ beneath, card }) => ({ type: 'Box' as const, props: { key: 'card' }, children: [beneath, card] }),
        card: async ({ beneath, width, title, note, body }) => ({
          type: 'Box' as const,
          children: [
            beneath,
            {
              type: 'Box' as const,
              props: { key: 'card', width },
              children: [
                { type: 'Box' as const, props: { key: 'title' }, children: [{ type: 'Text' as const, children: [title ?? ''] }] },
                { type: 'Box' as const, props: { key: 'note' }, children: [{ type: 'Text' as const, children: [note ?? ''] }] },
                { type: 'Box' as const, props: { key: 'body' }, children: [body] },
              ],
            },
          ],
        }),
        picture: async ({ surface, key, columns, rows, marks }) => {
          if (surface !== 'terminal') return { type: 'Text' as const, children: ['no picture'] }

          const cells = Math.ceil(columns / 2) * Math.ceil(rows / 2)
          const blank = String.fromCharCode(32, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1)
          const sum = [...JSON.stringify(marks)].reduce((held, letter) => (held * 31 + letter.charCodeAt(0)) % 0xffffff, 7)
          const first = String.fromCharCode(32, 0, 0, 0, sum & 255, (sum >> 8) & 255, sum >> 16, 0, 0, 0, 0, 1)

          return {
            type: 'Raster',
            props: { key, columns: Math.ceil(columns / 2), rows: Math.ceil(rows / 2), cells: btoa(first + blank.repeat(cells - 1)) },
          } as never
        },
      },
    }))
    on('command.run', { command: 'place' }, async ($, e) => {
      await $.state.set({ plugin: 'widgets', key: 'site' } as const, e.args as 'side')

      return { text: e.args }
    })
    on('command.run', { command: 'widen' }, async ($, e) => {
      const [widget = '', columns = ''] = e.args.split(' ')
      await $.state.set({ plugin: 'widgets', key: 'widths' } as const, { [widget]: Number(columns) })

      return { text: e.args }
    })
  },
}

export const run = (command: string, args = '') =>
  ({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  }) as const

export const target = (plugin: string, component: (typeof SITES)[number][1], columns = 40, surface = 'terminal') =>
  ({
    plugin,
    surface,
    component,
    ...(component === 'Pane' ? { requestId: 'widgets' } : {}),
    props:
      component === 'Pane'
        ? { title: 'Widgets', isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} }
        : component === 'AbovePrompt'
          ? { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: columns, scroll: { offset: 0, bodyRows: 20 }, view: {} }
          : { isDraft: false, isWorking: false, hint: '' },
    viewport: { columns, rows: 40, isFullscreen: true },
  }) as never

const flat = (path: string): string => path.replaceAll('\\', '/').replace(/^[a-z]:/i, '')

export const ground = (on: On, given: Given = {}): Ground => {
  const clock = mock.clock(on, { now: given.now ?? 1_700_000_000_000 })
  const store = new Map<string, unknown>(Object.entries(given.store ?? {}))
  const files = new Map<string, string>(Object.entries(given.files ?? {}).map(([path, text]) => [flat(path), text]))
  const writes: string[] = []
  const contexts: string[] = []
  const commands: string[] = []
  const toasts: string[] = []
  const answers: Record<string, (e: never) => unknown> = {
    'fs.list': () => [],
    'process.run': () => ({ exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }),
    'session.id': () => 'session-1',
    'session.cwd': () => '/work/project',
    'session.root': () => '/work/project',
    'session.repo': () => null,
    'session.usage': () => ({ startedAt: given.now ?? 1_700_000_000_000, context: { window: 200_000, tokens: 46_000, percent: 23 }, rateLimits: [], cost: { usd: 0.38 } }),
    'tool.register': (e: { name: string }) => ({ tool: `mcp__plugin__${e.name}` }),
    'ui.toast': (e: { text?: string }) => void toasts.push(String(e.text ?? '')),
    ...given.answers,
  }
  const bottom = on as unknown as (event: string, hook: (_$: unknown, e: never) => unknown) => void

  bottom('store.get', (_$, e: { key: string }) => ({ value: store.get(e.key) }))
  bottom('store.set', (_$, e: { key: string; value: unknown }) => {
    writes.push(`store ${e.key}`)
    store.set(e.key, e.value)

    return { value: undefined }
  })
  bottom('store.delete', (_$, e: { key: string }) => {
    writes.push(`store ${e.key}`)
    store.delete(e.key)

    return { value: undefined }
  })
  bottom('store.keys', () => ({ value: [...store.keys()] }))
  bottom('fs.read', (_$, e: { path: string }) => {
    const text = files.get(flat(e.path))
    if (text === undefined) throw new Error(`no such file: ${e.path}`)

    return { value: text }
  })
  bottom('fs.exists', (_$, e: { path: string }) => ({ value: files.has(flat(e.path)) }))
  bottom('fs.write', (_$, e: { path: string; text: string }) => {
    writes.push(`file ${flat(e.path)}`)
    files.set(flat(e.path), e.text)

    return { value: undefined }
  })
  bottom('command.register', (_$, e: { name: string }) => {
    commands.push(e.name)

    return { value: { command: e.name } }
  })
  for (const [call, answer] of Object.entries(answers)) bottom(call, (_$, e) => ({ value: answer(e) }))
  bottom('session.start', (_$, e: { cwd: string }) => ({ cwd: e.cwd }))
  bottom('session.measure', (_$, e: { changed: string[] }) => ({ changed: e.changed }))
  bottom('session.compact', () => ({}))
  bottom('prompt.submit', (_$, e: { text: string; context?: string[] }) => {
    contexts.push(...(e.context ?? []))

    return { text: e.text }
  })
  bottom('turn.start', (_$, e: { turnId: string }) => ({ turnId: e.turnId }))
  bottom('turn.complete', (_$, e: { answer: string }) => ({ text: e.answer }))
  bottom('tool.check', () => ({ decision: 'allow' }))
  bottom('ui.render', () => ({ type: 'Text', children: ['beneath'] }))

  return { clock, store, files, writes, contexts, commands, toasts }
}

export const session = async ($: unknown, cwd = '/work/project'): Promise<void> => {
  await ($ as { session: { start: (e: object) => Promise<unknown> } }).session.start({ cwd, surface: 'terminal', isInteractive: true })
}

export const turn = async ($: unknown, text = 'Fix the failing test', turnId = 'turn-1'): Promise<void> => {
  const engine = $ as Record<string, Record<string, (e: object) => Promise<unknown>>>
  await engine.prompt?.submit?.({ text, wait: false, origin: { kind: 'composer' } })
  await engine.turn?.start?.({ text, turnId })
  await engine.tool?.check?.({ tool: 'Bash', input: { command: 'npm test' }, tool_use_id: `${turnId}-a` })
  await engine.tool?.call?.({ tool: 'Bash', tool_use_id: `${turnId}-a`, command: 'npm test' })
  await engine.tool?.call?.({ tool: 'Edit', tool_use_id: `${turnId}-b`, file_path: '/work/project/src/sum.js', old_string: 'a', new_string: 'b' })
  await engine.session?.measure?.({ changed: ['context', 'rateLimits', 'cost'] })
  await engine.turn?.complete?.({ answer: 'Done.', durationMs: 4200, isAborted: false, turnId, reason: 'answer' })
}

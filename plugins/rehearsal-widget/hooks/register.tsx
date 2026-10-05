import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, folder, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Book = PluginState['rehearsal-widget']['book']
type Call = Book['calls'][number]
type Verdicts = PluginState['rehearsal-widget']['verdicts']
type Verdict = Verdicts[string]
type Run = PluginState['rehearsal-widget']['run']
type Answer = { decision: 'allow' | 'ask' | 'deny'; reason?: string; rule?: string }
type Shape = Pick<Call, 'key' | 'label' | 'input'>
type Part = { text: string; color?: 'red' | 'yellow'; isDim: boolean }
type Line = { key: string; parts: Part[] }
type Group = { calls: Call[]; mark: string; color?: 'red' | 'yellow'; wide: string; narrow: string }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const WIDE_COLUMNS = 30
const WHY_COLUMNS = 50
const TICK_MS = 5000
const MAX_CALLS = 40
const MAX_ROWS = 4
const MAX_KEPT = 300
const MAX_UPS = 2
const HEAD_WORDS = 3
const USAGE = 'Usage: /rehearsal-widget [on|off|show|forget <n>|clear]'
const OFF = 'Rehearsal is off.'
const VERBS = ['', 'on', 'off', 'show', 'clear']
const SUBJECTS = ['command', 'file_path', 'notebook_path', 'path', 'url'] as const
const OPERATORS = ['&&', '||', ';', '|']
const LITERAL = /[/\\.="'$@]/
const SECRETS = [/token|secret|passw|api[_-]?key|bearer|authorization/i, /:\/\/[^/\s:]+:[^/\s@]+@/, /[A-Za-z0-9+/_=-]{32,}/]
const NON_DIALOG: Readonly<Record<string, readonly [word: string, note: string]>> = {
  auto: ['auto', 'auto'],
  dontAsk: ['dontAsk', 'noask'],
  bypassPermissions: ['bypass', 'bypass'],
}
const EMPTY = ['No calls seen in this project yet.', 'Each kind Claude makes is kept and put to the permission check, unrun.']
const EMPTY_NARROW = ['No calls yet.', 'Each kind Claude makes is checked here, unrun.']
const CAVEAT = 'By the rules now. Hooks are not asked; a new kind of call may ask.'
const CAVEAT_NARROW = 'By the rules now; hooks are not asked.'
const FOOT = 'By the rules as they stand; PreToolUse hooks and the auto-mode classifier are not asked.'
const UNKNOWN: Verdict = { decision: 'unknown', why: '' }
const REST: Book = { key: '', name: '', root: '', isDirty: false, calls: [] }
const IDLE: Run = { mode: '', isRehearsing: false, shown: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'rehearsal-widget', key: 'isOn' } as const, false)
const book = atom({ plugin: 'rehearsal-widget', key: 'book' } as const, REST)
const verdicts = atom({ plugin: 'rehearsal-widget', key: 'verdicts' } as const, {})
const run = atom({ plugin: 'rehearsal-widget', key: 'run' } as const, IDLE)

let timer: Timer | undefined

const cut = (text: string, room: number): string => {
  const letters = [...text]

  return letters.length <= room ? text : `${letters.slice(0, Math.max(0, room - 1)).join('')}…`
}

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, cut(word, room)]
  }, [])

const headOf = (command: string): string => {
  const words = command.split(/\s+/)
  const left = words[0] === 'cd' ? words.findIndex(word => word === '&&' || word.endsWith(';')) : -1
  const rest = words.slice(left + 1)
  const stop = rest.findIndex(word => OPERATORS.includes(word) || LITERAL.test(word))

  return rest.slice(0, stop === -1 ? HEAD_WORDS : Math.min(HEAD_WORDS, stop)).join(' ')
}

const hostOf = (url: string): string => (/^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#]*@)?([^/?#@]+)/i.exec(url)?.[1] ?? '').toLowerCase()

const near = (path: string, base: string): string => {
  const from = base.split('/')
  const same = folder(path).split('/')
  const shared = from.findIndex((part, at) => part !== same[at])
  const ups = from.length - shared

  return shared > 1 && ups <= MAX_UPS ? [...from.slice(shared).map(() => '..'), ...path.split('/').slice(shared)].join('/') : path
}

const placed = (given: string, root: string): { kind: 'in' | 'dot' | 'out'; shown: string } => {
  const path = given.replaceAll('\\', '/').replace(/\/+$/, '')
  const base = folder(root)
  const isUnder = folder(path) === base || folder(path).startsWith(`${base}/`)
  if (/^(\/|[a-z]:\/|~)/i.test(path) && !isUnder) return { kind: 'out', shown: near(path, base) }

  const inside = isUnder ? path.slice(base.length + 1) : path.replace(/^(\.\/)+/, '')
  const parts = inside.split('/')
  if (parts.includes('..')) return { kind: 'out', shown: isUnder ? path : inside }

  return { kind: parts.some(part => part.startsWith('.') && part !== '.') ? 'dot' : 'in', shown: inside === '' ? '.' : inside }
}

export const shapeOf = (tool: string, input: unknown, root: string): Shape => {
  const fields = typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const field = SUBJECTS.find(name => typeof fields[name] === 'string')
  const subject = field === undefined ? '' : String(fields[field]).trim()
  const bare = { key: tool, label: tool, input: {} }
  if (field === undefined || subject === '') return bare

  const blanked = Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, typeof value === 'string' && name !== field ? '' : value]))
  if (field === 'command') return { key: `${tool}:${headOf(subject)}`, label: subject.split(/\s+/).join(' '), input: blanked }
  if (field === 'url') return hostOf(subject) === '' ? bare : { key: `${tool}:${hostOf(subject)}`, label: `${tool} ${hostOf(subject)}`, input: blanked }

  const { kind, shown } = placed(subject, root)

  return { key: `${tool}:${kind}`, label: `${tool} ${shown}`, input: blanked }
}

const isSecret = (input: Record<string, unknown>): boolean => {
  const text = [input.command, input.url].find(value => typeof value === 'string' && value !== '') ?? ''

  return typeof text === 'string' && (text.length > MAX_KEPT || SECRETS.some(pattern => pattern.test(text)))
}

const judged = ({ decision, rule, reason }: Answer): Verdict => ({ decision, why: (rule ?? reason ?? '').split(/\s+/).join(' ').trim() })

const ranked = (calls: readonly Call[], found: Verdicts, decision: Verdict['decision']): Call[] =>
  calls
    .filter(call => found[call.key]?.decision === decision)
    .sort((one, other) => {
      const [left, right] = [one.label.toLowerCase(), other.label.toLowerCase()]

      return left < right ? -1 : left > right ? 1 : one.key < other.key ? -1 : 1
    })

const ordered = (calls: readonly Call[], found: Verdicts): Call[] => (['deny', 'ask', 'unknown', 'allow'] as const).flatMap(decision => ranked(calls, found, decision))

const restored = (stored: unknown): Call[] =>
  (Array.isArray(stored) ? stored : [])
    .filter(
      (call): call is Omit<Call, 'isKept'> =>
        typeof call === 'object' &&
        call !== null &&
        typeof call.key === 'string' &&
        typeof call.tool === 'string' &&
        typeof call.label === 'string' &&
        typeof call.seenAt === 'number' &&
        typeof call.input === 'object' &&
        call.input !== null,
    )
    .slice(0, MAX_CALLS)
    .map(({ key, tool, input, label, seenAt }) => ({ key, tool, input, label, seenAt, isKept: true }))

const saved = (calls: readonly Call[]): Omit<Call, 'isKept'>[] =>
  calls.filter(call => call.isKept).map(({ key, tool, input, label, seenAt }) => ({ key, tool, input, label, seenAt }))

const drawn = (held: Book, found: Verdicts, mode: string, width: number, room: number): { note: string; lines: Line[] } => {
  const isWide = width >= WIDE_COLUMNS
  const n = held.calls.length
  const word = NON_DIALOG[mode]
  const said = (key: string, text: string, isDim = false): Line[] => wrapped(text, room).map((line, at) => ({ key: `${key}:${at}`, parts: [{ text: line, isDim }] }))
  const row = (key: string, wide: string, narrow: string, isDim = false): Line => ({ key, parts: [{ text: cut(isWide ? wide : narrow, room), isDim }] })
  if (n === 0) return { note: '', lines: (isWide ? EMPTY : EMPTY_NARROW).flatMap((text, at) => said(`empty${at}`, text, true)) }
  if (held.calls.some(call => found[call.key] === undefined)) {
    return { note: '', lines: [row('checking', `Checking ${plural(n, 'call')} seen here.`, `checking ${n}`, true)] }
  }

  const [refused, open, lost, free] = (['deny', 'ask', 'unknown', 'allow'] as const).map(decision => ranked(held.calls, found, decision)) as [Call[], Call[], Call[], Call[]]
  if (lost.length === n && isWide) {
    return { note: 'no check', lines: [...said('silent', 'The permission check did not answer.'), ...said('blind', `Nothing is known about ${plural(n, 'call')}.`)] }
  }
  if (lost.length === n) return { note: 'none', lines: [...said('silent', 'The check did not answer.'), row('blind', '', `${n} unchecked`)] }
  if (free.length === n && isWide) {
    return { note: word?.[0] ?? 'all clear', lines: [...said('clear', `All ${plural(n, 'call')} seen here would run.`), ...said('caveat', CAVEAT, true)] }
  }
  if (free.length === n) return { note: word?.[1] ?? 'clear', lines: [row('clear', '', `${n} would run`), ...said('caveat', CAVEAT_NARROW, true)] }

  const stops = refused.length + open.length
  const groups: Group[] = [
    { calls: refused, mark: '✗', color: 'red', wide: `Would be refused: ${refused.length} of ${n}`, narrow: `${refused.length} of ${n} refused` },
    {
      calls: open,
      mark: '?',
      color: 'yellow',
      wide: `${word === undefined ? 'Would stop and ask' : 'Not settled by rules'}: ${open.length} of ${n}`,
      narrow: `${open.length} of ${n} ${word === undefined ? 'ask' : 'open'}`,
    },
    { calls: lost, mark: '!', wide: `${plural(lost.length, 'call')} could not be checked`, narrow: `${lost.length} unchecked` },
  ]
  const top = groups.flatMap(group => group.calls).slice(0, MAX_ROWS)
  const more = stops + lost.length - top.length
  const lines = groups
    .filter(group => group.calls.length > 0)
    .flatMap(({ calls, mark, color, wide, narrow }) => [
      row(`head${mark}`, wide, narrow),
      ...calls
        .filter(call => top.includes(call))
        .flatMap(call => {
          const why = found[call.key]?.why ?? ''
          const letters = [...cut(`${call.label}${width >= WHY_COLUMNS && why !== '' ? ` · ${why}` : ''}`, room - 2)]
          const size = [...call.label].length

          return [
            {
              key: `call:${call.key}`,
              parts: [
                { text: `${mark} `, color, isDim: color === undefined },
                { text: letters.slice(0, size).join(''), isDim: false },
                { text: letters.slice(size).join(''), isDim: true },
              ],
            },
            ...(more > 0 && call === top.at(-1) ? [row('more', `and ${more} more`, `and ${more} more`, true)] : []),
          ]
        }),
    ])

  return {
    note: word?.[isWide ? 0 : 1] ?? (stops === 0 ? '' : isWide ? `${stops} of ${n}` : `${stops}/${n}`),
    lines: [
      ...lines,
      row('free', free.length === 0 ? 'None would run by the rules.' : `${free.length} would run by the rules.`, `${free.length} would run`),
      ...(word !== undefined && open.length > 0
        ? [
            row(
              'mode',
              [`${word[0]} mode decides these, no dialog.`, `${word[0]} decides these, no dialog.`].find(text => text.length <= room) ?? `${word[0]} decides`,
              `${word[0]} decides`,
              true,
            ),
          ]
        : []),
    ],
  }
}

const reported = (held: Book, found: Verdicts, mode: string): string => {
  if (held.calls.length === 0) return `Rehearsal in ${held.name}: no calls seen here yet.`

  const word = NON_DIALOG[mode]
  const count = (decision: Verdict['decision']): number => ranked(held.calls, found, decision).length
  const verbs = { deny: 'refuse', ask: 'ask', unknown: 'unchecked', allow: 'run' }

  return [
    `Rehearsal in ${held.name}, ${mode === '' ? 'mode not seen yet' : `${word?.[0] ?? mode} mode`}: ${count('ask')} ${word === undefined ? 'would stop' : 'not settled'}, ${count('deny')} refused, ${count('allow')} would run, ${count('unknown') > 0 ? `${count('unknown')} unchecked, ` : ''}of ${held.calls.length} seen here.`,
    ...ordered(held.calls, found).map((call, at) => {
      const { decision, why } = found[call.key] ?? UNKNOWN

      return `${at + 1}. ${verbs[decision]} ${call.label}${why === '' ? '' : ` (${why})`}${call.isKept ? '' : ' [this session only]'}`
    }),
    FOOT,
  ].join('\n')
}

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['rehearsal-widget'] ?? CARD_COLUMNS, columns)
  const { note, lines } = drawn(await read($, book), await read($, verdicts), (await read($, run)).mode, width, width - CARD_FRAME)

  return $.widgets.card({
    beneath,
    width,
    title: 'Rehearsal',
    note,
    body: (
      <Box flexDirection="column">
        {lines.map(({ key, parts }) => (
          <Box key={key}>
            <Text wrap="truncate-end">
              {parts
                .filter(part => part.text !== '')
                .map(({ text, color, isDim }) => (
                  <Text color={color} dimColor={isDim}>
                    {text}
                  </Text>
                ))}
            </Text>
          </Box>
        ))}
      </Box>
    ),
  })
}

const asked = async ($: EngineInterface, call: Call): Promise<Verdict> => {
  try {
    return judged(await $.tool.check({ tool: call.tool, input: call.input }))
  } catch {
    return UNKNOWN
  }
}

const rehearse = async ($: EngineInterface, isForced: boolean): Promise<void> => {
  const { calls } = await read($, book)
  if (calls.length === 0 || (!isForced && (await read($, run)).isRehearsing)) return

  await update($, run, ran => ({ ...(ran ?? IDLE), isRehearsing: true }))
  const heard: Verdicts = {}
  for (const call of calls) {
    if (!(await read($, isOn))) return

    heard[call.key] = await asked($, call)
  }
  if (!(await read($, isOn))) return

  const before = await read($, verdicts)
  const after: Verdicts = {}
  for (const call of (await read($, book)).calls) {
    const fresh = calls.some(old => old.key === call.key && old.seenAt === call.seenAt) ? heard[call.key] : undefined
    const verdict = fresh ?? before[call.key]
    if (verdict !== undefined) after[call.key] = verdict
  }
  const isSame =
    Object.keys(after).length === Object.keys(before).length &&
    Object.entries(after).every(([key, verdict]) => before[key]?.decision === verdict.decision && before[key]?.why === verdict.why)
  if (!isSame) await update($, verdicts, () => after)
  await update($, run, ran => ({ ...(ran ?? IDLE), isRehearsing: false }))
}

const begun = ($: EngineInterface): void => {
  void rehearse($, false).catch(() => undefined)
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) timer = $.clock.every(TICK_MS, () => begun($))
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const opened = async ($: EngineInterface): Promise<void> => {
  const root = await $.session.root()
  const key = folder(root)
  if ((await read($, book)).key === key) return

  const calls = restored(await $.store.get(`calls:${key}`))
  await update($, book, () => ({ key, name: key.split('/').at(-1) || key || '/', root, isDirty: false, calls }))
  await update($, verdicts, () => ({}))
}

const closed = async ($: EngineInterface): Promise<void> => {
  await update($, book, () => REST)
  await update($, verdicts, () => ({}))
  await update($, run, () => IDLE)
}

const collected = async ($: EngineInterface, tool: string, input: unknown, answer: Answer): Promise<void> => {
  const held = await read($, book)
  const shape = shapeOf(tool, input, held.root)
  const call: Call = { ...shape, tool, seenAt: await $.clock.now(), isKept: !isSecret(shape.input) }
  const calls = [call, ...held.calls.filter(other => other.key !== call.key).sort((one, other) => other.seenAt - one.seenAt)].slice(0, MAX_CALLS)

  await update($, book, seen => ({ ...(seen ?? REST), isDirty: true, calls }))
  await update($, verdicts, found => ({
    ...Object.fromEntries(Object.entries(found ?? {}).filter(([key]) => calls.some(left => left.key === key))),
    [call.key]: judged(answer),
  }))
  if ((await read($, run)).shown.includes(call.key)) {
    await update($, run, ran => ({ ...(ran ?? IDLE), shown: (ran ?? IDLE).shown.map(key => (key === call.key ? '' : key)) }))
  }
}

const kept = async ($: EngineInterface): Promise<void> => {
  const held = await read($, book)
  if (!held.isDirty) return

  await $.store.set(`calls:${held.key}`, saved(held.calls))
  await update($, book, seen => ({ ...(seen ?? REST), isDirty: false }))
}

const listed = async ($: EngineInterface): Promise<string> => {
  await rehearse($, true)

  const held = await read($, book)
  const found = await read($, verdicts)
  await update($, run, ran => ({ ...(ran ?? IDLE), shown: ordered(held.calls, found).map(call => call.key) }))

  return reported(held, found, (await read($, run)).mode)
}

const forgotten = async ($: EngineInterface, row: number): Promise<string> => {
  const key = (await read($, run)).shown[row - 1] ?? ''
  const held = await read($, book)
  const call = held.calls.find(other => other.key === key)
  if (call === undefined) return `No row ${row}; /rehearsal-widget show lists them.`

  const calls = held.calls.filter(other => other !== call)
  await update($, book, seen => ({ ...(seen ?? REST), isDirty: false, calls }))
  await update($, verdicts, found => Object.fromEntries(Object.entries(found ?? {}).filter(([name]) => name !== key)))
  await update($, run, ran => ({ ...(ran ?? IDLE), shown: (ran ?? IDLE).shown.map(name => (name === key ? '' : name)) }))
  await $.store.set(`calls:${held.key}`, saved(calls))

  return `Forgot: ${call.label}.`
}

const cleared = async ($: EngineInterface): Promise<string> => {
  const held = await read($, book)

  await $.store.delete(`calls:${held.key}`)
  await update($, book, seen => ({ ...(seen ?? REST), isDirty: false, calls: [] }))
  await update($, verdicts, () => ({}))
  await update($, run, ran => ({ ...(ran ?? IDLE), shown: [] }))

  return `Rehearsal cleared: ${plural(held.calls.length, 'call')} forgotten for ${held.name}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rehearsal-widget',
      description: 'Toggle the Rehearsal card, list what would stop for permission, or forget calls',
      argumentHint: '[on|off|show|forget <n>|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)
    if (await read($, isOn)) {
      await opened($)
      begun($)
    }

    return next(e)
  })

  on('command.run', { command: 'rehearsal-widget' }, async ($, e) => {
    const [arg = '', ...rest] = e.args.trim().toLowerCase().split(/\s+/)
    const row = arg === 'forget' && rest.length === 1 && /^\d+$/.test(rest[0] ?? '') ? Number(rest[0]) : undefined
    if (row === undefined && (!VERBS.includes(arg) || rest.length > 0)) return { text: USAGE }
    if (row !== undefined || arg === 'show' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }
      if (row !== undefined) return { text: await forgotten($, row) }

      return { text: arg === 'show' ? await listed($) : await cleared($) }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)
    if (isShown) {
      await opened($)
      await rehearse($, true)
    } else await closed($)

    return { text: isShown ? 'Rehearsal on; /widgets places it.' : 'Rehearsal off.' }
  })

  on('tool.check', async ($, e, next) => {
    if (e.tool_use_id === undefined || !(await read($, isOn))) return next(e)

    const verdict = await next(e)
    await collected($, e.tool, e.input, verdict).catch(() => undefined)

    return verdict
  })

  on('classic.*', async ($, e, next) => {
    const mode = 'permission_mode' in e ? e.permission_mode : undefined
    if (typeof mode === 'string' && (await read($, isOn)) && mode !== (await read($, run)).mode) {
      await update($, run, ran => ({ ...(ran ?? IDLE), mode }))
      begun($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isOn))) await kept($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

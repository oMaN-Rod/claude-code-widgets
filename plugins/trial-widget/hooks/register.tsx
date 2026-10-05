import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Run = { isWith: boolean; turns: number; clean: number }
type Trial = { subject: string; runs: Record<string, Run> }
type Now = { id: string; phase: 'idle' | 'joined' | 'stalled'; isOpen: boolean; isFailing: boolean }
type Arm = { turns: number; clean: number }
type Verdict = { need: number; lead: 'with' | 'without' | '' }
type Row = { key: string; text: string; side?: string; isDim?: boolean; color?: 'yellow' }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LONG_COLUMNS = 36
const SHORT_COLUMNS = 16
const JOIN_MS = 50
const ENOUGH_TURNS = 30
const SURE = 1.96
const FILE = 'trial.json'
const SUFFIX = '-widget'
const USAGE = 'Usage: /trial-widget [on|off|test <widget>|clear]'
const OFF = 'Trial is off.'
const EMPTY = ['No trial yet.', '/trial-widget test <widget> runs it on one session and off the next.'] as const
const NAMED = /^[a-z0-9][a-z0-9-]*$/
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g
const ARMS = [
  { isWith: true, long: 'with', short: 'on' },
  { isWith: false, long: 'without', short: 'off' },
] as const
const BLANK: Trial = { subject: '', runs: {} }
const IDLE: Now = { id: '', phase: 'idle', isOpen: false, isFailing: false }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'trial-widget', key: 'isOn' } as const, false)
const trial = atom({ plugin: 'trial-widget', key: 'trial' } as const, BLANK)
const now = atom({ plugin: 'trial-widget', key: 'now' } as const, IDLE)

let timer: Timer | undefined

const isRun = (value: unknown): value is Run => {
  const run = value as Partial<Run> | null

  return typeof run === 'object' && run !== null && typeof run.isWith === 'boolean' && typeof run.turns === 'number' && typeof run.clean === 'number'
}

const parsed = (text: string): Trial => {
  const held = JSON.parse(text) as Partial<Trial> | null
  if (typeof held !== 'object' || held === null || typeof held.subject !== 'string' || held.subject === '') return BLANK
  if (typeof held.runs !== 'object' || held.runs === null || Array.isArray(held.runs) || !Object.values(held.runs).every(isRun)) return BLANK

  return { subject: held.subject, runs: held.runs }
}

const armOf = (runs: Trial['runs'], isWith: boolean): Arm =>
  Object.values(runs)
    .filter(run => run.isWith === isWith)
    .reduce<Arm>((held, run) => ({ turns: held.turns + run.turns, clean: held.clean + run.clean }), { turns: 0, clean: 0 })

const rateOf = (arm: Arm): number => Math.round((100 * arm.clean) / arm.turns)

const grouped = (count: string): string => count.replace(THOUSANDS, ',')

const compact = (count: number): string => (count < 1000 ? String(count) : `${(count / 1000).toFixed(1)}k`)

const verdictOf = (on: Arm, off: Arm): Verdict => {
  const need = Math.max(0, ENOUGH_TURNS - on.turns) + Math.max(0, ENOUGH_TURNS - off.turns)
  if (need > 0) return { need, lead: '' }

  const pooled = (on.clean + off.clean) / (on.turns + off.turns)
  const spread = Math.sqrt(pooled * (1 - pooled) * (1 / on.turns + 1 / off.turns))
  const score = spread === 0 ? 0 : (on.clean / on.turns - off.clean / off.turns) / spread

  return { need, lead: Math.abs(score) < SURE ? '' : score > 0 ? 'with' : 'without' }
}

const worded = ({ need, lead }: Verdict, isLong: boolean): string => {
  if (need > 0) return isLong ? `Too early: ${plural(need, 'more turn')}` : plural(need, 'more turn')
  if (lead === '') return isLong ? 'No difference beyond chance.' : 'no difference'

  return isLong ? `${lead === 'with' ? 'With' : 'Without'} it is ahead, beyond chance.` : `${lead} is ahead`
}

const wrapped = (sentence: string, columns: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const last = rows.at(-1)

    return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
  }, [])

const rowsOf = ({ subject, runs }: Trial, phase: Now['phase'], isLong: boolean): Row[] => {
  if (subject === '') {
    return EMPTY.flatMap((sentence, at) =>
      wrapped(sentence, isLong ? LONG_COLUMNS : SHORT_COLUMNS).map((text, line) => ({ key: `empty-${at}-${line}`, text, isDim: at > 0 })),
    )
  }
  if (phase === 'stalled') {
    return [
      { key: 'subject', text: subject },
      { key: 'fault', text: isLong ? 'Could not switch it here.' : 'switch failed', color: 'yellow' },
      { key: 'effect', text: isLong ? 'This session is not counted.' : 'not counted', isDim: true },
    ]
  }

  const [on, off] = [armOf(runs, true), armOf(runs, false)]
  const verdict = verdictOf(on, off)

  return [
    { key: 'subject', text: subject },
    ...ARMS.map(({ isWith, long, short }): Row => {
      const arm = isWith ? on : off
      if (!isLong) return { key: long, text: `${short.padEnd(4)}${arm.turns === 0 ? 'none' : `${rateOf(arm)}% of ${compact(arm.turns)}`}` }
      if (arm.turns === 0) return { key: long, text: `${long.padEnd(9)}no turns yet` }

      return { key: long, text: `${long.padEnd(9)}${rateOf(arm)}% clean`, side: grouped(plural(arm.turns, 'turn')) }
    }),
    { key: 'verdict', text: worded(verdict, isLong), isDim: verdict.need > 0 },
  ]
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

  const width = fit((await $.state.get(widths)).value?.['trial-widget'] ?? CARD_COLUMNS, columns)
  const held = await read($, trial)
  const { id, phase } = await read($, now)
  const mine = held.runs[id]

  return $.widgets.card({
    beneath,
    width,
    title: 'Trial',
    note: held.subject === '' ? '' : phase === 'stalled' ? 'stalled' : mine === undefined ? '' : mine.isWith ? 'with' : 'without',
    body: (
      <Box flexDirection="column">
        {rowsOf(held, phase, width - 4 >= LONG_COLUMNS).map(row => (
          <Box key={row.key} justifyContent="space-between" columnGap={1}>
            <Text dimColor={row.isDim === true} wrap="truncate-end" {...(row.color === undefined ? {} : { color: row.color })}>
              {row.text}
            </Text>
            {row.side !== undefined && (
              <Text dimColor wrap="truncate-end">
                {row.side}
              </Text>
            )}
          </Box>
        ))}
      </Box>
    ),
  })
}

const stored = async ($: EngineInterface): Promise<Trial> => {
  try {
    return parsed(await $.fs.read(`${$.plugin.root}/${FILE}`))
  } catch {
    return BLANK
  }
}

const keep = async ($: EngineInterface, held: Trial): Promise<void> => {
  await $.fs.write(`${$.plugin.root}/${FILE}`, JSON.stringify(held)).catch(() => undefined)
}

const blank = async ($: EngineInterface): Promise<void> => {
  await update($, trial, () => BLANK)
  await update($, now, () => IDLE)
}

const listed = async ($: EngineInterface, subject: string): Promise<boolean> => {
  try {
    return (await $.command.list()).some(command => command.name.replace(/^[/]/, '') === subject)
  } catch {
    return false
  }
}

const switched = async ($: EngineInterface, subject: string, isWith: boolean): Promise<boolean> => {
  if (!(await listed($, subject))) return false
  try {
    await $.command.run({ command: subject, args: isWith ? 'on' : 'off' })
  } catch {
    return false
  }

  return true
}

const join = async ($: EngineInterface): Promise<void> => {
  const kept = await stored($)
  const id = kept.subject === '' ? '' : await $.session.id().catch(() => '')
  const counted = Object.values(kept.runs).filter(run => run.turns > 0)
  const mine = kept.runs[id] ?? { isWith: counted.filter(run => run.isWith).length * 2 <= counted.length, turns: 0, clean: 0 }
  const isJoined = id !== '' && (await switched($, kept.subject, mine.isWith))
  if ((await read($, trial)).subject === '' || (await read($, now)).phase !== 'idle') return

  await update($, trial, () => (isJoined ? { subject: kept.subject, runs: { ...kept.runs, [id]: mine } } : kept))
  await update($, now, () => ({ ...IDLE, id: isJoined ? id : '', phase: kept.subject === '' ? 'idle' : isJoined ? 'joined' : 'stalled' }))
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isDue = (await read($, isOn)) && (await read($, trial)).subject !== '' && (await read($, now)).phase === 'idle'
  timer?.cancel()
  timer = isDue ? $.clock.after(JOIN_MS, () => void join($)) : undefined
}

const tally = async ($: EngineInterface, id: string, isClean: boolean): Promise<void> => {
  const held = await read($, trial)
  const before = held.runs[id]
  if (before === undefined) return

  const mine = { ...before, turns: before.turns + 1, clean: before.clean + (isClean ? 1 : 0) }
  await update($, trial, () => ({ subject: held.subject, runs: { ...held.runs, [id]: mine } }))
  const kept = await stored($)
  if (kept.subject !== held.subject) return blank($)

  const merged = { subject: kept.subject, runs: { ...kept.runs, [id]: mine } }
  await keep($, merged)
  await update($, trial, () => merged)
}

const begin = async ($: EngineInterface, subject: string): Promise<string> => {
  const kept = await stored($)
  if (kept.subject !== '') return `A trial of ${kept.subject} is running; /trial-widget clear ends it.`
  if (subject === 'trial-widget' || !(await listed($, subject))) return `No widget called ${subject}.`

  const fresh = { subject, runs: {} }
  await keep($, fresh)
  await update($, trial, () => fresh)
  await update($, now, () => IDLE)
  await sync($)

  return `Trial of ${subject} started. This session runs with it, the next without, and so on. Leave its switch alone meanwhile.`
}

const finish = async ($: EngineInterface): Promise<string> => {
  const kept = await stored($)
  const held = await read($, trial)
  const { id, phase } = await read($, now)
  await blank($)
  await sync($)
  if (kept.subject === '') return 'No trial is running.'

  const mine = phase === 'joined' && held.subject === kept.subject ? held.runs[id] : undefined
  const runs = mine === undefined ? kept.runs : { ...kept.runs, [id]: mine }
  const verdict = verdictOf(armOf(runs, true), armOf(runs, false))
  const figures = ARMS.map(({ isWith, long }) => {
    const arm = armOf(runs, isWith)

    return `${long} ${arm.turns === 0 ? 'no turns' : `${rateOf(arm)}% of ${grouped(plural(arm.turns, 'turn'))}`}`
  })
  await keep($, BLANK)

  return [
    `Trial of ${kept.subject} ended: ${figures.join(', ')}.`,
    `${worded(verdict, true)}${verdict.need > 0 ? '.' : ''}`,
    ...(mine === undefined ? [] : [`${kept.subject} is left ${mine.isWith ? 'on' : 'off'}.`]),
  ].join(' ')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trial-widget',
      description: 'Toggle the card that runs a fair test of another widget, session by session',
      argumentHint: '[on|off|test <widget>|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if (await read($, isOn)) {
      const kept = await stored($)
      await update($, trial, () => kept)
      await sync($)
    }

    return next(e)
  })

  on('command.run', { command: 'trial-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const [verb = '', name = '', ...more] = arg.split(/\s+/)
    if (verb === 'test' && more.length === 0 && NAMED.test(name)) {
      return { text: (await read($, isOn)) ? await begin($, name.endsWith(SUFFIX) ? name : `${name}${SUFFIX}`) : OFF }
    }
    if (arg === 'clear') return { text: (await read($, isOn)) ? await finish($) : OFF }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const wasShown = await read($, isOn)
    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown !== wasShown) {
      const kept = isShown ? await stored($) : BLANK
      await blank($)
      if (isShown) await update($, trial, () => kept)
    }
    await sync($)

    return { text: isShown ? 'Trial on; /widgets places it.' : 'Trial off.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge' && e.origin.kind !== 'sdk') return next(e)

    const held = await read($, now)
    if (held.phase === 'joined') await update($, now, () => ({ ...held, isOpen: true, isFailing: false }))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const ran = await next(e)
    if (e.tool !== 'Bash' || e.agentId !== undefined || ran.deny !== undefined) return ran

    const command = String((e as { command?: unknown }).command ?? '').split('\n')[0] ?? ''
    const held = await read($, now)
    if (held.isOpen && CHECKS.test(command)) await update($, now, () => ({ ...held, isFailing: ran.isError === true }))

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const ended = await next(e)
    const held = await read($, now)
    if (e.agentId !== undefined || held.phase !== 'joined' || !held.isOpen) return ended

    await update($, now, () => ({ ...held, isOpen: false, isFailing: false }))
    await tally($, held.id, !e.isAborted && e.reason === 'answer' && !held.isFailing)

    return ended
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

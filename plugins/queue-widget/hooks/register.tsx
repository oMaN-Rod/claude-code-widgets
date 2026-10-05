import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, PromptSubmitArgs, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Queue = PluginState['queue-widget']['queue']
type Run = NonNullable<Queue['run']>
type Entry = Queue['log'][number]
type Color = 'green' | 'red' | 'yellow' | 'cyan'
type Row = { key: string; text: string; lead?: { text: string; color: Color }; color?: Color; isDim?: boolean }
type Drawn = { note?: string; rows: Row[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_EDGE = 4
const LONG_COLUMNS = 36
const STEP_MS = 400
const GATE_MS = 600_000
const RETRIES = 3
const MAX_PROMPTS = 10
const MAX_LOG = 30
const SHOWN_ROWS = 3
const LABEL_CHARS = 80
const PROMPT_CHARS = 2000
const GATE_CHARS = 200
const REASON_CHARS = 60
const ECHO_CHARS = 20
const OUTPUT_LINES = 40
const OUTPUT_CHARS = 4000
const USAGE = 'Usage: /queue-widget [on|off|add <prompt>|until <command|off>|start|drop <number>|report|clear]'
const OFF = 'Queue is off.'
const EMPTY = 'Nothing queued. /queue-widget add <prompt> lines up work to run back to back; until <command> keeps each going until the command passes.'
const MARKS = { clean: '✓', failed: '✗', stopped: '■' } as const
const COLORS = { clean: 'green', failed: 'red', stopped: 'yellow' } as const
const BLANK: Queue = { tasks: [], gate: '', halt: '', run: null, log: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'queue-widget', key: 'isOn' } as const, false)
const queue = atom({ plugin: 'queue-widget', key: 'queue' } as const, BLANK)

let timer: Timer | undefined

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

const label = (prompt: string): string => {
  const line = flat(prompt)

  return line.length > LABEL_CHARS ? `${line.slice(0, LABEL_CHARS - 1)}…` : line
}

const wrapped = (sentence: string, columns: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const last = rows.at(-1)

    return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
  }, [])

const isSame = (run: Run | null, sent: Run): run is Run => run !== null && run.startedAt === sent.startedAt && run.retries === sent.retries

const isDue = ({ tasks, halt, run }: Queue): boolean => (run === null ? halt === '' && tasks.length > 0 : run.phase === 'ended')

const closed = (held: Queue, outcome: Entry['outcome'], note: string, halt: string, now: number): Queue =>
  held.run === null
    ? held
    : {
        ...held,
        halt: halt === '' ? held.halt : halt,
        run: null,
        log: [...held.log, { task: held.run.task, outcome, note, retries: held.run.retries, ms: Math.max(0, now - held.run.startedAt) }].slice(-MAX_LOG),
      }

const output = (stdout: string, stderr: string): string =>
  `${stdout.trimEnd().slice(-OUTPUT_CHARS).split('\n').slice(-OUTPUT_LINES).join('\n')}\n${stderr}`.trim().slice(-OUTPUT_CHARS) || '(no output)'

const told = ({ tasks, gate, halt, run, log }: Queue): string =>
  [
    log.length === 0 ? 'Nothing has finished yet.' : `${log.filter(entry => entry.outcome === 'clean').length} of ${log.length} finished clean.`,
    ...log.map(entry => `${MARKS[entry.outcome]} ${entry.task} (${span(entry.ms)}${entry.note === '' ? '' : `; ${entry.note}`})`),
    ...(run === null ? [] : [`Running: ${run.task}${run.phase === 'sent' ? ' (sent; its turn has not started)' : ''}`]),
    ...(tasks.length > 0 ? [`${plural(tasks.length, 'prompt')} waiting.`] : []),
    ...(gate === '' ? [] : [`Gate: ${flat(gate)}`]),
    ...(halt === '' ? [] : [`Halted: ${halt}. /queue-widget start resumes.`]),
  ].join('\n')

const draw = ({ tasks, gate, halt, run, log }: Queue, inner: number): Drawn => {
  const isLong = inner >= LONG_COLUMNS
  const clean = log.filter(entry => entry.outcome === 'clean').length
  const other = log.length - clean
  const more = tasks.length - SHOWN_ROWS
  const isIdle = run === null && tasks.length === 0
  const note = halt !== '' ? 'halted' : tasks.length > 0 ? `${tasks.length} waiting` : run !== null ? 'running' : log.length > 0 && other === 0 ? 'all clean' : undefined
  const rows: Row[] = [
    ...(isIdle && log.length === 0 ? wrapped(EMPTY, inner).map((text, at) => ({ key: `empty-${at + 1}`, text })) : []),
    ...(log.length > 0
      ? [
          {
            key: 'tally',
            lead: { text: isLong ? `${clean} clean` : `${clean} ✓`, color: 'green' as const },
            text: other === 0 ? '' : isLong ? ` · ${other} not` : ` · ${other} ✗`,
            color: 'red' as const,
          },
        ]
      : []),
    ...(isIdle ? log.slice(-SHOWN_ROWS).map((entry, at) => ({ key: `done-${at + 1}`, lead: { text: MARKS[entry.outcome], color: COLORS[entry.outcome] }, text: ` ${entry.task}` })) : []),
    ...(run === null ? [] : [{ key: 'current', lead: { text: '▶', color: 'cyan' as const }, text: ` ${run.task}` }]),
    ...tasks.slice(0, SHOWN_ROWS).map((task, at) => ({ key: `waiting-${at + 1}`, text: `${at + 1} ${label(task)}`, isDim: true })),
    ...(more > 0 ? [{ key: 'more', text: `+${more} more`, isDim: true }] : []),
    ...(gate === ''
      ? []
      : [run !== null && run.retries > 0 ? { key: 'gate', text: `retry ${run.retries}/${RETRIES}: ${flat(gate)}`, color: 'yellow' as const } : { key: 'gate', text: `until: ${flat(gate)}`, isDim: true }]),
    ...(halt === '' ? [] : [{ key: 'halt', text: `■ ${halt}`, color: 'red' as const }]),
  ]

  return note === undefined ? { rows } : { note, rows }
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

  const width = fit((await $.state.get(widths)).value?.['queue-widget'] ?? CARD_COLUMNS, columns)
  const { note, rows } = draw(await read($, queue), width - CARD_EDGE)

  return $.widgets.card({
    beneath,
    width,
    title: 'Queue',
    ...(note === undefined ? {} : { note }),
    body: (
      <Box flexDirection="column">
        {rows.map(row => (
          <Text key={row.key} dimColor={row.isDim === true} wrap="truncate-end" {...(row.color === undefined ? {} : { color: row.color })}>
            {row.lead !== undefined && <Text color={row.lead.color}>{row.lead.text}</Text>}
            {row.text}
          </Text>
        ))}
      </Box>
    ),
  })
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWaiting = (await read($, isOn)) && isDue(await read($, queue))
  timer?.cancel()
  timer = isWaiting ? $.clock.after(STEP_MS, () => void step($)) : undefined
}

const cut = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  await update($, queue, held => closed(held, 'stopped', 'switched off', 'switched off', now))
}

const send = async ($: EngineInterface, args: PromptSubmitArgs, sent: Run): Promise<void> => {
  const refusal = await $.prompt.submit(args).then(
    entered => entered.drop,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
  if (refusal === undefined) return

  const now = await $.clock.now()
  await update($, queue, held => (isSame(held.run, sent) ? closed(held, 'stopped', `prompt refused: ${flat(refusal).slice(0, REASON_CHARS)}`, 'prompt refused', now) : held))
}

const settle = async ($: EngineInterface): Promise<void> => {
  const gated: { gate: string; run: Run }[] = []
  const endedAt = await $.clock.now()
  await update($, queue, (held): Queue => {
    const { run, gate } = held
    gated.length = 0
    if (run?.phase !== 'ended') return held
    if (run.ended === 'interrupted') return closed(held, 'stopped', 'turn interrupted', 'interrupted', endedAt)
    if (run.ended !== '') return closed(held, 'stopped', `turn ended with ${run.ended}`, `turn ${run.ended}`, endedAt)
    if (gate === '') return closed(held, 'clean', '', '', endedAt)
    gated.push({ gate, run })

    return { ...held, run: { ...run, phase: 'gate' } }
  })
  const [due] = gated
  if (due === undefined) return

  const shell = await $.env.get('ComSpec').catch(() => undefined)
  const ran = await $.process.run(typeof shell === 'string' && shell !== '' ? ['cmd', '/c', due.gate] : ['sh', '-c', due.gate], { timeoutMs: GATE_MS }).then(
    done => ({ isPassed: done.exitCode === 0, said: output(done.stdout, done.stderr) }),
    (error: unknown) => ({ isPassed: false, said: output('', String(error)) }),
  )
  const retried: Run[] = []
  const now = await $.clock.now()
  await update($, queue, held => {
    const { run } = held
    retried.length = 0
    if (!isSame(run, due.run) || run.phase !== 'gate') return held
    if (ran.isPassed) return closed(held, 'clean', run.retries === 0 ? 'gate passed' : `gate passed on retry ${run.retries}`, '', now)
    if (run.retries === RETRIES) return closed(held, 'failed', `gate still failing after ${RETRIES} retries`, 'gate failing', now)
    retried.push({ ...run, retries: run.retries + 1, phase: 'sent', turnId: '', ended: '' })

    return { ...held, run: retried[0] ?? run }
  })
  const [again] = retried
  if (again === undefined) return

  await send($, { text: `\`${flat(due.gate)}\` is still failing after your last change. Find the cause, fix it, and stop when you believe it passes. Its output:\n${ran.said}` }, again)
}

const take = async ($: EngineInterface): Promise<void> => {
  const taken: { prompt: string; run: Run }[] = []
  const startedAt = await $.clock.now()
  await update($, queue, held => {
    const [prompt, ...tasks] = held.tasks
    taken.length = 0
    if (held.run !== null || held.halt !== '' || prompt === undefined) return held
    taken.push({ prompt, run: { task: label(prompt), startedAt, retries: 0, phase: 'sent', turnId: '', ended: '' } })

    return { ...held, tasks, run: taken[0]?.run ?? null }
  })
  const [first] = taken
  if (first === undefined) return
  if (!(await read($, isOn))) return cut($)

  await send($, { text: first.prompt, asUser: true }, first.run)
}

const step = async ($: EngineInterface): Promise<void> => {
  if (!(await read($, isOn))) return

  await settle($)
  await take($)
  await sync($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'queue-widget',
      description: 'Toggle the Queue card, line prompts up to run back to back, or set the command each must pass',
      argumentHint: '[on|off|add <prompt>|until <command|off>|start|drop <number>|report|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'queue-widget' }, async ($, e) => {
    const typed = e.args.trim()
    const verb = (/^\S+/.exec(typed)?.[0] ?? '').toLowerCase()
    const rest = typed.slice(verb.length).trim()

    if (rest === '' && (verb === '' || verb === 'on' || verb === 'off')) {
      const isShown = await update($, isOn, shown => (verb === '' ? !(shown ?? false) : verb === 'on'))
      await $.store.set('isOn', isShown)
      if (!isShown) await cut($)
      await sync($)

      return { text: isShown ? 'Queue on; /queue-widget add <prompt> lines one up. /widgets places it.' : 'Queue off; nothing more is sent.' }
    }
    if (!(verb === 'add' || verb === 'until' || verb === 'drop' || (rest === '' && (verb === 'start' || verb === 'report' || verb === 'clear')))) return { text: USAGE }
    if (!(await read($, isOn))) return { text: OFF }

    const held = await read($, queue)
    if (verb === 'report') return { text: told(held) }
    if (verb === 'add') {
      if (rest === '') return { text: 'Add what? Try /queue-widget add run the tests and fix what fails' }
      if (held.tasks.length >= MAX_PROMPTS) return { text: `The queue is full (${plural(MAX_PROMPTS, 'prompt')}). /queue-widget drop <number> makes room.` }

      const { tasks, halt } = await update($, queue, was => ({ ...was, tasks: [...was.tasks, rest.slice(0, PROMPT_CHARS)] }))
      await sync($)

      return { text: `Queued at ${tasks.length}.${halt === '' ? '' : ` The queue is halted (${halt}); /queue-widget start resumes.`}` }
    }
    if (verb === 'until') {
      if (rest === '') return { text: 'Until what? Try /queue-widget until bun test' }

      const gate = rest.toLowerCase() === 'off' ? '' : rest.slice(0, GATE_CHARS)
      await update($, queue, was => ({ ...was, gate }))

      return {
        text:
          gate === ''
            ? 'Gate removed; a prompt is finished when its turn ends.'
            : `Gate set: after each queued prompt \`${flat(gate)}\` runs; while it fails Claude is sent its output, up to ${RETRIES} times.`,
      }
    }
    if (verb === 'drop') {
      const at = /^\d+$/.test(rest) ? Number(rest) - 1 : -1
      const dropped = held.tasks[at]
      if (dropped === undefined) return { text: `There is no waiting prompt "${rest.slice(0, ECHO_CHARS)}".` }

      await update($, queue, was => (was.tasks[at] === dropped ? { ...was, tasks: was.tasks.filter((_, index) => index !== at) } : was))
      await sync($)

      return { text: `Dropped ${at + 1}: ${label(dropped)}` }
    }
    if (verb === 'start') {
      const { tasks } = await update($, queue, was => ({ ...was, halt: '' }))
      await sync($)

      return { text: `Queue running: ${plural(tasks.length, 'prompt')} waiting.` }
    }

    await update($, queue, was => ({ ...was, tasks: [], halt: '', log: [] }))
    await sync($)

    return { text: 'Queue and report cleared.' }
  })

  on('turn.start', async ($, e, next) => {
    if (await read($, isOn)) await update($, queue, (held): Queue => (held.run?.phase === 'sent' ? { ...held, run: { ...held.run, phase: 'turn', turnId: e.turnId } } : held))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    const run = (await read($, queue)).run
    if (!(await read($, isOn)) || e.agentId !== undefined || run?.phase !== 'turn' || run.turnId !== e.turnId) return ended

    const how = e.reason === 'answer' ? '' : e.isAborted || e.reason === 'aborted' ? 'interrupted' : e.reason
    await update($, queue, (held): Queue => (held.run?.phase === 'turn' && held.run.turnId === e.turnId ? { ...held, run: { ...held.run, phase: 'ended', ended: how } } : held))
    await sync($)

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

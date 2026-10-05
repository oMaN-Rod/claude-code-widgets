import { atom, read, update } from 'claude-code'
import type { AgentInfo, AgentStatus, Elements, EngineInterface, Register, RenderElement, RenderSurface, SessionMessage, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { EarpieceRow } from '../types'
import { fit } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Said = SessionMessage[] | { deny: string } | null
type Whisper = EarpieceRow['whisper']

const PANE = 'widgets'
const CARD_COLUMNS = 40
const USAGE = 'Usage: /earpiece-widget [on|off]'
const WHISPER_USAGE = 'Usage: /whisper <number> <note>'
const HINT = '/whisper <number> <note>'
const EMPTY = `No agents running. When Claude starts subagents, each gets a row here, and ${HINT} slips one a note.`
const BLIND = 'Could not read the agents.'
const OFF = 'Earpiece is off.'
const FRAME = 'Note from the person running this session, typed while you work (sent with /whisper): '
const LIVE: readonly AgentStatus[] = ['pending', 'running', 'waiting']
const BLANK = { rows: [], next: 1, skipped: [], readAt: 0, isBlind: false }
const UNRUN = { begun: 0, landed: 0 }
const MOST = 4
const PERIOD_MS = 3000
const WAIT_MS = 3000
const SEEK_MS = 4000
const GAP_MS = 750
const LOOKS = 3
const THROTTLE_MS = 1000
const WIDE = 30
const ROOMY = 18
const HINT_COLUMNS = 24
const LINE_MAX = 200
const TOOL_MAX = 10
const NOTE_MAX = 300
const REASON_MAX = 120
const LISTED_MAX = 80
const DESCRIPTION_MAX = 80
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'earpiece-widget', key: 'isOn' } as const, false)
const roster = atom({ plugin: 'earpiece-widget', key: 'roster' } as const, BLANK)
const lap = atom({ plugin: 'earpiece-widget', key: 'lap' } as const, UNRUN)

let timer: Timer | undefined

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

const cut = (text: string, room: number): string => {
  if (text.length <= room) return text

  return room < 1 ? '' : `${text.slice(0, room - 1).trimEnd()}…`
}

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

const named = (agent: AgentInfo): string => {
  const name = flat(agent.description) || flat(agent.type) || 'agent'

  return name.length <= DESCRIPTION_MAX ? name : `${name.slice(0, DESCRIPTION_MAX - 1)}…`
}

const isLive = (row: EarpieceRow): boolean => row.status === 'live' || row.status === 'waiting'

const ranked = (rows: readonly EarpieceRow[]): EarpieceRow[] =>
  [...rows].sort((one, other) => Number(isLive(other)) - Number(isLive(one)) || one.number - other.number)

const wordOf = (row: EarpieceRow): string => {
  if (!isLive(row)) return row.status

  return row.tool || (row.status === 'waiting' ? 'waiting' : '')
}

const lineOf = (said: readonly SessionMessage[]): string => {
  const last = said.findLast(message => message.role === 'assistant' && message.text.trim() !== '')

  return last === undefined ? '' : (flat(last.text).split(/(?<=[.!?])\s+/).at(-1) ?? '').slice(0, LINE_MAX)
}

const toolOf = (said: readonly SessionMessage[]): string => {
  const use = said.findLast(message => message.role === 'assistant')?.toolUses.at(-1)
  if (use === undefined || use.text !== undefined) return ''

  return (use.tool.startsWith('mcp__') ? use.tool.split('__').slice(2).join('__') || use.tool : use.tool).slice(0, TOOL_MAX)
}

const weigh = (whisper: Whisper, said: readonly SessionMessage[] | undefined, isOver: boolean): Whisper => {
  if (whisper?.status !== 'sent') return whisper

  const answers = said?.filter(message => message.role === 'assistant').length
  if (answers !== undefined && whisper.seen !== null && answers > whisper.seen) return { ...whisper, status: 'heard' }

  return { ...whisper, seen: whisper.seen ?? answers ?? null, status: isOver ? 'missed' : 'sent' }
}

const statusOf = (agent: AgentInfo | undefined): EarpieceRow['status'] => {
  if (agent === undefined) return 'done'
  if (agent.status === 'waiting') return 'waiting'
  if (LIVE.includes(agent.status)) return 'live'
  if (agent.status === 'failed') return 'failed'

  return agent.status === 'killed' ? 'stopped' : 'done'
}

const settle = (row: EarpieceRow, agent: AgentInfo | undefined, said: Said | undefined): EarpieceRow => {
  const status = isLive(row) ? statusOf(agent) : row.status
  const isOver = status !== 'live' && status !== 'waiting'
  const texts = Array.isArray(said) ? said : undefined

  return {
    ...row,
    status,
    line: texts === undefined ? row.line : lineOf(texts),
    tool: isOver ? '' : texts === undefined ? row.tool : toolOf(texts),
    isUnread: said === undefined ? row.isUnread : texts === undefined,
    whisper: weigh(row.whisper, texts, isOver),
  }
}

const listing = (row: EarpieceRow): string =>
  [`${row.number} ${row.description}`, wordOf(row), row.whisper?.status ?? '', row.isUnread ? 'unread' : '', cut(row.line, LISTED_MAX)].filter(part => part !== '').join(' · ')

const face = ({ Box, Text }: Tags, row: EarpieceRow, inner: number): RenderElement[] => {
  const isOver = !isLive(row)
  const heard = row.whisper?.status ?? ''
  const mark = inner >= WIDE ? [wordOf(row), heard].filter(part => part !== '').join(' · ') : heard || wordOf(row)
  const head = `${row.number}`
  const room = Math.max(0, inner - head.length - 1 - (mark === '' ? 0 : mark.length + 1))

  return [
    <Box key={`agent-${row.number}`} justifyContent="space-between">
      <Text key={`name-${row.number}`} wrap="truncate-end" dimColor={isOver}>
        <Text bold>{head}</Text>
        {` ${cut(row.description, room)}`}
      </Text>
      <Text key={`mark-${row.number}`} wrap="truncate-end" dimColor={isOver} color={isOver ? undefined : heard === 'heard' ? 'green' : heard === 'sent' ? 'yellow' : 'cyan'}>
        {mark}
      </Text>
    </Box>,
    <Text key={`line-${row.number}`} wrap="truncate-end" dimColor>
      {`  ${cut(row.line || 'starting…', inner - 2)}`}
    </Text>,
  ]
}

const roll = async ($: EngineInterface): Promise<AgentInfo[] | undefined> => {
  try {
    return await $.agent.list()
  } catch {
    return undefined
  }
}

const peek = async ($: EngineInterface, agentId: string): Promise<Said> => {
  try {
    return await $.session.messages({ agentId })
  } catch {
    return null
  }
}

const slip = async ($: EngineInterface, agentId: string, note: string): Promise<string | undefined> => {
  try {
    const kept = await $.session.append({ agentId, message: { type: 'user', content: [{ type: 'text', text: note }] } })

    return typeof kept.uuid === 'string' ? undefined : (kept.deny ?? '')
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const begin = async ($: EngineInterface): Promise<number> =>
  (await update($, lap, kept => ({ ...(kept ?? UNRUN), begun: (kept ?? UNRUN).begun + 1 }))).begun

const land = async ($: EngineInterface, ticket: number): Promise<boolean> =>
  (await update($, lap, kept => ((kept ?? UNRUN).landed > ticket ? (kept ?? UNRUN) : { ...(kept ?? UNRUN), landed: ticket }))).landed === ticket

const outdate = async ($: EngineInterface): Promise<void> => {
  await land($, await begin($))
}

const refresh = async ($: EngineInterface): Promise<number> => {
  if (!(await read($, isOn))) return 0

  const ticket = await begin($)
  const held = await read($, roster)
  const listed = await roll($)
  if (listed === undefined) {
    if (await land($, ticket)) await update($, roster, kept => ({ ...(kept ?? BLANK), isBlind: true }))

    return 0
  }

  const agents = new Map(listed.map(agent => [agent.id, agent]))
  const isRunning = (id: string): boolean => LIVE.includes(agents.get(id)?.status ?? 'completed')
  const wanted = new Set([
    ...listed.filter(agent => isRunning(agent.id) && !held.skipped.includes(agent.id) && !held.rows.some(row => row.id === agent.id)).map(agent => agent.id),
    ...ranked(held.rows.filter(row => isLive(row) && isRunning(row.id))).slice(0, MOST).map(row => row.id),
    ...held.rows.filter(row => isLive(row) && (!isRunning(row.id) || row.whisper?.status === 'sent')).map(row => row.id),
  ])
  const seen = new Map(await Promise.all([...wanted].map(async id => [id, await peek($, id)] as const)))
  if (!(await land($, ticket))) return 0

  let found = 0
  await update($, roster, kept => {
    const base = kept ?? BLANK
    const fresh = listed.filter(
      agent => seen.has(agent.id) && isRunning(agent.id) && !base.skipped.includes(agent.id) && !base.rows.some(row => row.id === agent.id),
    )
    found = fresh.length
    const isDenied = (agent: AgentInfo): boolean => {
      const said = seen.get(agent.id)

      return said !== undefined && said !== null && !Array.isArray(said)
    }
    const added = fresh
      .filter(agent => !isDenied(agent))
      .map((agent, at) =>
        settle(
          { id: agent.id, number: base.next + at, description: named(agent), status: 'live', tool: '', line: '', isUnread: true, whisper: null },
          agent,
          seen.get(agent.id),
        ),
      )

    return {
      rows: [...base.rows.map(row => settle(row, agents.get(row.id), seen.get(row.id))), ...added],
      next: base.next + added.length,
      skipped: [...base.skipped, ...fresh.filter(isDenied).map(agent => agent.id)],
      readAt: base.readAt,
      isBlind: false,
    }
  })
  await sync($)

  return found
}

const kick = ($: EngineInterface): void => {
  void refresh($).catch(() => undefined)
}

const within = async ($: EngineInterface, ms: number, work: () => Promise<unknown>): Promise<void> => {
  await new Promise<void>(done => {
    const wait = $.clock.after(ms, done)
    void work()
      .catch(() => undefined)
      .then(() => {
        wait.cancel()
        done()
      })
  })
}

const pause = async ($: EngineInterface, ms: number): Promise<void> => {
  await new Promise<void>(done => {
    $.clock.after(ms, done)
  })
}

const catchUp = async ($: EngineInterface): Promise<void> => within($, WAIT_MS, () => refresh($))

const seek = async ($: EngineInterface, number: number): Promise<void> => {
  let isSought = true
  await within($, SEEK_MS, async () => {
    for (let look = 0; look < LOOKS; look += 1) {
      if (look > 0) await pause($, GAP_MS)
      if (!isSought) return

      await refresh($)
      const held = await read($, roster)
      if (held.isBlind || held.rows.some(row => row.number === number)) return
    }
  })
  isSought = false
}

const follow = async ($: EngineInterface): Promise<void> => {
  for (let look = 0; look < LOOKS; look += 1) {
    if (look > 0) await pause($, GAP_MS)
    if (!(await read($, isOn)) || (await refresh($)) > 0) return
  }
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = (await read($, isOn)) && (await read($, roster)).rows.some(isLive)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(PERIOD_MS, () => kick($))
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const glance = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  let isDue = false
  await update($, roster, kept => {
    const base = kept ?? BLANK
    isDue = now - base.readAt >= THROTTLE_MS

    return isDue ? { ...base, readAt: now } : base
  })
  if (isDue) kick($)
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

  const width = fit((await $.state.get(widths)).value?.['earpiece-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const held = await read($, roster)
  const live = held.rows.filter(isLive).length
  const drawn = ranked(held.rows)
  const isQuiet = held.isBlind || held.rows.length === 0

  return $.widgets.card({
    beneath,
    width,
    title: 'Earpiece',
    ...(isQuiet ? {} : { note: live === 0 ? 'done' : live <= 99 ? `${live} live` : inner < ROOMY ? '99+' : '99+ live' }),
    body: isQuiet ? (
      <Box key={held.isBlind ? 'blind' : 'empty'} flexDirection="column">
        {wrapped(held.isBlind ? BLIND : EMPTY, inner).map((line, at) => (
          <Text key={`say-${at}`} wrap="truncate-end" color={held.isBlind ? 'red' : undefined}>
            {line}
          </Text>
        ))}
      </Box>
    ) : (
      <Box key="agents" flexDirection="column">
        {drawn.slice(0, MOST).flatMap(row => face({ Box, Text }, row, inner))}
        {drawn.length > MOST && (
          <Text key="more" wrap="truncate-end" dimColor>
            +{drawn.length - MOST} more
          </Text>
        )}
        {live > 0 && inner >= HINT_COLUMNS && (
          <Text key="hint" wrap="truncate-end" dimColor>
            {HINT}
          </Text>
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'earpiece-widget',
      description: 'Toggle the Earpiece card',
      argumentHint: '[on|off]',
    })
    await $.command.register({
      name: 'whisper',
      description: 'Slip a note to one running subagent on the Earpiece card',
      argumentHint: '<number> <note>',
      immediate: true,
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if (await read($, isOn)) await catchUp($)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'earpiece-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await catchUp($)
    else {
      await outdate($)
      await update($, roster, () => BLANK)
    }
    await sync($)

    return { text: isShown ? 'Earpiece on; /widgets places it.' : 'Earpiece off.' }
  })

  on('command.run', { command: 'whisper' }, async ($, e) => {
    if (!(await read($, isOn))) return { text: OFF }

    const args = e.args.trim()
    if (args === '') {
      await catchUp($)
      const shown = await read($, roster)
      if (shown.isBlind) return { text: BLIND }

      return { text: shown.rows.length === 0 ? 'No agents on the card.' : shown.rows.map(listing).join('\n') }
    }

    const asked = /^(\d{1,4})\s+(\S[\s\S]*)$/.exec(args)
    if (asked === null) return { text: WHISPER_USAGE }

    const text = asked[2] ?? ''
    if (text.length > NOTE_MAX) return { text: `A whisper is at most ${NOTE_MAX} characters.` }

    const number = Number(asked[1])
    if (!(await read($, roster)).rows.some(kept => kept.number === number)) await seek($, number)

    const held = await read($, roster)
    const row = held.rows.find(kept => kept.number === number)
    if (row === undefined && !held.isBlind) return { text: `No agent ${number} on the card.` }

    const listed = await roll($)
    if (listed === undefined) return { text: BLIND }
    if (row === undefined) return { text: `No agent ${number} on the card.` }
    if (!listed.some(agent => agent.id === row.id && LIVE.includes(agent.status))) return { text: `Agent ${number} has finished.` }

    const note = `${FRAME}${text}`
    const refusal = await slip($, row.id, note)
    if (refusal !== undefined) return { text: `Agent ${number} could not be reached: ${cut(flat(refusal), REASON_MAX) || 'no reason given'}` }

    await outdate($)
    await update($, roster, kept => ({
      ...(kept ?? BLANK),
      rows: (kept ?? BLANK).rows.map(other => (other.id === row.id ? { ...other, whisper: { note, status: 'sent' as const, seen: null } } : other)),
    }))
    kick($)

    return { text: `Whispered to agent ${number} (${row.description}). The card says heard once it has answered.` }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (await read($, isOn)) void follow($).catch(() => undefined)

    return started
  })

  on('tool.call', ($, e, next) => {
    if (e.agentId !== undefined) {
      void read($, isOn)
        .then(shown => (shown ? glance($) : undefined))
        .catch(() => undefined)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined && (await read($, isOn))) kick($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (await read($, isOn)) {
      await update($, roster, kept => {
        const rows = (kept ?? BLANK).rows.filter(isLive)

        return { ...(kept ?? BLANK), rows, next: rows.length === 0 ? 1 : (kept ?? BLANK).next }
      })
    }

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

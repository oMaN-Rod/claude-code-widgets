import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { SessionsPeer } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const BEAT_MS = 10_000
const STALE_MS = 35_000
const FILE = '.sessions.json'
const NOBODY: SessionsPeer = { id: '', cwd: '', branch: '', isBusy: false, at: 0, since: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'sessions-widget', key: 'isOn' } as const, false)
const me = atom({ plugin: 'sessions-widget', key: 'me' } as const, NOBODY)
const peers = atom({ plugin: 'sessions-widget', key: 'peers' } as const, [])

let timer: Timer | undefined

const isPeers = (value: unknown): value is SessionsPeer[] =>
  Array.isArray(value) &&
  value.every(peer => typeof peer === 'object' && peer !== null && typeof (peer as SessionsPeer).id === 'string')

const folderOf = (cwd: string): string => cwd.replaceAll('\\', '/').split('/').filter(Boolean).pop() ?? cwd

const beat = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  const mine = await update($, me, held => ({ ...(held ?? NOBODY), at: now }))
  if (mine.id === '') return

  let kept: unknown = []
  try {
    kept = JSON.parse(await $.fs.read(`${$.plugin.root}/${FILE}`))
  } catch {
    kept = []
  }
  const others = (isPeers(kept) ? kept : []).filter(peer => peer.id !== mine.id && now - peer.at < STALE_MS)
  await $.fs.write(`${$.plugin.root}/${FILE}`, JSON.stringify([...others, mine])).catch(() => undefined)
  await update($, peers, () => others)
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(BEAT_MS, () => {
      void beat($)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const enrol = async ($: EngineInterface, cwd: string): Promise<void> => {
  const now = await $.clock.now()
  let branch = ''
  try {
    const head = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
    branch = head.exitCode === 0 ? head.stdout.trim() : ''
  } catch {
    branch = ''
  }
  const id = await $.session.id().catch(() => `${now}-${Math.floor(Math.random() * 1_000_000)}`)
  await update($, me, held => ({
    id: (held ?? NOBODY).id === '' ? id : (held ?? NOBODY).id,
    cwd: cwd === '' ? (held ?? NOBODY).cwd : cwd,
    branch,
    isBusy: (held ?? NOBODY).isBusy,
    at: now,
    since: (held ?? NOBODY).since === 0 ? now : (held ?? NOBODY).since,
  }))
}

const span = (ms: number): string => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return ''

  return minutes < 60 ? ` ${minutes}m` : ` ${Math.floor(minutes / 60)}h`
}

const mark = async ($: EngineInterface, isBusy: boolean): Promise<void> => {
  const now = await $.clock.now()
  await update($, me, held => ((held ?? NOBODY).isBusy === isBusy ? (held ?? NOBODY) : { ...(held ?? NOBODY), isBusy, since: now }))
  if (await read($, isOn)) await beat($)
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

  const wanted = (await $.state.get(widths)).value?.['sessions-widget'] ?? CARD_COLUMNS
  const mine = await read($, me)
  const others = await read($, peers)
  const now = await $.clock.now()

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: 'Sessions',
    note: `${others.length + 1} open`,
    body: (
      <Box flexDirection="column">
        {[mine, ...others].map((peer, index) => (
          <Box columnGap={1}>
            <Text color={peer.isBusy ? 'yellow' : 'green'}>●</Text>
            <Box flexGrow={1}>
              <Text wrap="truncate-end" bold={index === 0}>
                {index > 0 && <Text color="cyan">{index} </Text>}
                {folderOf(peer.cwd) || 'this session'}
                {peer.branch !== '' && <Text dimColor> {peer.branch}</Text>}
              </Text>
            </Box>
            <Text dimColor>
              {index === 0 ? 'here' : `${peer.isBusy ? 'busy' : 'waiting'}${span(now - (peer.since ?? peer.at))}`}
            </Text>
          </Box>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sessions-widget',
      description: 'Toggle the card listing the other Claude Code sessions open on this machine',
      argumentHint: '[on|off]',
    })
    await $.command.register({
      name: 'relay',
      description: 'Send a line to another session listed on the sessions card',
      argumentHint: '<number> <message>',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await enrol($, e.cwd)
    if (await read($, isOn)) await beat($)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'sessions-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /sessions-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) {
      await enrol($, '')
      await beat($)
    }
    await sync($)

    return { text: isShown ? 'Sessions on; /widgets places it.' : 'Sessions off.' }
  })

  on('command.run', { command: 'relay' }, async ($, e) => {
    const sent = /^(\d+)\s+(.+)$/s.exec(e.args.trim())
    if (sent === null) return { text: 'Usage: /relay <number> <message>, the number shown on the sessions card' }

    await beat($)
    const peer = (await read($, peers))[Number(sent[1]) - 1]
    if (peer === undefined) return { text: `No session ${sent[1]} on the card.` }

    const done = await $.session
      .send({ to: { sessionId: peer.id }, text: sent[2] ?? '' })
      .catch(error => ({ isDelivered: false as const, reason: String(error) }))

    return {
      text: done.isDelivered
        ? `Sent to ${folderOf(peer.cwd)}. It reads it as a message from this session.`
        : `Not delivered to ${folderOf(peer.cwd)}: ${done.reason}`,
    }
  })

  on('turn.start', async ($, e, next) => {
    await mark($, true)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await mark($, false)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

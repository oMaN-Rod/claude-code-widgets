import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { SessionsPeer } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const BEAT_MS = 10_000
const STALE_MS = 35_000
const NOBODY: SessionsPeer = { id: '', cwd: '', branch: '', isBusy: false, at: 0 }
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

  const kept = await $.store.get('peers')
  const others = (isPeers(kept) ? kept : []).filter(peer => peer.id !== mine.id && now - peer.at < STALE_MS)
  await $.store.set('peers', [...others, mine])
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
  await update($, me, held => ({
    id: (held ?? NOBODY).id === '' ? `${now}-${Math.floor(Math.random() * 1_000_000)}` : (held ?? NOBODY).id,
    cwd: cwd === '' ? (held ?? NOBODY).cwd : cwd,
    branch,
    isBusy: (held ?? NOBODY).isBusy,
    at: now,
  }))
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
                {folderOf(peer.cwd) || 'this session'}
                {peer.branch !== '' && <Text dimColor> {peer.branch}</Text>}
              </Text>
            </Box>
            <Text dimColor>{index === 0 ? 'here' : peer.isBusy ? 'busy' : 'idle'}</Text>
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

  on('turn.start', async ($, e, next) => {
    await update($, me, held => ({ ...(held ?? NOBODY), isBusy: true }))
    if (await read($, isOn)) await beat($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, me, held => ({ ...(held ?? NOBODY), isBusy: false }))
      if (await read($, isOn)) await beat($)
    }

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

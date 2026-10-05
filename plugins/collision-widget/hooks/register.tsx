import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, FsEntry, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { CollisionHeld, CollisionMeet, CollisionWatch } from '../types'
import { fit, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Peer = CollisionHeld & { place: string }
type Peers = Record<string, Peer>
type Shared = { id: string; cwd: string; files: Record<string, CollisionHeld> }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const USAGE = 'Usage: /collision-widget [on|off|clear]'
const WINDOW_MS = 30 * 60_000
const STALE_MS = 24 * 3_600_000
const STARTED_SLACK_MS = 1000
const OWN_EDIT_MS = 2000
const FILES = 60
const MEETS = 6
const STATS = 40
const SEEN = 200
const WRITE_PASSES = 3
const ROW_COLUMNS = 30
const PLACE_LETTERS = 8
const FRAME_COLUMNS = 4
const GLYPH_COLUMNS = 2
const NO_PLACE = 'root'
const EDITS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']
const WORD_BREAKS = /[\s"'`<>|;&()]+/
const EMPTY = 'No shared files. A file appears here when another session edits one that this session edits.'
const NO_WRITE = 'Cannot write the shared folder. Others cannot see edits made here.'
const NO_HOME = 'No home folder found. Cannot watch other sessions.'
const STATES = [
  { state: 'stopped', glyph: '✕', color: 'red', legend: 'edit stopped' },
  { state: 'changed', glyph: '!', color: 'yellow', legend: 'Bash changed' },
  { state: 're-read', glyph: '✓', color: 'green', legend: 'read again' },
] as const
const REST: CollisionWatch = { slot: '', wrote: null, mine: {}, seen: {}, meets: [], others: 0, isBlind: false }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'collision-widget', key: 'isOn' } as const, false)
const watch = atom({ plugin: 'collision-widget', key: 'watch' } as const, REST)

const slashed = (path: string): string => path.replaceAll('\\', '/')

const isDrive = (part: string | undefined): boolean => part !== undefined && /^[a-z]:$/i.test(part)

const absolute = (path: string, cwd: string): string => {
  const base = slashed(cwd)
  const mounted = /^[a-z]:/i.test(base) ? slashed(path).replace(/^\/([a-z])(?=\/|$)/i, '$1:') : slashed(path)
  const whole = /^[a-z]:|^\//i.test(mounted) ? mounted : `${base}/${mounted}`
  const parts: string[] = []
  for (const part of whole.split('/')) {
    if (part === '..' && !isDrive(parts[parts.length - 1])) parts.pop()
    else if (part !== '' && part !== '.' && part !== '..') parts.push(part)
  }

  return `${whole.startsWith('/') ? '/' : ''}${parts.join('/')}`
}

const lastOf = (path: string): string => slashed(path).split('/').filter(part => part !== '').pop() ?? ''

const placeOf = (cwd: string): string => {
  const last = lastOf(cwd)

  return last === '' || isDrive(last) ? NO_PLACE : last
}

const pathIn = (input: unknown): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined
  const { file_path: file, notebook_path: notebook } = input as { file_path?: unknown; notebook_path?: unknown }
  const path = file ?? notebook

  return typeof path === 'string' && path !== '' ? path : undefined
}

const isHeld = (value: unknown): value is CollisionHeld =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CollisionHeld).path === 'string' &&
  typeof (value as CollisionHeld).at === 'number'

const sharedOf = (text: string): Shared | undefined => {
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null) return undefined
    const { id, cwd, at, files } = value as Record<string, unknown>
    if (typeof id !== 'string' || typeof cwd !== 'string' || typeof at !== 'number') return undefined
    if (typeof files !== 'object' || files === null) return undefined

    return { id, cwd, files: Object.fromEntries(Object.entries(files).filter((entry): entry is [string, CollisionHeld] => isHeld(entry[1]))) }
  } catch {
    return undefined
  }
}

const evicted = (mine: Record<string, CollisionHeld>, now: number): Record<string, CollisionHeld> =>
  Object.fromEntries(
    Object.entries(mine)
      .filter(([, held]) => now - held.at <= WINDOW_MS)
      .sort(([, one], [, other]) => other.at - one.at)
      .slice(0, FILES),
  )

const capped = (seen: Record<string, number>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(seen)
      .sort(([, one], [, other]) => other - one)
      .slice(0, SEEN),
  )

const met = (meets: readonly CollisionMeet[], meet: CollisionMeet): CollisionMeet[] =>
  [meet, ...meets.filter(old => old.key !== meet.key)].slice(0, MEETS)

const clipped = (name: string, room: number): string =>
  name.length <= room ? name : `…${name.slice(name.length - Math.max(0, room - 1))}`

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').filter(word => word !== '').reduce<string[]>((lines, word) => {
    const last = lines[lines.length - 1]

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

const fileOf = (id: string): string => `${id.replace(/[^\w.-]/g, '_')}.json`

const dirOf = async ($: EngineInterface): Promise<string | null> => {
  const held = (await read($, watch)).dir
  if (held !== undefined) return held

  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = config || (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const base = slashed(home ?? '').replace(/\/+$/, '')
  const dir = !home ? null : config ? `${base}/collision-widget` : `${base}/.claude/collision-widget`
  await update($, watch, kept => ({ ...kept, dir }))

  return dir
}

const idOf = async ($: EngineInterface): Promise<string | undefined> => {
  try {
    return (await $.session.id()) || undefined
  } catch {
    return undefined
  }
}

const scan = async ($: EngineInterface, dir: string, id: string, now: number): Promise<Peers> => {
  const { slot, wrote, others } = await read($, watch)
  const entries = await $.fs.list(dir).catch((): FsEntry[] => [])
  const peers: Peers = {}
  const ids = new Set<string>()
  let isTaken = false
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json') || !(entry.mtimeMs >= now - WINDOW_MS)) continue
    const shared = sharedOf(await $.fs.read(`${dir}/${entry.name}`).catch(() => ''))
    if (shared === undefined || shared.id === id || shared.id === wrote) continue

    ids.add(shared.id)
    isTaken ||= entry.name === slot
    const place = placeOf(shared.cwd)
    for (const [key, held] of Object.entries(shared.files)) {
      if (now - held.at <= WINDOW_MS && held.at > (peers[key]?.at ?? 0)) peers[key] = { ...held, place }
    }
  }
  if (isTaken || ids.size !== others) {
    await update($, watch, kept => ({ ...kept, others: ids.size, slot: isTaken && kept.slot === slot ? fileOf(id) : kept.slot }))
  }

  return peers
}

const slotOf = async ($: EngineInterface, dir: string, id: string, now: number): Promise<string> => {
  const entries = await $.fs.list(dir).catch((): FsEntry[] => [])
  const oldest = entries
    .filter(entry => entry.kind === 'file' && entry.name.endsWith('.json') && entry.mtimeMs > 0)
    .sort((one, other) => one.mtimeMs - other.mtimeMs)[0]

  return oldest !== undefined && now - oldest.mtimeMs > STALE_MS ? oldest.name : fileOf(id)
}

const publish = async ($: EngineInterface, dir: string, id: string, now: number): Promise<void> => {
  const cwd = await $.session.cwd()
  const chosen = (await read($, watch)).slot || (await slotOf($, dir, id, now))
  for (let pass = 0; pass < WRITE_PASSES; pass += 1) {
    const held = await update($, watch, kept => ({ ...kept, slot: kept.slot || chosen, mine: evicted(kept.mine, now) }))
    const isWritten = await $.fs.write(`${dir}/${held.slot}`, JSON.stringify({ id, cwd, at: now, files: held.mine })).then(
      () => true,
      () => false,
    )
    const after = await update($, watch, kept => ({ ...kept, wrote: isWritten ? id : kept.wrote, isBlind: !isWritten }))
    if (!isWritten || JSON.stringify(after.mine) === JSON.stringify(held.mine)) return
  }
}

const touched = async (
  $: EngineInterface,
  command: string,
  cwd: string,
  started: number,
  now: number,
  peers: Peers,
): Promise<Record<string, CollisionHeld>> => {
  const named = command
    .split(WORD_BREAKS)
    .filter(word => word !== '')
    .map((word): [string, string] => {
      const path = absolute(word, cwd)

      return [path.toLowerCase(), path]
    })
  const candidates = [...new Map([...Object.entries(peers).map(([key, peer]): [string, string] => [key, peer.path]), ...named])].slice(0, STATS)
  const found = await Promise.all(
    candidates.map(async ([key, path]): Promise<[string, CollisionHeld][]> => {
      const stat = await $.fs.stat(path).catch(() => undefined)
      if (stat === undefined || stat.kind !== 'file' || stat.mtimeMs < started - STARTED_SLACK_MS) return []
      const peer = peers[key]
      if (peer !== undefined && stat.mtimeMs <= peer.at + OWN_EDIT_MS) return []

      return [[key, { path, at: Math.min(stat.mtimeMs, now) }]]
    }),
  )

  return Object.fromEntries(found.flat())
}

const wipe = async ($: EngineInterface): Promise<void> => {
  await update($, watch, kept => ({ ...kept, mine: {}, seen: {}, meets: [] }))
  const dir = await dirOf($)
  const id = dir === null ? undefined : await idOf($)
  if (dir !== null && id !== undefined) await publish($, dir, id, await $.clock.now())
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

  const width = fit((await $.state.get(widths)).value?.['collision-widget'] ?? CARD_COLUMNS, columns)
  const { dir, mine, meets, others, isBlind } = await read($, watch)
  const files = Object.keys(mine).length
  const error = dir === null ? NO_HOME : isBlind ? NO_WRITE : undefined
  const isWide = width >= ROW_COLUMNS
  const isResting = error === undefined && meets.length === 0
  const isEmpty = isResting && files === 0 && others === 0
  const hasCounts = isResting && !isEmpty
  const inner = width - FRAME_COLUMNS
  const room = inner - GLYPH_COLUMNS
  const rows = meets.map((meet, at) => {
    const { glyph, color } = STATES.find(known => known.state === meet.state) ?? STATES[0]
    const name = lastOf(meet.path)
    const spot = meet.place.length > PLACE_LETTERS ? `${meet.place.slice(0, PLACE_LETTERS - 1)}…` : meet.place
    const side = `${spot} · ${meet.state}`

    return (
      <Box key={`meet-${at}`} justifyContent="space-between" columnGap={1}>
        <Box columnGap={1}>
          <Text color={color}>{glyph}</Text>
          <Text wrap="truncate-start">{clipped(name, isWide ? room - side.length - 1 : room)}</Text>
        </Box>
        {isWide ? (
          <Box columnGap={1}>
            <Text dimColor wrap="truncate-end">{`${spot} ·`}</Text>
            <Text color={color} wrap="truncate-end">
              {meet.state}
            </Text>
          </Box>
        ) : null}
      </Box>
    )
  })
  const legend = isWide
    ? []
    : STATES.filter(known => meets.some(meet => meet.state === known.state)).map(known => (
        <Box key={`legend-${known.state}`} columnGap={1}>
          <Text color={known.color}>{known.glyph}</Text>
          <Text dimColor wrap="truncate-end">
            {known.legend}
          </Text>
        </Box>
      ))

  return $.widgets.card({
    beneath,
    width,
    title: 'Collision',
    note: error !== undefined ? 'blind' : meets.length > 0 ? `${meets.length} met` : files > 0 ? 'clear' : 'idle',
    body: (
      <Box flexDirection="column">
        {rows}
        {legend}
        {hasCounts ? (
          <Text key="files" wrap="truncate-end">
            {files === 0 ? 'No files edited' : `${plural(files, 'file')} edited`}
          </Text>
        ) : null}
        {hasCounts ? (
          <Text key="others" dimColor wrap="truncate-end">
            {others === 0 ? 'No others nearby' : `${plural(others, 'other')} nearby`}
          </Text>
        ) : null}
        {wrapped(error ?? (isEmpty ? EMPTY : ''), inner).map((line, at) => (
          <Text key={`prose-${at}`} color={error === undefined ? undefined : 'red'} dimColor={error === undefined} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'collision-widget',
      description: 'Toggle the Collision card, or clear what it has recorded',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'collision-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'clear') {
      if (!(await read($, isOn))) return { text: 'Collision is off.' }

      await wipe($)

      return { text: 'Collision cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Collision on; /widgets places it.' : 'Collision off.' }
  })

  on('tool.check', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const verdict = await next(e)
    const path = pathIn(e.input)
    if (e.tool_use_id === undefined || verdict.decision === 'deny' || !EDITS.includes(e.tool) || path === undefined) return verdict

    const dir = await dirOf($)
    const id = dir === null ? undefined : await idOf($)
    if (dir === null || id === undefined) return verdict

    const now = await $.clock.now()
    const key = absolute(path, await $.session.cwd()).toLowerCase()
    const peer = (await scan($, dir, id, now))[key]
    if (peer === undefined || peer.at <= ((await read($, watch)).seen[key] ?? 0)) return verdict

    const name = lastOf(path)
    await update($, watch, kept => ({ ...kept, meets: met(kept.meets, { key, path, place: peer.place, at: peer.at, state: 'stopped' }) }))

    return {
      decision: 'deny',
      reason: `collision-widget: ${name} was edited by another Claude Code session (in ${peer.place}) ${span(now - peer.at)} ago, after this session last read it. Read the file again, then repeat the edit, and tell the user that two sessions are working on this file.`,
    }
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const tool: string = e.tool
    const started = tool === 'Bash' ? await $.clock.now() : 0
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const path = pathIn(e)
    const isRead = tool === 'Read' && path !== undefined
    const isEdit = EDITS.includes(tool) && path !== undefined
    const command = e.tool === 'Bash' && ran.isReadOnly !== true ? e.command : ''
    if (!isRead && !isEdit && command === '') return ran

    const dir = await dirOf($)
    if (dir === null) return ran

    const cwd = await $.session.cwd()
    if (isRead) {
      const now = await $.clock.now()
      const key = absolute(path, cwd).toLowerCase()
      await update($, watch, kept => ({
        ...kept,
        seen: capped({ ...kept.seen, [key]: now }),
        meets: kept.meets.map(meet => (meet.key === key ? { ...meet, state: 're-read' as const } : meet)),
      }))

      return ran
    }

    const id = await idOf($)
    if (id === undefined) return ran

    const now = await $.clock.now()
    if (isEdit) {
      const whole = absolute(path, cwd)
      const key = whole.toLowerCase()
      await update($, watch, kept => ({
        ...kept,
        mine: { ...kept.mine, [key]: { path: whole, at: now } },
        seen: capped({ ...kept.seen, [key]: now }),
      }))
      await publish($, dir, id, now)

      return ran
    }

    const peers = await scan($, dir, id, now)
    const mine = await touched($, command, cwd, started, now, peers)
    if (Object.keys(mine).length === 0) return ran

    const { seen, meets } = await read($, watch)
    const fresh = Object.entries(mine).flatMap(([key, held]): CollisionMeet[] => {
      const peer = peers[key]
      const known = Math.max(seen[key] ?? 0, meets.find(meet => meet.key === key)?.at ?? 0)

      return peer === undefined || peer.at <= known ? [] : [{ key, path: held.path, place: peer.place, at: peer.at, state: 'changed' }]
    })
    await update($, watch, kept => ({ ...kept, mine: { ...kept.mine, ...mine }, meets: fresh.reduce(met, kept.meets) }))
    await publish($, dir, id, now)
    if (fresh.length === 0) return ran

    return {
      ...ran,
      context: [
        ...(ran.context ?? []),
        ...fresh.map(
          meet =>
            `collision-widget: this command changed ${lastOf(meet.path)}, which another Claude Code session (in ${meet.place}) edited ${span(now - meet.at)} ago. Read the file again before editing it further, and tell the user.`,
        ),
      ],
    }
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

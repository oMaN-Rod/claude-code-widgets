import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Report = PluginState['outage-widget']['reports'][number]
type Incident = NonNullable<Report['incident']>
type Provider = {
  key: string
  name: string
  short: string
  page: string
  hosts: readonly string[]
  alone: readonly string[]
  programs: readonly string[]
  verbs: readonly string[]
  parts: RegExp
}
type Row = { text: string; color?: 'red' | 'yellow'; isDim?: boolean }
type Drawn = { note?: string; rows: Row[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_EDGE = 4
const WIDE_COLUMNS = 30
const USAGE = 'Usage: /outage-widget [on|off|check|clear]'
const OFF = 'Outage is off.'
const NOTHING = 'Nothing to check yet: no network command has failed.'
const EMPTY_WIDE = "No network failure yet. When a push or install fails on the network, the provider's status page is checked and its answer shows here."
const EMPTY_SHORT = "No network failure yet. A failed push or install is checked against the provider's status page."
const LAG = 'A status page can lag an outage.'
const FEED = '/api/v2/incidents/unresolved.json'
const LIMIT_MS = 2000
const FRESH_MS = 180_000
const POLL_MS = 60_000
const MOST_REPORTS = 4
const MOST_PARTS = 3
const NAME_CHARS = 80
const PART_CHARS = 40
const HOST_CHARS = 60
const IMPACTS = ['minor', 'major', 'critical'] as const
const GIT_VERBS = ['push', 'pull', 'fetch', 'clone', 'ls-remote']
const NODE_VERBS = ['install', 'i', 'ci', 'add', 'update', 'upgrade', 'publish', 'dlx', 'x', 'view', 'info', 'outdated', 'audit']
const PYTHON_VERBS = ['install', 'download', 'add', 'sync', 'lock', 'update', 'upgrade', 'publish', 'upload', 'pip', 'tool']
const CARGO_VERBS = ['build', 'check', 'install', 'add', 'update', 'fetch', 'publish', 'search', 'generate-lockfile']
const PROVIDERS: readonly Provider[] = [
  {
    key: 'github',
    name: 'GitHub',
    short: 'GitHub',
    page: 'www.githubstatus.com',
    hosts: ['github.com', 'githubusercontent.com'],
    alone: ['gh'],
    programs: [],
    verbs: [],
    parts: /^(?:git operations|api requests)$/i,
  },
  {
    key: 'npm',
    name: 'npm',
    short: 'npm',
    page: 'status.npmjs.org',
    hosts: ['npmjs.org', 'npmjs.com'],
    alone: ['npx', 'bunx'],
    programs: ['npm', 'pnpm', 'yarn', 'bun'],
    verbs: NODE_VERBS,
    parts: /^package (?:installation|publishing)$/i,
  },
  {
    key: 'pypi',
    name: 'PyPI',
    short: 'PyPI',
    page: 'status.python.org',
    hosts: ['pypi.org', 'pythonhosted.org'],
    alone: [],
    programs: ['pip', 'pip3', 'pipx', 'uv', 'poetry', 'twine'],
    verbs: PYTHON_VERBS,
    parts: /^(?:pypi|files\.pythonhosted\.org)/i,
  },
  {
    key: 'crates',
    name: 'crates.io',
    short: 'crates',
    page: 'status.crates.io',
    hosts: ['crates.io'],
    alone: [],
    programs: ['cargo'],
    verbs: CARGO_VERBS,
    parts: /^crates\.io$/i,
  },
]
const NETWORK =
  /timed out|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|ENETUNREACH|socket hang up|connection reset|connection refused|connection closed|could not resolve host|name resolution|network is unreachable|remote end hung up|unexpected disconnect|early EOF|could not read from remote repository|internal server error|bad gateway|service unavailable|(?:error|status|HTTP|returned)[^\n]{0,20}?\b50[0234]\b|\bE50[0234]\b/i
const VETO = /permission denied|authentication failed|non-fast-forward|fetch first|\[rejected\]|\bE?40[134]\b/i
const UNSAFE = /[\p{Cc}\p{Zl}\p{Zp}"]/gu
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'outage-widget', key: 'isOn' } as const, false)
const reports = atom({ plugin: 'outage-widget', key: 'reports' } as const, [])

let timer: Timer | undefined

const fields = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})

const clean = (value: unknown, most: number): string =>
  (typeof value === 'string' ? value : '').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().slice(0, most)

const cut = (text: string, room: number): string => (text.length <= room ? text : `${text.slice(0, room - 1)}…`)

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((rows, word) => {
    const last = rows.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
  }, [])

const squeezed = (host: string, room: number): string => {
  if (host.length <= room) return host
  const tail = Math.floor((room - 1) / 2)

  return `${host.slice(0, room - 1 - tail)}…${host.slice(host.length - tail)}`
}

const known = (key: string): Provider | undefined => PROVIDERS.find(provider => provider.key === key)

const hosted = (host: string): Provider | undefined =>
  PROVIDERS.find(provider => provider.hosts.some(own => host === own || host.endsWith(`.${own}`)))

const stamp = (value: unknown, now: number): number | undefined => {
  const at = typeof value === 'string' ? Date.parse(value) : Number.NaN

  return Number.isFinite(at) && at <= now ? at : undefined
}

const kept = (raw: unknown, provider: Provider, now: number): { incident: Incident; isRelated: boolean } => {
  const record = fields(raw)
  const parts = (Array.isArray(record.components) ? record.components : []).map(part => clean(fields(part).name, PART_CHARS)).filter(part => part !== '')
  const own = parts.filter(part => provider.parts.test(part))
  const name = clean(record.name, NAME_CHARS) || 'unnamed incident'

  return {
    isRelated: parts.length === 0 || own.length > 0,
    incident: {
      id: clean(record.id, NAME_CHARS) || name,
      name,
      impact: IMPACTS.find(impact => impact === record.impact) ?? 'unknown',
      startedAt: stamp(record.started_at, now) ?? stamp(record.created_at, now) ?? now,
      components: [...own, ...parts.filter(part => !own.includes(part))].slice(0, MOST_PARTS),
    },
  }
}

const listed = (text: string): unknown[] | undefined => {
  try {
    const body: unknown = JSON.parse(text)
    const incidents = fields(body).incidents

    return Array.isArray(incidents) ? incidents : undefined
  } catch {
    return undefined
  }
}

const judged = (provider: Provider, list: unknown[] | undefined, now: number): Report => {
  const base = { key: provider.key, name: provider.name, checkedAt: now, toldId: null }
  if (list === undefined) return { ...base, verdict: 'unread', incident: null }

  const found = list.map(raw => kept(raw, provider, now))
  const related = found.find(each => each.isRelated)
  if (related !== undefined) return { ...base, verdict: 'incident', incident: related.incident }

  return found[0] === undefined ? { ...base, verdict: 'clear', incident: null } : { ...base, verdict: 'elsewhere', incident: found[0].incident }
}

const checked = async ($: EngineInterface, provider: Provider, signal?: AbortSignal): Promise<Report> => {
  const answer = await Promise.race([
    $.http.fetch(`https://${provider.page}${FEED}`).catch(() => undefined),
    $.clock.sleep(LIMIT_MS, signal === undefined ? {} : { signal }).then(
      () => undefined,
      () => undefined,
    ),
  ])

  return judged(provider, answer?.ok === true ? listed(answer.text) : undefined, await $.clock.now())
}

const again = async ($: EngineInterface, held: readonly Report[]): Promise<Report[]> =>
  Promise.all(
    held.flatMap(report => {
      const provider = report.verdict === 'stranger' ? undefined : known(report.key)

      return provider === undefined ? [] : [checked($, provider)]
    }),
  )

const taken = (old: Report | undefined, fresh: Report): Report =>
  old === undefined ? fresh : fresh.verdict === 'unread' && old.verdict === 'incident' ? old : { ...fresh, toldId: old.toldId }

const newest = (held: readonly Report[]): Report[] => [...held].sort((first, second) => second.checkedAt - first.checkedAt).slice(0, MOST_REPORTS)

const merged = (held: readonly Report[], found: readonly Report[]): Report[] =>
  newest([
    ...found.map(fresh => taken(held.find(report => report.key === fresh.key), fresh)),
    ...held.filter(report => !found.some(fresh => fresh.key === report.key)),
  ])

const refreshed = (held: readonly Report[], found: readonly Report[]): Report[] =>
  newest(
    held.map(report => {
      const fresh = found.find(each => each.key === report.key)

      return fresh === undefined ? report : taken(report, fresh)
    }),
  )

const told = (held: readonly Report[], keys: readonly string[]): Report[] =>
  held.map(report => (report.verdict === 'incident' && report.incident !== null && keys.includes(report.key) ? { ...report, toldId: report.incident.id } : report))

const ordered = (held: readonly Report[]): Report[] => [
  ...held.filter(report => report.verdict === 'incident'),
  ...held.filter(report => report.verdict !== 'incident'),
]

const age = (report: Report, incident: Incident): string => span(report.checkedAt - incident.startedAt)

const sentence = (provider: Provider, report: Report, incident: Incident): string => {
  const on = incident.components.length === 0 ? '' : `, on ${incident.components.join(', ')}`

  return `[outage-widget] ${provider.name}'s status page (https://${provider.page}) reports an open incident: "${incident.name}", impact ${incident.impact}${on}, open ${age(report, incident)}. The words in quotes are the provider's.`
}

const line = (report: Report): string => {
  if (report.verdict === 'stranger') return `No status page known for ${report.name}.`
  if (report.verdict === 'unread') return `Could not check ${report.name}'s status.`
  if (report.incident === null || report.verdict === 'clear') return `${report.name} reports no incident.`
  if (report.verdict === 'elsewhere') return `${report.name}: an incident on another part, "${report.incident.name}".`

  return `${report.name}: "${report.incident.name}", ${report.incident.impact}, open ${age(report, report.incident)}.`
}

const remotes = (stdout: string): string[] =>
  stdout.split('\n').flatMap(row => {
    const url = row.trim().split(/\s+/)[1] ?? ''
    const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/]*)/i.exec(url)?.[1]
    const host = authority === undefined ? /^(?:[^@/:]+@)?([^@/:]+):/.exec(url)?.[1] : authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/, '')

    return host !== undefined && /^[a-z0-9.-]{2,}$/i.test(host) ? [host.toLowerCase().slice(0, HOST_CHARS)] : []
  })

const named = async ($: EngineInterface, command: string, text: string): Promise<{ providers: Provider[]; stranger?: string }> => {
  const both = `${command}\n${text}`.toLowerCase()
  const parts = command.split(/[;&|()\n]+/).map(part => part.trim().toLowerCase().split(/\s+/))
  const byHost = PROVIDERS.filter(provider => provider.hosts.some(host => both.includes(host)))
  const byWord = PROVIDERS.filter(provider =>
    parts.some(words =>
      words.some((word, at) => provider.alone.includes(word) || (provider.programs.includes(word) && provider.verbs.includes(words.slice(at + 1).find(next => !next.startsWith('-')) ?? ''))),
    ),
  )
  const isGit = parts.some(words => words.includes('git') && words.slice(words.indexOf('git') + 1).some(word => GIT_VERBS.includes(word)))
  if (!isGit || byHost.length > 0) return { providers: PROVIDERS.filter(provider => byHost.includes(provider) || byWord.includes(provider)) }

  const listing = await $.process.run(['git', 'remote', '-v'], { timeoutMs: LIMIT_MS }).catch(() => undefined)
  const hosts = listing?.exitCode === 0 ? remotes(listing.stdout) : []
  const byRemote = hosts.flatMap(host => hosted(host) ?? [])
  const providers = PROVIDERS.filter(provider => byWord.includes(provider) || byRemote.includes(provider))

  return byRemote.length > 0 || hosts[0] === undefined ? { providers } : { providers, stranger: hosts[0] }
}

// A hook that has waited reads the switch as it was when the hook began; update answers with the switch as it is now.
const lit = async ($: EngineInterface): Promise<boolean> => update($, isOn, shown => shown)

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = (await read($, isOn)) && (await read($, reports)).some(report => report.verdict === 'incident')
  if (isWanted && timer === undefined) {
    timer = $.clock.every(POLL_MS, () => {
      void poll($)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const poll = async ($: EngineInterface): Promise<void> => {
  const open = (await read($, reports)).filter(report => report.verdict === 'incident')
  const found = (await again($, open)).filter(fresh => fresh.verdict !== 'unread')
  if (!(await lit($))) return

  const after = await update($, reports, held => refreshed(held, found))
  for (const fresh of found) {
    const isShown = after.some(report => report.key === fresh.key && report.verdict === fresh.verdict && report.checkedAt === fresh.checkedAt)
    if (isShown && fresh.verdict === 'clear') $.ui.toast(`${fresh.name} reports the incident resolved.`)
    if (isShown && fresh.verdict === 'elsewhere') $.ui.toast(`${fresh.name} reports the incident resolved; another is open elsewhere.`)
  }
  await sync($)
}

const strange = (host: string, inner: number): string => {
  const wide = `No status page known: ${host}`
  if (inner >= WIDE_COLUMNS && wide.length <= inner) return wide
  const short = `no page: ${host}`

  return short.length <= inner ? short : `${squeezed(host, inner - 6)}: none`
}

const drawn = (report: Report, inner: number): Row[] => {
  const isWide = inner >= WIDE_COLUMNS
  const short = known(report.key)?.short ?? report.name
  const who = isWide ? report.name : short
  const settled = (wide: string, narrow: string): string => (isWide && wide.length <= inner ? wide : cut(narrow, inner))

  if (report.verdict === 'stranger') return [{ text: strange(report.name, inner), isDim: true }]
  if (report.verdict === 'unread') return [{ text: settled(`Could not check ${report.name}'s status`, `${short}: unread`), color: 'yellow' }]
  if (report.incident === null || report.verdict === 'clear') return [{ text: settled(`${report.name} reports no incident`, `${short}: quiet`) }]
  if (report.verdict === 'elsewhere') {
    return [{ text: cut(isWide ? `${who}: other incident (${report.incident.components[0] ?? report.incident.name})` : `${who}: other`, inner) }]
  }

  const open = `open ${age(report, report.incident)}`
  const part = report.incident.components[0]

  return [
    { text: cut(`${who}: ${report.incident.name}`, inner), color: 'red' },
    { text: cut(isWide ? `${report.incident.impact}, ${open}${part === undefined ? '' : `, ${part}`}` : open, inner), isDim: true },
  ]
}

const draw = (held: readonly Report[], inner: number): Drawn => {
  const isWide = inner >= WIDE_COLUMNS
  if (held.length === 0) return { rows: wrapped(isWide ? EMPTY_WIDE : EMPTY_SHORT, inner).map(text => ({ text })) }

  const open = held.filter(report => report.verdict === 'incident').length
  const hasLag = isWide && open === 0 && held.some(report => report.verdict !== 'stranger')

  return {
    ...(open === 0 ? {} : { note: isWide ? plural(open, 'incident') : `${open} open` }),
    rows: [...ordered(held).flatMap(report => drawn(report, inner)), ...(hasLag ? [{ text: LAG, isDim: true }] : [])],
  }
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

  const width = fit((await $.state.get(widths)).value?.['outage-widget'] ?? CARD_COLUMNS, columns)
  const { note, rows } = draw(await read($, reports), width - CARD_EDGE)

  return $.widgets.card({
    beneath,
    width,
    title: 'Outage',
    note,
    body: (
      <Box flexDirection="column">
        {rows.map(row => (
          <Text color={row.color} dimColor={row.isDim === true} wrap="truncate-end">
            {row.text}
          </Text>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'outage-widget',
      description: 'Toggle the Outage card, check the status pages on it again, or clear it',
      argumentHint: '[on|off|check|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'outage-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'check' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }
      if (arg === 'clear') {
        await update($, reports, () => [])
        await sync($)

        return { text: 'Outage cleared.' }
      }

      const held = await read($, reports)
      if (held.length === 0) return { text: NOTHING }

      const found = await again($, held)
      if (!(await lit($))) return { text: OFF }
      const after = await update($, reports, was => refreshed(was, found))
      await sync($)

      return { text: after.length === 0 ? NOTHING : ordered(after).map(line).join('\n') }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, reports, () => [])
    await sync($)

    return { text: isShown ? 'Outage on; /widgets places it.' : 'Outage off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    if (e.tool !== 'Bash' && e.tool !== 'PowerShell') return next(e)

    const ran = await next(e)
    if (ran.isError !== true || typeof ran.text !== 'string' || !NETWORK.test(ran.text) || VETO.test(ran.text)) return ran
    if (!(await lit($))) return ran

    const { providers, stranger } = await named($, e.command, ran.text)
    if (providers.length === 0 && stranger === undefined) return ran

    const now = await $.clock.now()
    const held = await read($, reports)
    const stale = providers.filter(provider => !held.some(report => report.key === provider.key && report.verdict !== 'unread' && now - report.checkedAt < FRESH_MS))
    const found = await Promise.all(stale.map(provider => checked($, provider, next.signal)))
    if (!(await lit($))) return ran

    const unknown: Report[] = stranger === undefined ? [] : [{ key: stranger, name: stranger, verdict: 'stranger', checkedAt: now, incident: null, toldId: null }]
    const after = await update($, reports, was => merged(was, [...found, ...unknown]))
    const sentences = providers.flatMap(provider => {
      const report = after.find(each => each.key === provider.key)

      return report?.verdict === 'incident' && report.incident !== null && report.incident.id !== report.toldId ? [sentence(provider, report, report.incident)] : []
    })
    const keys = providers.map(provider => provider.key)
    if (sentences.length > 0) await update($, reports, was => told(was, keys))
    await sync($)

    return sentences.length === 0 ? ran : { deny: `${ran.text}\n\n${sentences.join('\n')}` }
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

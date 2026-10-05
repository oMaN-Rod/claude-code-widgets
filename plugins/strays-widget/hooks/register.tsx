import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { StraysRow, StraysWindow } from '../types'
import { fit, folder, hash, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Watch = PluginState['strays-widget']['watch']
type Fact = { pid: number; parent: number; born: number; name: string; command: string }
type Facts = { host: number; table: Map<number, Fact> }
type Saved = { session: string; rows: StraysRow[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const USAGE = 'Usage: /strays-widget [on|off|stop <port>|forget <port>|clear]'
const OFF = 'Strays is off.'
const EMPTY = 'Nothing left running. A server this session starts and leaves listening on a port shows here.'
const NO_FACTS = 'Cannot read processes.'
const WINDOWS = /^[a-z]:[\\/]|^\\\\/i
const DOCKER = /\b(docker|podman)\b/
const SHARED = ['com.docker.backend', 'wslrelay', 'wslhost', 'vpnkit', 'docker-proxy', 'rootlessport']
const HINTED = ['node', 'bun', 'deno', 'python', 'python3', 'py', 'ruby', 'java', 'dotnet', 'php']
const WRAPPERS = ['cmd', 'powershell', 'pwsh']
const INLINE = ['-e', '-p', '-c', '--eval', '--print']
const SCRIPT = /\.(?:js|mjs|cjs|ts|py|rb|jar|dll|php)$/i
const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec'
const NETSTAT = ['netstat', '-ano', '-p', 'TCP']
const LSOF = ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']
const PS = ['sh', '-c', 'echo "self $PPID"; exec ps -axo pid=,ppid=,lstart=,args=']
const RUN_MS = 15_000
const FACTS_MS = 45_000
const TICK_MS = 1000
const SLACK_MS = 2000
const DOCKER_MS = 60_000
const CALLS_MAX = 50
const ROWS_MAX = 9
const SHOWN_MAX = 5
const STEPS_MAX = 8
const HINT_MAX = 12
const SYSTEM_PID = 4
const WIDE_INNER = 30
const BLANK: Watch = { opened: 0, turn: 0, host: 0, at: 0, fault: '', isBusy: false, isQueued: false, seen: null, calls: [], rows: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'strays-widget', key: 'isOn' } as const, false)
const watch = atom({ plugin: 'strays-widget', key: 'watch' } as const, BLANK)

let timer: Timer | undefined

const cut = (text: string, room: number): string => {
  if (text.length <= room) return text

  return room < 1 ? '' : `${text.slice(0, room - 1)}…`
}

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

const pairOf = (row: StraysRow): string => `${row.port}/${row.pid}`

const labelOf = (row: StraysRow): string => (row.isShared ? 'docker' : row.hint === '' ? row.name : `${row.name} (${row.hint})`)

const netstatPairs = (out: string): string[] =>
  out.split('\n').flatMap(line => {
    const columns = line.trim().split(/\s+/)
    const [protocol, local = '', remote] = columns
    const port = /:(\d+)$/.exec(local)?.[1]
    const pid = columns.at(-1) ?? ''
    const isListener = protocol === 'TCP' && columns.length >= 4 && (remote === '0.0.0.0:0' || remote === '[::]:0')

    return isListener && port !== undefined && /^\d+$/.test(pid) ? [`${Number(port)}/${Number(pid)}`] : []
  })

const lsofPairs = (out: string): string[] => {
  let pid = ''

  return out.split('\n').flatMap(raw => {
    const line = raw.trim()
    if (/^p\d+$/.test(line)) pid = line.slice(1)
    const port = /^n.*:(\d+)$/.exec(line)?.[1]

    return port !== undefined && pid !== '' ? [`${Number(port)}/${Number(pid)}`] : []
  })
}

const listed = async ($: EngineInterface, isWindows: boolean): Promise<string[] | undefined> => {
  try {
    const ran = await $.process.run(isWindows ? NETSTAT : LSOF, { timeoutMs: RUN_MS })
    // lsof exits 1 with nothing printed when no process listens at all.
    const isNone = !isWindows && ran.exitCode === 1 && ran.stdout.trim() === '' && ran.stderr.trim() === ''
    if (ran.exitCode !== 0 && !isNone) return undefined

    return [...new Set(isWindows ? netstatPairs(ran.stdout) : lsofPairs(ran.stdout))]
  } catch {
    return undefined
  }
}

// The command line is the slow read, so it is asked by key and only for a listener whose name takes a hint.
const cimScript = (pids: readonly number[], isLabelled: boolean): string =>
  [
    "$ErrorActionPreference='SilentlyContinue'",
    '$t=[char]9',
    "'self'+$t+$PID",
    '$all=@{}',
    "foreach($p in @(Get-CimInstance -Query 'SELECT ProcessId,ParentProcessId,CreationDate,Name FROM Win32_Process')){$all[[int]$p.ProcessId]=$p}",
    '$keep=@{}',
    `foreach($id in @(${pids.join(',')})+$PID){$at=[int]$id;for($i=0;$i -lt 9 -and $at -gt 4 -and $all.ContainsKey($at) -and -not $keep.ContainsKey($at);$i++){$keep[$at]=1;$at=[int]$all[$at].ParentProcessId}}`,
    '$said=@{}',
    ...(isLabelled
      ? [
          `foreach($id in @(${pids.join(',')})){if(@(${HINTED.map(name => `'${name}.exe'`).join(',')}) -contains $all[$id].Name){$said[$id]=((Get-CimInstance -InputObject (New-CimInstance -ClassName Win32_Process -ClientOnly -Key Handle -Property @{Handle=[string]$id})).CommandLine -replace '\\s+',' ')}}`,
        ]
      : []),
    "foreach($id in $keep.Keys){$p=$all[$id];$born=0;if($p.CreationDate){$born=([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds()};(@($id,[int]$p.ParentProcessId,$born,$p.Name,$said[$id]) -join $t)}",
  ].join(';')

// The engine may reach PowerShell through a shell of its own, as its PowerShell tool does through cmd.exe; the host is the first process above that is not one.
const hostOf = (table: ReadonlyMap<number, Fact>, self: number): number => {
  let host = table.get(self)?.parent ?? 0
  for (let step = 0; step < STEPS_MAX && WRAPPERS.includes(table.get(host)?.name.toLowerCase() ?? ''); step += 1) host = table.get(host)?.parent ?? 0

  return host
}

const cimFacts = (out: string): Facts => {
  const lines = out.split('\n').map(line => line.replace(/\r$/, '').split('\t'))
  const self = Number(lines.find(([word]) => word === 'self')?.[1] ?? 0)
  const table = new Map<number, Fact>()
  for (const [pid = '', parent = '', born = '', name = '', ...command] of lines) {
    if (/^\d+$/.test(pid) && /^\d+$/.test(parent)) {
      table.set(Number(pid), { pid: Number(pid), parent: Number(parent), born: Number(born) || 0, name: name.replace(/\.exe$/i, ''), command: command.join(' ').replace(/\s+/g, ' ').trim() })
    }
  }

  return { host: hostOf(table, self), table }
}

const psFacts = (out: string): Facts => {
  const table = new Map<number, Fact>()
  for (const line of out.split('\n')) {
    const [, pid, parent, month = '', day, hours, minutes, seconds, year, command = ''] = /^\s*(\d+)\s+(\d+)\s+\w+\s+(\w{3})\s+(\d+)\s+(\d+):(\d+):(\d+)\s+(\d{4})\s+(.*)$/.exec(line) ?? []
    const at = MONTHS.indexOf(month)
    if (pid !== undefined && at >= 0 && at % 3 === 0) {
      table.set(Number(pid), {
        pid: Number(pid),
        parent: Number(parent),
        born: new Date(Number(year), at / 3, Number(day), Number(hours), Number(minutes), Number(seconds)).getTime(),
        name: (command.split(/\s/)[0] ?? '').split('/').at(-1) ?? '',
        command: command.trim(),
      })
    }
  }

  return { host: Number(/^self (\d+)$/m.exec(out)?.[1] ?? 0), table }
}

const known = async ($: EngineInterface, isWindows: boolean, pids: readonly number[], isLabelled: boolean): Promise<Facts | undefined> => {
  try {
    const ran = isWindows
      ? await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', cimScript(pids, isLabelled)], { timeoutMs: FACTS_MS })
      : await $.process.run(PS, { env: { LC_ALL: 'C' }, timeoutMs: FACTS_MS })
    const facts = ran.exitCode === 0 ? (isWindows ? cimFacts(ran.stdout) : psFacts(ran.stdout)) : undefined

    return facts === undefined || facts.host === 0 ? undefined : facts
  } catch {
    return undefined
  }
}

const hintOf = (command: string): string => {
  const rest = (command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).slice(1).map(word => word.replace(/["']/g, ''))
  const at = rest.findIndex(word => !word.startsWith('-'))
  const word = rest[at]
  if (word === undefined || rest.slice(0, at).some(flag => INLINE.includes(flag))) return ''

  const base = word.split(/[\\/]/).at(-1) ?? ''

  return (/[\\/]/.test(word) ? base.replace(/\.[a-z0-9]+$/i, '') : base.replace(SCRIPT, '')).slice(0, HINT_MAX)
}

const windowAt = (calls: readonly StraysWindow[], time: number, now: number): StraysWindow | undefined =>
  calls.findLast(call => call.from - SLACK_MS <= time && time <= (call.to === 0 ? now : call.to) + SLACK_MS)

const chainOf = ({ host, table }: Facts, pid: number): Fact[] => {
  const chain: Fact[] = []
  let top = table.get(pid)
  for (let step = 0; top !== undefined && step <= STEPS_MAX; step += 1) {
    chain.push(top)
    const parent = table.get(top.parent)
    top = parent !== undefined && parent.born <= top.born && parent.pid > SYSTEM_PID && parent.pid !== host ? parent : undefined
  }

  return chain
}

const rowOf = (facts: Facts, calls: readonly StraysWindow[], pair: string, now: number): StraysRow | undefined => {
  const [port = 0, pid = 0] = pair.split('/').map(Number)
  const fact = facts.table.get(pid)
  if (fact === undefined) return undefined

  const base = { port, pid, born: fact.born, name: fact.name, hint: '', isEarlier: false }
  if (pid <= SYSTEM_PID || SHARED.includes(fact.name.toLowerCase())) {
    const docker = calls.findLast(call => call.isDocker && (call.to === 0 || now - call.to <= DOCKER_MS))

    return docker === undefined ? undefined : { ...base, turn: docker.turn, isShared: true }
  }

  const chain = chainOf(facts, pid)
  const top = chain.at(-1)
  const born = chain.map(member => windowAt(calls, member.born, now)).find(call => call !== undefined)
  if (pid === facts.host || top === undefined || born === undefined) return undefined
  if (top.parent !== facts.host && windowAt(calls, top.born, now) === undefined) return undefined

  return { ...base, hint: HINTED.includes(fact.name.toLowerCase()) ? hintOf(fact.command) : '', turn: born.turn, isShared: false }
}

const savedOf = (value: unknown): Saved | undefined => {
  const { session, rows } = (typeof value === 'object' && value !== null ? value : {}) as Partial<Saved>
  if (typeof session !== 'string' || !Array.isArray(rows)) return undefined

  return {
    session,
    rows: rows.filter(row => [row?.port, row?.pid, row?.born, row?.turn].every(Number.isFinite) && typeof row.name === 'string' && typeof row.hint === 'string'),
  }
}

const keyOf = async ($: EngineInterface): Promise<string> => `rows:${hash(folder(await $.session.root()))}`

const save = async ($: EngineInterface, rows: readonly StraysRow[]): Promise<void> => {
  await $.store.set(await keyOf($), { session: await $.session.id(), rows })
}

// It applies what it found to the card as it stands when each call answers, and changes nothing once the switch has opened anew.
const refresh = async ($: EngineInterface, opened: number): Promise<void> => {
  const isWindows = WINDOWS.test(await $.session.cwd())
  const key = await keyOf($)
  const session = await $.session.id()
  const pairs = await listed($, isWindows)
  const before = await read($, watch)
  if (before.opened !== opened) return
  if (pairs === undefined) {
    const fault = `Cannot list ports: ${isWindows ? 'netstat' : 'lsof'} failed.`
    await update($, watch, kept => ((kept ?? BLANK).opened === opened ? { ...(kept ?? BLANK), fault } : (kept ?? BLANK)))

    return
  }

  const now = await $.clock.now()
  const isFirst = before.seen === null
  const saved = isFirst ? savedOf(await $.store.get(key)) : undefined
  const stored = saved?.rows ?? []
  const old = stored.filter(row => pairs.includes(pairOf(row)))
  // A call that opened before the first listing answered may have started one of its listeners, so they are examined instead of taken as the baseline.
  const fresh = isFirst && before.calls.length === 0 ? [] : pairs.filter(pair => !(before.seen ?? []).includes(pair) && !old.some(row => pairOf(row) === pair))
  const pids = [...new Set([...fresh, ...old.map(pairOf)].map(pair => Number(pair.split('/')[1])))]
  const facts = pids.length === 0 ? undefined : await known($, isWindows, pids, fresh.length > 0)
  const isBlind = pids.length > 0 && facts === undefined
  const restored = old.flatMap(row => (facts?.table.get(row.pid)?.born === row.born ? [{ ...row, isEarlier: row.isEarlier || saved?.session !== session }] : []))
  const added = facts === undefined ? [] : fresh.flatMap(pair => rowOf(facts, before.calls, pair, now) ?? [])
  let isChanged = false
  const after = await update($, watch, kept => {
    const held = kept ?? BLANK
    isChanged = false
    if (held.opened !== opened || (held.seen === null) !== isFirst) return held

    const all = [...held.rows.filter(row => pairs.includes(pairOf(row))), ...restored, ...added]
    const rows = all.filter((row, at) => all.findIndex(other => pairOf(other) === pairOf(row)) === at).slice(0, ROWS_MAX)
    isChanged = JSON.stringify(rows) !== JSON.stringify(stored.length > 0 && !isBlind ? stored : held.rows)

    return {
      ...held,
      at: now,
      host: facts?.host ?? held.host,
      fault: isBlind ? NO_FACTS : '',
      seen: isBlind ? held.seen : [...new Set([...(held.seen ?? []), ...pairs])],
      rows,
    }
  })
  if (isChanged) await $.store.set(key, { session, rows: after.rows })
}

const once = async ($: EngineInterface, isAsked: boolean): Promise<boolean> => {
  let opened: number | undefined
  await update($, watch, kept => {
    const held = kept ?? BLANK
    opened = held.isBusy || held.isQueued !== isAsked ? undefined : held.opened

    return opened === undefined ? held : { ...held, isBusy: true, isQueued: false }
  })
  const mine = opened
  if (mine === undefined) return false

  try {
    await refresh($, mine)
  } finally {
    await update($, watch, kept => ((kept ?? BLANK).opened === mine ? { ...(kept ?? BLANK), isBusy: false } : (kept ?? BLANK)))
  }

  return true
}

const tick = async ($: EngineInterface): Promise<void> => {
  const { isQueued, isBusy } = await read($, watch)
  if (isQueued && !isBusy) await once($, true)
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void tick($).catch(() => undefined)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

// A reload ends the old environment and any refresh it was running, so a busy flag found here is stale; the new count voids one still out after off and on.
const open = async ($: EngineInterface): Promise<void> => {
  await update($, watch, kept => ({ ...(kept ?? BLANK), opened: (kept ?? BLANK).opened + 1, isBusy: false, isQueued: true }))
}

const windowed = async <Result,>($: EngineInterface, command: string, call: () => Promise<Result>): Promise<Result> => {
  const from = await $.clock.now()
  await update($, watch, kept => {
    const held = kept ?? BLANK

    return { ...held, calls: [...held.calls, { from, to: 0, turn: held.turn, isDocker: DOCKER.test(command) }].slice(-CALLS_MAX) }
  })
  try {
    return await call()
  } finally {
    const to = await $.clock.now()
    await update($, watch, kept => {
      const held = kept ?? BLANK
      const at = held.calls.findIndex(entry => entry.from === from && entry.to === 0)

      return at < 0 ? held : { ...held, isQueued: true, calls: held.calls.map((entry, index) => (index === at ? { ...entry, to } : entry)) }
    })
  }
}

const drop = async ($: EngineInterface, isGone: (row: StraysRow) => boolean): Promise<void> => {
  const { rows } = await update($, watch, kept => ({ ...(kept ?? BLANK), rows: (kept ?? BLANK).rows.filter(row => !isGone(row)) }))
  await save($, rows)
}

const found = async ($: EngineInterface, port: number): Promise<StraysRow | string> => {
  const held = await read($, watch)
  const row = held.rows.find(entry => entry.port === port)
  if (row !== undefined) return row
  if (held.seen?.some(pair => pair.startsWith(`${port}/`)) === true) return `Nothing of this session's is on port ${port}.`
  if (!(await once($, false))) return `Still checking ports; try stop ${port} again in a moment.`

  const { rows, fault } = await read($, watch)
  const made = rows.find(entry => entry.port === port)
  if (made !== undefined) return made

  return fault === '' ? `Nothing of this session's is on port ${port}.` : `Could not check port ${port}: ${fault.charAt(0).toLowerCase()}${fault.slice(1)}`
}

const stop = async ($: EngineInterface, port: number): Promise<string> => {
  const row = await found($, port)
  if (typeof row === 'string') return row
  if (row.isShared) return `Port ${port} is held by Docker's shared process (${row.name}); stop the container instead.`

  const isWindows = WINDOWS.test(await $.session.cwd())
  const { pid } = row
  const facts = await known($, isWindows, [pid], false)
  if (facts === undefined) return `Could not stop pid ${pid}: cannot read processes.`
  if (facts.table.get(pid)?.born !== row.born) {
    await drop($, entry => entry.pid === pid)

    return `Port ${port}: that process has already gone.`
  }
  if (pid === facts.host) return `Could not stop pid ${pid}: it runs this session.`

  try {
    const ran = await $.process.run(isWindows ? ['taskkill', '/PID', String(pid), '/T', '/F'] : ['kill', String(pid)], { timeoutMs: RUN_MS })
    if (ran.exitCode !== 0) return `Could not stop pid ${pid}: ${ran.stderr.trim().split('\n')[0]?.trim() || `exit ${ran.exitCode}`}`
  } catch (error) {
    return `Could not stop pid ${pid}: ${error instanceof Error ? error.message : String(error)}`
  }
  // A plain kill can be ignored or outlived, so only a pid that has left the listing is called stopped.
  if (!isWindows && (await listed($, false))?.some(pair => pair.endsWith(`/${pid}`)) !== false) {
    return `Could not stop pid ${pid}: kill was sent but :${port} is not seen free.`
  }
  await drop($, entry => entry.pid === pid)

  return `Stopped ${labelOf(row)} on :${port} (pid ${pid}).`
}

const forget = async ($: EngineInterface, port: number): Promise<string> => {
  const row = (await read($, watch)).rows.find(entry => entry.port === port)
  if (row === undefined) return `Nothing of this session's is on port ${port}.`

  await drop($, entry => pairOf(entry) === pairOf(row))

  return `Forgot :${port} (${row.name}, pid ${row.pid}); it is left running.`
}

const clear = async ($: EngineInterface): Promise<string> => {
  const { rows, seen } = await read($, watch)
  const count = rows.length
  await update($, watch, kept => ({ ...(kept ?? BLANK), rows: [] }))
  await $.store.delete(await keyOf($))
  // A first refresh still out has read the rows just deleted; opening anew keeps it from putting them back.
  if (seen === null) await open($)

  return count === 0 ? 'No strays on the card; nothing was stopped.' : `Cleared ${plural(count, 'stray')} from the card; nothing was stopped.`
}

const portOf = (word: string): number | undefined => {
  const port = Number(/^:?(\d+)$/.exec(word)?.[1] ?? 0)

  return port >= 1 && port <= 65_535 ? port : undefined
}

const lineOf = (row: StraysRow, at: number, inner: number): string => {
  const left = `:${row.port} ${labelOf(row)}`
  if (inner < WIDE_INNER) return cut(left, inner)

  const mark = row.isShared ? 'shared' : row.isEarlier ? 'earlier' : `turn ${row.turn}`
  const right = row.born > 0 ? `${span(at - row.born)}  ${mark}` : mark

  return `${cut(left, inner - right.length - 2).padEnd(inner - right.length)}${right}`
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

  const width = fit((await $.state.get(widths)).value?.['strays-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const { rows, fault, at } = await read($, watch)
  const earlier = rows.filter(row => row.isEarlier).length
  const said = fault !== '' ? fault : rows.length === 0 ? EMPTY : ''

  return $.widgets.card({
    beneath,
    width,
    title: 'Strays',
    note: rows.length === 0 ? undefined : earlier === 0 ? `${rows.length} running` : `${earlier} ${inner < WIDE_INNER ? 'earlier' : 'from earlier'}`,
    body: (
      <Box key="strays" flexDirection="column">
        {(said === '' ? [] : wrapped(said, inner)).map((line, index) => (
          <Text key={`say-${index}`} color={fault === '' ? undefined : 'red'} wrap="truncate-end">
            {line}
          </Text>
        ))}
        {rows.slice(0, SHOWN_MAX).map(row => (
          <Text key={`row-${pairOf(row)}`} wrap="truncate-end">
            {lineOf(row, at, inner)}
          </Text>
        ))}
        {rows.length > SHOWN_MAX && (
          <Text key="more" dimColor wrap="truncate-end">
            +{rows.length - SHOWN_MAX} more
          </Text>
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'strays-widget',
      description: 'Toggle the Strays card, or stop a server this session left running',
      argumentHint: '[on|off|stop <port>|forget <port>|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)
    if (await read($, isOn)) await open($)

    return next(e)
  })

  on('command.run', { command: 'strays-widget' }, async ($, e) => {
    const [first = '', second = '', ...others] = e.args.trim().split(/\s+/)
    const verb = first.toLowerCase()

    if (verb === 'stop' || verb === 'forget' || verb === 'clear') {
      const port = portOf(second)
      if (verb === 'clear' ? second !== '' : port === undefined || others.length > 0) return { text: USAGE }
      if (!(await read($, isOn))) return { text: OFF }
      if (port === undefined) return { text: await clear($) }

      return { text: verb === 'stop' ? await stop($, port) : await forget($, port) }
    }

    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await open($)
    else await update($, watch, kept => ({ ...BLANK, opened: (kept ?? BLANK).opened + 1 }))
    await sync($)

    return { text: isShown ? 'Strays on; /widgets places it.' : 'Strays off.' }
  })

  on('turn.start', async ($, e, next) => {
    if (await read($, isOn)) await update($, watch, kept => ({ ...(kept ?? BLANK), turn: (kept ?? BLANK).turn + 1 }))

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => ((await read($, isOn)) ? windowed($, e.command, () => next(e)) : next(e)))

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => ((await read($, isOn)) ? windowed($, e.command, () => next(e)) : next(e)))

  on('turn.complete', async ($, e, next) => {
    if ((await read($, isOn)) && e.agentId === undefined) await update($, watch, kept => ({ ...(kept ?? BLANK), isQueued: true }))

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

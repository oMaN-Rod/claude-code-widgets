import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, ToolCheckResult } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Entry = PluginState['customs-widget']['list'][number]
type Registry = Entry['registry']
type Found = Pick<Entry, 'kind' | 'fact' | 'line'>
type Wanted = Pick<Entry, 'key' | 'name' | 'registry'> & { asked: string; isPrivate: boolean }
type NpmRecord = { time?: { created?: unknown }; 'dist-tags'?: { latest?: unknown } } | null | undefined
type PypiRecord = { info?: { version?: unknown }; releases?: Record<string, { upload_time_iso_8601?: unknown }[]> } | null | undefined

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const WIDE_COLUMNS = 30
const TITLE = 'Customs'
const USAGE = 'Usage: /customs-widget [on|off|show|trust <name>|clear]'
const EMPTY = 'Nothing checked yet. Each package Claude installs is looked up on npm or PyPI first; a missing or brand new name is held for your yes.'
const NPM_URL = 'https://registry.npmjs.org'
const DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point/last-week'
const PYPI_URL = 'https://pypi.org/pypi'
const PUBLIC_NPM = '//registry.npmjs.org'
const LIMIT_MS = 4000
const DAY_MS = 86_400_000
const NEW_DAYS = 30
const MAX_KEYS = 8
const MAX_LIST = 8
const MAX_EARLIER = 5
const MAX_TRUSTED = 100
const FORMS: Record<Registry, string[]> = {
  npm: ['npm install', 'npm i', 'npm add', 'pnpm add', 'pnpm install', 'pnpm i', 'yarn add', 'bun add', 'bun install', 'bun i'],
  pypi: [
    'pip install',
    'pip3 install',
    'python -m pip install',
    'python3 -m pip install',
    'py -m pip install',
    'uv add',
    'uv pip install',
  ],
}
const VALUE_FLAGS = [
  '-r -e -c -t -p -w -C -F -i -f --requirement --editable --constraint --constraints --target --prefix --python --filter',
  '--workspace --cwd --dir --group --extra --optional --package --project --directory --script --marker --tag --branch --rev',
  '--bounds --python-version --python-platform --platform --implementation --abi --root --src --upgrade-strategy',
  '--upgrade-package --reinstall-package --no-binary --only-binary --no-binary-package --no-build-package --config-settings',
  '--config-setting --progress-bar --root-user-action --report --log --timeout --retries --proxy --cert --client-cert',
  '--trusted-host --exists-action --use-feature --use-deprecated --resolution --prerelease --exclude-newer --index-strategy',
  '--keyring-provider --link-mode --override --overrides --loglevel --reporter --cache --cache-dir --cache-folder --store-dir',
  '--modules-dir --modules-folder --userconfig --config --config-file --omit --include --otp --scope --before --save-prefix',
  '--install-strategy --cpu --os --libc --backend --network-timeout --network-concurrency --mutex --color --registry',
  '--index-url --extra-index-url --find-links --index --default-index',
].flatMap(row => row.split(' '))
const PRIVATE_FLAGS = ['--registry', '--index-url', '-i', '--extra-index-url', '--find-links', '-f', '--index', '--default-index']
const ARCHIVES = ['.tgz', '.whl', '.gz', '.zip']
const NPM_NAME = /^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/
const PYPI_NAME = /^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?$/
const BARE_NAME = /^[a-z0-9][a-z0-9._-]*$/
const WORD = /(?:[^\s'"]|'[^']*'|"[^"]*")+/g
const QUOTED = /'([^']*)'|"([^"]*)"/g
const PLAIN_VERSION = /^(\d+)(\.\d+)*(-[\w.]+)?$/
const REGISTRIES = { npm: 'npm', pypi: 'PyPI' } as const
const MARKS = {
  missing: { mark: '✗', color: 'red' },
  new: { mark: '✗', color: 'red' },
  behind: { mark: '!', color: 'yellow' },
  ok: { mark: '✓', color: 'green' },
  unchecked: { mark: '?', color: undefined },
  skipped: { mark: '·', color: undefined },
  checking: { mark: '…', color: undefined },
} as const
const SKIPPED: Found = { kind: 'skipped', fact: 'skipped', line: 'not looked up: private scope or registry' }
const NONE: Entry[] = []
const NO_NAMES: string[] = []
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'customs-widget', key: 'isOn' } as const, false)
const list = atom({ plugin: 'customs-widget', key: 'list' } as const, NONE)
const trusted = atom({ plugin: 'customs-widget', key: 'trusted' } as const, NO_NAMES)

const bare = (name: string): string => name.toLowerCase().replace(/[-_.]+/g, '-')

const cut = (text: string, columns: number): string => (text.length > columns ? `${text.slice(0, Math.max(0, columns - 1))}…` : text)

const wrapped = (text: string, columns: number): string[] =>
  text
    .split(' ')
    .map(word => cut(word, columns))
    .reduce<string[]>((rows, word) => {
      const last = rows.at(-1)

      return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
    }, [])

const age = (days: number): string => {
  if (days < 60) return plural(days, 'day')
  if (days < 720) return plural(Math.floor(days / 30), 'month')

  return plural(Math.floor(days / 365), 'year')
}

const weekly = (downloads: number | undefined): string => {
  if (downloads === undefined) return ''
  if (downloads < 1000) return `, ${plural(downloads, 'download')} last week`

  return `, ${downloads < 1_000_000 ? `${Math.floor(downloads / 1000)}k` : `${Math.floor(downloads / 1_000_000)}M`} downloads last week`
}

const checking = (registry: Registry): Found => ({ kind: 'checking', fact: 'checking', line: `looking up on ${REGISTRIES[registry]}` })

const unchecked = (registry: Registry): Found => ({ kind: 'unchecked', fact: 'unchecked', line: `unchecked: ${REGISTRIES[registry]} did not answer` })

const missing = (item: Wanted): Found => ({ kind: 'missing', fact: 'not found', line: `no package named ${item.name} on ${REGISTRIES[item.registry]}` })

const judged = (item: Wanted, created: number, latest: string, downloads: number | undefined, now: number): Found => {
  const days = Math.max(0, Math.floor((now - created) / DAY_MS))
  if (days < NEW_DAYS) return { kind: 'new', fact: age(days), line: `first published ${age(days)} ago${weekly(downloads)}` }

  const asked = PLAIN_VERSION.exec(item.asked)?.[1]
  const newest = /^\d+/.exec(latest)?.[0]
  if (asked !== undefined && newest !== undefined && Number(asked) < Number(newest)) {
    return { kind: 'behind', fact: `${item.asked} → ${latest}`, line: `asked ${item.asked}, latest is ${latest}` }
  }

  return { kind: 'ok', fact: latest, line: `on ${REGISTRIES[item.registry]} ${age(days)}${weekly(downloads)}, latest ${latest}` }
}

const isRedirection = (word: string): boolean => /[<>]/.test(word) && !/['"]/.test(word)

const settled = (words: string[]): string[] =>
  words.slice(0, words.includes('&') ? words.indexOf('&') : words.length).flatMap((word, at, all) => {
    const before = all[at - 1] ?? ''
    if (isRedirection(before) && /[<>&]$/.test(before)) return []
    if (!isRedirection(word)) return [word.replace(QUOTED, '$1$2')]

    const kept = word.slice(0, word.search(/[<>]/))

    return kept === '' || kept === '&' || /^\d+$/.test(kept) ? [] : [kept]
  })

const uncommented = (row: string): string => {
  const comment = [...row.matchAll(WORD)].find(word => word[0].startsWith('#'))

  return comment === undefined ? row : row.slice(0, comment.index)
}

const isLocal = (word: string): boolean =>
  /^[./~]/.test(word) ||
  word.includes(':') ||
  word.includes('\\') ||
  (word.includes('/') && !word.startsWith('@')) ||
  ARCHIVES.some(ending => word.endsWith(ending))

const npmName = (word: string, isPrivate: boolean): Wanted | undefined => {
  const at = word.lastIndexOf('@')
  const name = at > 0 ? word.slice(0, at) : word
  if (!NPM_NAME.test(name)) return undefined

  const version = at > 0 ? word.slice(at + 1).replace(/^[\^~=<>v]+/, '') : ''

  return { key: `npm:${name}`, name, registry: 'npm', asked: /^\d/.test(version) ? version : '', isPrivate }
}

const pypiName = (word: string, isPrivate: boolean): Wanted | undefined => {
  if (/^[\d.]+$/.test(word)) return undefined

  const at = word.search(/[=<>!~]/)
  const found = PYPI_NAME.exec(at === -1 ? word : word.slice(0, at))?.[1]
  if (found === undefined) return undefined

  const name = bare(found)
  const spec = at === -1 ? '' : word.slice(at)

  return { key: `pypi:${name}`, name, registry: 'pypi', asked: /^==\d/.test(spec) ? spec.slice(2) : '', isPrivate }
}

const named = (segment: string): Wanted[] => {
  if (/[$`(]/.test(segment)) return []

  const words = segment.match(WORD) ?? []
  const first = words.findIndex(word => word !== 'sudo' && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word))
  const line = (first === -1 ? [] : words.slice(first)).join(' ')
  const registry = (['npm', 'pypi'] as const).find(kind => FORMS[kind].some(form => line.startsWith(`${form} `)))
  if (registry === undefined) return []

  const form = FORMS[registry].find(start => line.startsWith(`${start} `)) ?? ''
  const rest = settled(line.slice(form.length + 1).match(WORD) ?? [])
  const isPrivate = rest.some(word => PRIVATE_FLAGS.some(flag => word === flag || word.startsWith(`${flag}=`)))

  return rest
    .filter((word, at) => !word.startsWith('-') && !VALUE_FLAGS.includes(rest[at - 1] ?? '') && !isLocal(word))
    .flatMap(word => (registry === 'npm' ? npmName(word, isPrivate) : pypiName(word, isPrivate)) ?? [])
}

const parsed = (command: string): Wanted[] =>
  command
    .split('\n')
    .map(uncommented)
    .join('\n')
    .split(/&&|\|\||[;|\n]/)
    .flatMap(segment => named(segment.trim()))
    .filter((item, at, all) => all.findIndex(other => other.key === item.key) === at)
    .slice(0, MAX_KEYS)

const json = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const moment = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) : Number.NaN)

const downloaded = async ($: EngineInterface, name: string): Promise<number | undefined> => {
  try {
    const answer = await $.http.fetch(`${DOWNLOADS_URL}/${name}`)
    const count = answer.status === 200 ? (json(answer.text) as { downloads?: unknown } | null | undefined)?.downloads : undefined

    return typeof count === 'number' ? count : undefined
  } catch {
    return undefined
  }
}

const onNpm = async ($: EngineInterface, item: Wanted, now: number): Promise<Found> => {
  const answer = await $.http.fetch(`${NPM_URL}/${item.name}`)
  if (answer.status === 404) return missing(item)

  const record = answer.status === 200 ? (json(answer.text) as NpmRecord) : undefined
  const created = moment(record?.time?.created)
  const latest = record?.['dist-tags']?.latest
  if (typeof latest !== 'string' || !Number.isFinite(created)) return unchecked('npm')

  return judged(item, created, latest, await downloaded($, item.name), now)
}

const onPypi = async ($: EngineInterface, item: Wanted, now: number): Promise<Found> => {
  const answer = await $.http.fetch(`${PYPI_URL}/${item.name}/json`)
  if (answer.status === 404) return missing(item)

  const record = answer.status === 200 ? (json(answer.text) as PypiRecord) : undefined
  const latest = record?.info?.version
  const created = Math.min(
    ...Object.values(record?.releases ?? {})
      .flat()
      .map(file => moment(file.upload_time_iso_8601))
      .filter(Number.isFinite),
  )
  if (typeof latest !== 'string' || !Number.isFinite(created)) return unchecked('pypi')

  return judged(item, created, latest, undefined, now)
}

const lookup = async ($: EngineInterface, item: Wanted, now: number): Promise<Found> => {
  try {
    return await (item.registry === 'npm' ? onNpm($, item, now) : onPypi($, item, now))
  } catch {
    return unchecked(item.registry)
  }
}

const timeUp = async ($: EngineInterface, signal: AbortSignal | undefined): Promise<undefined> => {
  try {
    await $.clock.sleep(LIMIT_MS, signal === undefined ? {} : { signal })
  } catch {
    // The wait rejects when the check ends first; that is not a failure.
  }

  return undefined
}

const mirrored = async ($: EngineInterface): Promise<boolean> => {
  try {
    const text = await $.fs.read(`${await $.session.cwd()}/.npmrc`)

    return text.split('\n').some(row => /^\s*registry\s*=/.test(row) && !row.includes(PUBLIC_NPM))
  } catch {
    return false
  }
}

const merged = (fresh: readonly Entry[], held: readonly Entry[]): Entry[] =>
  [...fresh, ...held.filter(entry => !fresh.some(other => other.key === entry.key))].slice(0, MAX_LIST)

const gate = async (
  $: EngineInterface,
  input: unknown,
  id: string | undefined,
  verdict: ToolCheckResult,
  signal: AbortSignal | undefined,
): Promise<ToolCheckResult> => {
  const command = (input as { command?: unknown } | null)?.command
  if (id === undefined || typeof command !== 'string' || verdict.decision === 'deny') return verdict

  const wanted = parsed(command)
  if (wanted.length === 0) return verdict

  const isMirrored = wanted.some(item => item.registry === 'npm') && (await mirrored($))
  const isSkipped = (item: Wanted): boolean => item.isPrivate || (item.registry === 'npm' && (isMirrored || item.name.startsWith('@')))
  const entry = (item: Wanted, found: Found): Entry => ({ key: item.key, name: item.name, registry: item.registry, ...found, held: false })
  const now = await $.clock.now()
  await update($, list, held => merged(wanted.map(item => entry(item, isSkipped(item) ? SKIPPED : checking(item.registry))), held ?? []))

  const limit = timeUp($, signal)
  const found = await Promise.all(
    wanted.map(async item => (isSkipped(item) ? SKIPPED : ((await Promise.race([lookup($, item, now), limit])) ?? unchecked(item.registry)))),
  )
  const names = await read($, trusted)
  const entries = wanted.map((item, at) => entry(item, found[at] ?? unchecked(item.registry)))
  const flagged = entries.filter(item => (item.kind === 'missing' || item.kind === 'new') && !names.includes(bare(item.name)))
  const isRaised = flagged.length > 0 && verdict.decision === 'allow'
  const isOurs = (item: Entry): boolean => wanted.some(other => other.key === item.key)
  const kept = await update($, list, (held = []) =>
    held.some(isOurs) ? merged(entries.map(item => ({ ...item, held: isRaised && flagged.includes(item) })), held) : held,
  )

  const [first] = flagged
  if (first === undefined || !kept.some(isOurs)) return verdict

  const line = `${first.name}: ${first.line}${flagged.length > 1 ? ` (+${flagged.length - 1} more)` : ''}`
  if (isRaised) return { decision: 'ask', reason: line }

  try {
    await $.ui.notice(id, line)
  } catch {
    // A call that is not open refuses the line; the verdict still stands.
  }

  return verdict
}

const row = (Text: Tags['Text'], entry: Entry, inner: number, isWide: boolean): RenderElement => {
  const { mark, color } = MARKS[entry.kind]
  const room = inner - 3 - entry.fact.length
  const hasFact = isWide && room >= 3
  const name = cut(entry.name, hasFact ? room : inner - 2)

  return (
    <Text wrap="truncate-end" dimColor={color === undefined}>
      <Text color={color}>{mark}</Text> {name}
      {hasFact ? `${' '.repeat(inner - 2 - name.length - entry.fact.length)}${entry.fact}` : ''}
    </Text>
  )
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

  const width = fit((await $.state.get(widths)).value?.['customs-widget'] ?? CARD_COLUMNS, columns)
  const entries = await read($, list)
  const [latest, ...earlier] = entries
  const inner = width - CARD_FRAME
  const held = entries.filter(entry => entry.held).length
  const note = held > 0 ? `${held} held` : plural(entries.length, 'package')
  const isWide = width >= WIDE_COLUMNS

  return $.widgets.card({
    beneath,
    width,
    title: TITLE,
    note: latest === undefined ? '' : note.length > inner - TITLE.length - 1 ? `${held > 0 ? held : entries.length}` : note,
    body: (
      <Box flexDirection="column">
        {latest === undefined && wrapped(EMPTY, inner).map(text => <Text dimColor>{text}</Text>)}
        {latest !== undefined && row(Text,latest, inner, isWide)}
        {latest !== undefined &&
          wrapped(latest.line, inner).map(text => (
            <Text color={MARKS[latest.kind].color} dimColor={MARKS[latest.kind].color === undefined}>
              {text}
            </Text>
          ))}
        {earlier.slice(0, MAX_EARLIER).map(entry => row(Text,entry, inner, isWide))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'customs-widget',
      description: 'Toggle the Customs card',
      argumentHint: '[on|off|show|trust <name>|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    const names = await $.store.get('trusted')
    if (Array.isArray(names)) await update($, trusted, () => names.filter(name => typeof name === 'string'))

    return next(e)
  })

  on('command.run', { command: 'customs-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const [verb, name, ...more] = arg.split(/\s+/)
    if (verb === 'show' || verb === 'clear' || verb === 'trust') {
      if (verb === 'trust' ? name === undefined || more.length > 0 || !BARE_NAME.test(name) : name !== undefined) return { text: USAGE }
      if (!(await read($, isOn))) return { text: 'Customs is off.' }

      const names = await read($, trusted)
      if (verb === 'show') {
        const rows = (await read($, list)).map(
          entry => `${entry.name} (${REGISTRIES[entry.registry]}): ${entry.line}${entry.held ? ' [held]' : ''}`,
        )
        const text = [...rows, ...(names.length === 0 ? [] : [`Trusted: ${names.join(', ')}`])].join('\n')

        return { text: text === '' ? 'Nothing checked yet.' : text }
      }

      const kept = verb === 'clear' ? [] : names.includes(bare(name ?? '')) ? names : [...names, bare(name ?? '')].slice(-MAX_TRUSTED)
      if (verb === 'clear') await update($, list, () => [])
      if (kept !== names) {
        await update($, trusted, () => kept)
        await $.store.set('trusted', kept)
      }

      return { text: verb === 'clear' ? 'Customs cleared.' : `Customs trusts ${bare(name ?? '')}.` }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, list, () => [])

    return { text: isShown ? 'Customs on; /widgets places it.' : 'Customs off.' }
  })

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    return gate($, e.input, e.tool_use_id, await next(e), next.signal)
  })

  on('tool.check', { tool: 'PowerShell' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    return gate($, e.input, e.tool_use_id, await next(e), next.signal)
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

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { AimKind, AimRow, AimShot } from '../types'
import { fit, plural, span } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Aim = PluginState['aim-widget']['aim']
type Env = Readonly<Record<string, string | undefined>>
type Over = Readonly<Record<string, string>>
type Place = { cwd: string; isWindows: boolean }
type Probes = Map<string, Promise<string>>
type Target = { name: string; phrase: string; source: string }
type Ask = { kind: AimKind; ask: 'ambient' | 'psql' | 'url'; dir: string | undefined; over: Over; base?: string }
type Marks = Partial<Record<AimKind, string>>
type Settled = { kind: AimKind } & (Target | { why: string })
type Shot = Settled | Ask
type Frame = { words: string[]; word: string; shut: string; isGroup: boolean }
type Reading = { over: Over; dir: string | undefined; set: Marks; moot: Marks; isChanged: boolean; shots: Shot[]; outer: readonly Reading[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const USAGE = 'Usage: /aim-widget [on|off|prod <word>|unprod <word>|show|clear]'
const OFF = 'Aim is off.'
const LOOKING = 'Looking for targets…'
const NONE = 'No outside targets found here.'
const EMPTY = `${NONE} A kube context, cloud profile, project, workspace or database host shows once one is set on this machine.`
const WINDOWS = /^[a-z]:[\\/]|^\\\\/i
const WORD = /^[a-z0-9._-]{2,32}$/
const ASSIGNED = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s
const MENTIONED = /kubectl|helm|aws|gcloud|terraform|psql/i
const LINK = /^postgres(?:ql)?:\/\//
const HEREDOC = /<<-?\s*(["']?)([A-Za-z_]\w*)\1/
const ENV_DRIVE = /(?:^|[^a-z0-9_])env:|SetEnvironmentVariable/i
const UNSET_FLAG = /^(?:--unset=|-u)(\w+)$/
const LINK_VARIABLE = /^(?:--dbname=)?\$\{?DATABASE_URL\}?$/
const CONTINUED = /\\\r?\n/g
const TICK_CONTINUED = /`\r?\n/g
const PSQL_VALUED =
  /^(?:-[aAbeEnqsStxXwWlz1]*[cdfvoLFPRThpU]|--(?:command|dbname|file|set|variable|output|log-file|field-separator|pset|record-separator|table-attr|host|port|username))$/
const URL_PARTS = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#]*@)?(\[[^\]]*\]|[^:/?#]*)(?::\d*)?(?:\/([^?#]*))?/i
const TOOLS = new Map<string, AimKind>([
  ['kubectl', 'kube'],
  ['helm', 'kube'],
  ['aws', 'aws'],
  ['gcloud', 'gcp'],
  ['terraform', 'tf'],
  ['psql', 'db'],
])
const KINDS: readonly AimKind[] = ['kube', 'aws', 'gcp', 'tf', 'db']
const PHRASES: Readonly<Record<AimKind, string>> = { kube: 'kube context', aws: 'aws profile', gcp: 'gcloud project', tf: 'terraform workspace', db: 'database' }
const VARIABLES: Readonly<Record<AimKind, readonly string[]>> = {
  kube: [],
  aws: ['AWS_ACCESS_KEY_ID', 'AWS_PROFILE', 'AWS_DEFAULT_PROFILE'],
  gcp: ['CLOUDSDK_CORE_PROJECT'],
  tf: ['TF_WORKSPACE', 'TF_DATA_DIR'],
  db: ['DATABASE_URL', 'PGHOST', 'PGDATABASE'],
}
const WRAPPERS = ['sudo', 'env', 'time', 'command', 'exec', 'nohup', 'xargs', 'if', 'elif', 'then', 'else', 'while', 'until', 'do', '!']
const SOURCING = ['source', '.', 'eval']
const EXPORTING = ['export', 'declare', 'typeset', 'readonly', 'local']
const MOVING = ['cd', 'chdir', 'pushd', 'popd', 'set-location', 'sl', 'push-location', 'pop-location']
const UNSETTING = ['-u', '--unset']
const VALUED = [...UNSETTING, '-I']
const ELSEWHERE: Readonly<Record<string, readonly string[]>> = { kubectl: ['--cluster', '--server', '-s', '--user'], helm: ['--kube-apiserver'] }
const OPEN = '('
const SHUT = ')'
const HOLE = '$()'
const OTHER_USER = /^(?:-u|--user(?:=|$))/
const SHELL = ['cmd', '/d', '/c']
const KUBECTL = ['kubectl', 'config', 'current-context']
const GCLOUD = ['gcloud', 'config', 'get-value', 'project']
const NAMED = 'named in the command'
const ENVIRONMENT = 'from the environment'
const FROM_VARIABLE = 'set from a variable'
const INDIRECT = 'not a direct call'
const RECONFIGURED = 'another configuration given'
const REPOINTED = 'context changed in the command'
const GIVEN = 'connection string given'
const UNSET = '$'
const PROBE_MS = 3000
const TICK_MS = 1000
const REFRESH_MS = 30_000
const WORDS_MAX = 8
const LINES_MAX = 3
const COMMAND_MAX = 80
const WIDE_COLUMNS = 30
const BLANK: Aim = { at: 0, isBusy: false, rows: [], last: null }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'aim-widget', key: 'isOn' } as const, false)
const words = atom({ plugin: 'aim-widget', key: 'words' } as const, ['prod'])
const aim = atom({ plugin: 'aim-widget', key: 'aim' } as const, BLANK)

let timer: Timer | undefined

const cut = (text: string, room: number): string => {
  if (text.length <= room) return text

  return room < 1 ? '' : `${text.slice(0, room - 1).replace(/…$/, '')}…`
}

const wrapped = (text: string, room: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)

    return last !== undefined && last.length + 1 + word.length <= room ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, cut(word, room)]
  }, [])

const ago = (ms: number): string => span(ms).split(' ')[0] ?? ''

const bare = (word: string): string => (word.length >= 2 && (word.startsWith('"') || word.startsWith("'")) && word.endsWith(word.charAt(0)) ? word.slice(1, -1) : word)

const valued = (value: string): string => (value.replace(/\\/g, '').trim() === '' || /["'$`]/.test(value) ? UNSET : value)

const toolOf = (word: string): string => (word.split(/[\\/]/).at(-1) ?? '').replace(/\.exe$/i, '').toLowerCase()

// A heredoc's body is text handed to the command, not commands of its own.
const spoken = (command: string): string => {
  let end: string | undefined

  return command
    .split('\n')
    .filter(line => {
      if (end !== undefined) {
        if (line.trim() === end) end = undefined

        return false
      }
      end = HEREDOC.exec(line.replace(/<<</g, ' '))?.[2]

      return true
    })
    .join('\n')
}

// Quotes and an escape (a backslash in Bash, a backtick in PowerShell) keep a separator as text, so a commit message or a query is one word.
// Whatever opens with a bracket or a backtick is read first, between OPEN and SHUT, which no unquoted word can equal. Unless it began a
// command of its own, the command it was written in then carries on, with HOLE where its output would stand.
// A brace separates only as a word of its own, or in PowerShell around a script block; inside a word it is text.
// A lone & ends a command as ; does, and in PowerShell starts one; the & of 2>&1 and &> belongs to its redirection.
const segmentsOf = (command: string, isBash: boolean): string[][] => {
  const segments: string[][] = []
  const outer: Frame[] = []
  const escape = isBash ? '\\' : '`'
  let frame: Frame = { words: [], word: '', shut: '', isGroup: false }
  let quote = ''
  let blocks = 0
  const close = (): void => {
    if (frame.word !== '' && frame.word !== '\\') frame.words.push(frame.word)
    frame.word = ''
  }
  const end = (): void => {
    close()
    if (frame.words.length > 0) segments.push(frame.words)
    frame.words = []
  }
  const open = (shut: string, isGroup: boolean): void => {
    segments.push([OPEN])
    outer.push(frame)
    frame = { words: [], word: '', shut, isGroup }
  }
  const shut = (): void => {
    end()
    segments.push([SHUT])
    const before = outer.pop()
    if (before === undefined) return
    if (!frame.isGroup) before.word += HOLE
    frame = before
  }
  for (let at = 0; at < command.length; at += 1) {
    const letter = command.charAt(at)
    const after = command.charAt(at + 1)
    const pair = command.slice(at, at + 2)
    const isEdge = after === '' || /[\s;|&)]/.test(after)
    if (letter === escape && quote !== "'" && after !== '') {
      frame.word += pair
      at += 1
    } else if (quote !== '') {
      frame.word += letter
      if (letter === quote) quote = ''
    } else if (letter === '"' || letter === "'") {
      quote = letter
      frame.word += letter
    } else if (letter === '#' && frame.word === '') {
      const rest = command.indexOf('\n', at)
      at = rest < 0 ? command.length : rest - 1
    } else if (pair === '$(') {
      open(SHUT, false)
      at += 1
    } else if (letter === OPEN) open(SHUT, frame.word === '' && frame.words.length === 0)
    else if (letter === '`' && isBash) {
      if (frame.shut === letter) shut()
      else open(letter, false)
    } else if (letter === SHUT) {
      if (frame.shut === letter) shut()
      else end()
    } else if (letter === '{' && frame.word === '' && (after === '' || /\s/.test(after))) end()
    else if (letter === '{' && frame.word === '' && !isBash && after !== '{' && after !== '}') {
      blocks += 1
      end()
    } else if (letter === '}' && frame.word === '' && isEdge) end()
    else if (letter === '}' && !isBash && blocks > 0 && isEdge) {
      blocks -= 1
      end()
    } else if (pair === '&&' || pair === '||') {
      end()
      at += 1
    } else if (';|\n'.includes(letter) || (letter === '&' && !/[<>]$/.test(frame.word) && after !== '>')) end()
    else if (/\s/.test(letter)) close()
    else frame.word += letter
  }
  while (outer.length > 0) shut()
  end()

  return segments
}


const headOf = (raws: readonly string[]): number => {
  let at = 0
  let isWrapped = false
  for (; at < raws.length; at += 1) {
    const raw = raws[at] ?? ''
    if (WRAPPERS.includes(raw)) isWrapped = true
    else if (!ASSIGNED.test(raw) && !(isWrapped && (raw.startsWith('-') || VALUED.includes(raws[at - 1] ?? '')))) break
  }

  return at
}

const assigned = (over: Over, raw: string): Over => {
  const [, name, value = ''] = ASSIGNED.exec(raw) ?? []

  return name === undefined ? over : { ...over, [name]: valued(bare(value)) }
}

const dropped = (over: Over, name: string): Over => ({ ...over, [name]: '' })

const prefixed = (over: Over, raws: readonly string[]): Over =>
  raws.reduce((held, raw, at) => {
    const name = UNSETTING.includes(raws[at - 1] ?? '') ? raw : UNSET_FLAG.exec(raw)?.[1]

    return name === undefined ? assigned(held, raw) : dropped(held, name)
  }, over)

const attached = (texts: readonly string[], flag: string): string | undefined => {
  const text = texts.find(other => other.startsWith(flag) && other.length > flag.length && !other.startsWith('--'))

  return text === undefined ? undefined : valued(bare(text.slice(flag.length)))
}

// A flag given twice is read as these tools read it: the last one wins.
const flagged = (texts: readonly string[], names: readonly string[]): string | undefined =>
  texts.reduce<string | undefined>((found, text, at) => {
    const [flag = '', ...rest] = text.split('=')

    return names.includes(flag) ? valued(rest.length > 0 ? bare(rest.join('=')) : (texts[at + 1] ?? '')) : found
  }, undefined)

// sudo -u runs the tool as someone else, whose kubeconfig, profile and environment are not this user's.
const isBorrowed = (raws: readonly string[]): boolean => {
  let wrapper = ''

  return raws.some(raw => {
    if (WRAPPERS.includes(raw)) wrapper = raw

    return wrapper === 'sudo' && OTHER_USER.test(raw)
  })
}

const partsOf = (url: string): [host: string, base: string] | undefined => {
  const [, host, base = ''] = URL_PARTS.exec(url) ?? []

  return host === undefined ? undefined : [host === '' ? 'localhost' : host, base]
}

const reachOf = (url: string): string | undefined => {
  const [host, base] = partsOf(url) ?? []

  return host === undefined ? undefined : base ? `${host}/${base}` : host
}

const moved = (dir: string | undefined, path: string | undefined, isWindows: boolean): string | undefined => {
  if (dir === undefined || path === undefined || valued(path) === UNSET || path.startsWith('~')) return undefined
  if (WINDOWS.test(path)) return isWindows ? path : undefined
  // A Git Bash path such as /c/infra is not one $.fs can be trusted to resolve.
  if (path.startsWith('/')) return isWindows ? undefined : path

  return `${dir}/${path}`
}

const setterOf = (head: string, plain: readonly string[]): string | undefined => {
  const [first, second, third, fourth] = plain
  if (head === 'kubectl' && first === 'config' && (second === 'use-context' || second === 'use')) return valued(third ?? '')
  if (head === 'kubectl' && first === 'config' && second === 'set' && third === 'current-context') return valued(fourth ?? '')
  if (head === 'terraform' && first === 'workspace' && (second === 'select' || second === 'new')) return valued(third ?? '')
  if (head === 'gcloud' && first === 'config' && second === 'set' && (third === 'project' || third === 'core/project')) return valued(fourth ?? '')

  return undefined
}

// These rewrite the kubeconfig or gcloud's active configuration after the probe has answered for the old one.
const mootOf = (head: string, plain: readonly string[]): Marks => {
  const isRepointing =
    head === 'kubectx' ||
    (head === 'aws' && plain.includes('update-kubeconfig')) ||
    ((head === 'gcloud' || head === 'az') && plain.includes('get-credentials')) ||
    (head === 'kubectl' && plain[0] === 'config' && plain[1] === 'unset' && plain[2] === 'current-context')
  if (isRepointing) return { kube: REPOINTED }

  return head === 'gcloud' && plain.includes('configurations') && plain.includes('activate') ? { gcp: RECONFIGURED } : {}
}

const named = (kind: AimKind, name: string | undefined, phrase = PHRASES[kind]): Settled =>
  name === undefined || name === UNSET ? { kind, why: FROM_VARIABLE } : { kind, name, phrase, source: NAMED }

const direct = (head: string, kind: AimKind, texts: readonly string[], held: Reading, set: string | undefined, isWindows: boolean): Shot => {
  const { over, dir } = held
  const ask: Ask = { kind, ask: 'ambient', dir, over }
  if (kind === 'kube') {
    const until = texts.indexOf('--')
    const own = until < 0 ? texts : texts.slice(0, until)
    if (flagged(own, ['--kubeconfig']) !== undefined || 'KUBECONFIG' in over) return { kind, why: 'another kubeconfig given' }
    if (flagged(own, ELSEWHERE[head] ?? []) !== undefined) return { kind, why: 'another cluster given' }
    const context = flagged(own, [head === 'helm' ? '--kube-context' : '--context']) ?? set

    return context === undefined ? ask : named(kind, context)
  }
  if (kind === 'aws') {
    const endpoint = flagged(texts, ['--endpoint-url'])
    if (endpoint !== undefined) return named(kind, partsOf(endpoint)?.[0], 'aws endpoint')
    const profile = flagged(texts, ['--profile'])

    return profile === undefined ? ask : named(kind, profile)
  }
  if (kind === 'gcp') {
    const project = flagged(texts, ['--project']) ?? set
    if (project !== undefined) return named(kind, project)

    return flagged(texts, ['--configuration', '--account']) === undefined && !over.CLOUDSDK_ACTIVE_CONFIG_NAME ? ask : { kind, why: RECONFIGURED }
  }
  if (kind === 'tf') {
    const chdir = texts.find(text => text.startsWith('-chdir='))
    if (set !== undefined && !over.TF_WORKSPACE) return named(kind, set)

    return chdir === undefined ? ask : { ...ask, dir: moved(dir, bare(chdir.slice('-chdir='.length)), isWindows) }
  }

  const lone = texts.find((text, at) => !text.startsWith('-') && !text.includes('=') && !PSQL_VALUED.test(texts[at - 1] ?? ''))
  const base = flagged(texts, ['-d', '--dbname']) ?? attached(texts, '-d') ?? (lone === undefined ? undefined : valued(lone))
  const link = [base, ...texts].find(text => text !== undefined && LINK.test(text))
  if (link !== undefined) return named(kind, valued(link) === UNSET ? undefined : reachOf(link))
  if (texts.some(text => LINK_VARIABLE.test(text))) return { ...ask, ask: 'url' }
  const host = flagged(texts, ['-h', '--host']) ?? attached(texts, '-h')
  if (host !== undefined) return named(kind, host === UNSET || base === UNSET ? undefined : base === undefined ? host : `${host}/${base}`)
  if (texts.some(text => /(?:^|\s)(?:host|service)=/.test(text))) return { kind, why: GIVEN }

  return { ...ask, ask: 'psql', ...(base === undefined ? {} : { base }) }
}

const headsIn = (text: string, isBash: boolean): AimKind[] =>
  segmentsOf(text, isBash).flatMap(raws => {
    const kind = TOOLS.get(toolOf(bare(raws[headOf(raws)] ?? '')))

    return [...(kind === undefined ? [] : [kind]), ...raws.filter(raw => bare(raw) !== raw).flatMap(raw => headsIn(bare(raw), isBash))]
  })

const stepOf = (held: Reading, raws: readonly string[], isWindows: boolean, isBash: boolean): Reading => {
  const at = headOf(raws)
  const texts = raws.map(bare)
  const head = toolOf(texts[at] ?? '')
  const rest = texts.slice(at + 1)
  const plain = rest.filter(text => !text.startsWith('-'))
  const local = prefixed(held.over, raws.slice(0, at))
  if (at === raws.length) return { ...held, over: local }
  if (EXPORTING.includes(head)) return { ...held, over: raws.slice(at + 1).reduce(assigned, held.over) }
  if (head === 'unset') return { ...held, over: plain.reduce(dropped, held.over) }
  if (MOVING.includes(head)) {
    const { tf: _tf, ...set } = held.set

    return { ...held, set, dir: moved(held.dir, plain[0], isWindows) }
  }

  const kind = TOOLS.get(head)
  const set = kind === undefined ? undefined : setterOf(head, plain)
  // A workspace chosen or read under -chdir belongs to that folder, so it neither carries on nor is carried in.
  const isAside = kind === 'tf' && rest.some(text => text.startsWith('-chdir='))
  const carried = kind === undefined || isAside ? undefined : held.set[kind]
  const quoted = raws.filter((raw, index) => bare(raw) !== raw && (kind === undefined || index !== at)).flatMap(raw => headsIn(bare(raw), isBash))
  // Inside a listed tool's own call another tool's name is an argument, a namespace or a chart, so only other commands are read for a mention.
  const loose = kind === undefined ? raws.flatMap((raw, index) => (bare(raw) === raw ? (TOOLS.get(toolOf(texts[index] ?? '')) ?? []) : [])) : []
  const taken = kind === undefined ? undefined : direct(head, kind, rest, { ...held, over: local }, set ?? carried, isWindows)
  const shot: Shot | undefined = taken !== undefined && 'ask' in taken && isBorrowed(raws.slice(0, at)) ? { kind: taken.kind, why: 'another user given' } : taken
  const fresh = mootOf(head, plain)
  const moot = { ...held.moot, ...fresh }
  const doubt = shot !== undefined && 'ask' in shot && shot.ask === 'ambient' ? moot[shot.kind] : undefined
  const mine: Shot[] =
    kind === undefined || shot === undefined ? [] : [held.isChanged ? { kind, why: 'environment changed in the command' } : doubt === undefined ? shot : { kind, why: doubt }]
  const kept: Marks = Object.fromEntries(Object.entries(held.set).filter(([other]) => !(other in fresh)))

  return {
    ...held,
    moot,
    set: kind === undefined || set === undefined || isAside ? kept : { ...kept, [kind]: set },
    isChanged: held.isChanged || SOURCING.includes(head) || raws.some(raw => ENV_DRIVE.test(raw)),
    shots: [...held.shots, ...mine, ...[...new Set([...quoted, ...loose])].filter(other => other !== kind).map(other => ({ kind: other, why: INDIRECT }))],
  }
}

// What a subshell sets ends with it, but what it wrote to a config file stays written: a context or project it chose, and a workspace
// when it chose it in the folder the reading returns to. PowerShell's parentheses group and do not scope, so there the reading carries on.
const scoped = (held: Reading, mark: string, isScoping: boolean): Reading => {
  if (!isScoping) return held
  if (mark === OPEN) return { ...held, outer: [...held.outer, held] }
  const before = held.outer.at(-1)
  if (before === undefined) return held
  const { tf: _tf, ...written } = held.set
  const set: Marks = held.dir === before.dir ? held.set : { ...written, ...(before.set.tf === undefined ? {} : { tf: before.set.tf }) }

  return { ...before, shots: held.shots, moot: held.moot, set }
}

// A backslash before a newline (a backtick in PowerShell) carries the command on, so the next line's flags are this command's.
const shotsOf = (command: string, { cwd, isWindows }: Place, isScoping: boolean): Shot[] =>
  segmentsOf(isScoping ? spoken(command).replace(CONTINUED, '') : spoken(command).replace(TICK_CONTINUED, ' '), isScoping).reduce<Reading>(
    (held, raws) => (raws.length === 1 && (raws[0] === OPEN || raws[0] === SHUT) ? scoped(held, raws[0], isScoping) : stepOf(held, raws, isWindows, isScoping)),
    { over: {}, dir: cwd, set: {}, moot: {}, isChanged: false, shots: [], outer: [] },
  ).shots

const envOf = async ($: EngineInterface): Promise<Env> => ({
  AWS_PROFILE: await $.env.get('AWS_PROFILE'),
  AWS_DEFAULT_PROFILE: await $.env.get('AWS_DEFAULT_PROFILE'),
  AWS_ACCESS_KEY_ID: await $.env.get('AWS_ACCESS_KEY_ID'),
  CLOUDSDK_CORE_PROJECT: await $.env.get('CLOUDSDK_CORE_PROJECT'),
  TF_WORKSPACE: await $.env.get('TF_WORKSPACE'),
  TF_DATA_DIR: await $.env.get('TF_DATA_DIR'),
  DATABASE_URL: await $.env.get('DATABASE_URL'),
  PGHOST: await $.env.get('PGHOST'),
  PGDATABASE: await $.env.get('PGDATABASE'),
  PGSERVICE: await $.env.get('PGSERVICE'),
  PGHOSTADDR: await $.env.get('PGHOSTADDR'),
  USERPROFILE: await $.env.get('USERPROFILE'),
  HOME: await $.env.get('HOME'),
})

const probed = ($: EngineInterface, argv: readonly string[], dir: string, isWindows: boolean, probes: Probes): Promise<string> => {
  const [tool = ''] = argv
  const asked =
    probes.get(tool) ??
    $.process.run(isWindows ? [...SHELL, ...argv] : argv, { cwd: dir, timeoutMs: PROBE_MS }).then(
      ran => (ran.exitCode === 0 ? (ran.stdout.split('\n')[0] ?? '').trim() : ''),
      () => '',
    )
  probes.set(tool, asked)

  return asked
}

// The CLI's versions do not agree on which of the two names wins, so two different ones name no profile.
const isSplit = (env: Env): boolean => !!env.AWS_PROFILE && !!env.AWS_DEFAULT_PROFILE && env.AWS_PROFILE !== env.AWS_DEFAULT_PROFILE

const ambient = async ($: EngineInterface, shot: Ask, env: Env, place: Place, probes: Probes): Promise<Target | undefined> => {
  const { kind, dir, over } = shot
  const phrase = PHRASES[kind]
  const from = (name: string): string => (name in over ? NAMED : ENVIRONMENT)
  if (kind === 'kube') {
    const name = await probed($, KUBECTL, dir ?? place.cwd, place.isWindows, probes)

    return name === '' ? undefined : { name, phrase, source: '' }
  }
  if (kind === 'gcp') {
    if (env.CLOUDSDK_CORE_PROJECT) return { name: env.CLOUDSDK_CORE_PROJECT, phrase, source: from('CLOUDSDK_CORE_PROJECT') }
    const name = await probed($, GCLOUD, dir ?? place.cwd, place.isWindows, probes)

    return name === '' || name === '(unset)' ? undefined : { name, phrase, source: '' }
  }
  if (kind === 'aws') {
    if (env.AWS_ACCESS_KEY_ID) return { name: `key …${env.AWS_ACCESS_KEY_ID.slice(-4)}`, phrase: 'aws key', source: from('AWS_ACCESS_KEY_ID') }
    if (isSplit(env)) return undefined
    if (env.AWS_PROFILE) return { name: env.AWS_PROFILE, phrase, source: from('AWS_PROFILE') }
    if (env.AWS_DEFAULT_PROFILE) return { name: env.AWS_DEFAULT_PROFILE, phrase, source: from('AWS_DEFAULT_PROFILE') }
    const home = env.USERPROFILE || env.HOME
    const isSetUp = home !== undefined && home !== '' && ((await $.fs.exists(`${home}/.aws/config`)) || (await $.fs.exists(`${home}/.aws/credentials`)))

    return isSetUp ? { name: 'default', phrase, source: '' } : undefined
  }
  if (kind === 'tf') {
    if (env.TF_WORKSPACE) return { name: env.TF_WORKSPACE, phrase, source: from('TF_WORKSPACE') }
    if (dir === undefined || env.TF_DATA_DIR) return undefined
    const name = await $.fs.read(`${dir}/.terraform/environment`).then(
      text => text.trim(),
      () => '',
    )
    if (name !== '') return { name, phrase, source: '' }

    return (await $.fs.exists(`${dir}/.terraform.lock.hcl`)) ? { name: 'default', phrase, source: '' } : undefined
  }

  const reach = reachOf(env.DATABASE_URL ?? '')
  if (reach !== undefined) return { name: reach, phrase, source: from('DATABASE_URL') }

  return env.PGHOST ? { name: env.PGDATABASE ? `${env.PGHOST}/${env.PGDATABASE}` : env.PGHOST, phrase, source: from('PGHOST') } : undefined
}

const settle = async ($: EngineInterface, shot: Ask, base: Env, place: Place, probes: Probes): Promise<Target | string> => {
  const { kind, over } = shot
  const env = { ...base, ...over }
  const phrase = PHRASES[kind]
  const isUnset = (names: readonly string[]): boolean => names.some(name => over[name] === UNSET)
  if (shot.ask === 'url') {
    const reach = isUnset(['DATABASE_URL']) ? undefined : reachOf(env.DATABASE_URL ?? '')

    return reach === undefined ? FROM_VARIABLE : { name: reach, phrase, source: 'DATABASE_URL' in over ? NAMED : ENVIRONMENT }
  }
  if (shot.ask === 'psql') {
    if (env.PGSERVICE || env.PGHOSTADDR) return GIVEN
    if (shot.base === UNSET || isUnset(['PGHOST', 'PGDATABASE'])) return FROM_VARIABLE
    // psql itself does not read DATABASE_URL, so only PGHOST moves it off its default.
    const host = env.PGHOST || 'localhost'
    const base = shot.base ?? env.PGDATABASE

    return { name: base ? `${host}/${base}` : host, phrase, source: !env.PGHOST ? 'psql default' : 'PGHOST' in over ? NAMED : ENVIRONMENT }
  }
  if (isUnset(VARIABLES[kind])) return FROM_VARIABLE
  if (kind === 'aws' && !env.AWS_ACCESS_KEY_ID && isSplit(env)) return 'two profiles set'
  if (kind === 'tf' && !env.TF_WORKSPACE && env.TF_DATA_DIR) return 'another data folder given'
  const found = await ambient($, shot, env, place, probes)
  if (found !== undefined) return found
  if (kind === 'kube' || kind === 'gcp') return `${kind === 'kube' ? 'kubectl' : 'gcloud'} did not answer`
  if (kind === 'aws') return 'no profile found'

  return shot.dir === undefined ? 'folder changed in the command' : 'no workspace found here'
}

const merged = (rows: readonly AimRow[], seen: ReadonlyMap<AimKind, string | undefined>, now: number): AimRow[] =>
  KINDS.flatMap(kind => {
    const held = rows.find(row => row.kind === kind)
    if (!seen.has(kind)) return held ?? []
    const name = seen.get(kind)
    if (name === undefined) return []

    return [{ kind, name, since: held === undefined || held.name === name ? (held?.since ?? 0) : now }]
  })

const isHot = (name: string, held: readonly string[]): boolean => held.some(word => name.toLowerCase().includes(word))

const tidied = (command: string): string =>
  command
    .replace(/:\/\/[^\s/]*@([^\s/:?#"']*)(?::\d+)?([^\s?#"']*)(?:[?#][^\s"']*)?/g, '://…@$1$2')
    .replace(/\b(\w*(?:PASSWORD|SECRET|TOKEN)\w*)=\S+/gi, '$1=…')
    .replace(/(?<![\w-])(-{1,2}(?!-?no-)[\w-]*(?:password|secret|token)[\w-]*)\s+(?!-)\S+/gi, '$1 …')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, COMMAND_MAX)

const aimed = async ($: EngineInterface, command: string, isScoping: boolean): Promise<string | undefined> => {
  if (!MENTIONED.test(command)) return undefined

  const cwd = await $.session.cwd()
  const place = { cwd, isWindows: WINDOWS.test(cwd) }
  const shots = shotsOf(command, place, isScoping)
  if (shots.length === 0) return undefined

  const env = shots.some(shot => 'ask' in shot) ? await envOf($) : {}
  const probes: Probes = new Map()
  const seen = new Map<AimKind, string | undefined>()
  const settled: Settled[] = []
  for (const shot of shots) {
    if (!('ask' in shot)) {
      settled.push(shot)
      continue
    }
    const found = await settle($, shot, env, place, probes)
    const isAmbient = shot.ask === 'ambient' && shot.dir === cwd && !VARIABLES[shot.kind].some(name => name in shot.over)
    if (isAmbient) seen.set(shot.kind, typeof found === 'string' ? undefined : found.name)
    settled.push(typeof found === 'string' ? { kind: shot.kind, why: found } : { kind: shot.kind, ...found })
  }

  const now = await $.clock.now()
  const held = await read($, words)
  const rows = merged((await read($, aim)).rows, seen, now)
  const lines = settled.map(shot => {
    if ('why' in shot) return { text: `${PHRASES[shot.kind]} not known: ${shot.why}`, isProduction: false, isKnown: false }
    const since = shot.source !== NAMED && seen.get(shot.kind) === shot.name ? (rows.find(row => row.kind === shot.kind)?.since ?? 0) : 0
    const said = [shot.phrase, shot.source, since === 0 ? '' : `changed, seen ${ago(now - since)} ago`].filter(part => part !== '').join(', ')
    const isProduction = isHot(shot.name, held)

    return { text: `${isProduction ? 'PRODUCTION: goes' : 'Goes'} to ${shot.name} (${said})`, isProduction, isKnown: true }
  })
  const texts = [...new Set(lines.map(line => line.text))]
  const line = `${texts.slice(0, LINES_MAX).join('; ')}${texts.length > LINES_MAX ? ` (+${texts.length - LINES_MAX} more)` : ''}`
  const last: AimShot = { command: tidied(command), line, isProduction: lines.some(made => made.isProduction), isKnown: lines.every(made => made.isKnown) }
  if (!(await read($, isOn))) return undefined
  await update($, aim, kept => ({ ...(kept ?? BLANK), rows: merged((kept ?? BLANK).rows, seen, now), last }))

  return line
}

const judged = async <Verdict extends { decision: string; reason?: string }>(
  $: EngineInterface,
  input: unknown,
  id: string | undefined,
  verdict: Verdict,
  isScoping: boolean,
): Promise<Verdict> => {
  const command = (input as { command?: unknown } | null)?.command
  if (verdict.decision !== 'ask' || typeof id !== 'string' || typeof command !== 'string') return verdict

  const line = await aimed($, command, isScoping)
  if (line === undefined) return verdict

  return { ...verdict, reason: verdict.reason ? `${line} · ${verdict.reason}` : line }
}

const refresh = async ($: EngineInterface): Promise<void> => {
  const cwd = await $.session.cwd()
  const place = { cwd, isWindows: WINDOWS.test(cwd) }
  const env = await envOf($)
  const probes: Probes = new Map()
  const found = await Promise.all(KINDS.map(kind => ambient($, { kind, ask: 'ambient', dir: cwd, over: {} }, env, place, probes)))
  const seen = new Map(KINDS.map((kind, at) => [kind, found[at]?.name]))
  const now = await $.clock.now()
  if (await read($, isOn)) await update($, aim, kept => ({ ...(kept ?? BLANK), rows: merged((kept ?? BLANK).rows, seen, now) }))
}

const tick = async ($: EngineInterface): Promise<void> => {
  if (!(await read($, isOn))) return

  const { at, isBusy } = await read($, aim)
  if (isBusy || (at !== 0 && (await $.clock.now()) - at < REFRESH_MS)) return

  await update($, aim, kept => ({ ...(kept ?? BLANK), isBusy: true }))
  try {
    await refresh($)
  } finally {
    const ended = await $.clock.now()
    if (await read($, isOn)) await update($, aim, kept => ({ ...(kept ?? BLANK), at: ended, isBusy: false }))
  }
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

const listed = (held: readonly string[]): string => (held.length === 0 ? 'No production words.' : `Production words: ${held.join(', ')}.`)

const add = async ($: EngineInterface, word: string): Promise<string> => {
  const held = await read($, words)
  if (held.includes(word)) return listed(held)
  if (held.length >= WORDS_MAX) return `Aim holds ${WORDS_MAX} production words; unprod one first.`

  const kept = await update($, words, () => [...held, word])
  await $.store.set('words', kept)

  return listed(kept)
}

const remove = async ($: EngineInterface, word: string): Promise<string> => {
  const held = await read($, words)
  if (!held.includes(word)) return `"${word}" is not a production word.`

  const kept = await update($, words, () => held.filter(other => other !== word))
  await $.store.set('words', kept)

  return listed(kept)
}

const told = async ($: EngineInterface): Promise<string> => {
  const { at, rows, last } = await read($, aim)

  return [
    rows.length === 0 ? (at === 0 ? LOOKING : NONE) :`Targets: ${rows.map(row => `${row.kind} ${row.name}`).join(', ')}.`,
    listed(await read($, words)),
    ...(last === null ? [] : [`Last: ${last.command}`, last.line]),
  ].join('\n')
}

const clear = async ($: EngineInterface): Promise<string> => {
  await update($, aim, kept => ({ ...(kept ?? BLANK), rows: (kept ?? BLANK).rows.map(row => ({ ...row, since: 0 })), last: null }))

  return 'Aim cleared.'
}

const rowOf = (row: AimRow, at: number, width: number): string => {
  const inner = width - 4
  if (width < WIDE_COLUMNS) return cut(`${row.kind} ${row.name}`, inner)

  const left = `${row.kind.padEnd(5)} ${row.name}`
  const right = row.since === 0 ? '' : `changed ${ago(at - row.since)}`

  return right === '' ? cut(left, inner) : `${cut(left, inner - right.length - 2).padEnd(inner - right.length)}${right}`
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

  const width = fit((await $.state.get(widths)).value?.['aim-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const { at, rows, last } = await read($, aim)
  const held = await read($, words)
  const isBare = rows.length === 0 && last === null
  const isProduction = last?.isProduction === true || rows.some(row => isHot(row.name, held))
  const tone = last === null ? undefined : last.isProduction ? 'red' : last.isKnown ? undefined : 'yellow'

  return $.widgets.card({
    beneath,
    width,
    title: 'Aim',
    note: isProduction ? 'prod' : last?.isKnown === false ? 'not known' : rows.length === 0 ? undefined : plural(rows.length, 'target'),
    body: (
      <Box key="aim" flexDirection="column">
        {(isBare ? wrapped(at === 0 ? LOOKING : EMPTY, inner) : []).map((line, index) => (
          <Text key={`say-${index}`} dimColor wrap="truncate-end">
            {line}
          </Text>
        ))}
        {rows.map(row => (
          <Text key={`row-${row.kind}`} color={isHot(row.name, held) ? 'red' : undefined} wrap="truncate-end">
            {rowOf(row, at, width)}
          </Text>
        ))}
        {last !== null && (
          <Text key="command" dimColor wrap="truncate-end">
            {cut(last.command, inner)}
          </Text>
        )}
        {(last === null ? [] : wrapped(last.line, inner)).map((line, index) => (
          <Text key={`line-${index}`} color={tone} wrap="truncate-end">
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
      name: 'aim-widget',
      description: 'Toggle the Aim card, or set the words that mark a target as production',
      argumentHint: '[on|off|prod <word>|unprod <word>|show|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const saved = await $.store.get('words')
    if (Array.isArray(saved)) await update($, words, () => saved.filter(word => typeof word === 'string' && WORD.test(word)).slice(0, WORDS_MAX))
    if (await read($, isOn)) await update($, aim, kept => ({ ...(kept ?? BLANK), isBusy: false }))
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'aim-widget' }, async ($, e) => {
    const [first = '', second = '', ...others] = e.args.trim().split(/\s+/)
    const verb = first.toLowerCase()

    if (verb === 'prod' || verb === 'unprod' || verb === 'show' || verb === 'clear') {
      const word = second.toLowerCase()
      const isWorded = verb === 'prod' || verb === 'unprod'
      if (isWorded ? !WORD.test(word) || others.length > 0 : second !== '') return { text: USAGE }
      if (!(await read($, isOn))) return { text: OFF }
      if (isWorded) return { text: verb === 'prod' ? await add($, word) : await remove($, word) }

      return { text: verb === 'show' ? await told($) : await clear($) }
    }

    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, aim, () => BLANK)
    await sync($)

    return { text: isShown ? 'Aim on; /widgets places it.' : 'Aim off.' }
  })

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => ((await read($, isOn)) ? judged($, e.input, e.tool_use_id, await next(e), true) : next(e)))

  on('tool.check', { tool: 'PowerShell' }, async ($, e, next) => ((await read($, isOn)) ? judged($, e.input, e.tool_use_id, await next(e), false) : next(e)))

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

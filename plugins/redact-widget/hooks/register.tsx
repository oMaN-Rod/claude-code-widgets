import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Tally = PluginState['redact-widget']['tally']
type Kinds = Record<string, number>
type Row = { text: string; count?: string; isDim?: boolean; isWarning?: boolean; isWrapped?: boolean }
type Drawn = { note?: string; rows: Row[] }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_EDGE = 4
const LONG_COLUMNS = 36
const SHORT_COLUMNS = 16
const USAGE = 'Usage: /redact-widget [on|off|clear]'
const OFF = 'Redact is off.'
const MOST = 999
const SHOWN_KINDS = 3
const LABEL_CHARS = 80
const UNCHECKED: readonly unknown[] = ['notebook', 'pdf', 'parts']
const EMPTY_LONG = ['Nothing kept out yet. A key, token', 'or password in command output or a', 'file read is replaced before Claude', 'reads it, and counted here.']
const EMPTY_SHORT = ['Nothing kept out', 'yet. A key or', 'password in a', 'result is hidden', 'from Claude and', 'counted here.']
const BLANK: Tally = { checked: 0, unchecked: 0, total: 0, kinds: {}, last: '' }
const SHAPES: readonly (readonly [string, RegExp])[] = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  ['API key', /\bsk-[A-Za-z0-9_-]{20,}/g],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['Stripe key', /\b[sr]k_live_[A-Za-z0-9]{16,}\b/g],
  ['Google key', /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
]
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]{0,30}:\/\/[^\s/@:]*:)[^\s@/]{3,}(?=@)/gi
const ASSIGNMENT =
  /(?<![A-Za-z0-9_])([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY)["'`]?[ \t]*[=:][ \t]*["'`]?)(?![$<{[])(?=[^\s"'`()]*\d)[^\s"'`()]{8,}/g
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'redact-widget', key: 'isOn' } as const, false)
const tally = atom({ plugin: 'redact-widget', key: 'tally' } as const, BLANK)

const mask =
  (kinds: Kinds, kind: string) =>
  (_found: string, kept: unknown): string => {
    kinds[kind] = (kinds[kind] ?? 0) + 1

    return `${typeof kept === 'string' ? kept : ''}[redacted ${kind}]`
  }

export const scrub = (text: string): { text: string; kinds: Kinds } => {
  const kinds: Kinds = {}
  const shaped = SHAPES.reduce((held, [kind, shape]) => held.replace(shape, mask(kinds, kind)), text)

  return { text: shaped.replace(URL_PASSWORD, mask(kinds, 'password')).replace(ASSIGNMENT, mask(kinds, 'secret value')), kinds }
}

const merged = (held: Kinds, found: Kinds): Kinds =>
  Object.entries(found).reduce((kinds, [kind, count]) => ({ ...kinds, [kind]: (kinds[kind] ?? 0) + count }), held)

const fields = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})

const rewritten = (tool: string, result: unknown): { result: unknown; kinds: Kinds } => {
  const record = fields(result)
  const file = fields(record.file)
  const texts: Record<string, unknown> =
    tool === 'Read'
      ? { content: record.type === 'text' ? file.content : undefined }
      : tool === 'Grep'
        ? { content: record.content }
        : record.isImage === true
          ? {}
          : { stdout: record.stdout, stderr: record.stderr }
  const cleaned = Object.entries(texts).flatMap(([key, text]) => (typeof text === 'string' ? [[key, scrub(text)] as const] : []))
  const swapped = Object.fromEntries(cleaned.map(([key, found]) => [key, found.text]))

  return {
    result: tool === 'Read' ? { ...record, file: { ...file, ...swapped } } : { ...record, ...swapped },
    kinds: cleaned.reduce((kinds, [, found]) => merged(kinds, found.kinds), {}),
  }
}

const cap = (count: number): string => (count > MOST ? `${MOST}+` : String(count))

const some = (count: number, word: string): string => plural(count, word).replace(/^\S+/, cap(count))

const named = (kind: string, count: string, isLong: boolean): Row => {
  const room = SHORT_COLUMNS - count.length - 1

  return { text: isLong || kind.length <= room ? kind : `${kind.slice(0, room - 1)}…`, count }
}

const draw = (held: Tally, inner: number): Drawn => {
  const isLong = inner >= LONG_COLUMNS
  const unchecked: Row[] =
    held.unchecked > 0
      ? [{ text: isLong ? `${some(held.unchecked, 'read')} unchecked: PDF, notebook` : `${cap(held.unchecked)} unchecked`, isWarning: true }]
      : []

  if (held.total === 0) {
    if (held.checked === 0 && held.unchecked === 0) return { rows: (isLong ? EMPTY_LONG : EMPTY_SHORT).map(text => ({ text, isWrapped: true })) }

    const clean: Row[] =
      held.checked === 0
        ? []
        : isLong
          ? [{ text: `${some(held.checked, 'result')} checked, all clean` }]
          : [{ text: `${cap(held.checked)} checked` }, { text: 'all clean' }]

    return { note: held.unchecked > 0 ? 'unchecked' : 'watching', rows: [...clean, ...unchecked] }
  }

  const ranked = Object.entries(held.kinds).sort(([, first], [, second]) => second - first)
  const more = ranked.length - SHOWN_KINDS

  return {
    note: `${cap(held.total)} ${isLong ? 'kept out' : 'out'}`,
    rows: [
      ...ranked.slice(0, SHOWN_KINDS).map(([kind, count]) => named(kind, `×${cap(count)}`, isLong)),
      ...(more > 0 ? [{ text: isLong ? `and ${cap(more)} more` : `+${cap(more)} more`, isDim: true }] : []),
      { text: `${isLong ? 'Last in' : 'in'}: ${held.last}`, isDim: true },
      { text: isLong ? `${some(held.checked, 'result')} checked` : `${cap(held.checked)} checked` },
      ...unchecked,
    ],
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

  const width = fit((await $.state.get(widths)).value?.['redact-widget'] ?? CARD_COLUMNS, columns)
  const { note, rows } = draw(await read($, tally), width - CARD_EDGE)

  return $.widgets.card({
    beneath,
    width,
    title: 'Redact',
    note,
    body: (
      <Box flexDirection="column">
        {rows.map(row =>
          row.count === undefined ? (
            <Text color={row.isWarning === true ? 'yellow' : undefined} dimColor={row.isDim === true} wrap={row.isWrapped === true ? 'wrap' : 'truncate-end'}>
              {row.text}
            </Text>
          ) : (
            <Box justifyContent="space-between" columnGap={1}>
              <Text wrap="truncate-end">{row.text}</Text>
              <Text>{row.count}</Text>
            </Box>
          ),
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'redact-widget',
      description: 'Toggle the Redact card, or clear its count of secrets kept out',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'redact-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }
      await update($, tally, () => BLANK)

      return { text: 'Redact cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, tally, () => BLANK)

    return { text: isShown ? 'Redact on; /widgets places it.' : 'Redact off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    if (e.tool !== 'Bash' && e.tool !== 'PowerShell' && e.tool !== 'Read' && e.tool !== 'Grep') return next(e)

    const ran = await next(e)
    if (ran.deny !== undefined || !(await read($, isOn))) return ran

    const type = e.tool === 'Read' && ran.isError !== true ? fields(ran.result).type : undefined
    if (type === 'image') return ran
    if (UNCHECKED.includes(type)) {
      await update($, tally, held => ({ ...held, unchecked: held.unchecked + 1 }))

      return ran
    }

    const failure = ran.isError === true ? scrub(ran.text ?? '') : undefined
    const answer = failure === undefined ? rewritten(e.tool, ran.result) : undefined
    const kinds = failure?.kinds ?? answer?.kinds ?? {}
    const count = Object.values(kinds).reduce((sum, each) => sum + each, 0)
    if (count === 0) {
      await update($, tally, held => ({ ...held, checked: held.checked + 1 }))

      return ran
    }

    const label = e.tool === 'Read' ? (e.file_path.split(/[\\/]/).pop() ?? '') : e.tool === 'Grep' ? `Grep ${e.pattern}` : e.command
    const last = scrub(label).text.replace(/\s+/g, ' ').trim().slice(0, LABEL_CHARS)
    await update($, tally, held => ({
      checked: held.checked + 1,
      unchecked: held.unchecked,
      total: held.total + count,
      kinds: merged(held.kinds, kinds),
      last,
    }))
    const note = `redact-widget replaced ${plural(count, 'secret value')} in this result with [redacted ...] placeholders before you read it. The real values are unchanged on disk. Never write a placeholder into a file or a command, and do not try to read the values another way.`

    return failure === undefined ? { result: answer?.result, context: [...(ran.context ?? []), note] } : { deny: `${failure.text}\n\n${note}` }
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

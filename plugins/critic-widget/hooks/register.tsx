import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Review = {
  status: 'idle' | 'reading' | 'found' | 'clean' | 'failed'
  findings: string[]
  why: string
  isCut: boolean
  isTelling: boolean
  ticket: number
}
type Outcome = Pick<Review, 'status' | 'findings' | 'why' | 'isCut'>
type Row = { key: string; text: string; mark?: string; isDim?: boolean; color?: 'green' | 'red' }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const FRAME_COLUMNS = 4
const MAX_DIFF = 40_000
const MAX_FINDINGS = 6
const MAX_FINDING = 240
const USAGE = 'Usage: /critic-widget [on|off|review|tell|clear]'
const OFF = 'Critic is off.'
const GIT = ['git', 'diff', 'HEAD', '--no-color', '--no-ext-diff'] as const
const BRIEF =
  'You are a second pair of eyes on a git diff. Report only defects that would cause wrong behaviour, a crash, data loss or a security hole. Never comment on style, naming, tests that could be added, or anything you only suspect. Write one finding per line as "- path:line: what breaks and when", at most six lines. If you find no defect, reply with exactly NONE.'
const LEAD =
  'critic-widget: an independent reviewer that saw only the uncommitted diff, not this conversation, flagged these. Check each against the code. Fix the ones that are real, and say which you reject and why:'
const EMPTY = 'No review yet. /critic-widget review has a separate model read the uncommitted diff and list only real defects.'
const READING = 'Reading the diff…'
const TELL = '/critic-widget tell hands these to Claude.'
const TOLD = 'Goes to Claude with your next prompt.'
const CLEAN = 'No defects found in the diff.'
const CUT = 'Only the first part of a long diff was read.'
const NO_REPO = 'No git repository here, or no commit yet.'
const NO_GIT = 'Could not run git diff.'
const NO_DIFF = 'Nothing uncommitted in tracked files.'
const UNREACHED = 'The reviewing model could not be reached.'
const NO_ANSWER = 'The reviewing model gave no answer.'
const TOO_LONG = 'The review took too long and was stopped.'
const UNREADABLE = "The reviewer's reply could not be read."
const NONE = /^none\.?$/i
const BULLET = /^[-*]\s+\S/
const BLANK: Review = { status: 'idle', findings: [], why: '', isCut: false, isTelling: false, ticket: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'critic-widget', key: 'isOn' } as const, false)
const review = atom({ plugin: 'critic-widget', key: 'review' } as const, BLANK)

const emptied = (held: Review | undefined): Review => ({ ...BLANK, ticket: held?.ticket ?? 0 })

const failed = (why: string): Outcome => ({ status: 'failed', findings: [], why, isCut: false })

const wrapped = (sentence: string, columns: number): string[] =>
  sentence
    .split(' ')
    .flatMap(word => word.match(new RegExp(`.{1,${columns}}`, 'g')) ?? [])
    .reduce<string[]>((rows, word) => {
      const last = rows.at(-1)

      return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
    }, [])

const said = (key: string, sentence: string, inner: number, look: Pick<Row, 'isDim' | 'color'> = {}): Row[] =>
  wrapped(sentence, inner).map((text, at) => ({ key: `${key}-${at + 1}`, text, ...look }))

const listed = (finding: string, at: number, inner: number): Row[] => {
  const [first = '', second, ...rest] = wrapped(finding, inner - 2)
  const head = { key: `finding-${at + 1}`, text: first, mark: String(at + 1) }
  if (second === undefined) return [head]

  return [head, { key: `finding-${at + 1}-more`, text: `  ${rest.length === 0 ? second : `${second.slice(0, inner - 3).trimEnd()}…`}` }]
}

const laid = ({ status, findings, why, isCut, isTelling }: Review, inner: number): Row[] => {
  const cut = isCut ? said('cut', CUT, inner, { isDim: true }) : []
  if (status === 'reading') return said('reading', READING, inner, { isDim: true })
  if (status === 'found') {
    return [...findings.flatMap((finding, at) => listed(finding, at, inner)), ...cut, ...said('tell', isTelling ? TOLD : TELL, inner, { isDim: true })]
  }
  if (status === 'clean') return [...cut, ...said('clean', CLEAN, inner, { color: 'green' })]

  return status === 'failed' ? said('why', why, inner, { color: 'red' }) : said('empty', EMPTY, inner)
}

const noted = ({ status, findings }: Review): string =>
  status === 'reading' ? 'reading' : status === 'found' ? `${findings.length} found` : status === 'clean' ? 'clean' : status === 'failed' ? 'no review' : ''

const parsed = (reply: string, isCut: boolean): Outcome => {
  if (NONE.test(reply.trim())) return { status: 'clean', findings: [], why: '', isCut }

  const findings = reply
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => BULLET.test(line))
    .slice(0, MAX_FINDINGS)
    .map(line => line.slice(1).replaceAll(/\s+/g, ' ').trim().slice(0, MAX_FINDING).trimEnd())

  return findings.length === 0 ? failed(UNREADABLE) : { status: 'found', findings, why: '', isCut }
}

const judged = async ($: EngineInterface): Promise<Outcome> => {
  const diffed = await $.process.run(GIT).catch(() => undefined)
  if (diffed === undefined) return failed(NO_GIT)
  if (diffed.exitCode !== 0) return failed(NO_REPO)
  if (diffed.stdout.trim() === '') return failed(NO_DIFF)

  const reply = await $.model
    .complete({ model: 'sonnet', system: BRIEF, prompt: diffed.stdout.slice(0, MAX_DIFF), maxTokens: 900, timeoutMs: 60_000 })
    .catch(() => undefined)
  if (reply === undefined) return failed(UNREACHED)
  if (!reply.isAnswered) return failed(reply.reason === 'empty-reply' ? NO_ANSWER : reply.reason === 'aborted' ? TOO_LONG : UNREACHED)

  return parsed(reply.text, diffed.stdout.length > MAX_DIFF || diffed.isStdoutTruncated)
}

const examined = async ($: EngineInterface): Promise<string> => {
  const held = await read($, review)
  if (held.status === 'reading') return 'Still reading.'

  const ticket = held.ticket + 1
  await update($, review, () => ({ ...BLANK, status: 'reading' as const, ticket }))
  const outcome = await judged($)
  const kept = await update($, review, now =>
    now?.status === 'reading' && now.ticket === ticket ? { ...outcome, isTelling: false, ticket } : (now ?? BLANK),
  )
  if (kept.ticket !== ticket || kept.status === 'idle') return 'Critic dropped the review.'
  if (outcome.status === 'failed') return outcome.why

  return [
    ...(outcome.status === 'found' ? [...outcome.findings.map((finding, at) => `${at + 1}. ${finding}`), TELL] : ['No defects found.']),
    ...(outcome.isCut ? [CUT] : []),
  ].join('\n')
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

  const width = fit((await $.state.get(widths)).value?.['critic-widget'] ?? CARD_COLUMNS, columns)
  const held = await read($, review)

  return $.widgets.card({
    beneath,
    width,
    title: 'Critic',
    note: noted(held),
    body: (
      <Box flexDirection="column">
        {laid(held, width - FRAME_COLUMNS).map(row =>
          row.mark === undefined ? (
            <Text key={row.key} dimColor={row.isDim === true} wrap="truncate-end" {...(row.color === undefined ? {} : { color: row.color })}>
              {row.text}
            </Text>
          ) : (
            <Text key={row.key} wrap="truncate-end">
              <Text dimColor>{row.mark}</Text> {row.text}
            </Text>
          ),
        )}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'critic-widget',
      description: 'Toggle the Critic card; review has a separate model read the uncommitted diff',
      argumentHint: '[on|off|review|tell|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'critic-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'review' || arg === 'tell' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: OFF }
      if (arg === 'review') return { text: await examined($) }
      if (arg === 'clear') {
        await update($, review, emptied)

        return { text: 'Critic cleared.' }
      }
      if ((await read($, review)).status !== 'found') return { text: 'No findings to hand over.' }
      await update($, review, held => (held?.status === 'found' ? { ...held, isTelling: true } : (held ?? BLANK)))

      return { text: 'The findings go to Claude with your next prompt.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, review, emptied)

    return { text: isShown ? 'Critic on; /widgets places it.' : 'Critic off.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge' && e.origin.kind !== 'sdk') return next(e)

    const { isTelling, findings } = await read($, review)
    if (!isTelling || findings.length === 0) return next(e)

    await update($, review, emptied)

    return next({ ...e, context: [...(e.context ?? []), [LEAD, ...findings.map(finding => `- ${finding}`)].join('\n')] })
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

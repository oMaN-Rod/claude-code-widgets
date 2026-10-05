import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, TurnStepTextChunk, TurnStepThinkingChunk } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Turn = PluginState['premise-widget']['turn']
type Item = Turn['found'][number]
type Reader = { kind: 'text' | 'thinking' | ''; index: number; tail: string; reply: string[]; hasThought: boolean; isStopped: boolean }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LONG_COLUMNS = 24
const MAX_ITEMS = 20
const MAX_SHOWN = 3
const MAX_ROWS = 7
const QUOTE_LETTERS = 240
const GIST_LETTERS = 80
const USAGE = 'Usage: /premise-widget [on|off|show|fix <n>|clear]'
const OFF = 'Premise is off.'
const EMPTY = 'What Claude takes for granted in its thinking and does not say appears here while it thinks.'
const READING = "Reading Claude's thinking…"
const NONE = 'The thinking shown words nothing as an assumption.'
const UNSEEN = 'No thinking text reached this card.'
const POINTER = '/premise-widget show says why.'
const WHY =
  'No thinking text reached Premise this turn. Claude Code sends it only when settings.json has "showThinkingSummaries": true (headless: --thinking-display summarized). Set it, and restart Claude Code if it does not take effect. If it is set, Claude did not think this turn.'
const LIMIT =
  'Premise reads only the summary of the thinking, for sentences that name something not given and a choice made anyway. Claude may have assumed more than that.'
const BROKEN = "Could not read this turn's thinking."
const BLANK: Turn = { id: '', phase: 'idle', sawThinking: false, isBroken: false, found: [] }
const SENTENCE_END = /[.!?](?=\s)|\n/g
const ABBREVIATED = /(?<![\p{L}\p{N}])(?:e\.g|i\.e|etc|vs)$/iu
const GAP =
  /(?<![\p{L}\p{N}])(?:(?:isn|wasn|aren|weren|didn)['’]t specif(?:y|ied)|no (?:\S+ ){1,2}(?:is|was) (?:specified|given)|i don['’]t know|without specifics|without knowing)(?![\p{L}\p{N}])/iu
const CHOICE = /(?<![\p{L}\p{N}])(?:i['’]ll|i will|i need to pick)(?![\p{L}\p{N}])/iu
const FLAG =
  /(?<![\p{L}\p{N}])(?:assum\p{L}*|placeholders?|replace|adjust|unknown|best guess|(?:not|\p{L}+n['’]t) specified)(?![\p{L}\p{N}])/iu
const NEGATED = /\p{L}+n['’]t/gu
const STOP_WORDS = new Set(
  'that this with from have will just they their them then than since know specified specify without which what when your into only most some like about should would could there here also need pick write default being each'.split(
    ' ',
  ),
)
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'premise-widget', key: 'isOn' } as const, false)
const turn = atom({ plugin: 'premise-widget', key: 'turn' } as const, BLANK)

const tidy = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:[-*]|\d+\.) /, '')
    .trim()

const cut = (text: string, room: number): string => {
  const letters = [...text]

  return letters.length <= room ? text : `${letters.slice(0, room - 1).join('')}…`
}

const premise = (sentence: string): Item | undefined => {
  if (sentence.endsWith('?') || !GAP.test(sentence)) return undefined

  const choice = sentence.search(CHOICE)
  if (choice < 0) return undefined

  return {
    quote: cut(sentence, QUOTE_LETTERS),
    gist: cut(sentence.slice(choice).replace(/[.!]$/, ''), GIST_LETTERS),
    isSaid: false,
  }
}

const content = (sentence: string): string[] => [
  ...new Set(
    (sentence.toLowerCase().replace(NEGATED, ' ').match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter(word => !word.startsWith('assum') && !STOP_WORDS.has(word)),
  ),
]

const alike = (one: string, other: string): boolean =>
  one === other || (one.length >= 5 && other.length >= 5 && one.slice(0, 5) === other.slice(0, 5))

const stated = (quote: string, reply: readonly string[]): boolean => {
  const wanted = content(quote)

  return reply.some(sentence => FLAG.test(sentence) && content(sentence).some(given => wanted.some(word => alike(word, given))))
}

const sentences = (reader: Reader): string[] => {
  const whole: string[] = []
  let from = 0
  for (const { 0: mark, index } of reader.tail.matchAll(SENTENCE_END)) {
    if (mark === '.' && ABBREVIATED.test(reader.tail.slice(from, index))) continue
    whole.push(reader.tail.slice(from, index + 1))
    from = index + 1
  }
  reader.tail = reader.tail.slice(from)

  return whole
}

const wrapped = (sentence: string, columns: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const held = rows.at(-1)

    return held !== undefined && held.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${held} ${word}`] : [...rows, word]
  }, [])

const itemRows = (number: number, gist: string, inner: number): string[] => {
  const lead = `${number} `
  const room = inner - lead.length
  const words = gist.split(' ')
  let head = ''
  let taken = 0
  for (const word of words) {
    const longer = head === '' ? word : `${head} ${word}`
    if (longer.length > room) break
    head = longer
    taken += 1
  }
  const rest = taken === 0 ? gist.slice(room) : words.slice(taken).join(' ')

  return rest === '' ? [`${lead}${head}`] : [`${lead}${taken === 0 ? gist.slice(0, room) : head}`, `  ${cut(rest, inner - 2)}`]
}

const drawn = (unspoken: readonly Item[], inner: number, spare: number): { rows: string[]; earlier: number } => {
  for (let count = Math.min(MAX_SHOWN, unspoken.length); count > 0; count -= 1) {
    const earlier = unspoken.length - count
    const rows = unspoken.slice(earlier).flatMap(({ gist }, at) => itemRows(earlier + at + 1, gist, inner))
    if (count === 1 || rows.length + (earlier > 0 ? 1 : 0) <= spare) return { rows, earlier }
  }

  return { rows: [], earlier: 0 }
}

const resting = (held: Turn): string[] => {
  if (held.isBroken) return [BROKEN]
  if (held.phase === 'idle') return [EMPTY]
  if (held.phase === 'live') return [READING]
  if (!held.sawThinking) return [UNSEEN, POINTER]

  const said = held.found.filter(item => item.isSaid).length

  return said === 0 ? [NONE] : [NONE, `${said} ${said === 1 ? 'was' : 'were'} said in the reply.`]
}

const listing = (held: Turn): string => {
  const unspoken = held.found.filter(item => !item.isSaid)
  const said = held.found.length - unspoken.length
  if (unspoken.length === 0) {
    if (held.isBroken || held.phase !== 'settled') return resting(held).join('\n')

    return held.sawThinking ? [...resting(held), LIMIT].join('\n') : WHY
  }

  return [
    `Premise: ${plural(unspoken.length, 'assumption')} in the thinking shown that the reply does not flag. Claude may have checked them since.`,
    ...unspoken.map(({ quote }, at) => `${at + 1}. "${quote}"`),
    ...(said === 0 ? [] : [`${said} more said in the reply.`]),
    ...(held.isBroken ? [BROKEN] : []),
  ].join('\n')
}

const amend = async ($: EngineInterface, id: string, change: (held: Turn) => Turn): Promise<void> => {
  if (!(await read($, isOn)) || (await read($, turn)).id !== id) return

  // A read here can trail a switch-off or a clear by a moment; update() reads afresh, and throwing is its only way to write nothing.
  let isHeld = true
  try {
    await update($, turn, held => {
      isHeld = held?.id === id
      if (held === undefined || !isHeld) throw new Error('premise-widget: the turn is no longer held')

      return change(held)
    })
  } catch (error) {
    if (isHeld) throw error
  }
}

const failed = async ($: EngineInterface, id: string): Promise<void> => {
  try {
    await amend($, id, held => ({ ...held, isBroken: true }))
  } catch {
    return
  }
}

const guarded = async ($: EngineInterface, id: string, reader: Reader, work: () => Promise<void>): Promise<void> => {
  try {
    await work()
  } catch {
    reader.isStopped = true
    await failed($, id)
  }
}

const opening = async ($: EngineInterface, id: string): Promise<void> => {
  if ((await read($, isOn)) && (await read($, turn)).id !== id) await update($, turn, () => ({ ...BLANK, id, phase: 'live' as const }))
}

const heard = async ($: EngineInterface, id: string, reader: Reader, raw: string): Promise<void> => {
  const sentence = tidy(raw)
  if (sentence === '') return
  if (reader.kind === 'text') {
    reader.reply.push(sentence)

    return
  }

  const item = premise(sentence)
  if (item === undefined) return

  const quote = item.quote.toLowerCase()
  if ((await read($, turn)).found.some(other => other.quote.toLowerCase() === quote)) return

  await amend($, id, held => ({ ...held, found: [...held.found, item].slice(-MAX_ITEMS) }))
}

const flushing = async ($: EngineInterface, id: string, reader: Reader): Promise<void> => {
  const last = reader.tail
  reader.tail = ''
  await heard($, id, reader, last)
}

const reading = async ($: EngineInterface, id: string, reader: Reader, chunk: TurnStepTextChunk | TurnStepThinkingChunk): Promise<void> => {
  if (reader.kind !== chunk.kind || reader.index !== chunk.index) {
    await flushing($, id, reader)
    reader.kind = chunk.kind
    reader.index = chunk.index
  }
  if (chunk.kind === 'thinking' && !reader.hasThought && chunk.text.trim() !== '') {
    reader.hasThought = true
    if (!(await read($, turn)).sawThinking) await amend($, id, held => ({ ...held, sawThinking: true }))
  }
  reader.tail += chunk.text
  for (const sentence of sentences(reader)) await heard($, id, reader, sentence)
}

const closing = async ($: EngineInterface, id: string, reader: Reader): Promise<void> => {
  await flushing($, id, reader)
  await amend($, id, held => ({
    ...held,
    found: held.found.map(item => (!item.isSaid && stated(item.quote, reader.reply) ? { ...item, isSaid: true } : item)),
  }))
}

const fixing = async ($: EngineInterface, number: number): Promise<string> => {
  const item = (await read($, turn)).found.filter(found => !found.isSaid)[number - 1]
  if (item === undefined) return `No assumption ${number}. /premise-widget show lists them.`

  const unfilled = `Could not fill the prompt box. Assumption ${number}: "${item.quote}"`
  try {
    const filled = await $.prompt.fill({ text: `You assumed: "${tidy(item.quote.replaceAll('"', "'"))}". That is wrong: ` })

    return filled?.isFilled === true ? `Filled the prompt with assumption ${number}. Finish the sentence and send it.` : unfilled
  } catch {
    return unfilled
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

  const width = fit((await $.state.get(widths)).value?.['premise-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const held = await read($, turn)
  const unspoken = held.found.filter(item => !item.isSaid)
  const count = unspoken.length
  const red = held.isBroken ? wrapped(BROKEN, inner) : []
  const dim = held.isBroken || count > 0 ? [] : resting(held).flatMap(sentence => wrapped(sentence, inner))
  const { rows, earlier } = drawn(unspoken, inner, MAX_ROWS - red.length)
  const more = `+${earlier} earlier · show lists all`
  const long = held.phase === 'live' ? `${count} so far` : `${count} unspoken`

  return $.widgets.card({
    beneath,
    width,
    title: 'Premise',
    note: count > 0 ? (inner >= LONG_COLUMNS ? long : `${count}`) : held.phase === 'live' ? 'live' : '',
    body: (
      <Box flexDirection="column">
        {dim.map(row => (
          <Text dimColor wrap="truncate-end">
            {row}
          </Text>
        ))}
        {rows.map(row => (
          <Text wrap="truncate-end">{row}</Text>
        ))}
        {earlier > 0 && (
          <Text key="earlier" dimColor wrap="truncate-end">
            {more.length <= inner ? more : `+${earlier} earlier`}
          </Text>
        )}
        {red.map(row => (
          <Text color="red" wrap="truncate-end">
            {row}
          </Text>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'premise-widget',
      description: 'Toggle the Premise card, or show, fix and clear the quotes of its thinking summary the reply does not flag',
      argumentHint: '[on|off|show|fix <n>|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'premise-widget' }, async ($, e) => {
    const typed = e.args.trim()
    const [word = ''] = typed.split(/\s+/)
    const verb = word.toLowerCase()
    const rest = typed.slice(word.length).trim()

    if (verb === 'show' || verb === 'fix' || verb === 'clear') {
      if (verb === 'fix' ? !/^\d{1,3}$/.test(rest) : rest !== '') return { text: USAGE }
      if (!(await read($, isOn))) return { text: OFF }
      if (verb === 'show') return { text: listing(await read($, turn)) }
      if (verb === 'fix') return { text: await fixing($, Number(rest)) }

      await update($, turn, () => BLANK)

      return { text: 'Premise cleared.' }
    }

    const arg = typed.toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, turn, () => BLANK)

    return { text: isShown ? 'Premise on; /widgets places it.' : 'Premise off.' }
  })

  on('turn.start', async ($, e, next) => {
    if (await read($, isOn)) await update($, turn, () => ({ ...BLANK, id: e.turnId, phase: 'live' as const }))

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || !(await read($, isOn))) return yield* next(e)

    const id = e.turnId
    const reader: Reader = { kind: '', index: 0, tail: '', reply: [], hasThought: false, isStopped: false }
    const stream = next(e)
    await guarded($, id, reader, () => opening($, id))
    try {
      for await (const chunk of stream) {
        if (!reader.isStopped && (chunk.kind === 'thinking' || chunk.kind === 'text')) {
          await guarded($, id, reader, () => reading($, id, reader, chunk))
        }
        yield chunk
      }
    } finally {
      await guarded($, id, reader, () => closing($, id, reader))
    }

    return await stream.result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isOn)) && (await read($, turn)).id === e.turnId) {
      await update($, turn, held => ({ ...(held ?? BLANK), phase: 'settled' as const }))
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

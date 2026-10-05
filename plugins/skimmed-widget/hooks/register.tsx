import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderNode, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>
type Book = PluginState['skimmed-widget']['book']
type Page = Book['pages'][number]
type Caveat = Page['caveats'][number]
type Report = { id: string; text: string; on: { first: number; last: number; of: number } | null; columns: number }
type Found = { id: string; turn: number; place: number; text: string; fate: 'off' | 'shown' | 'unknown' }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const WIDE_COLUMNS = 30
const FLUSH_MS = 100
const SHOWN_MS = 1000
const SETTLE_MS = 500
const FALLBACK_COLUMNS = 80
const MAX_ROWS = 300
const MAX_PAGES = 40
const MAX_CAVEATS = 5
const MAX_TEXT = 200
const MAX_QUOTES = 2
const QUOTE_ROWS = 3
const USAGE = 'Usage: /skimmed-widget [on|off|show|clear]'
const VERBS = ['', 'on', 'off', 'show', 'clear']
const EMPTY = 'No replies watched yet. A caveat that scrolls away while Claude is still writing is quoted here.'
const WORKING = 'Claude is writing. Caveats that leave the screen are quoted when the turn ends.'
const RESTING = 'Nothing off screen in the last turn.'
const UNQUOTED = 'Nothing to quote from the last turn.'
const UNWATCHED = 'No replies watched yet.'
const UNJUDGED = 'not judged: the reply was resized, was never in the window, or runs past row 300.'
const HEAD = 'Off screen since Claude wrote them:'
const BLIND = 'This layout does not report what is on screen. Skimmed needs the fullscreen layout and claims nothing here.'
const RULE =
  'Shown means on screen 1s or more after its reply stopped changing, or on screen now, with a margin of rows either side. Nothing here says a shown line was read.'
const CAVEAT = /\b(did not|didn't|could not|couldn't|unable to|skipped|not yet|failed|untested|not verified|note that|note:|warning:|caveat)/gi
const NONE = /^(?:0|no|none|nothing)$/i
const LEAD = /^\s*(?:(?:#+\s+|>\s*|[-*+]\s+|\d+[.)]\s+))*/
const MARK = /(`+)(.+?)\1(?!`)|[*_]+|`/g
const WORD = /[\p{L}\p{N}]/u
const STOP = /(?<=[.!?])(?<!\b(?:[Ee]\.[Gg]|[Ii]\.[Ee]|[Vv][Ss])\.)(?<!(?:\b[Ee][Tt][Cc]\.|\.\.\.)(?=\s+\p{Ll}))\s+/u
const WIDE =/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u
const START: Page['read'] = { at: 0, weight: 0, isFenced: false }
const REST: Book = { turn: 0, isBusy: false, pages: [] }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'skimmed-widget', key: 'isOn' } as const, false)
const spot = { plugin: 'skimmed-widget', key: 'book' } as const
const book = atom(spot, REST)
const queue: Report[] = []

let timer: Timer | undefined

const cells = (text: string): number => [...text].reduce((sum, letter) => sum + (WIDE.test(letter) ? 2 : 1), 0)

const fitted = (text: string, room: number): string => {
  const letters = [...text]
  while (letters.length > 0 && cells(letters.join('')) > room) letters.pop()

  return letters.join('')
}

const cut = (text: string, room: number): string => (cells(text) <= room ? text : `${fitted(text, room - 1)}…`)

const wrapped = (text: string, room: number, most: number): string[] => {
  const lines: string[] = []
  let rest = text
  while (lines.length < most - 1 && cells(rest) > room) {
    const head = fitted(rest, room)
    const space = head.lastIndexOf(' ')
    const [word = ''] = rest.slice(space + 1).split(' ')
    const line = rest[head.length] !== ' ' && space > 0 && cells(word) <= room ? head.slice(0, space) : head
    lines.push(line.trimEnd())
    rest = rest.slice(line.length).trimStart()
  }

  return [...lines, cut(rest, room)]
}

const replies = (count: number): string => `${count} ${count === 1 ? 'reply' : 'replies'}`

const warns = (sentence: string): boolean =>
  [...sentence.matchAll(CAVEAT)].some(
    match =>
      !sentence
        .slice(0, match.index)
        .trim()
        .split(' ')
        .slice(-2)
        .some(word => NONE.test(word)),
  )

const unmarked = (line: string): string =>
  line.replace(MARK, (run: string, ticks: string | undefined, code: string | undefined, at: number) => {
    if (ticks !== undefined) return code ?? ''
    if (run.startsWith('`')) return ''

    const sides = [line[at - 1] ?? ' ', line[at + run.length] ?? ' ']

    return sides.every(side => WORD.test(side)) || sides.every(side => side.trim() === '') ? run : ''
  })

const quoted = (line: string, before: number, weight: number): Caveat[] =>
  unmarked(line.replace(LEAD, ''))
    .split(STOP)
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(warns)
    .map(sentence => [...sentence])
    .map(letters => ({ text: letters.length > MAX_TEXT ? `${letters.slice(0, MAX_TEXT).join('')}…` : letters.join(''), before, weight }))

const scanned = (page: Page, text: string, columns: number): Pick<Page, 'size' | 'weight' | 'read' | 'caveats'> => {
  const from = text.length > page.size && columns === page.columns ? page.read : START
  const lines = text.slice(from.at).split('\n')
  const caveats = page.caveats.filter(caveat => caveat.before < from.weight)
  let reached = from
  let { weight, isFenced } = from

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1
    if (isLast) reached = { at: reached.at, weight, isFenced }

    const rows = isLast && line === '' ? 0 : Math.max(1, Math.ceil(line.length / columns))
    if (line.trimStart().startsWith('```')) isFenced = !isFenced
    else if (!isFenced && !line.trimStart().startsWith('|')) caveats.push(...quoted(line, weight, rows))
    weight += rows
    if (!isLast) reached = { ...reached, at: reached.at + line.length + 1 }
  })

  return { size: text.length, weight, read: reached, caveats: caveats.slice(0, MAX_CAVEATS) }
}

const alike = (known: Page, made: Page): boolean =>
  JSON.stringify(known) === JSON.stringify({ ...made, on: made.on === null ? null : { ...made.on, at: known.on?.at } })

const kept = (pages: readonly Page[], id: string): Page[] => {
  if (pages.length <= MAX_PAGES) return [...pages]

  const spare = pages.find(page => !page.isGrown && page.id !== id) ?? pages.find(page => page.id !== id)

  return pages.filter(page => page !== spare)
}

const applied = (held: Book, report: Report, now: number): Book => {
  const known = held.pages.find(page => page.id === report.id)
  const page: Page = known ?? {
    id: report.id,
    turn: 0,
    isGrown: false,
    isDoubted: false,
    moved: now,
    columns: report.columns,
    of: 0,
    size: 0,
    weight: 0,
    read: START,
    on: null,
    ms: [],
    caveats: [],
  }
  const { on } = page
  const of = report.on?.of ?? page.of
  const isSame = report.text.length === page.size
  const isTurned = report.columns !== page.columns
  const isLaid = of !== page.of
  const earned = on === null || !isSame || isTurned || isLaid ? 0 : now - Math.max(on.at, page.moved + SETTLE_MS)
  const credited = on !== null && earned > 0 ? page.ms.map((ms, row) => (row >= on.first && row <= on.last ? Math.min(SHOWN_MS, ms + earned) : ms)) : page.ms
  const text = isSame ? {} : scanned(page, report.text, report.columns)
  const grown = isSame || known === undefined ? {} : { isGrown: true, turn: held.isBusy ? held.turn : page.turn }
  const isFresh = page.of === 0 || now - (isSame ? page.moved : now) <= SETTLE_MS
  const rows = Math.max(0, Math.min(of, MAX_ROWS))
  const made: Page = {
    ...page,
    ...text,
    ...grown,
    isDoubted: page.isDoubted || isTurned || (isLaid && !isFresh),
    moved: isSame && !isTurned && !isLaid ? page.moved : now,
    columns: report.columns,
    of,
    ms: [...credited.slice(0, rows), ...Array<number>(Math.max(0, rows - credited.length)).fill(0)],
    on: report.on === null ? null : { first: report.on.first, last: report.on.last, at: now },
  }
  const next = known !== undefined && alike(known, made) ? known : made
  if (next.isGrown) return next === known ? held : { ...held, pages: held.pages.map(other => (other === known ? next : other)) }
  if (next === known && held.pages.at(-1) === known) return held

  return { ...held, pages: kept([...held.pages.filter(other => other !== known), next], next.id) }
}

const counted = (held: Book): Page[] => held.pages.filter(page => page.isGrown && page.turn >= 1)

const judged = (held: Book): Found[] =>
  counted(held).flatMap(page =>
    page.caveats.map(caveat => {
      const isLaid = !page.isDoubted && page.of > 0 && page.weight > 0
      const first = isLaid ? Math.floor((caveat.before / page.weight) * page.of) : 0
      const last = isLaid ? Math.ceil(((caveat.before + caveat.weight) / page.weight) * page.of) : 0
      const slack = Math.max(3, Math.ceil(page.of / 10))
      const from = Math.max(0, first - slack)
      const to = Math.min(page.of - 1, last + slack)
      const isShown = (page.on !== null && from <= page.on.last && to >= page.on.first) || page.ms.slice(from, to + 1).some(ms => ms >= SHOWN_MS)

      return {
        id: page.id,
        turn: page.turn,
        place: isLaid ? Math.min(100, Math.round(((first + last) / 2 / page.of) * 100)) : 0,
        text: caveat.text,
        fate: !isLaid || to >= MAX_ROWS ? 'unknown' : isShown ? 'shown' : 'off',
      }
    }),
  )

const listed = (held: Book): string => {
  const found = judged(held)
  const off = found.filter(caveat => caveat.fate === 'off')
  const unknown = found.filter(caveat => caveat.fate === 'unknown').length
  const among = `found in ${replies(counted(held).length)}`

  return [
    off.length > 0
      ? `${plural(off.length, 'caveat')} off screen since Claude wrote them, of ${found.length} ${among}:`
      : `${unknown === 0 ? 'Nothing off screen' : 'Nothing to quote'}: ${plural(found.length, 'caveat')} ${among}.`,
    ...off.map(caveat => `t${caveat.turn}  ${caveat.place}% down  ${caveat.text}`),
    ...(unknown > 0 ? [`${unknown} ${UNJUDGED}`] : []),
    RULE,
  ].join('\n')
}

const seat = (node: RenderNode, seats: Readonly<Record<string, RenderElement>>): RenderNode => {
  if (typeof node !== 'object') return node
  const { props, children } = node as { props?: { key?: unknown }; children?: RenderNode[] }
  const seated = typeof props?.key === 'string' ? seats[props.key] : undefined
  if (seated !== undefined) return seated

  return children === undefined ? node : ({ ...node, children: children.map(child => seat(child, seats)) } as RenderElement)
}

const jump = async ($: EngineInterface, requestId: string): Promise<void> => {
  let deny: string | undefined
  try {
    deny = (await $.ui.scroll({ to: { requestId }, block: 'start' })).deny
  } catch (error) {
    deny = error instanceof Error ? error.message : String(error)
  }
  if (deny !== undefined) $.ui.toast(`Skimmed: the transcript did not move (${deny})`)
}

const show = async (
  $: EngineInterface,
  { Box, Text, Button }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
  isFullscreen: boolean | undefined,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['skimmed-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - CARD_FRAME
  const isWide = width >= WIDE_COLUMNS
  const held = await read($, book)
  const sentence = (text: string, isDim: boolean): RenderElement => (
    <Box key="said" flexDirection="column">
      {wrapped(text, inner, Infinity).map(line => (
        <Text dimColor={isDim} wrap="truncate-end">
          {line}
        </Text>
      ))}
    </Box>
  )
  const said = (text: string, note?: string): Promise<RenderElement> =>
    $.widgets.card({ beneath, width, title: 'Skimmed', ...(note !== undefined && isWide ? { note } : {}), body: sentence(text, note === undefined) })

  if (held.pages.length === 0 && isFullscreen === false) return said(BLIND)
  if (held.isBusy) return said(WORKING, 'watching')
  if (counted(held).length === 0) return said(EMPTY)

  const found = judged(held)
  const turned = found.filter(caveat => caveat.turn === held.turn)
  const last = turned.filter(caveat => caveat.fate === 'off')
  const unknown = turned.filter(caveat => caveat.fate === 'unknown').length
  const earlier = found.filter(caveat => caveat.turn !== held.turn && caveat.fate === 'off').length
  const aside = (key: string, text: string): RenderElement => (
    <Box key={key}>
      <Text dimColor wrap="truncate-end">
        {cut(text, inner)}
      </Text>
    </Box>
  )

  if (last.length === 0) {
    const isClear = turned.length > 0 && unknown === 0

    return $.widgets.card({
      beneath,
      width,
      title: 'Skimmed',
      ...(isWide && isClear ? { note: 'all shown' } : {}),
      body: (
        <Box flexDirection="column">
          {sentence(isClear ? RESTING : UNQUOTED, false)}
          {turned.length > 0 && aside('found', `${plural(turned.length, 'caveat')} found`)}
          {unknown > 0 && aside('unknown', `${unknown} not judged`)}
          {earlier > 0 && aside('earlier', isWide ? `${earlier} earlier in show` : `${earlier} earlier`)}
        </Box>
      ),
    })
  }

  const quotes = last.slice(0, MAX_QUOTES)
  const more = last.length - quotes.length
  const card = await $.widgets.card({
    beneath,
    width,
    title: 'Skimmed',
    note: isWide ? `${last.length} off screen` : String(last.length),
    body: (
      <Box flexDirection="column">
        {sentence(HEAD, false)}
        {quotes.map((caveat, at) => (
          <Box key={`quote:${at}`} flexDirection="column">
            {wrapped(`“${caveat.text}”`, inner, QUOTE_ROWS).map(line => (
              <Text wrap="truncate-end">{line}</Text>
            ))}
            <Box key={`seat:${at}`} />
          </Box>
        ))}
        {more > 0 && aside('more', isWide ? `… ${more} more in show` : `… ${more} more`)}
        {unknown > 0 && aside('unknown', `${unknown} not judged`)}
      </Box>
    ),
  })

  return seat(
    card,
    Object.fromEntries(
      quotes.map((caveat, at) => [
        `seat:${at}`,
        <Button plain key={`go:${at}`} label={isWide ? `▸ ${caveat.place}% down its reply` : `▸ ${caveat.place}% down`} onPress={() => jump($, caveat.id)} />,
      ]),
    ),
  ) as RenderElement
}

const flush = async ($: EngineInterface): Promise<void> => {
  timer = undefined
  const batch = queue.splice(0)
  try {
    if (batch.length === 0 || !(await read($, isOn))) return

    const now = await $.clock.now()
    const { value: seen = REST, version } = await $.state.get(spot)
    const made = batch.reduce((turned, report) => applied(turned, report, now), seen)
    if (made === seen || !(await read($, isOn))) return
    if ((await $.state.set(spot, made, { ifVersion: version })).isSet || !(await read($, isOn))) return

    await update($, book, turned => batch.reduce((again, report) => applied(again, report, now), turned ?? REST))
  } catch {
    // A batch that cannot be written is dropped: the next one is read on its own, and nothing is claimed from this one.
  }
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWaiting = queue.length > 0
  if (isWaiting === (timer !== undefined)) return

  timer?.cancel()
  timer = isWaiting ? $.clock.after(FLUSH_MS, () => void flush($)) : undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skimmed-widget',
      description: 'Toggle the Skimmed card, list the caveats that stayed off screen or clear them',
      argumentHint: '[on|off|show|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'skimmed-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (!VERBS.includes(arg)) return { text: USAGE }

    if (arg === 'show' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: 'Skimmed is off.' }
      if (arg === 'clear') {
        queue.length = 0
        await sync($)
        await update($, book, held => ({ ...(held ?? REST), pages: [] }))

        return { text: 'Skimmed cleared.' }
      }

      const held = await read($, book)
      if (held.pages.length === 0 && e.presentation.isFullscreen === false) return { text: BLIND }

      return { text: counted(held).length === 0 ? UNWATCHED : listed(held) }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) {
      queue.length = 0
      await update($, book, () => REST)
    }
    await sync($)

    return { text: isShown ? 'Skimmed on; /widgets places it.' : 'Skimmed off.' }
  })

  on('turn.start', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    await update($, book, held => ({ ...(held ?? REST), turn: (held ?? REST).turn + 1, isBusy: true }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined || !(await read($, isOn))) return next(e)

    await update($, book, held => ({ ...(held ?? REST), isBusy: false }))

    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const drawn = await next(e)
    try {
      if (e.props.onScreen !== undefined && (await read($, isOn))) {
        queue.push({ id: e.requestId, text: e.props.text, on: e.props.onScreen, columns: e.viewport?.columns || FALLBACK_COLUMNS })
        await sync($)
      }
    } catch {
      // Watching a reply must never cost the transcript the drawing the engine made of it.
    }

    return drawn
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns, e.viewport?.isFullscreen),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns, e.viewport?.isFullscreen),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80, e.viewport?.isFullscreen),
  )
}

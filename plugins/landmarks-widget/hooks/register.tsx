import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderNode, RenderSurface, ToolCallInput, ToolCallResult } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, folder, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>
type Trail = PluginState['landmarks-widget']['trail']
type Mark = Trail['marks'][number]

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const WIDE_COLUMNS = 30
const MAX_MARKS = 200
const MAX_ROWS = 8
const FOLDED_ROWS = 7
const MAX_LABEL = 48
const USAGE = 'Usage: /landmarks-widget [on|off|list|go <n>|clear]'
const VERBS = ['', 'on', 'off', 'list', 'clear']
const EMPTY = 'No landmarks yet. Prompts, first edits, red and green checks, commits and questions are listed here; press one to jump to it.'
const NEEDS = ['Jumping needs the fullscreen layout', 'Needs fullscreen'] as const
const HINTS = ['Press a line or go <n>', 'go <n> jumps'] as const
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const COMMIT = /\bgit\b(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+commit(?=\s|$)/
const SUBJECT = /^\[.+ [0-9a-f]{4,40}\] (.*)$/m
const WHOLE = /^0*([1-9]\d*)$/
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u
const REST: Trail = { marks: [], edited: [], mood: 'none', turn: 0, last: 0, waiting: 0, said: '' }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'landmarks-widget', key: 'isOn' } as const, false)
const spot = { plugin: 'landmarks-widget', key: 'trail' } as const
const trail = atom(spot, REST)

const cells = (text: string): number => [...text].reduce((sum, letter) => sum + (WIDE.test(letter) ? 2 : 1), 0)

const cut = (text: string, room: number): string => {
  if (cells(text) <= room) return text

  const letters = [...text]
  while (letters.length > 0 && cells(letters.join('')) > room - 1) letters.pop()

  return `${letters.join('')}…`
}

const labelled = (text: string): string => {
  const letters = [...text.replace(/\s+/g, ' ').trim()]

  return letters.length > MAX_LABEL ? `${letters.slice(0, MAX_LABEL - 1).join('')}…` : letters.join('')
}

const line = (mark: Mark): string => (mark.label === '' ? mark.kind : `${mark.kind}: ${mark.label}`)

const listed = (mark: Mark): string =>
  `${mark.id}  t${mark.turn}  ${line(mark)}${mark.isNear ? ' (near)' : ''}${mark.row === '' ? ' (no row)' : ''}${mark.isGone ? ' (gone)' : ''}`

const added = (held: Trail, kind: Mark['kind'], label: string, row: string): Trail => ({
  ...held,
  last: held.last + 1,
  marks: [...held.marks, { id: held.last + 1, turn: held.turn, kind, label: labelled(label), row, isNear: false, isGone: false }].slice(-MAX_MARKS),
})

const begun = (held: Trail, text: string): Trail => {
  const turned = { ...held, turn: held.turn + 1, waiting: 0 }
  const first = text.split('\n').find(part => part.trim() !== '')
  if (first === undefined) return turned

  return { ...added(turned, 'you', first, ''), waiting: turned.last + 1 }
}

const anchored = (held: Trail, row: string): Trail =>
  held.waiting === 0 || row === ''
    ? held
    : { ...held, waiting: 0, marks: held.marks.map(mark => (mark.id === held.waiting ? { ...mark, row, isNear: true } : mark)) }

const edited = (held: Trail, path: string, row: string): Trail => {
  const key = folder(path)
  if (held.edited.includes(key)) return held

  return { ...added(held, 'edit', path.split(/[\\/]/).pop() ?? '', row), edited: [...held.edited, key] }
}

const checked = (held: Trail, first: string, isFailed: boolean, row: string): Trail => {
  const mood = isFailed ? 'red' : 'green'
  if (isFailed === (held.mood === 'red')) return held.mood === mood ? held : { ...held, mood }

  return { ...added(held, mood, first, row), mood }
}

const shelled = (held: Trail, command: string, ran: ToolCallResult, row: string): Trail => {
  const first = command.split('\n')[0] ?? ''
  const isFailed = ran.isError === true
  const tried = CHECKS.test(first) ? checked(held, first, isFailed, row) : held
  if (isFailed || !COMMIT.test(first)) return tried

  const stdout = (ran.result as { stdout?: unknown } | undefined)?.stdout

  return added(tried, 'commit', typeof stdout === 'string' ? (SUBJECT.exec(stdout)?.[1] ?? '') : '', row)
}

const noted = (held: Trail, e: ToolCallInput, ran: ToolCallResult): Trail => {
  const row = e.tool_use_id ?? ''
  const based = anchored(held, row)
  if (e.tool === 'Edit' || e.tool === 'Write') return ran.isError === true ? based : edited(based, e.file_path, row)
  if (e.tool === 'Bash') return shelled(based, e.command, ran, row)
  if (e.tool === 'AskUserQuestion') return added(based, 'asked', e.questions[0]?.question ?? '', row)

  return based
}

const picked = (marks: readonly Mark[]): readonly Mark[] => {
  if (marks.length <= MAX_ROWS) return marks

  const others = marks.filter(mark => mark.kind !== 'you').slice(-FOLDED_ROWS)
  const prompts = others.length < FOLDED_ROWS ? marks.filter(mark => mark.kind === 'you').slice(others.length - FOLDED_ROWS) : []

  return [...others, ...prompts].sort((one, other) => one.id - other.id)
}

const seat = (node: RenderNode, seats: Readonly<Record<string, RenderElement>>): RenderNode => {
  if (typeof node !== 'object') return node
  const { props, children } = node as { props?: { key?: unknown }; children?: RenderNode[] }
  const seated = typeof props?.key === 'string' ? seats[props.key] : undefined
  if (seated !== undefined) return seated

  return children === undefined ? node : ({ ...node, children: children.map(child => seat(child, seats)) } as RenderElement)
}

const jump = async ($: EngineInterface, wanted: string, isFullscreen: boolean | undefined): Promise<string> => {
  const { marks } = await read($, trail)
  const mark = marks.find(held => held.id === Number(wanted))
  if (mark === undefined) return marks.length === 0 ? 'No landmarks yet.' : `No landmark ${wanted}. The list holds ${marks[0]?.id} to ${marks.at(-1)?.id}.`
  if (mark.row === '') return `Landmark ${mark.id} has no row: its turn made no tool call.`

  let deny: string | undefined
  try {
    deny = (await $.ui.scroll({ to: { requestId: mark.row }, block: 'start' })).deny
  } catch (error) {
    deny = error instanceof Error ? error.message : String(error)
  }

  const isLayout = deny !== undefined && isFullscreen === false
  const said =
    deny === undefined
      ? `At ${mark.id}: ${line(mark)}${mark.isNear ? ' (nearest row)' : ''}`
      : isLayout
        ? `Jumping needs the fullscreen layout (${deny}).`
        : `${mark.id} did not move: ${deny}`
  await update($, trail, held => ({
    ...(held ?? REST),
    said,
    marks: isLayout ? (held ?? REST).marks : (held ?? REST).marks.map(kept => (kept.id === mark.id ? { ...kept, isGone: deny !== undefined } : kept)),
  }))

  return said
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

  const width = fit((await $.state.get(widths)).value?.['landmarks-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - CARD_FRAME
  const isWide = width >= WIDE_COLUMNS
  const { marks, said } = await read($, trail)
  if (marks.length === 0) return $.widgets.card({ beneath, width, title: 'Landmarks', body: <Text dimColor>{EMPTY}</Text> })

  const shown = picked(marks)
  const folded = marks.length - shown.length
  const pad = String(shown.at(-1)?.id ?? 0).length
  const foot = isFullscreen === false ? NEEDS[isWide ? 0 : 1] : said === '' ? HINTS[isWide ? 0 : 1] : said

  const rows = shown.map(mark => {
    const fact = !isWide ? '' : mark.isGone ? 'gone' : mark.isNear ? 'near' : ''
    const label = cut(`${String(mark.id).padStart(pad)} ${isWide ? `t${mark.turn} ` : ''}${line(mark)}`, inner - (fact === '' ? 0 : fact.length + 1))

    return { mark, fact, label }
  })

  const card = await $.widgets.card({
    beneath,
    width,
    title: 'Landmarks',
    note: isWide ? plural(marks.length, 'landmark') : String(marks.length),
    body: (
      <Box flexDirection="column">
        {folded > 0 && (
          <Box key="more">
            <Text dimColor wrap="truncate-end">
              {cut(isWide ? `… ${folded} more in /landmarks-widget list` : `… ${folded} more`, inner)}
            </Text>
          </Box>
        )}
        {rows.map(({ mark, fact, label }) => (
          <Box key={`row:${mark.id}`} justifyContent="space-between">
            {mark.row === '' ? (
              <Text dimColor wrap="truncate-end">
                {label}
              </Text>
            ) : (
              <Box key={`seat:${mark.id}`} />
            )}
            {fact !== '' && <Text dimColor>{fact}</Text>}
          </Box>
        ))}
        <Box key="foot">
          <Text dimColor wrap="truncate-end">
            {cut(foot, inner)}
          </Text>
        </Box>
      </Box>
    ),
  })

  return seat(
    card,
    Object.fromEntries(
      rows.map(({ mark, label }) => [
        `seat:${mark.id}`,
        <Button plain key={`go:${mark.id}`} label={label} dimColor={mark.isGone} onPress={() => jump($, String(mark.id), isFullscreen)} />,
      ]),
    ),
  ) as RenderElement
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'landmarks-widget',
      description: 'Toggle the Landmarks card, list its landmarks or jump to one',
      argumentHint: '[on|off|list|go <n>|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'landmarks-widget' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = verb.toLowerCase()
    const wanted = arg === 'go' && rest.length === 1 ? (WHOLE.exec(rest[0] ?? '')?.[1] ?? '') : ''
    if (arg === 'go' ? wanted === '' : rest.length > 0 || !VERBS.includes(arg)) return { text: USAGE }

    if (arg === 'list' || arg === 'go' || arg === 'clear') {
      if (!(await read($, isOn))) return { text: 'Landmarks is off.' }
      if (arg === 'go') return { text: await jump($, wanted, e.presentation.isFullscreen) }
      if (arg === 'clear') {
        await update($, trail, held => ({ ...REST, turn: (held ?? REST).turn }))

        return { text: 'Landmarks cleared.' }
      }

      const { marks } = await read($, trail)

      return { text: marks.length === 0 ? 'No landmarks yet.' : marks.map(listed).join('\n') }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await update($, trail, () => REST)

    return { text: isShown ? 'Landmarks on; /widgets places it.' : 'Landmarks off.' }
  })

  on('turn.start', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    await update($, trail, held => begun(held ?? REST, e.text))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined || !(await read($, isOn))) return next(e)

    const ran = await next(e)
    try {
      if (ran.deny === undefined) {
        const { value: seen = REST, version } = await $.state.get(spot)
        const made = noted(seen, e, ran)
        if (made !== seen && !(await $.state.set(spot, made, { ifVersion: version })).isSet) await update($, trail, held => noted(held ?? REST, e, ran))
      }
    } catch {
      // A landmark that cannot be read from the call must not cost Claude the result it was given.
    }

    return ran
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

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PromptBox, Register, RenderElement, RenderNode, RenderSurface, UiPressArgument } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'> & Partial<Pick<Elements['terminal'], 'Button' | 'Input'>>
type Mark = { passage: string; remark: string; isCut: boolean }
type Marked = { refusal: string; number: number; isCut: boolean }
type Sent = { refusal: string; count: number }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LONG_COLUMNS = 36
const MAX_MARKS = 9
const MAX_ROWS = 4
const PASSAGE_LETTERS = 600
const REMARK_LETTERS = 200
const FIELD = 'margin-widget:field'
const BUTTONS = 'margin-widget:buttons'
const USAGE = 'Usage: /margin-widget [on|off|mark [remark]|drop <n>|send|clear]'
const OFF = 'Margin is off.'
const EMPTY = 'Select text in a reply with the mouse, then press Mark.'
const FULLSCREEN = 'Margin needs fullscreen: /tui fullscreen'
const TERMINAL = 'Margin works in the terminal only.'
const SENT = 'In the prompt box. Cleared when you submit.'
const NOTHING = 'Nothing selected.'
const ONE_REPLY = 'Select inside one reply.'
const ALREADY = 'Already marked.'
const FULL = 'Margin is full: send or drop.'
const NO_MARKS = 'No marks to send.'
const DIALOG = 'A dialog is open. Marks kept.'
const REFUSED = 'The prompt box took nothing. Marks kept.'
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'margin-widget', key: 'isOn' } as const, false)
const marks = atom({ plugin: 'margin-widget', key: 'marks' } as const, [] as Mark[])
const asking = atom({ plugin: 'margin-widget', key: 'asking' } as const, 0)
const isSent = atom({ plugin: 'margin-widget', key: 'isSent' } as const, false)
const said = atom({ plugin: 'margin-widget', key: 'said' } as const, '')

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim()

const cells = (letter: string): number => (WIDE.test(letter) ? 2 : 1)

const cut = (text: string, room: number): string => {
  const letters = [...text]
  if (letters.reduce((sum, letter) => sum + cells(letter), 0) <= room) return text

  let kept = ''
  let used = 0
  for (const letter of letters) {
    if (used + cells(letter) > room - 1) break
    kept += letter
    used += cells(letter)
  }

  return `${kept}…`
}

const wrapped = (sentence: string, columns: number): string[] =>
  sentence.split(' ').reduce<string[]>((rows, word) => {
    const held = rows.at(-1)

    return held !== undefined && held.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${held} ${word}`] : [...rows, word]
  }, [])

const quoted = (held: readonly Mark[]): string =>
  `${held
    .map(({ passage, remark }) =>
      [...passage.split('\n').map(line => (line.trim() === '' ? '>' : `> ${line}`)), ...(remark === '' ? [] : [remark])].join('\n'),
    )
    .join('\n\n')}\n`

const seat = (node: RenderNode, seats: Readonly<Record<string, RenderElement>>): RenderNode => {
  if (typeof node !== 'object') return node
  const { props, children } = node as { props?: { key?: unknown }; children?: RenderNode[] }
  const seated = typeof props?.key === 'string' ? seats[props.key] : undefined
  if (seated !== undefined) return seated

  return children === undefined ? node : ({ ...node, children: children.map(child => seat(child, seats)) } as RenderElement)
}

const wipe = async ($: EngineInterface): Promise<void> => {
  await update($, marks, () => [])
  await update($, asking, () => 0)
  await update($, isSent, () => false)
  await update($, said, () => '')
}

const selected = async ($: EngineInterface): Promise<{ text: string; requestId?: string } | undefined> => {
  try {
    const selection = await $.ui.selection()

    return typeof selection?.text === 'string' && selection.text.trim() !== '' ? selection : undefined
  } catch {
    return undefined
  }
}

const marking = async ($: EngineInterface, remark: string): Promise<Marked> => {
  const refused = (refusal: string): Marked => ({ refusal, number: 0, isCut: false })
  const selection = await selected($)
  if (selection === undefined) return refused(NOTHING)
  if (selection.requestId === undefined) return refused(ONE_REPLY)

  const letters = [...selection.text.replaceAll('\r', '').trim()]
  const isCut = letters.length > PASSAGE_LETTERS
  const passage = isCut ? `${letters.slice(0, PASSAGE_LETTERS).join('')}…` : letters.join('')
  const held = await read($, marks)
  if (held.some(mark => mark.passage === passage)) return refused(ALREADY)
  if (held.length >= MAX_MARKS) return refused(FULL)

  const number = (await update($, marks, before => [...(before ?? []), { passage, remark, isCut }])).length
  await update($, asking, () => (remark === '' ? number : 0))
  await update($, isSent, () => false)
  await update($, said, () => '')

  return { refusal: '', number, isCut }
}

const drafted = async ($: EngineInterface): Promise<string> => {
  try {
    const box: PromptBox | undefined = await $.prompt.read()

    return typeof box?.text === 'string' ? box.text : ''
  } catch {
    return ''
  }
}

const sending = async ($: EngineInterface): Promise<Sent> => {
  const held = await read($, marks)
  if (held.length === 0) return { refusal: NO_MARKS, count: 0 }

  const lead = (await drafted($)).trim() === '' ? '' : '\n\n'
  try {
    const filled = await $.prompt.fill({ text: `${lead}${quoted(held)}`, mode: 'append' })
    if (filled?.isFilled !== true) return { refusal: filled?.refusal === 'dialog' ? DIALOG : REFUSED, count: held.length }
  } catch {
    return { refusal: REFUSED, count: held.length }
  }
  await update($, isSent, () => true)
  await update($, said, () => '')

  return { refusal: '', count: held.length }
}

const pressMark = async ($: EngineInterface, press: UiPressArgument): Promise<void> => {
  const { refusal } = await marking($, '')
  if (refusal !== '') {
    await update($, said, () => refusal)

    return
  }
  if (press.component !== 'Pane' && press.component !== 'AbovePrompt') return

  try {
    await $.ui.focus({ requestId: press.requestId, key: 'remark' })
  } catch {
    return
  }
}

const pressSend = async ($: EngineInterface): Promise<void> => {
  const { refusal } = await sending($)
  if (refusal !== '') await update($, said, () => refusal)
}

const remarked = async ($: EngineInterface, value: string): Promise<void> => {
  const number = await read($, asking)
  if (number === 0) return

  const remark = [...tidy(value)].slice(0, REMARK_LETTERS).join('')
  await update($, marks, held => (held ?? []).map((mark, at) => (at === number - 1 ? { ...mark, remark } : mark)))
  await update($, asking, () => 0)
}

const show = async (
  $: EngineInterface,
  { Box, Text, Button, Input }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
  surface: RenderSurface,
  isFullscreen: boolean,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['margin-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - 4
  const sentences = (sentence: string): RenderElement[] => wrapped(sentence, inner).map(row => <Text dimColor wrap="truncate-end">{row}</Text>)

  if (surface !== 'terminal' || Button === undefined || Input === undefined || !isFullscreen) {
    return $.widgets.card({
      beneath,
      width,
      title: 'Margin',
      body: <Box flexDirection="column">{sentences(surface === 'terminal' ? FULLSCREEN : TERMINAL)}</Box>,
    })
  }

  const held = await read($, marks)
  const waiting = await read($, asking)
  const sent = await read($, isSent)
  const refusal = await read($, said)
  const earlier = Math.max(0, held.length - MAX_ROWS)

  const card = await $.widgets.card({
    beneath,
    width,
    title: 'Margin',
    note: held.length === 0 ? '' : sent ? 'sent' : inner >= LONG_COLUMNS ? plural(held.length, 'mark') : `${held.length}`,
    body: (
      <Box flexDirection="column">
        {held.length === 0 && sentences(EMPTY)}
        {earlier > 0 && (
          <Text key="earlier" dimColor wrap="truncate-end">
            {`${earlier} earlier`}
          </Text>
        )}
        {held.slice(earlier).flatMap(({ passage, remark }, at) => [
          <Text key={`mark-${earlier + at + 1}`} wrap="truncate-end">
            <Text dimColor>{earlier + at + 1}</Text> {cut(tidy(passage), inner - 2)}
          </Text>,
          ...(remark === ''
            ? []
            : [
                <Text key={`remark-${earlier + at + 1}`} wrap="truncate-end">
                  {`  ${cut(remark, inner - 2)}`}
                </Text>,
              ]),
        ])}
        {waiting !== 0 && <Box key={FIELD} />}
        {sent && sentences(SENT)}
        {refusal !== '' &&
          wrapped(refusal, inner).map(row => (
            <Text color="yellow" wrap="truncate-end">
              {row}
            </Text>
          ))}
        <Box key={BUTTONS} />
      </Box>
    ),
  })

  return seat(card, {
    [FIELD]: (
      <Input key="remark" placeholder={`remark on ${waiting}`} value="" submitLabel="save" autoFocus onSubmit={value => remarked($, value)} />
    ),
    [BUTTONS]: (
      <Box flexDirection="row" gap={2}>
        <Button key="mark" label="Mark" variant="primary" onPress={press => pressMark($, press)} />
        {held.length > 0 && <Button key="send" label="Send" onPress={() => pressSend($)} />}
      </Box>
    ),
  }) as RenderElement
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'margin-widget',
      description: "Toggle the Margin card, or mark, drop, send and clear passages of Claude's reply",
      argumentHint: '[on|off|mark [remark]|drop <n>|send|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'margin-widget' }, async ($, e) => {
    const typed = e.args.trim()
    const [word = ''] = typed.split(/\s+/)
    const verb = word.toLowerCase()
    const rest = typed.slice(word.length).trim()

    if (verb === 'mark' || verb === 'drop' || verb === 'send' || verb === 'clear') {
      if ((verb === 'drop' && !/^\d+$/.test(rest)) || ((verb === 'send' || verb === 'clear') && rest !== '')) return { text: USAGE }
      if (!(await read($, isOn))) return { text: OFF }

      if (verb === 'mark') {
        if (e.presentation?.isFullscreen !== true) return { text: FULLSCREEN }

        const { refusal, number, isCut } = await marking($, [...tidy(rest)].slice(0, REMARK_LETTERS).join(''))
        if (refusal !== '') return { text: refusal }

        return { text: isCut ? `Marked ${number}, cut to ${PASSAGE_LETTERS} characters.` : `Marked ${number}.` }
      }
      if (verb === 'drop') {
        const number = Number(rest)
        if (number < 1 || number > (await read($, marks)).length) return { text: `No mark ${number}.` }

        await update($, marks, held => (held ?? []).filter((_mark, at) => at !== number - 1))
        await update($, asking, () => 0)
        await update($, isSent, () => false)
        await update($, said, () => '')

        return { text: `Dropped ${number}.` }
      }
      if (verb === 'send') {
        const { refusal, count } = await sending($)

        return { text: refusal === '' ? `In the prompt box: ${plural(count, 'mark')}. Read it, then submit.` : refusal }
      }
      await wipe($)

      return { text: 'Margin cleared.' }
    }

    const arg = typed.toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await wipe($)

    return { text: isShown ? 'Margin on; /widgets places it.' : 'Margin off.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const isOwn = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (isOwn && (await read($, isOn)) && (await read($, isSent))) await wipe($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns, e.surface, e.viewport?.isFullscreen === true),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns, e.surface, e.viewport?.isFullscreen === true),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80, e.surface, e.viewport?.isFullscreen === true),
  )
}

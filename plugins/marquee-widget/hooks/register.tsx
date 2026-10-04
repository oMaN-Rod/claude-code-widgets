import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { MarqueeSign } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 90
const SIGN_ROWS = 8
const PITCH = 4
const MAX_ITEMS = 6
const JOIN = '  +  '
const PANEL = 0x1a1200
const LIT = 0xffb000
const HOT = 0xff5c33
const GLYPHS: Record<string, string> = {
  A: '.#.|#.#|###|#.#|#.#',
  B: '##.|#.#|##.|#.#|##.',
  C: '.##|#..|#..|#..|.##',
  D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###',
  F: '###|#..|##.|#..|#..',
  G: '.##|#..|#.#|#.#|.##',
  H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###',
  J: '..#|..#|..#|#.#|.#.',
  K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#',
  N: '##.|#.#|#.#|#.#|#.#',
  O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..',
  Q: '.#.|#.#|#.#|.#.|..#',
  R: '##.|#.#|##.|#.#|#.#',
  S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###',
  V: '#.#|#.#|#.#|#.#|.#.',
  W: '#.#|#.#|###|###|#.#',
  X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.',
  Z: '###|..#|.#.|#..|###',
  0: '###|#.#|#.#|#.#|###',
  1: '.#.|##.|.#.|.#.|###',
  2: '##.|..#|.#.|#..|###',
  3: '##.|..#|.#.|..#|##.',
  4: '#.#|#.#|###|..#|..#',
  5: '###|#..|##.|..#|##.',
  6: '.##|#..|###|#.#|###',
  7: '###|..#|.#.|.#.|.#.',
  8: '###|#.#|###|#.#|###',
  9: '###|#.#|###|..#|##.',
  '.': '...|...|...|...|.#.',
  ':': '...|.#.|...|.#.|...',
  '-': '...|...|###|...|...',
  '!': '.#.|.#.|.#.|...|.#.',
  '+': '...|.#.|###|.#.|...',
  '/': '..#|..#|.#.|#..|#..',
}
const BLANK: MarqueeSign = { items: ['CLAUDE CODE WIDGETS'], tick: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'marquee-widget', key: 'isOn' } as const, false)
const sign = atom({ plugin: 'marquee-widget', key: 'sign' } as const, BLANK)

let timer: Timer | undefined

const span = (ms: number): string => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}S` : `${Math.round(ms / 60_000)}M`)

const post = async ($: EngineInterface, text: string): Promise<void> => {
  await update($, sign, held => ({
    ...(held ?? BLANK),
    items: [...(held ?? BLANK).items, text.toUpperCase()].slice(-MAX_ITEMS),
  }))
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, sign, held => ({ ...(held ?? BLANK), tick: ((held ?? BLANK).tick + 1) % 1_000_000 }))
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['marquee-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, sign)
  const tape = held.items.flatMap((item, index) => [
    ...[...(index === 0 ? '' : JOIN)].map(letter => ({ letter, color: LIT })),
    ...[...item].map(letter => ({ letter, color: item.includes('FAILED') ? HOT : LIT })),
  ])
  const length = tape.length * PITCH
  const shift = (held.tick % (length + inner)) - inner
  const marks: WidgetsMark[] = []

  tape.forEach(({ letter, color }, index) => {
    const left = index * PITCH - shift
    if (left <= -PITCH || left >= inner) return
    ;(GLYPHS[letter] ?? '').split('|').forEach((row, y) => {
      ;[...row].forEach((dot, x) => {
        if (dot === '#') marks.push([left + x, y + 1, color])
      })
    })
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Marquee',
    note: `${held.items.length} ${held.items.length === 1 ? 'headline' : 'headlines'}`,
    body: await $.widgets.picture({ surface, key: 'marquee', columns: inner, rows: SIGN_ROWS, fill: PANEL, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'marquee-widget',
      description: 'Toggle the LED ticker that scrolls session events, or post your own headline',
      argumentHint: '[on|off|clear|<text>]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'marquee-widget' }, async ($, e) => {
    const arg = e.args.trim()
    const word = arg.toLowerCase()

    if (word === 'clear') {
      await update($, sign, held => ({ ...BLANK, tick: (held ?? BLANK).tick }))

      return { text: 'Marquee cleared.' }
    }
    if (word !== '' && word !== 'on' && word !== 'off') {
      await post($, arg.slice(0, 60))
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await sync($)

      return { text: 'Headline posted.' }
    }

    const isShown = await update($, isOn, shown => (word === '' ? !(shown ?? false) : word === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Marquee on; /widgets places it.' : 'Marquee off.' }
  })

  on('turn.start', async ($, e, next) => {
    if (await read($, isOn)) await post($, 'Turn started')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isOn))) await post($, `Turn done ${span(e.durationMs)}`)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const startedAt = await $.clock.now()
    const ran = await next(e)
    const isFailed = ran.isError === true || ran.deny !== undefined
    await post($, `${e.tool} ${isFailed ? 'failed' : `ok ${span((await $.clock.now()) - startedAt)}`}`)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, e.surface, await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, e.surface, await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, e.surface, await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

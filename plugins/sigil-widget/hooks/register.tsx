import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { SigilEntry, SigilSession } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const SIDE = 8
const SCALE = 2
const SIGIL_ROWS = SIDE * SCALE
const MAX_GALLERY = 12
const NEW: SigilSession = { id: 0, tools: '', fails: 0, turns: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'sigil-widget', key: 'isOn' } as const, false)
const session = atom({ plugin: 'sigil-widget', key: 'session' } as const, NEW)
const gallery = atom({ plugin: 'sigil-widget', key: 'gallery' } as const, [])

const hash = (text: string): number => {
  let sum = 2_166_136_261
  for (const letter of text) sum = Math.imul(sum ^ letter.charCodeAt(0), 16_777_619) >>> 0

  return sum
}

const isGallery = (value: unknown): value is SigilEntry[] =>
  Array.isArray(value) &&
  value.every(entry => typeof entry === 'object' && entry !== null && typeof (entry as SigilEntry).seed === 'number')

const seedOf = (held: SigilSession): number => hash(`${held.tools}|${held.fails}|${held.turns}`)

const tint = (hue: number, light: number): number => {
  const channel = (shift: number): number => {
    const wave = Math.cos(((hue + shift) / 360) * Math.PI * 2) * 0.5 + 0.5

    return Math.round(Math.min(255, (60 + wave * 195) * light))
  }

  return (channel(0) << 16) | (channel(120) << 8) | channel(240)
}

const stamp = (marks: WidgetsMark[], seed: number, left: number, top: number, scale: number): void => {
  const main = tint(seed % 360, 1)
  const accent = tint((seed >> 9) % 360, 0.75)
  let state = seed === 0 ? 1 : seed

  for (let y = 0; y < SIDE; y += 1) {
    for (let x = 0; x < SIDE / 2; x += 1) {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0
      const roll = (state >>> 16) % 10
      if (roll < 4) continue
      const color = roll < 8 ? main : accent
      for (const column of [x, SIDE - 1 - x]) {
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) marks.push([left + column * scale + dx, top + y * scale + dy, color])
        }
      }
    }
  }
}

const keep = async ($: EngineInterface): Promise<void> => {
  const held = await read($, session)
  if (held.id === 0 || held.tools === '') return

  const entry = { id: held.id, seed: seedOf(held), calls: held.tools.length }
  const kept = await update($, gallery, before =>
    [...(before ?? []).filter(one => one.id !== held.id), entry].slice(-MAX_GALLERY),
  )
  await $.store.set('gallery', kept)
}

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['sigil-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, session)
  const past = (await read($, gallery)).filter(entry => entry.id !== held.id)
  const perRow = Math.max(1, Math.floor((inner - SIGIL_ROWS - 3) / (SIDE + 1)))
  const marks: WidgetsMark[] = []

  stamp(marks, seedOf(held), 0, 0, SCALE)
  past.slice(-perRow * 2).forEach((entry, index) => {
    stamp(marks, entry.seed, SIGIL_ROWS + 3 + (index % perRow) * (SIDE + 1), Math.floor(index / perRow) * SIDE, 1)
  })
  const picture = await $.widgets.picture({ surface, key: 'sigil', columns: inner, rows: SIGIL_ROWS, marks })

  return $.widgets.card({
    beneath,
    width,
    title: 'Sigil',
    note: `${past.length} kept`,
    body: (
      <Box flexDirection="column">
        {picture}
        <Text dimColor wrap="truncate-end">
          this session: {held.tools.length} calls · {held.turns} turns · {held.fails} failures
        </Text>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sigil-widget',
      description: 'Toggle the emblem generated from this session, beside the ones kept from earlier sessions',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('gallery')
    if (isGallery(kept)) await update($, gallery, () => kept)
    const now = await $.clock.now()
    await update($, session, held => ((held ?? NEW).id === 0 ? { ...NEW, id: now } : (held ?? NEW)))

    return next(e)
  })

  on('command.run', { command: 'sigil-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, gallery, () => [])
      await $.store.set('gallery', [])

      return { text: 'Gallery cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /sigil-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    const now = await $.clock.now()
    await update($, session, held => ((held ?? NEW).id === 0 ? { ...NEW, id: now } : (held ?? NEW)))

    return { text: isShown ? 'Sigil on; /widgets places it.' : 'Sigil off.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    await update($, session, held => ({
      ...(held ?? NEW),
      tools: `${(held ?? NEW).tools}${e.tool[0] ?? '?'}`.slice(-2000),
      fails: (held ?? NEW).fails + (ran.isError === true ? 1 : 0),
    }))

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, session, held => ({ ...(held ?? NEW), turns: (held ?? NEW).turns + 1 }))
      await keep($)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, e.surface, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, e.surface, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, e.surface, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

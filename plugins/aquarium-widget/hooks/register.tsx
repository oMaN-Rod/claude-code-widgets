import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { Swimmer } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 400
const DEMO_MS = 30_000
const TANK_ROWS = 12
const WATER = 0x0b3a5b
const SURFACE = 0x1f6fa5
const SAND = 0xc2a66b
const WEED = 0x2ea043
const BUBBLE = 0x9fd3f5
const SMALL = ['t..bbbb.', 'ttbbbbpb', 't..bbbb.']
const LARGE = [
  't....bbbbbb...',
  'tt.bbbbbbbbbb.',
  'tttbbbbbbbpbbb',
  'tt.bbhhhhhbbb.',
  't....bbbbbb...',
]
const PEBBLE = 0x9c8455
const WEED_DARK = 0x1f7a33
const EYE = 0x1f2328
const COLORS = {
  resident: { b: 0xd97757, t: 0x9a5b45, h: 0xf0a58c, p: EYE },
  tool: { b: 0xf2cc60, t: 0xd29922, h: 0xfff1b8, p: EYE },
  agent: { b: 0xd670d6, t: 0x8e44ad, h: 0xf5b8f5, p: EYE },
} as const
const RESIDENT = { id: 'resident', kind: 'resident' } as const
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'aquarium-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'aquarium-widget', key: 'tick' } as const, 0)
const swimmers = atom({ plugin: 'aquarium-widget', key: 'swimmers' } as const, [])

let timer: Timer | undefined

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, tick, count => ((count ?? 0) + 1) % 1_000_000)
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const hash = (text: string): number => {
  let sum = 7
  for (const letter of text) sum = (sum * 31 + letter.charCodeAt(0)) % 100_003

  return sum
}

const drawCard = async (
  $: EngineInterface,
  surface: RenderSurface,
  beneath: RenderElement,
  width: number,
): Promise<RenderElement> => {
  const beat = await read($, tick)
  const now = await $.clock.now()
  const swimming = (await read($, swimmers)).filter(one => one.until === undefined || one.until > now)
  const inner = (width - 4) * 2
  const marks: WidgetsMark[] = []

  for (let x = 0; x < inner; x += 1) {
    marks.push([x, 0, SURFACE])
    marks.push([x, TANK_ROWS - 1, x % 5 === 0 ? PEBBLE : SAND])
  }
  for (const [x, height] of [[8, 5], [12, 3], [inner - 14, 4]] as const) {
    for (let y = 0; y < height; y += 1) {
      const sway = (beat + y) % 4 === 0 ? 1 : 0
      marks.push([x + sway, TANK_ROWS - 2 - y, WEED])
      marks.push([x + sway + 1, TANK_ROWS - 2 - y, WEED_DARK])
    }
  }
  for (const [x, offset] of [[18, 0], [inner - 24, 4], [Math.floor(inner / 2), 7]] as const) {
    marks.push([x, TANK_ROWS - 2 - ((beat + offset) % (TANK_ROWS - 2)), BUBBLE])
  }

  for (const fish of [RESIDENT, ...swimming]) {
    const seed = hash(fish.id)
    const sprite = fish.kind === 'agent' ? LARGE : SMALL
    const length = sprite[0]?.length ?? 8
    const lane = 1 + (seed % (TANK_ROWS - 2 - sprite.length))
    const span = inner + length * 2
    const travelled = (seed + beat * 2) % span
    const isLeftward = seed % 2 === 1
    const left = isLeftward ? inner + length - travelled : travelled - length

    marks.push({ lines: sprite, palette: COLORS[fish.kind], left, top: lane, isMirrored: isLeftward })
  }

  const agents = swimming.filter(one => one.kind === 'agent').length
  const tools = swimming.length - agents

  return $.widgets.card({
    beneath,
    width,
    title: 'Aquarium',
    note: swimming.length === 0 ? 'all quiet' : `${some(agents, 'agent')} · ${some(tools, 'tool')} running`,
    body: await $.widgets.picture({
      surface,
      key: 'aquarium',
      columns: inner,
      rows: TANK_ROWS,
      fill: WATER,
      marks,
    }),
  })
}

const wide = async ($: EngineInterface): Promise<number> =>
  (await $.state.get(widths)).value?.['aquarium-widget'] ?? CARD_COLUMNS

const show = async (
  $: EngineInterface,
  surface: RenderSurface,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  return drawCard($, surface, beneath, Math.min(await wide($), Math.max(20, columns)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'aquarium-widget',
      description: 'Toggle the aquarium: a fish for every running tool call and agent',
      argumentHint: '[on|off|demo]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await update($, swimmers, () => [])
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'aquarium-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'demo') {
      const until = (await $.clock.now()) + DEMO_MS
      const school: Swimmer[] = [
        { id: 'demo-agent-1', kind: 'agent', until },
        { id: 'demo-agent-2', kind: 'agent', until },
        { id: 'demo-tool-1', kind: 'tool', until },
        { id: 'demo-tool-2', kind: 'tool', until },
        { id: 'demo-tool-3', kind: 'tool', until },
      ]
      await update($, swimmers, held => [
        ...(held ?? []).filter(one => !one.id.startsWith('demo-')),
        ...school,
      ])
    } else if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /aquarium-widget [on|off|demo]' }
    }

    const isShown = await update($, isOn, shown =>
      arg === '' ? !(shown ?? false) : arg !== 'off',
    )
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Aquarium on; /widgets places it.' : 'Aquarium off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const id = String(e.tool_use_id)
    const kind = /^(Agent|Task|Workflow)$/.test(String(e.tool)) ? 'agent' : 'tool'
    await update($, swimmers, held => [...(held ?? []), { id, kind } as const].slice(-24))
    try {
      return await next(e)
    } finally {
      await update($, swimmers, held => (held ?? []).filter(one => one.id !== id))
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, e.surface, await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, e.surface, await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, e.surface, await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

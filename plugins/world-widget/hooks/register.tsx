import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { WorldScene } from '../types'

type Phase = 'night' | 'dawn' | 'day' | 'dusk'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const TICK_MS = 300
const WORLD_ROWS = 24
const STREET = WORLD_ROWS - 7
const TRACK = WORLD_ROWS - 4
const MAX_TOWERS = 40
const MAX_FLOORS = 9
const TOWER = 5
const MAX_WAGONS = 8
const SKIES: Record<Phase, number> = { night: 0x0b1026, dawn: 0x5c4d8a, day: 0x4dabf7, dusk: 0xd9662e }
const TOWERS: Record<Phase, number> = { night: 0x1f2937, dawn: 0x3b3760, day: 0x5b6b7c, dusk: 0x5a3324 }
const SUN = ['.yy.', 'yhhy', 'yhhy', '.yy.']
const MOON = ['.mm.', 'mm..', 'mm..', '.mm.']
const CLOUD = ['..ccc...', '.cccccc.', 'cccccccc', '.gggggg.']
const LOCO = ['.cc..k.', 'rrrrrrr', '.o..o..']
const WAGON = ['wwwww.', '.o.o..']
const CRAB = [
  ['o.....o', '.ooooo.', 'ooeoeoo', '.o.o.o.'],
  ['.o...o.', '.ooooo.', 'ooeoeoo', 'o..o..o'],
] as const
const EMPTY: WorldScene = { tick: 0, percent: 0, towers: [], calls: 0, isWorking: false }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'world-widget', key: 'isOn' } as const, false)
const scene = atom({ plugin: 'world-widget', key: 'scene' } as const, EMPTY)

let timer: Timer | undefined

const phaseAt = (hour: number): Phase => (hour < 5 || hour >= 21 ? 'night' : hour < 7 ? 'dawn' : hour < 18 ? 'day' : 'dusk')

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(TICK_MS, () => {
      void update($, scene, held => ({ ...(held ?? EMPTY), tick: ((held ?? EMPTY).tick + 1) % 1_000_000 }))
    })
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const draw = (held: WorldScene, inner: number, hour: number): WidgetsMark[] => {
  const phase = phaseAt(hour)
  const isSunUp = hour >= 6 && hour < 18
  const along = isSunUp ? (hour - 6) / 12 : ((hour + 6) % 24) / 12
  const isRainy = held.percent >= 75
  const clouds = held.percent >= 75 ? 4 : held.percent >= 50 ? 3 : held.percent >= 25 ? 1 : 0
  const cloud = held.percent >= 90 ? { c: 0x484f58, g: 0x30363d } : isRainy ? { c: 0x8b949e, g: 0x6e7681 } : { c: 0xe6edf3, g: 0xafb8c1 }
  const marks: WidgetsMark[] = []

  if (phase === 'night') {
    for (let star = 0; star < 16; star += 1) marks.push([(star * 37 + 5) % inner, (star * 5 + 1) % 9, 0xe6edf3])
  }
  marks.push({
    lines: isSunUp ? SUN : MOON,
    palette: isSunUp ? { y: 0xf2cc60, h: 0xfff1b8 } : { m: 0xe6edf3 },
    left: Math.round(along * (inner - 4)),
    top: Math.round(8 - Math.sin(along * Math.PI) * 8),
  })
  for (let index = 0; index < clouds; index += 1) {
    const span = inner + 16
    marks.push({
      lines: CLOUD,
      palette: cloud,
      left: ((Math.floor(held.tick / 2) + index * Math.floor(span / clouds)) % span) - 8,
      top: 1 + (index % 2) * 2,
    })
  }

  const room = Math.floor(inner / (TOWER + 1))
  held.towers.slice(-room).forEach((floors, index) => {
    const left = index * (TOWER + 1)
    for (let floor = 0; floor < floors; floor += 1) {
      for (let x = 0; x < TOWER; x += 1) {
        const isWindow = x % 2 === 1 && floor % 2 === 0
        const lit = phase === 'night' || phase === 'dusk' ? 0xffd43b : 0xc9d1d9
        marks.push([left + x, STREET - floor, isWindow ? lit : TOWERS[phase]])
      }
    }
  })

  if (isRainy) {
    for (let x = 2; x < inner; x += 5) marks.push([x, 6 + ((held.tick + x) % (STREET - 7)), 0x58a6ff])
  }
  for (let x = 0; x < inner; x += 1) {
    marks.push([x, STREET + 1, 0x30363d], [x, TRACK, (x + held.tick) % 4 === 0 ? 0x8a5a2b : 0x6e7681])
    marks.push([x, TRACK + 1, 0x2f6f3a], [x, TRACK + 2, 0x2f6f3a], [x, TRACK + 3, 0x245c30])
  }

  const wagons = Math.min(MAX_WAGONS, held.calls)
  const length = LOCO[0]?.length ?? 7
  const head = ((held.tick * 2) % (inner + length + wagons * 6)) - length
  marks.push({ lines: LOCO, palette: { c: 0xd97757, k: 0x30363d, r: 0xc2452d, o: 0x1f2328 }, left: head, top: TRACK - 3 })
  for (let wagon = 0; wagon < wagons; wagon += 1) {
    marks.push({ lines: WAGON, palette: { w: 0xf0883e, o: 0x1f2328 }, left: head - (wagon + 1) * 6, top: TRACK - 2 })
  }

  const stride = inner - 12
  const walked = Math.floor(held.tick / 2) % (stride * 2)
  marks.push({
    lines: CRAB[held.isWorking ? held.tick % 2 : Math.floor(held.tick / 3) % 2] ?? CRAB[0],
    palette: { o: 0xd97757, e: 0x1f2328 },
    left: held.isWorking ? Math.floor(inner / 2) - 3 : 2 + (walked < stride ? walked : stride * 2 - walked),
    top: TRACK + 0,
  })

  return marks
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

  const wanted = (await $.state.get(widths)).value?.['world-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, scene)
  const clock = new Date(await $.clock.now())
  const hour = clock.getHours() + clock.getMinutes() / 60

  return $.widgets.card({
    beneath,
    width,
    title: 'World',
    note: `${held.towers.length} towers · context ${Math.round(held.percent)}%`,
    body: await $.widgets.picture({
      surface,
      key: 'world',
      columns: inner,
      rows: WORLD_ROWS,
      fill: SKIES[phaseAt(hour)],
      marks: draw(held, inner, hour),
    }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'world-widget',
      description: 'Toggle the diorama: sky, weather, skyline, train and crab in one scene',
      argumentHint: '[on|off|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'world-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'clear') {
      await update($, scene, held => ({ ...(held ?? EMPTY), towers: [], calls: 0 }))

      return { text: 'World cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /world-widget [on|off|clear]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) {
      const { context } = await $.session.usage()
      await update($, scene, held => ({ ...(held ?? EMPTY), percent: context.percent ?? (held ?? EMPTY).percent }))
    }
    await sync($)

    return { text: isShown ? 'World on; /widgets places it.' : 'World off.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, scene, held => ({ ...(held ?? EMPTY), calls: 0, isWorking: true }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, scene, held => {
        const before = held ?? EMPTY

        return {
          ...before,
          isWorking: false,
          towers: [...before.towers, Math.min(MAX_FLOORS, 1 + before.calls)].slice(-MAX_TOWERS),
        }
      })
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isOn)) await update($, scene, held => ({ ...(held ?? EMPTY), calls: (held ?? EMPTY).calls + 1 }))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const percent = e.context.percent
    if (percent !== undefined) await update($, scene, held => ({ ...(held ?? EMPTY), percent }))

    return next(e)
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

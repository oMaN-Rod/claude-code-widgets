import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import { CARD_COLUMNS, canvas, dot, frame, paint, picture, shade, stack, tagsOf } from './kit'
import type { Place, Tags } from './kit'

const PANE = 'widgets'
const MAX_TURNS = 60
const SKY_ROWS = 12
const MAX_FLOORS = 10
const BUILDING = 6
const FACE = 4
const GAP = 2
const CRESCENT = ['.mmm..', 'mm....', '.mmm..']
const GROUND = 0x444c56
const STAR = 0x6e7681
const MOON = 0xf0e68c
const FLOORS: Record<string, number> = {
  r: 0x4ea1f3,
  e: 0x3fb950,
  s: 0xe3b341,
  a: 0xc678dd,
  w: 0x56b6c2,
  o: 0x8b949e,
  x: 0xe5484d,
}
const LEGEND = [
  ['r', 'read'],
  ['e', 'edit'],
  ['s', 'shell'],
  ['a', 'agent'],
  ['w', 'web'],
] as const
const STARS = [
  [3, 1],
  [10, 4],
  [17, 0],
  [24, 3],
  [31, 1],
  [38, 5],
  [45, 2],
  [52, 0],
  [58, 4],
] as const
const SAMPLE = ['rrre', 'rses', 'rrrrees', 'aar', 'ssx', 'rreess', 'wwr', 'rrrreeeess', 'es']
const site = { plugin: 'widgets', key: 'site' } as const
const isOn = atom({ plugin: 'skyline-widget', key: 'isOn' } as const, false)
const turns = atom({ plugin: 'skyline-widget', key: 'turns' } as const, [])

const kindOf = (tool: string): string => {
  if (/^(Read|Glob|Grep|LS|NotebookRead|ToolSearch)$/.test(tool)) return 'r'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'e'
  if (/^(Bash|PowerShell|BashOutput)$/.test(tool)) return 's'
  if (/^(Agent|Task|Workflow|SendMessage)$/.test(tool)) return 'a'
  if (/^(Web|mcp__)/.test(tool)) return 'w'

  return 'o'
}

const sample = (floors: string): string => {
  if (floors.length <= MAX_FLOORS) return floors

  return Array.from(
    { length: MAX_FLOORS },
    (_, floor) => floors[Math.floor((floor * floors.length) / MAX_FLOORS)] ?? 'o',
  ).join('')
}

const drawCard = async ($: EngineInterface, tags: Tags, width: number): Promise<RenderElement> => {
  const { Box, Text } = tags
  const built = await read($, turns)
  const inner = (width - 4) * 2
  const pixels = canvas(inner, SKY_ROWS)
  const room = Math.floor((inner + GAP) / (BUILDING + GAP))
  const shown = built.slice(-room)

  for (const [x, y] of STARS) dot(pixels, x, y, STAR)
  paint(pixels, CRESCENT, { m: MOON }, inner - 8, 0)
  for (let x = 0; x < inner; x += 1) dot(pixels, x, SKY_ROWS - 1, GROUND)

  shown.forEach((floors, index) => {
    const left = index * (BUILDING + GAP)
    const levels = floors === '' ? 'o' : sample(floors)
    ;[...levels].forEach((kind, floor) => {
      const color = FLOORS[kind] ?? 0x8b949e
      for (let x = 0; x < BUILDING; x += 1) {
        dot(pixels, left + x, SKY_ROWS - 2 - floor, x < FACE ? color : shade(color, 0.55))
      }
    })
  })

  const calls = built.reduce((sum, floors) => sum + floors.length, 0)

  return frame(
    tags,
    width,
    'Skyline',
    `${built.length} turns · ${calls} tool calls`,
    <Box flexDirection="column">
      {picture(tags, 'skyline', pixels)}
      <Text wrap="truncate-end">
        {LEGEND.map(([kind, label], index) => (
          <Text>
            {index > 0 ? ' ' : ''}
            <Text color={`#${(FLOORS[kind] ?? 0).toString(16).padStart(6, '0')}`}>■</Text> {label}
          </Text>
        ))}
      </Text>
    </Box>,
  )
}

const show = async (
  $: EngineInterface,
  tags: Tags,
  beneath: RenderElement,
  place: Place,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  return stack(tags, beneath, await drawCard($, tags, Math.min(CARD_COLUMNS, Math.max(20, columns))))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skyline-widget',
      description: 'Toggle the skyline: one building per turn, one floor per tool call',
      argumentHint: '[on|off|demo|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'skyline-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'demo' || arg === 'clear') {
      await update($, turns, () => (arg === 'demo' ? SAMPLE : []))
      if (arg === 'clear') return { text: 'Skyline cleared.' }
    } else if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /skyline-widget [on|off|demo|clear]' }
    }

    const isShown = await update($, isOn, shown =>
      arg === '' ? !(shown ?? false) : arg !== 'off',
    )
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Skyline on; /widgets places it.' : 'Skyline off.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, turns, built => [...(built ?? []), ''].slice(-MAX_TURNS))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const kind = ran.isError === true ? 'x' : kindOf(String(e.tool))
    await update($, turns, built => {
      const all = built ?? []
      const current = all[all.length - 1] ?? ''

      return [...all.slice(0, -1), current + kind]
    })

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, tagsOf($.ui.resolve(e)), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, tagsOf($.ui.resolve(e)), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, tagsOf($.ui.resolve(e)), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { BossFight } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const BAR_CELLS = 14
const DROP = 20
const DOWN_MS = 8000
const BOSS = [
  '..h........h..',
  '.hhh......hhh.',
  '.bbbbbbbbbbbb.',
  'bbbbbbbbbbbbbb',
  'bbweebbbbweebb',
  'bbbbbbbbbbbbbb',
  'bbbmmmmmmmmbbb',
  'bbbbbbbbbbbbbb',
  '.bb.bb..bb.bb.',
  '.bb.bb..bb.bb.',
]
const FRESH: BossFight = { percent: 0, level: 1, downUntil: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'boss-widget', key: 'isOn' } as const, false)
const fight = atom({ plugin: 'boss-widget', key: 'fight' } as const, FRESH)

const moodOf = (health: number): string =>
  health > 75 ? 'unbothered' : health > 50 ? 'bruised' : health > 25 ? 'staggering' : 'one hit left'

const strike = async ($: EngineInterface, percent: number): Promise<void> => {
  const now = await $.clock.now()
  const before = await read($, fight)
  const isDown = percent < before.percent - DROP

  await update($, fight, held => ({
    percent,
    level: (held ?? FRESH).level + (isDown ? 1 : 0),
    downUntil: isDown ? now + DOWN_MS : (held ?? FRESH).downUntil,
  }))
  if (isDown) {
    $.ui.toast(`The Context Window is down. Level ${before.level + 1} begins.`)
    $.clock.after(DOWN_MS, () => {
      void update($, fight, held => ({ ...(held ?? FRESH), downUntil: 0 }))
    })
  }
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

  const wanted = (await $.state.get(widths)).value?.['boss-widget'] ?? CARD_COLUMNS
  const held = await read($, fight)
  const isDown = (await $.clock.now()) < held.downUntil
  const health = isDown ? 0 : Math.max(0, Math.round(100 - held.percent))
  const filled = Math.round((health / 100) * BAR_CELLS)
  const hide = isDown ? 0x6e7681 : health > 50 ? 0x8250df : health > 25 ? 0xbf5af2 : 0xe5484d
  const picture = await $.widgets.picture({
    surface,
    key: 'boss',
    columns: 14,
    rows: 10,
    marks: [
      {
        lines: BOSS,
        palette: {
          b: hide,
          h: 0xffd43b,
          w: isDown ? hide : 0xffffff,
          e: isDown ? 0x1f2328 : health > 25 ? 0x1f2328 : 0xffd43b,
          m: 0x1f2328,
        },
        left: 0,
        top: 0,
      },
    ],
  })

  return $.widgets.card({
    beneath,
    width: Math.min(wanted, Math.max(20, columns)),
    title: `Boss Lv ${held.level}`,
    note: 'The Context Window',
    body: (
      <Box columnGap={2}>
        {picture}
        <Box flexDirection="column" justifyContent="center">
          <Text>
            <Text color="red">{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(BAR_CELLS - filled)}</Text>
          </Text>
          <Text>HP {health}%</Text>
          <Text dimColor>{isDown ? 'defeated!' : moodOf(health)}</Text>
        </Box>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'boss-widget',
      description: 'Toggle the boss fight: context usage wears the boss down',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)

    return next(e)
  })

  on('command.run', { command: 'boss-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /boss-widget [on|off]' }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) {
      const { context } = await $.session.usage({ breakdown: 'summary' })
      const percent = context.percent ?? context.breakdown?.percentage
      await update($, fight, held => ({ ...(held ?? FRESH), percent: percent ?? (held ?? FRESH).percent }))
    }

    return { text: isShown ? 'Boss on; /widgets places it.' : 'Boss off.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.context.percent !== undefined && (await read($, isOn))) await strike($, e.context.percent)

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

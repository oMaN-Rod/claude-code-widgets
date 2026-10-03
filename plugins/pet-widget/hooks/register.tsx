import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'

import type { PetMood, PetStatus } from '../types'
import { CARD_COLUMNS, canvas, frame, paint, picture, shade, stack, tagsOf } from './kit'
import type { Place, Tags } from './kit'

const PANE = 'widgets'
const TICK_MS = 600
const FLASH_MS = 6000
const SLEEPY_MS = 90_000
const HOT_PERCENT = 80
const MOODS: readonly string[] = ['sleep', 'idle', 'work', 'happy', 'dizzy', 'hot']
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|build|check)\b/
const RESTING: PetStatus = { isWorking: false, isHot: false, activeAt: 0, calls: 0, forced: null }
const CLAWS = [
  [
    '..oooo................oooo..',
    '.oo..oo..............oo..oo.',
  ],
  [
    '..oooo................oooo..',
    '.oooooo..............oooooo.',
  ],
] as const
const BODY = [
  '.oooooo...ee....ee...oooooo.',
  '..dooo....ep....pe....oood..',
  '...doo....oo....oo....ood...',
  '....dooolllllllllllloood....',
  '.....oooooooooooooooooo.....',
  '.....oooooommmmmmoooooo.....',
  '.....dooooooooooooooood.....',
  '......dddddddddddddddd......',
]
const LEGS = [
  [
    '....oo..oo........oo..oo....',
    '...oo..oo..........oo..oo...',
  ],
  [
    '.....oo.oo........oo.oo.....',
    '....oo..oo........oo..oo....',
  ],
] as const
const SAYS: Record<PetMood, string> = {
  sleep: 'zzz',
  idle: 'waiting for you',
  work: 'working…',
  happy: 'checks passed!',
  dizzy: 'ouch',
  hot: 'context is filling up',
}
const site = { plugin: 'widgets', key: 'site' } as const
const isOn = atom({ plugin: 'pet-widget', key: 'isOn' } as const, false)
const tick = atom({ plugin: 'pet-widget', key: 'tick' } as const, 0)
const status = atom({ plugin: 'pet-widget', key: 'status' } as const, RESTING)

let timer: Timer | undefined

const isMood = (value: string): value is PetMood => MOODS.includes(value)

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

const moodAt = (held: PetStatus, now: number): PetMood => {
  if (held.forced !== null && now < held.forced.until) return held.forced.mood
  if (held.isWorking) return 'work'
  if (held.isHot) return 'hot'

  return now - held.activeAt > SLEEPY_MS ? 'sleep' : 'idle'
}

const drawCard = async ($: EngineInterface, tags: Tags, width: number): Promise<RenderElement> => {
  const { Box, Text } = tags
  const held = await read($, status)
  const beat = await read($, tick)
  const now = await $.clock.now()
  const mood = moodAt(held, now)
  const isStill = mood === 'sleep'
  const step = mood === 'work' || mood === 'happy' ? beat % 2 : Math.floor(beat / 2) % 2
  const isBlinking = mood === 'idle' && beat % 7 === 0
  const shell = mood === 'hot' ? 0xe5484d : isStill ? 0x9a5b45 : 0xd97757
  const palette = {
    o: shell,
    d: shade(shell, 0.7),
    l: mood === 'hot' ? 0xff8a80 : isStill ? shell : 0xf0a58c,
    m: mood === 'happy' ? 0xffffff : 0x5a2e22,
    e: mood === 'dizzy' && beat % 2 === 0 ? 0xd670d6 : 0xffffff,
    p: mood === 'happy' ? 0x3fb950 : mood === 'dizzy' && beat % 2 === 1 ? 0xd670d6 : 0x1f2328,
  }
  const body =
    isStill || isBlinking
      ? BODY.map((line, row) => (row < 2 ? line.replaceAll('e', 'o').replaceAll('p', 'd') : line))
      : BODY
  const frame2 = isStill ? 0 : step
  const pixels = canvas(32, 14)
  paint(
    pixels,
    [...(CLAWS[frame2] ?? CLAWS[0]), ...body, ...(LEGS[frame2] ?? LEGS[0])],
    palette,
    2,
    isStill ? 2 : 1 + step,
  )

  const said = held.forced !== null && now < held.forced.until && held.forced.note !== '' ? held.forced.note : SAYS[mood]

  return frame(
    tags,
    width,
    'Clawd',
    mood,
    <Box columnGap={2}>
      {picture(tags, 'pet', pixels)}
      <Box flexDirection="column" justifyContent="center">
        <Text wrap="wrap">{said}</Text>
        {held.isWorking && <Text dimColor>{held.calls} tool calls this turn</Text>}
      </Box>
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
      name: 'pet-widget',
      description: 'Toggle Clawd, a pixel pet whose mood follows the session',
      argumentHint: '[on|off|sleep|idle|work|happy|dizzy|hot]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const now = await $.clock.now()
    await update($, status, held => ({ ...(held ?? RESTING), isWorking: false, activeAt: now }))
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'pet-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (isMood(arg)) {
      const until = (await $.clock.now()) + FLASH_MS * 2
      await update($, status, held => ({
        ...(held ?? RESTING),
        forced: { mood: arg, until, note: '' },
      }))
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await sync($)

      return { text: `Pet on, previewing ${arg}.` }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /pet-widget [on|off|sleep|idle|work|happy|dizzy|hot]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    const now = await $.clock.now()
    await update($, status, held => ({ ...(held ?? RESTING), activeAt: now }))
    await sync($)

    return { text: isShown ? 'Pet on; /widgets places it.' : 'Pet off.' }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, status, held => ({
      ...(held ?? RESTING),
      isWorking: true,
      activeAt: now,
      calls: 0,
    }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, status, held => ({ ...(held ?? RESTING), isWorking: false, activeAt: now }))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!(await read($, isOn))) return ran

    const now = await $.clock.now()
    const command = String((e as { command?: unknown }).command ?? '')
    const forced =
      ran.isError === true ? { mood: 'dizzy' as const, until: now + FLASH_MS, note: `${e.tool} failed` }
      : e.tool === 'Bash' && CHECKS.test(command) ? { mood: 'happy' as const, until: now + FLASH_MS, note: '' }
      : undefined
    await update($, status, held => ({
      ...(held ?? RESTING),
      calls: (held ?? RESTING).calls + 1,
      activeAt: now,
      forced: forced ?? (held ?? RESTING).forced,
    }))

    return ran
  })

  on('session.measure', async ($, e, next) => {
    const isHot = (e.context.percent ?? 0) >= HOT_PERCENT
    await update($, status, held => ({ ...(held ?? RESTING), isHot }))

    return next(e)
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

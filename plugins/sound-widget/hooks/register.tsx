import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import type { SoundRoll } from '../types'

const PANE = 'widgets'
const CARD_COLUMNS = 40
const ROLL_ROWS = 14
const MAX_NOTES = 60
const GAIN = 0.5
const NOTES = ['c4', 'd4', 'e4', 'g4', 'a4', 'c5']
const PASS = 6
const FAIL = 7
const CLIPS = [...NOTES, 'pass', 'fail']
const COLORS = [0x58a6ff, 0xbc8cff, 0x3fb950, 0xf0883e, 0xf778ba, 0x39c5cf, 0xffd43b, 0xe5484d]
const STAVE = 0x21262d
const PITCHES: Record<string, number> = {
  Read: 0,
  Grep: 1,
  Glob: 1,
  Edit: 2,
  Write: 2,
  NotebookEdit: 2,
  Bash: 3,
  Agent: 4,
  WebFetch: 5,
  WebSearch: 5,
}
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const SILENT: SoundRoll = { notes: [], played: 0, isMuted: false }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'sound-widget', key: 'isOn' } as const, false)
const roll = atom({ plugin: 'sound-widget', key: 'roll' } as const, SILENT)

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const sound = async ($: EngineInterface, pitch: number): Promise<void> => {
  const held = await update($, roll, before => ({
    ...(before ?? SILENT),
    notes: [...(before ?? SILENT).notes, pitch].slice(-MAX_NOTES),
    played: (before ?? SILENT).played + 1,
  }))
  if (held.isMuted) return

  void $.audio.play({ asset: `sounds/${CLIPS[pitch] ?? 'c4'}.wav` }, { gain: GAIN }).catch(() => undefined)
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

  const wanted = (await $.state.get(widths)).value?.['sound-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const inner = (width - 4) * 2
  const held = await read($, roll)
  const shown = held.notes.slice(-Math.floor(inner / 2))
  const marks: WidgetsMark[] = []

  for (let line = 0; line < NOTES.length; line += 1) {
    for (let x = 0; x < inner; x += 3) marks.push([x, ROLL_ROWS - 2 - line * 2, STAVE])
  }
  shown.forEach((pitch, index) => {
    const x = inner - (shown.length - index) * 2
    const color = COLORS[pitch] ?? 0xffffff
    if (pitch === PASS) {
      for (let line = 0; line < NOTES.length; line += 2) marks.push([x, ROLL_ROWS - 2 - line * 2, color], [x + 1, ROLL_ROWS - 2 - line * 2, color])
    } else if (pitch === FAIL) {
      for (let y = 0; y < ROLL_ROWS; y += 2) marks.push([x, y, color])
    } else {
      marks.push([x, ROLL_ROWS - 2 - pitch * 2, color], [x + 1, ROLL_ROWS - 2 - pitch * 2, color])
    }
  })

  return $.widgets.card({
    beneath,
    width,
    title: 'Sound',
    note: `${some(held.played, 'note')}${held.isMuted ? ' · muted' : ''}`,
    body: await $.widgets.picture({ surface, key: 'sound', columns: inner, rows: ROLL_ROWS, marks }),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sound-widget',
      description: 'Toggle the session soundtrack: a note per tool call, with a piano roll',
      argumentHint: '[on|off|mute|test]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    if ((await $.store.get('isMuted')) === true) await update($, roll, held => ({ ...(held ?? SILENT), isMuted: true }))

    return next(e)
  })

  on('command.run', { command: 'sound-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'mute') {
      const held = await update($, roll, before => ({ ...(before ?? SILENT), isMuted: !(before ?? SILENT).isMuted }))
      await $.store.set('isMuted', held.isMuted)

      return { text: held.isMuted ? 'Sound muted; the piano roll keeps drawing.' : 'Sound unmuted.' }
    }
    if (arg === 'test') {
      await update($, isOn, () => true)
      await $.store.set('isOn', true)
      await sound($, PASS)

      return { text: 'Played a chord. Playback needs macOS; other platforms stay silent.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /sound-widget [on|off|mute|test]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Sound on; /widgets places it.' : 'Sound off.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || !(await read($, isOn))) return ran

    const command = String((e as { command?: unknown }).command ?? '')
    const isFailed = ran.isError === true
    const isCheck = e.tool === 'Bash' && CHECKS.test(command)
    await sound($, isFailed ? FAIL : isCheck ? PASS : (PITCHES[e.tool] ?? 1))

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

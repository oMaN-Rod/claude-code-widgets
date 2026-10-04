import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { QuestHero } from '../types'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Outcome = { hero: QuestHero; news: string; toast?: string }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CHECKS = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|build|check|clippy)\b/
const MONSTERS: Record<string, string> = {
  Bash: 'Shell Golem',
  Read: 'Scroll Wisp',
  Edit: 'Patch Imp',
  Write: 'Ink Wraith',
  NotebookEdit: 'Ledger Ghoul',
  Grep: 'Search Bat',
  Glob: 'Path Spider',
  Agent: 'Summoned Shade',
  WebFetch: 'Net Lurker',
  WebSearch: 'Net Lurker',
}
const ROOMS = [
  'a damp corridor',
  'the hall of stale caches',
  'a vault of tangled branches',
  'the library of unread docs',
  'a cavern of dangling pointers',
  'the forge of failing builds',
  'a crypt of legacy code',
  'the bridge of race conditions',
]
const NOVICE: QuestHero = { level: 1, xp: 0, hp: 60, gold: 0, room: 0, slain: 0, falls: 0 }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'quest-widget', key: 'isOn' } as const, false)
const hero = atom({ plugin: 'quest-widget', key: 'hero' } as const, NOVICE)
const news = atom({ plugin: 'quest-widget', key: 'news' } as const, 'The dungeon waits. Send a prompt to enter.')

const some = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const healthAt = (level: number): number => 50 + level * 10

const needAt = (level: number): number => level * 50

const hash = (text: string): number => {
  let sum = 7
  for (const letter of text) sum = (sum * 31 + letter.charCodeAt(0)) % 100_003

  return sum
}

const isHero = (value: unknown): value is QuestHero =>
  typeof value === 'object' &&
  value !== null &&
  Object.keys(NOVICE).every(key => typeof (value as Record<string, unknown>)[key] === 'number')

const settle = (before: QuestHero, story: string): Outcome => {
  if (before.hp <= 0) {
    return {
      hero: { ...before, hp: healthAt(before.level), gold: Math.floor(before.gold / 2), falls: before.falls + 1 },
      news: `${story} You fall, and wake by the campfire with half your gold.`,
      toast: 'Quest: you fell in battle.',
    }
  }
  if (before.xp >= needAt(before.level)) {
    const level = before.level + 1

    return {
      hero: { ...before, level, xp: before.xp - needAt(before.level), hp: healthAt(level) },
      news: `${story} Level ${level}!`,
      toast: `Quest: level ${level} reached.`,
    }
  }

  return { hero: before, news: story }
}

const fight = (before: QuestHero, tool: string, isFailed: boolean, isCheck: boolean): Outcome => {
  const monster = MONSTERS[tool] ?? 'Stray Daemon'

  if (isCheck && !isFailed) {
    const found = 10 + before.level * 2
    const healed = Math.min(healthAt(before.level), before.hp + Math.round(healthAt(before.level) * 0.2))

    return settle({ ...before, gold: before.gold + found, hp: healed, xp: before.xp + 10 }, `The checks pass: a chest holds ${found} gold.`)
  }
  if (isFailed) {
    const hurt = (isCheck ? 20 : 12) + before.level

    return settle(
      { ...before, hp: before.hp - hurt },
      isCheck ? `A trap springs as the checks fail (-${hurt} HP).` : `The ${monster} strikes back (-${hurt} HP).`,
    )
  }

  const gained = tool === 'Agent' ? 15 : tool === 'Bash' ? 8 : 5

  return settle({ ...before, slain: before.slain + 1, xp: before.xp + gained }, `You slay a ${monster} (+${gained} XP).`)
}

const apply = async ($: EngineInterface, change: (before: QuestHero) => Outcome): Promise<void> => {
  const outcome = change(await read($, hero))
  await update($, hero, () => outcome.hero)
  await update($, news, () => outcome.news)
  await $.store.set('hero', outcome.hero)
  if (outcome.toast !== undefined) $.ui.toast(outcome.toast)
}

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const wanted = (await $.state.get(widths)).value?.['quest-widget'] ?? CARD_COLUMNS
  const width = Math.min(wanted, Math.max(20, columns))
  const cells = width - 4 - 9
  const held = await read($, hero)
  const health = Math.max(0, Math.round((held.hp / healthAt(held.level)) * cells))
  const progress = Math.min(cells, Math.round((held.xp / needAt(held.level)) * cells))

  return $.widgets.card({
    beneath,
    width,
    title: `Quest Lv ${held.level}`,
    note: `room ${held.room}`,
    body: (
      <Box flexDirection="column">
        <Text>
          HP <Text color="red">{'█'.repeat(health)}</Text>
          <Text dimColor>{'░'.repeat(cells - health)}</Text> {Math.max(0, held.hp)}
        </Text>
        <Text>
          XP <Text color="cyan">{'█'.repeat(progress)}</Text>
          <Text dimColor>{'░'.repeat(cells - progress)}</Text> {held.xp}
        </Text>
        <Text dimColor wrap="truncate-end">
          {held.gold} gold · {held.slain} slain · {some(held.falls, 'fall')}
        </Text>
        <Text wrap="wrap">{await read($, news)}</Text>
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quest-widget',
      description: 'Toggle the dungeon crawl that the session plays out',
      argumentHint: '[on|off|reset]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    const kept = await $.store.get('hero')
    if (isHero(kept)) await update($, hero, () => kept)

    return next(e)
  })

  on('command.run', { command: 'quest-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'reset') {
      await apply($, () => ({ hero: NOVICE, news: 'A new hero stands at the dungeon door.' }))

      return { text: 'Quest reset.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /quest-widget [on|off|reset]' }
    }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)

    return { text: isShown ? 'Quest on; /widgets places it.' : 'Quest off.' }
  })

  on('turn.start', async ($, e, next) => {
    if (await read($, isOn)) {
      await apply($, before => ({
        hero: { ...before, room: before.room + 1 },
        news: `You enter ${ROOMS[hash(e.turnId) % ROOMS.length] ?? 'a dark room'}.`,
      }))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || !(await read($, isOn))) return ran

    const command = String((e as { command?: unknown }).command ?? '')
    await apply($, before => fight(before, e.tool, ran.isError === true, e.tool === 'Bash' && CHECKS.test(command)))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey
      ? next(e)
      : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

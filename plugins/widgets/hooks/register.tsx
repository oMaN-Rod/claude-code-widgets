import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { WidgetsPlace } from '../types'
import { HINT, STACK, widgets } from './kit'

const PANE = 'widgets'
const TITLE = 'Widgets'
const DEFAULT_COLUMNS = 44
const MIN_COLUMNS = 24
const MAX_COLUMNS = 120
const PLACES: readonly string[] = ['side', 'above', 'below']
const SETTLE_MS = 400
const SETTLE_TRIES = 10
const MIN_CARD = 20
const USAGE = 'Usage: /widgets [side|above|below|close|<columns>|width <widget> <columns|reset>]'
const site = atom({ plugin: 'widgets', key: 'site' } as const, 'off')
const last = atom({ plugin: 'widgets', key: 'last' } as const, 'side')
const widths = atom({ plugin: 'widgets', key: 'widths' } as const, {})

const isPlace = (value: unknown): value is WidgetsPlace =>
  typeof value === 'string' && PLACES.includes(value)

let isFullscreenSeen: boolean | undefined

const settle = async ($: EngineInterface, tries: number): Promise<void> => {
  if (isFullscreenSeen === undefined && tries > 0) {
    $.clock.after(SETTLE_MS, () => {
      void settle($, tries - 1)
    })

    return
  }
  if ((await read($, site)) !== 'off') return

  if (isFullscreenSeen === true) {
    await update($, site, () => 'side')
    await $.ui.open({ id: PANE, title: TITLE })
  } else {
    await update($, site, () => 'below')
  }
}

const isWidths = (value: unknown): value is Record<string, number> =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every(columns => typeof columns === 'number')

const resize = async ($: EngineInterface, name: string, size: string): Promise<string> => {
  const widget = name.endsWith('-widget') ? name : `${name}-widget`
  const isReset = size === 'reset'
  if (name === '' || (!isReset && !/^\d+$/.test(size))) return USAGE

  const columns = Math.min(MAX_COLUMNS, Math.max(MIN_CARD, Number(size)))
  const kept = await update($, widths, held => {
    const { [widget]: _dropped, ...rest } = held ?? {}

    return isReset ? rest : { ...rest, [widget]: columns }
  })
  await $.store.set('widths', kept)

  return isReset ? `${widget} card width reset.` : `${widget} cards are ${columns} columns wide.`
}

const isPaneOpen = async ($: EngineInterface): Promise<boolean> =>
  (await $.ui.panes()).some(pane => pane.id === PANE)

export const register: Register = on => {
  on('engine.create', async (_$, e, next) => ({ ...(await next(e)), widgets }))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'widgets',
      description: 'Toggle or move the widget cards: side, above or below the prompt',
      argumentHint: '[side|above|below|close|<columns>|width <widget> <columns|reset>]',
    })

    const sized = await $.store.get('widths')
    if (isWidths(sized)) await update($, widths, () => sized)
    const kept = await $.store.get('last')
    if (isPlace(kept)) await update($, last, () => kept)
    const shown = await $.store.get('site')
    if ((await read($, site)) === 'off' && isPlace(shown)) {
      const isDockWanted = shown === 'side' || (shown === 'below' && kept === 'side')
      if (isDockWanted) {
        $.clock.after(SETTLE_MS, () => {
          void settle($, SETTLE_TRIES)
        })
      } else {
        await update($, site, () => shown)
      }
    }

    return next(e)
  })

  on('command.run', { command: 'widgets' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const [verb, name = '', size = ''] = arg.split(/\s+/)
    if (verb === 'width') return { text: await resize($, name, size) }

    const isWidth = /^\d+$/.test(arg)
    const now = await read($, site)
    const target =
      arg === '' ? (now === 'off' ? await read($, last) : 'off')
      : arg === 'open' ? (now === 'off' ? await read($, last) : now)
      : arg === 'close' || arg === 'off' ? 'off'
      : isWidth ? 'side'
      : isPlace(arg) ? arg
      : undefined

    if (target === undefined) return { text: USAGE }

    const place = target === 'side' && !e.presentation.isFullscreen ? 'below' : target

    if (place !== 'side' && (await isPaneOpen($))) await $.ui.close({ id: PANE })
    await update($, site, () => place)
    await $.store.set('site', place)

    if (target === 'off') return { text: 'Widgets hidden.' }

    await update($, last, () => target)
    await $.store.set('last', target)

    if (place === 'above') return { text: 'Widgets above the prompt.' }
    if (place === 'below') {
      return {
        text:
          target === 'side'
            ? 'Widgets below the prompt; they dock beside the transcript in fullscreen.'
            : 'Widgets below the prompt.',
      }
    }

    const columns = isWidth
      ? Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Number(arg)))
      : DEFAULT_COLUMNS
    const opened = await $.ui.open({ id: PANE, title: TITLE, columns })

    if (!opened.isPlaced) {
      return { text: `Widget pane is waiting to be placed: ${opened.reason}` }
    }

    return { text: `Widget pane open beside the transcript (${columns} columns).` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person' && (await read($, site)) === 'side') {
      await update($, site, () => 'off')
      await $.store.set('site', 'off')
    }

    return closed
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.viewport?.isFullscreen !== undefined) isFullscreenSeen = e.viewport.isFullscreen

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const beneath = await next(e)
    const key = (beneath as { props?: { key?: unknown } }).props?.key
    if (key === STACK) return beneath

    return (
      <Box key={HINT} flexDirection="column">
        {beneath}
        <Text dimColor wrap="wrap">
          No widgets on. Turn one on with its command, such as /context-widget or /pet-widget.
        </Text>
      </Box>
    )
  })
}

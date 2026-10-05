import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderNode, RenderSurface, Timer } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import type { FactoryBoard, FactoryOrder } from '../types'
import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const REFRESH_MS = 5000
const SHOWN = 4
const BOARD = 'factory/floor/board.json'
const STATIONS = ['ideation', 'design', 'build', 'inspection', 'shipping'] as const
const SHORT = { ideation: 'idea', design: 'spec', build: 'build', inspection: 'check', shipping: 'ship' } as const
const USAGE = 'Usage: /factory-widget [on|off|orders|shipped|turned|log <order>]'
const OFF = 'Factory is off; /factory-widget on first.'
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'factory-widget', key: 'isOn' } as const, false)
const board = atom({ plugin: 'factory-widget', key: 'board' } as const, null)

let timer: Timer | undefined

const isBoard = (value: unknown): value is FactoryBoard =>
  typeof value === 'object' && value !== null && Array.isArray((value as { orders?: unknown }).orders)

const clock = (at: string | null): string => (at === null ? '' : at.slice(11, 16))

const widget = (order: FactoryOrder): string => (order.widget ?? 'unnamed').replace(/-widget$/, '')

const refresh = async ($: EngineInterface): Promise<void> => {
  let found: FactoryBoard | null = null
  try {
    const parsed: unknown = JSON.parse(await $.fs.read(`${(await $.session.root()).replaceAll('\\', '/')}/${BOARD}`))
    if (isBoard(parsed)) found = parsed
  } catch {
    found = null
  }
  const held = await read($, board)
  if (held?.at !== found?.at) await update($, board, () => found)
}

const sync = async ($: EngineInterface): Promise<void> => {
  const isWanted = await read($, isOn)
  if (isWanted && timer === undefined) {
    timer = $.clock.every(REFRESH_MS, () => {
      void refresh($)
    })
    await refresh($)
  }
  if (!isWanted && timer !== undefined) {
    timer.cancel()
    timer = undefined
  }
}

const turned = (held: FactoryBoard): { order: FactoryOrder; line: string }[] =>
  held.orders.flatMap(order =>
    order.stamps
      .filter(stamp => stamp.result !== 'pass')
      .map(stamp => ({
        order,
        line: `${order.id} ${stamp.station}: ${stamp.result === 'send-back' ? `sent back to ${stamp.to}` : stamp.result === 'scrap' ? 'scrapped' : 'rejected'} by ${stamp.by}${stamp.subject === undefined ? '' : ` ("${stamp.subject}")`}: ${stamp.reason}`,
      })),
  )

const report = (held: FactoryBoard | null, verb: string, id: string): string => {
  if (held === null) return `No factory floor in this project (${BOARD} is missing).`

  const open = held.orders.filter(order => order.status === 'open')
  const shipped = held.orders.filter(order => order.status === 'shipped')
  if (verb === 'orders') {
    return open.length === 0
      ? 'The line is clear.'
      : open.map(order => `${order.id} ${order.widget ?? '(unnamed)'} (${order.kind}) at ${order.station}, ${order.holder ?? 'waiting'}${order.sendBacks > 0 ? `, sent back ${order.sendBacks}×` : ''}`).join('\n')
  }
  if (verb === 'shipped') {
    return shipped.length === 0 ? 'Nothing shipped yet.' : shipped.map(order => `${order.id} ${order.widget} shipped ${order.closedAt?.slice(0, 16).replace('T', ' ')}`).join('\n')
  }
  if (verb === 'turned') {
    const lines = turned(held).map(entry => entry.line)

    return lines.length === 0 ? 'Nothing turned back.' : lines.join('\n')
  }

  const order = held.orders.find(known => known.id.toLowerCase() === id || known.id.slice(3).replace(/^0+/, '') === id)
  if (order === undefined) return `No work order ${id.toUpperCase()}. ${USAGE}`

  return [`${order.id} ${order.widget ?? '(unnamed)'}: ${order.status === 'open' ? `at ${order.station}` : order.status}`, ...order.log.map(entry => `${clock(entry.at)} ${entry.agent} @ ${entry.station}: ${entry.action}`)].join('\n')
}

const draw = ({ Box, Text }: Tags, held: FactoryBoard | null, inner: number): { note: string; body: RenderNode } => {
  if (held === null) {
    return {
      note: 'no floor',
      body: (
        <Text dimColor wrap="wrap">
          No factory floor here. Open a work order with factory/tools/order.ts and the line shows up.
        </Text>
      ),
    }
  }

  const open = held.orders.filter(order => order.status === 'open')
  const shipped = held.orders.filter(order => order.status === 'shipped')
  const back = turned(held)
  const last = shipped.at(-1)
  const isWide = inner >= 30

  return {
    note: `${open.length} on the line`,
    body: (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          {STATIONS.map(station => {
            const count = open.filter(order => order.station === station).length

            return (
              <Text color={count > 0 ? 'warning' : undefined} dimColor={count === 0}>
                {isWide ? SHORT[station] : SHORT[station].charAt(0)} {count === 0 ? '·' : String(count)}
              </Text>
            )
          })}
        </Box>
        {open.length === 0 && <Text dimColor>The line is clear.</Text>}
        {open.slice(0, SHOWN).map(order => (
          <Box justifyContent="space-between">
            <Text wrap="truncate-end">
              {isWide ? `${order.id} ` : `${order.id.slice(3)} `}
              <Text bold>{widget(order)}</Text>
            </Text>
            <Text dimColor wrap="truncate-end">
              {' '}
              {isWide ? `${order.station} · ${order.holder ?? 'waiting'}` : SHORT[order.station]}
              {order.sendBacks > 0 ? ` ↩${order.sendBacks}` : ''}
            </Text>
          </Box>
        ))}
        {open.length > SHOWN && <Text dimColor>and {open.length - SHOWN} more</Text>}
        <Text dimColor wrap="truncate-end">
          dock {shipped.length}
          {last === undefined ? '' : ` · last ${widget(last)} ${clock(last.closedAt)}`}
        </Text>
        {back.length > 0 && (
          <Text dimColor wrap="truncate-end">
            {plural(back.length, 'turn-back')} · {back.at(-1)?.line}
          </Text>
        )}
      </Box>
    ),
  }
}

const show = async (
  $: EngineInterface,
  tags: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['factory-widget'] ?? CARD_COLUMNS, columns)
  const { note, body } = draw(tags, await read($, board), width - 4)

  return $.widgets.card({ beneath, width, title: 'Factory', note, body })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'factory-widget',
      description: 'Toggle the factory floor card, or report on the work orders',
      argumentHint: '[on|off|orders|shipped|turned|log <order>]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'factory-widget' }, async ($, e) => {
    const [verb = '', id = ''] = e.args.trim().toLowerCase().split(/\s+/)
    if (verb === 'orders' || verb === 'shipped' || verb === 'turned' || (verb === 'log' && id !== '')) {
      if (!(await read($, isOn))) return { text: OFF }
      await refresh($)

      return { text: report(await read($, board), verb, id) }
    }
    if (verb !== '' && verb !== 'on' && verb !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (verb === '' ? !(shown ?? false) : verb === 'on'))
    await $.store.set('isOn', isShown)
    await sync($)

    return { text: isShown ? 'Factory on; /widgets places it.' : 'Factory off.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80),
  )
}

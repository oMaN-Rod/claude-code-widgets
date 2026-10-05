import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'
import type { WidgetsPlace } from 'widgets'

import { fit, folder, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'>
type Book = { key: string; notes: string[]; fresh: string[]; isDue: boolean }
type Jot = { text?: unknown; replace?: unknown }

const PANE = 'widgets'
const CARD_COLUMNS = 40
const LONG_COLUMNS = 36
const MAX_NOTES = 8
const MAX_LENGTH = 200
const MAX_ECHO = 20
const TOOL = /^mcp__notebook-widget__jot$/
const USAGE = 'Usage: /notebook-widget [on|off|show|drop <number>|clear]'
const OFF = 'Notebook is off.'
const ALREADY = 'Already in the notebook.'
const OPENING =
  "notebook-widget: notes you left yourself in earlier sessions in this project. Each was true when written; check one against the code before you rely on it, and overwrite it with the jot tool's replace if it is out of date:"
const EMPTY = ['Nothing noted yet.', 'Claude jots here what the next session should know of this project.'] as const
const BLANK: Book = { key: '', notes: [], fresh: [], isDue: false }
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'notebook-widget', key: 'isOn' } as const, false)
const book = atom({ plugin: 'notebook-widget', key: 'book' } as const, BLANK)

const list = (notes: readonly string[]): string => notes.map((text, at) => `${at + 1}. ${text}`).join('\n')

const wrapped = (text: string, columns: number): string[] =>
  text.split(' ').reduce<string[]>((rows, word) => {
    const last = rows.at(-1)

    return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
  }, [])

const kept = (stored: unknown): string[] =>
  (Array.isArray(stored) ? (stored as unknown[]) : [])
    .flatMap(entry => {
      if (typeof entry === 'string') return [entry]

      return typeof entry === 'object' && entry !== null && 'text' in entry && typeof entry.text === 'string' ? [entry.text] : []
    })
    .slice(0, MAX_NOTES)

const answer = (said: string, isError = false) => (isError ? { result: said, text: said, isError } : { result: said, text: said })

const show = async (
  $: EngineInterface,
  { Box, Text }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['notebook-widget'] ?? CARD_COLUMNS, columns)
  const room = Math.min(width - 4, LONG_COLUMNS)
  const isLong = room === LONG_COLUMNS
  const { notes, fresh } = await read($, book)
  const added = notes.filter(text => fresh.includes(text)).length
  const isFull = notes.length >= MAX_NOTES

  return $.widgets.card({
    beneath,
    width,
    title: 'Notebook',
    note: notes.length === 0 ? '' : added > 0 ? `+${added}` : isFull ? 'full' : `${notes.length} kept`,
    body:
      notes.length === 0 ? (
        <Box flexDirection="column">
          {wrapped(EMPTY[0], room).map(row => (
            <Text>{row}</Text>
          ))}
          {wrapped(EMPTY[1], room).map(row => (
            <Text dimColor>{row}</Text>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column">
          {notes.map((text, at) => (
            <Text key={`row-${at + 1}`} wrap="truncate-end">
              {fresh.includes(text) ? (
                <Text color="green" bold>
                  {at + 1}
                </Text>
              ) : (
                <Text dimColor>{at + 1}</Text>
              )}{' '}
              {text}
            </Text>
          ))}
          {isFull && (
            <Text key="full" wrap="truncate-end">
              {isLong ? 'Full: a new note replaces an old' : 'full, replacing'}
            </Text>
          )}
          <Text key="hint" dimColor wrap="truncate-end">
            {isLong ? '/notebook-widget show: in full' : 'show: in full'}
          </Text>
        </Box>
      ),
  })
}

const open = async ($: EngineInterface, cwd: string): Promise<void> => {
  const key = `notes:${folder(cwd)}`
  if ((await read($, book)).key === key) {
    await update($, book, held => ({ ...(held ?? BLANK), isDue: true }))

    return
  }

  const notes = kept(await $.store.get(key))
  await update($, book, () => ({ key, notes, fresh: [], isDue: true }))
  await $.tool.register({
    name: 'jot',
    description:
      'Jot a note to your future self about this project. It is read back to you at the start of every later session here, and the user sees it. Use it when you work out something a new session would otherwise have to rediscover: where something lives, a constraint that is not obvious from the code, why an approach failed, how to verify a change. One fact per note, under 200 characters. Not for task status, to-do items, or anything CLAUDE.md already says.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'One fact about this project, written so a new session can act on it.' },
        replace: {
          type: 'number',
          description: 'The number of an existing note to overwrite, when it is out of date or the notebook is full.',
        },
      },
      required: ['text'],
    },
  })
}

const keep = async ($: EngineInterface, held: Book, notes: string[], fresh: string[] = held.fresh): Promise<void> => {
  await update($, book, () => ({ key: held.key, notes, fresh, isDue: true }))
  await $.store.set(held.key, notes)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'notebook-widget',
      description: 'Toggle the notebook Claude keeps for its future self in this project',
      argumentHint: '[on|off|show|drop <number>|clear]',
    })
    if ((await $.store.get('isOn')) === true) {
      await update($, isOn, () => true)
      await open($, e.cwd)
    }

    return next(e)
  })

  on('command.run', { command: 'notebook-widget' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = verb.toLowerCase()
    const typed = rest.join(' ')

    if (arg === 'drop' || ((arg === 'show' || arg === 'clear') && typed === '')) {
      if (!(await read($, isOn))) return { text: OFF }

      const held = await read($, book)
      if (arg === 'show') {
        return {
          text:
            held.notes.length === 0
              ? 'The notebook is empty for this project.'
              : `${plural(held.notes.length, 'note')} for this project:\n${list(held.notes)}`,
        }
      }
      if (arg === 'clear') {
        await keep($, held, [], [])

        return { text: 'Notebook emptied for this project.' }
      }

      const at = /^\d+$/.test(typed) ? Number(typed) : 0
      const dropped = held.notes[at - 1]
      if (dropped === undefined) {
        return { text: `There is no note "${typed.slice(0, MAX_ECHO)}". /notebook-widget show lists them.` }
      }
      await keep($, held, held.notes.filter((_, index) => index !== at - 1))

      return { text: `Dropped note ${at}: ${dropped}` }
    }
    if (typed !== '' || (arg !== '' && arg !== 'on' && arg !== 'off')) return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (isShown) await open($, await $.session.cwd())

    return {
      text: isShown
        ? 'Notebook on; Claude can jot notes from the next prompt. /widgets places it.'
        : 'Notebook off. The jot tool stays listed until the session ends and writes nothing.',
    }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    if (!(await read($, isOn))) return answer('Notebook is off; nothing was written.', true)

    const jot = e as Jot
    const text = String(jot.text ?? '').replaceAll(/\s+/g, ' ').trim().slice(0, MAX_LENGTH)
    if (text === '') return answer('A note needs text.', true)

    const held = await read($, book)
    const at = jot.replace
    if (at !== undefined && (typeof at !== 'number' || !Number.isInteger(at) || at < 1 || at > held.notes.length)) {
      return answer(
        `There is no note ${String(at).slice(0, MAX_ECHO)}. ${held.notes.length === 0 ? 'The notebook is empty.' : `The notebook holds:\n${list(held.notes)}`}`,
        true,
      )
    }
    if (held.notes.some((note, index) => note === text && index + 1 !== at)) return answer(ALREADY)
    if (at === undefined && held.notes.length >= MAX_NOTES) {
      return answer(
        `The notebook is full (${plural(MAX_NOTES, 'note')}). Pass replace with the number of the least useful one:\n${list(held.notes)}`,
        true,
      )
    }

    const notes = at === undefined ? [...held.notes, text] : held.notes.map((note, index) => (index + 1 === at ? text : note))
    await keep($, held, notes, held.fresh.includes(text) ? held.fresh : [...held.fresh, text])

    return answer(`Noted (${notes.length} of ${MAX_NOTES}).`)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge' && e.origin.kind !== 'sdk') return next(e)

    const held = await read($, book)
    if (!held.isDue) return next(e)

    await update($, book, now => ({ ...(now ?? held), isDue: false }))

    return held.notes.length === 0 ? next(e) : next({ ...e, context: [...(e.context ?? []), `${OPENING}\n${list(held.notes)}`] })
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if ((await read($, isOn)) && e.agentId === undefined && e.trigger !== 'precompute' && result.skip === undefined) {
      await update($, book, held => ({ ...(held ?? BLANK), isDue: true }))
    }

    return result
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

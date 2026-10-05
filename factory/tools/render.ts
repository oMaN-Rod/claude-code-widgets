import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { Box, Spacer, Text, render } from 'ink'
import { createElement } from 'react'
import type { ReactNode } from 'react'

import { ROOT, fail, flag, typed, words } from './lib'

type Node = { type?: string; props?: Record<string, unknown>; children?: Node[] } | string | number | null | undefined
type Table = Record<string, unknown>
type Engine = {
  clients: Record<string, Table>
  start: () => Promise<void>
  run: (line: string) => Promise<void>
  turn: () => Promise<void>
  render: (columns: number) => Promise<Node>
  stop: () => void
}

export type Frame = { columns: number; lines: string[] }
export type Shots = { frames: Frame[]; printed: string[]; faults: string[] }
export type Script = { widths?: number[]; lines?: string[]; turns?: number; waitMs?: number; wide?: number }

const USAGE = 'Usage: bun factory/tools/render.ts <widget folder> [--widths 20,40,60] [--wide 60] [--do "/command args"]... [--turns 1] [--wait 200]'
const DEFAULT_COLOR = 0x01000000
const STYLE = /\u001b\[[0-9;]*m/g

const posix = (path: string): string => path.replaceAll('\\', '/')

const load = async (folder: string): Promise<void> => {
  const hooks = join(folder, 'hooks')
  const clients = readdirSync(hooks).filter(file => file.endsWith('.tsx') && file !== 'register.tsx')
  const scratch = mkdtempSync(join(tmpdir(), 'factory-render-'))
  const entry = join(scratch, 'entry.ts')
  writeFileSync(
    entry,
    [
      `import { widgets as kit } from '${posix(join(ROOT, 'plugins', 'widgets', 'hooks', 'kit.tsx'))}'`,
      `import { register } from '${posix(join(hooks, 'register.tsx'))}'`,
      ...clients.map((file, at) => `import * as c${at} from '${posix(join(hooks, file))}'`),
      `globalThis.DEMO_MODS = { kit, mods: { '${basename(folder)}': { register, clients: { ${clients.map((file, at) => `'./${file}': c${at}`).join(', ')} } } } }`,
    ].join('\n'),
  )
  const built = await Bun.build({
    entrypoints: [entry],
    format: 'iife',
    target: 'browser',
    plugins: [
      {
        name: 'claude-code-shim',
        setup(build) {
          build.onResolve({ filter: /^claude-code$/ }, () => ({ path: join(ROOT, 'site', 'claude-code.ts') }))
        },
      },
    ],
  })
  rmSync(scratch, { recursive: true, force: true })
  if (!built.success) fail(built.logs.map(String).join('\n'))
  ;(0, eval)(await built.outputs[0]!.text())
  ;(0, eval)(readFileSync(join(ROOT, 'docs', 'engine.js'), 'utf8'))
}

const raster = (props: Record<string, unknown>): ReactNode => {
  const columns = Number(props.columns)
  const bytes = Uint8Array.from(atob(String(props.cells)), letter => letter.charCodeAt(0))
  const cells = new Uint32Array(bytes.buffer)
  const rows: ReactNode[] = []
  for (let row = 0; row < Number(props.rows); row += 1) {
    let line = ''
    for (let column = 0; column < columns; column += 1) {
      const at = (row * columns + column) * 3
      const glyph = cells[at] || 32
      line += glyph === 32 && cells[at + 2] !== DEFAULT_COLOR ? '░' : String.fromCodePoint(glyph)
    }
    rows.push(createElement(Text, { key: row, wrap: 'truncate' }, line))
  }

  return createElement(Box, { flexDirection: 'column', flexShrink: 0, width: columns }, ...rows)
}

const client = (engine: Engine, props: Record<string, unknown>): ReactNode => {
  const table = engine.clients[String(props.module)] ?? {}
  const component = (table.default ?? Object.values(table).find(value => typeof value === 'function')) as ((given: unknown, surface: unknown) => Node) | undefined
  if (component === undefined) return createElement(Text, null, '[client]')

  const surface = {
    elements: (globalThis as never as { DemoEngine: { elements: unknown } }).DemoEngine.elements,
    state: undefined,
    setState: () => {},
    every: () => ({ cancel: () => {} }),
    after: () => ({ cancel: () => {} }),
    onKey: () => {},
    onPointer: () => {},
    post: () => {},
    columns: props.width,
    rows: props.height,
    isFocused: false,
  }

  return createElement(Box, { flexDirection: 'column', width: props.width as number, height: props.height as number, overflow: 'hidden' }, paint(engine, component(props.props, surface)))
}

const paint = (engine: Engine, node: Node, at = 0): ReactNode => {
  if (node === null || node === undefined) return null
  if (typeof node !== 'object') return String(node)

  const { key: _key, ...props } = node.props ?? {}
  const kids = (node.children ?? []).map((kid, index) => paint(engine, kid, index))
  if (node.type === 'Raster') return createElement(Box, { key: at, flexShrink: 0 }, raster(props))
  if (node.type === 'Client') return createElement(Box, { key: at, flexShrink: 0 }, client(engine, props))
  if (node.type === 'Spacer') return createElement(Spacer, { key: at })
  if (node.type === 'Button') return createElement(Text, { key: at }, String(props.label ?? ''), ...kids)
  if (node.type === 'Box') return createElement(Box, { key: at, ...props }, ...kids)
  if (node.type === 'Fragment') return createElement(Box, { key: at, flexDirection: 'column' }, ...kids)

  const { onPress: _onPress, href: _href, language: _language, ...style } = props

  return createElement(Text, { key: at, ...style }, ...kids)
}

const draw = (tree: ReactNode, columns: number): string[] => {
  let last = ''
  const stdout = Object.assign(new EventEmitter(), { columns, rows: 200, isTTY: false, write: (frame: string) => void (last = frame) })
  const stdin = Object.assign(new EventEmitter(), { isTTY: false, setRawMode: () => {}, setEncoding: () => {}, resume: () => {}, pause: () => {}, ref: () => {}, unref: () => {}, read: () => null })
  const app = render(createElement(Box, { width: columns, flexDirection: 'column' }, tree), { stdout, stdin, debug: true, patchConsole: false, exitOnCtrlC: false } as never)
  app.unmount()

  return last.replace(STYLE, '').split('\n').map(line => line.trimEnd())
}

export const shoot = async (folder: string, script: Script = {}): Promise<Shots> => {
  const name = basename(folder)
  if (!existsSync(join(folder, 'hooks', 'register.tsx'))) fail(`${folder} has no hooks/register.tsx.`)
  await load(folder)

  const printed: string[] = []
  const faults: string[] = []
  const trap = (error: unknown): void => void faults.push(String((error as Error)?.stack ?? error).split('\n').slice(0, 2).join(' / '))
  process.on('unhandledRejection', trap)
  const creator = (globalThis as never as { DemoEngine: { create: (name: string, options: object) => Engine } }).DemoEngine
  const engine = creator.create(name, { pace: 0.01, widths: script.wide === undefined ? {} : { [name]: script.wide }, onPrint: (text: string) => void printed.push(text), onToast: (text: string) => void printed.push(`(toast) ${text}`) })
  const frames: Frame[] = []
  try {
    await engine.start()
    for (const line of script.lines ?? []) await engine.run(line)
    for (let turn = 0; turn < (script.turns ?? 0); turn += 1) await engine.turn()
    await new Promise(done => setTimeout(done, script.waitMs ?? 120))
    for (const columns of script.widths ?? [20, 40, 60]) frames.push({ columns, lines: draw(paint(engine, await engine.render(columns)), columns) })
  } catch (error) {
    trap(error)
  }
  engine.stop()
  process.off('unhandledRejection', trap)

  return { frames, printed, faults }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const [folder] = words(args)
  if (folder === undefined) fail(USAGE)

  const lines = args.flatMap((arg, at) => (arg === '--do' ? [typed(args[at + 1] ?? '')] : []))
  const shots = await shoot(resolve(folder as string), {
    widths: flag(args, 'widths')?.split(',').map(Number),
    lines,
    turns: Number(flag(args, 'turns') ?? 0),
    wide: flag(args, 'wide') === undefined ? undefined : Number(flag(args, 'wide')),
    waitMs: Number(flag(args, 'wait') ?? 120),
  })
  for (const text of shots.printed) console.log(`> ${text}`)
  for (const frame of shots.frames) console.log(`\n--- ${frame.columns} columns ---\n${frame.lines.join('\n')}`)
  for (const fault of shots.faults) console.log(`FAULT ${fault}`)
  process.exit(shots.faults.length > 0 ? 1 : 0)
}

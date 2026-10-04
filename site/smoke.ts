import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const docs = join(import.meta.dir, '..', 'docs')
;(0, eval)(readFileSync(join(docs, 'mods.js'), 'utf8'))
;(0, eval)(readFileSync(join(docs, 'engine.js'), 'utf8'))

type Node = { type?: string; props?: Record<string, unknown>; children?: Node[] } | string | number
const cardOf = (node: Node): Node | undefined => {
  if (typeof node !== 'object' || node === null) return undefined
  if (node.props?.borderStyle === 'round') return node
  for (const child of node.children ?? []) {
    const found = cardOf(child)
    if (found !== undefined) return found
  }

  return undefined
}
const textOf = (node: Node): string => (typeof node !== 'object' || node === null ? String(node) : (node.children ?? []).map(textOf).join(node.type === 'Text' ? '' : ' | '))

const G = globalThis as never as { DEMO_MODS: { mods: Record<string, unknown> }; DemoEngine: { create: (name: string, options: object) => any } }
const only = process.argv[2]
const failed: string[] = []
const loose: string[] = []
process.on('unhandledRejection', error => loose.push(String((error as Error)?.stack ?? error).split('\n').slice(0, 3).join(' / ')))
for (const name of Object.keys(G.DEMO_MODS.mods)) {
  if (only !== undefined && name !== only) continue
  const before = loose.length
  try {
    const engine = G.DemoEngine.create(name, { pace: 0.01 })
    await engine.start()
    const rest = cardOf(await engine.render(38))
    await engine.turn()
    await new Promise(done => setTimeout(done, 80))
    const after = cardOf(await engine.render(38))
    engine.stop()
    if (rest === undefined || after === undefined) failed.push(`${name}: no card (${rest === undefined ? 'at rest' : 'after a turn'})`)
    else if (only !== undefined) console.log(textOf(rest), '\n---\n', textOf(after))
  } catch (error) {
    failed.push(`${name}: ${String((error as Error)?.stack ?? error).split('\n').slice(0, 3).join(' / ')}`)
  }
  if (loose.length > before) failed.push(`${name}: (async) ${loose.slice(before).join(' ;; ')}`)
}
console.log(failed.join('\n'))
console.log(`${failed.length} problems`)
process.exit(0)

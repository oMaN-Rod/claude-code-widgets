import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const docs = join(import.meta.dir, '..', 'docs')
;(0, eval)(readFileSync(join(docs, 'mods.js'), 'utf8'))
;(0, eval)(readFileSync(join(docs, 'engine.js'), 'utf8'))
const G = globalThis as never as { DEMO_MODS: { mods: Record<string, { clients: Record<string, Record<string, unknown>> }> }; DemoEngine: { elements: object } }
const textOf = (node: any): string => (typeof node !== 'object' || node === null ? String(node) : (node.children ?? []).map(textOf).join(node.type === 'Text' ? '' : '\n'))

for (const [name, mod] of Object.entries(G.DEMO_MODS.mods)) {
  for (const [file, table] of Object.entries(mod.clients)) {
    if (file === './kit.tsx') continue
    const component = (table.default ?? Object.values(table).find(value => typeof value === 'function')) as (props: object, surface: object) => unknown
    const keys: ((event: object) => void)[] = []
    const pointers: ((event: object) => void)[] = []
    const ticks: (() => void)[] = []
    const posted: unknown[] = []
    let state: unknown
    const surface = {
      elements: G.DemoEngine.elements,
      get state() { return state },
      setState: (next: unknown) => { state = next },
      every: (_ms: number, run: () => void) => { ticks.push(run); return { cancel: () => {} } },
      after: () => ({ cancel: () => {} }),
      onKey: (run: (event: object) => void) => void keys.push(run),
      onPointer: (run: (event: object) => void) => void pointers.push(run),
      post: (data: unknown) => void posted.push(data),
    }
    const props = { best: 0, wins: 0, seed: 1 }
    try {
    const first = textOf(component(props, surface))
    for (let at = 0; at < 5; at += 1) ticks.forEach(run => run())
    const ticked = textOf(component(props, surface))
    for (const key of ['left', 'down', 'a', ' ', 'right']) keys.forEach(run => run({ key }))
    pointers.forEach(run => run({ type: 'down', x: 4, y: 2, button: 'left' }))
    const played = textOf(component(props, surface))
    console.log(`${name} ${file}: keys ${keys.length}, pointers ${pointers.length}, timers ${ticks.length}; moved by clock ${first !== ticked}, by input ${ticked !== played}`)
    } catch (error) {
      console.log(`${name} ${file}: needs its real props (${String(error).slice(0, 60)})`)
    }
  }
}

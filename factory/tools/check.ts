import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { CATEGORIES, ROOT, fail, flag, sh, words } from './lib'
import { STAMPED, stamped } from './scaffold'

type Finding = { rule: string; detail: string }

const USAGE = `Usage: bun factory/tools/check.ts <widget folder> [--spec <spec.md>] [--static] [--json]
       bun factory/tools/check.ts --all`
const MANIFEST_KEYS = ['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'types', 'dependencies']
const FILES = ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/register.tsx', 'hooks/lib.ts', 'types/index.d.ts', 'widget.json', 'tests/kit.tsx', 'tests/standard.test.tsx', 'tests/widget.test.tsx']
const FREE_HOOKS = ['session.start', 'command.run', 'ui.render']
const WIDTHS = [20, 40, 60]

const text = (path: string): string => readFileSync(path, 'utf8').replaceAll('\r\n', '\n')

const registered = (source: string, noun: 'command' | 'tool'): string[] =>
  [...source.matchAll(new RegExp(`\\$\\.${noun}\\.register\\(\\{\\s*name: '([^']+)'`, 'g'))].map(found => found[1] ?? '')

const others = (name: string): Map<string, string> => {
  const taken = new Map<string, string>()
  const plugins = join(ROOT, 'plugins')
  for (const other of readdirSync(plugins)) {
    const path = join(plugins, other, 'hooks', 'register.tsx')
    if (other === name || !existsSync(path)) continue
    const source = text(path)
    for (const word of [...registered(source, 'command'), ...registered(source, 'tool')]) taken.set(word, other)
  }

  return taken
}

const handlers = (source: string): { event: string; body: string }[] =>
  source
    .split(/\n {2}on\(/)
    .slice(1)
    .map(body => ({ event: /^'([a-z.]+)'/.exec(body)?.[1] ?? '', body }))

const inspect = (folder: string, spec: string | undefined): Finding[] => {
  const name = basename(folder)
  const found: Finding[] = []
  const flagged = (rule: string, detail: string): void => void found.push({ rule, detail })

  if (!/^[a-z0-9]+(-[a-z0-9]+)*-widget$/.test(name)) flagged('name', `the folder is named ${name}, not <name>-widget`)
  const missing = FILES.filter(file => !existsSync(join(folder, file)))
  for (const file of missing) flagged('files', `${file} is missing`)
  if (missing.length > 0) return found

  const manifest = JSON.parse(text(join(folder, '.claude-plugin/plugin.json'))) as Record<string, unknown>
  if (Object.keys(manifest).join() !== MANIFEST_KEYS.join()) flagged('manifest', `keys must be ${MANIFEST_KEYS.join(', ')} in that order`)
  if (manifest.name !== name) flagged('manifest', `name is ${String(manifest.name)}`)
  if (JSON.stringify(manifest.dependencies) !== '["widgets"]') flagged('manifest', 'dependencies must be ["widgets"]')
  if (manifest.types !== './types/index.d.ts') flagged('manifest', 'types must be ./types/index.d.ts')

  const card = JSON.parse(text(join(folder, 'widget.json'))) as { title?: string; category?: string; shows?: string; commands?: string[]; cost?: string }
  const commands = card.commands ?? []
  if (typeof card.title !== 'string' || card.title === '') flagged('widget.json', 'title is empty')
  if (!CATEGORIES.includes(card.category as never)) flagged('widget.json', `category must be one of: ${CATEGORIES.join(', ')}`)
  if (typeof card.shows !== 'string' || card.shows.length < 20 || card.shows.length > 200 || card.shows.includes('__')) flagged('widget.json', 'shows must be one sentence of 20 to 200 characters')
  if (card.shows !== manifest.description) flagged('widget.json', 'shows must equal the manifest description')
  if (!commands[0]?.startsWith(`/${name}`)) flagged('widget.json', `the first command must be /${name}`)
  if (typeof card.cost !== 'string') flagged('widget.json', 'cost must be a string, empty when the widget is free')

  for (const file of STAMPED) {
    if (text(join(folder, file)) !== stamped(file, name, card.title ?? '').replaceAll('\r\n', '\n')) flagged('stamped', `${file} differs from the template; it is not edited by hand`)
  }

  const source = text(join(folder, 'hooks/register.tsx'))
  const has = (pattern: RegExp, rule: string, detail: string): void => {
    if (!pattern.test(source)) flagged(rule, detail)
  }
  has(new RegExp(`atom\\(\\{ plugin: '${name}', key: 'isOn' \\} as const, false\\)`), 'switch', 'the switch is atom({ plugin, key: \'isOn\' } as const, false)')
  has(/\$\.store\.get\('isOn'\)\) === true/, 'switch', 'session.start restores the switch from the store')
  has(/\$\.store\.set\('isOn', /, 'switch', 'the command saves the switch to the store')
  has(new RegExp(`Usage: /${name}`), 'command', 'unknown input answers with Usage: /<name>')
  has(/if \(!\(await read\(\$, isOn\)\)\) return beneath/, 'render', 'show() returns beneath while off')
  has(/\.value !== place\) return beneath/, 'render', 'show() returns beneath unless the layout places it here')
  has(/\$\.widgets\.card\(/, 'render', 'the card is drawn by $.widgets.card')
  has(/\bfit\(/, 'render', 'the width comes from fit() in ./lib')
  has(/on\('ui\.render', \{ component: 'Pane', requestId: PANE \}/, 'render', 'the Pane render hook is missing')
  has(/on\('ui\.render', \{ component: 'AbovePrompt' \}[\s\S]*?hasSurvey \? next\(e\)/, 'render', 'the AbovePrompt render hook must stand aside for a survey')
  has(/on\('ui\.render', \{ component: 'PromptHint' \}/, 'render', 'the PromptHint render hook is missing')
  if (/borderStyle/.test(source)) flagged('render', 'the widget draws its own border')
  if (/\bas any\b/.test(source)) flagged('code', 'as any')
  if (/engine\.create/.test(source)) flagged('code', 'only the layout plugin extends the engine')

  for (const line of source.split('\n')) {
    if (/^let /.test(line) && !/^let \w+: Timer \| undefined$/.test(line)) flagged('lifecycle', `module-level state other than a timer handle: ${line.trim()}`)
  }
  if (/\$\.clock\.(every|after)\(/.test(source) && !/\nconst sync = async \(/.test(source)) flagged('lifecycle', 'timers start and stop in one function named sync')
  for (const { event, body } of handlers(source)) {
    if (!FREE_HOOKS.includes(event) && !/\bisOn\b/.test(body)) flagged('off', `the ${event} hook does not check the switch`)
    if (event === 'prompt.submit' && /origin\.kind/.test(body) && !(body.includes("'sdk'") && body.includes("'bridge'"))) flagged('lifecycle', 'a prompt.submit hook accepts composer, bridge and sdk prompts')
  }

  const own = registered(source, 'command')
  if (!own.includes(name)) flagged('command', `the widget registers /${name}`)
  const taken = others(name)
  for (const word of [...own, ...registered(source, 'tool')]) {
    if (word !== name && !commands.some(usage => usage === `/${word}` || usage.startsWith(`/${word} `)) && own.includes(word)) flagged('command', `/${word} is registered and not listed in widget.json`)
    if (taken.has(word)) flagged('command', `${word} is already used by ${taken.get(word)}`)
  }

  const contract = text(join(folder, 'types/index.d.ts'))
  if (!new RegExp(`'${name}': \\{[^}]*isOn: `).test(contract)) flagged('types', `the contract declares '${name}': { isOn: ... }`)

  const tests = text(join(folder, 'tests/widget.test.tsx'))
  const covered = new Set([...tests.matchAll(/test\('A(\d+): /g)].map(match => match[1]))
  if (covered.size === 0) flagged('tests', 'tests/widget.test.tsx has no test named "A<n>: ..."')
  if (spec !== undefined) {
    const wanted = [...text(spec).matchAll(/^- A(\d+): /gm)].map(match => match[1] ?? '')
    if (wanted.length === 0) flagged('spec', 'the spec has no acceptance lines ("- A1: ...")')
    for (const number of wanted) if (!covered.has(number)) flagged('tests', `acceptance line A${number} has no test`)
  }

  return found
}

const exercise = async (folder: string): Promise<Finding[]> => {
  const found: Finding[] = []
  const validated = sh(['claude', 'plugin', 'validate', folder])
  if (validated.code !== 0 || !validated.out.includes('Validation passed')) found.push({ rule: 'validator', detail: validated.out.split('\n').filter(line => line.includes('❯') && !line.includes('register.tsx hooks') && !line.includes('register.tsx calls') && !line.includes('state ')).join(' ').trim() || 'validation failed' })
  const tested = sh(['claude', 'plugin', 'test', folder])
  if (tested.code !== 0 || !/\n 0 fail/.test(tested.out)) found.push({ rule: 'tests', detail: tested.out.split('\n').filter(line => line.startsWith('(fail)')).join('; ') || `the tests did not run: ${tested.out.trim().split('\n')[0]}` })

  const { shoot } = await import('./render')
  for (const turns of [0, 1]) {
    const shots = await shoot(folder, { widths: WIDTHS, turns })
    const when = turns === 0 ? 'at rest' : 'after a turn'
    for (const fault of shots.faults) found.push({ rule: 'render', detail: `${when}: ${fault}` })
    for (const frame of shots.frames) {
      const top = frame.lines.findIndex(line => line.startsWith('╭'))
      const bottom = frame.lines.findIndex(line => line.startsWith('╰'))
      const wanted = Math.min(40, Math.max(20, frame.columns))
      if (top < 0 || bottom < 0) {
        found.push({ rule: 'render', detail: `${when}, ${frame.columns} columns: no card was drawn` })
        continue
      }
      const edge = [...(frame.lines[top] ?? '')].length
      if (edge !== wanted) found.push({ rule: 'render', detail: `${when}, ${frame.columns} columns: the card is ${edge} wide, not ${wanted}` })
      const torn = frame.lines.slice(top + 1, bottom).filter(line => !line.startsWith('│') || !line.endsWith('│') || [...line].length !== edge)
      if (torn.length > 0) found.push({ rule: 'render', detail: `${when}, ${frame.columns} columns: ${torn.length} line(s) break the card's border, first: "${torn[0]}"` })
    }
  }

  return found
}

const args = process.argv.slice(2)
if (args.includes('--all')) {
  const plugins = join(ROOT, 'plugins')
  const tally = new Map<string, number>()
  let clean = 0
  for (const name of readdirSync(plugins).filter(entry => entry.endsWith('-widget') && existsSync(join(plugins, entry, 'hooks', 'register.tsx')))) {
    const found = inspect(join(plugins, name), undefined)
    if (found.length === 0) clean += 1
    for (const rule of new Set(found.map(finding => finding.rule))) tally.set(rule, (tally.get(rule) ?? 0) + 1)
    console.log(`${found.length === 0 ? 'PASS' : 'DEBT'}  ${name}${found.length === 0 ? '' : `  ${[...new Set(found.map(finding => finding.rule))].join(', ')}`}`)
  }
  console.log(`\n${clean} meet the standard. Widgets failing each rule: ${[...tally].map(([rule, count]) => `${rule} ${count}`).join(', ')}`)
  process.exit(0)
}

const [given] = words(args)
if (given === undefined) fail(USAGE)
const folder = resolve(given as string)
const found = inspect(folder, flag(args, 'spec'))
if (found.length === 0 && !args.includes('--static')) found.push(...(await exercise(folder)))

if (args.includes('--json')) console.log(JSON.stringify({ widget: basename(folder), isPassing: found.length === 0, findings: found }, null, 2))
else {
  for (const finding of found) console.log(`FAIL  ${finding.rule}: ${finding.detail}`)
  console.log(found.length === 0 ? `PASS  ${basename(folder)} meets the standard.` : `\n${found.length} finding(s). ${basename(folder)} does not meet the standard.`)
}
process.exit(found.length === 0 ? 0 : 1)

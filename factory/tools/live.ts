import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { CONFIG, ROOT, fail, flag, typed, words } from './lib'

const USAGE = `Usage: bun factory/tools/live.ts <widget folder> --say "/<name>-widget on" [--say "<prompt or command>"]... [--allow "Bash,Edit"] [--hold 3] [--claude "<more claude arguments>"] [--keep]

Runs a real headless Claude Code session in a scratch project, under the factory's own
config directory (FACTORY_CONFIG_DIR, default ~/.claude-factory), with only the layout
plugin and this widget loaded. Prints what the session said and what the widget stored.
With --keep as the last argument, the loaded copy of the widget stays in <config>/live/<name>
until the next run, so a file the widget wrote there can be read.`
const QUIET_MS = 20_000

const args = process.argv.slice(2)
const [given] = words(args)
const lines = args.flatMap((arg, at) => (arg === '--say' ? [typed(args[at + 1] ?? '')] : []))
if (given === undefined || lines.length === 0) fail(USAGE)

const folder = resolve(given as string)
const name = basename(folder)
const config = CONFIG
if (!existsSync(config)) fail(`${config} does not exist. Start claude once with CLAUDE_CONFIG_DIR set to it and log in.`)

const project = join(config, 'scratch-project')
const loaded = join(config, 'live', name)
const skip = (source: string): boolean => !source.replaceAll('\\', '/').includes('/.claude-plugin/types') && !source.endsWith('tsconfig.json')
rmSync(loaded, { recursive: true, force: true })
mkdirSync(project, { recursive: true })
cpSync(join(ROOT, 'plugins', 'widgets'), join(loaded, 'widgets'), { recursive: true, filter: skip })
cpSync(folder, join(loaded, name), { recursive: true, filter: skip })
if (!existsSync(join(project, 'README.md'))) writeFileSync(join(project, 'README.md'), '# scratch\n\nA throwaway project for live widget runs.\n')

const stores = (): string =>
  existsSync(join(config, 'plugins', 'store'))
    ? readdirSync(join(config, 'plugins', 'store'))
        .filter(file => file.startsWith(`${name}_`))
        .map(file => `${file}: ${readFileSync(join(config, 'plugins', 'store', file), 'utf8').trim()}`)
        .join('\n')
    : ''

const allow = flag(args, 'allow')
const more = (flag(args, 'claude') ?? '').split(' ').filter(Boolean)
const child = Bun.spawn(
  ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--plugin-dir', loaded, ...(allow === undefined ? [] : ['--allowedTools', allow]), ...more],
  { cwd: project, env: { ...process.env, CLAUDE_CONFIG_DIR: config }, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
)

let results = 0
let lastAt = Date.now()
const said = (event: Record<string, any>): string | undefined => {
  if (event.type === 'result') return `[turn ended: ${event.subtype}] ${String(event.result ?? '').slice(0, 600)}`
  if (event.type === 'assistant' || event.type === 'user') {
    const content = event.message?.content
    const parts = typeof content === 'string' ? [content] : (content ?? []).map((part: Record<string, any>) =>
      part.type === 'text' ? part.text
      : part.type === 'tool_use' ? `(tool ${part.name} ${JSON.stringify(part.input).slice(0, 200)})`
      : part.type === 'tool_result' ? `(result ${JSON.stringify(part.content).slice(0, 400)})`
      : '')

    return `[${event.type}] ${parts.filter(Boolean).join(' ').slice(0, 800)}`
  }
  if (event.type === 'system' && !['init', 'thinking_tokens', 'commands_changed'].includes(event.subtype)) return `[system ${event.subtype}] ${JSON.stringify(event).slice(0, 400)}`

  return undefined
}
const reading = (async () => {
  let rest = ''
  for await (const chunk of child.stdout) {
    rest += new TextDecoder().decode(chunk)
    const rows = rest.split('\n')
    rest = rows.pop() ?? ''
    for (const row of rows.filter(Boolean)) {
      lastAt = Date.now()
      try {
        const event = JSON.parse(row) as Record<string, any>
        if (event.type === 'result') results += 1
        const text = said(event)
        if (text !== undefined) console.log(text)
      } catch {
        console.log(row.slice(0, 400))
      }
    }
  }
})()

const settled = async (wanted: number): Promise<void> => {
  while (results < wanted && Date.now() - lastAt < QUIET_MS) await Bun.sleep(250)
}

for (const [at, line] of lines.entries()) {
  console.log(`\n>>> ${line}`)
  lastAt = Date.now()
  child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: line } })}\n`)
  await child.stdin.flush()
  await settled(at + 1)
}
await Bun.sleep(Number(flag(args, 'hold') ?? 3) * 1000)
await child.stdin.end()
await Promise.race([reading, Bun.sleep(15_000)])
child.kill()

const errors = (await new Response(child.stderr).text()).trim()
if (errors !== '') console.log(`\n--- stderr ---\n${errors.slice(0, 1500)}`)
console.log(`\n--- ${name} store ---\n${stores() || '(nothing stored)'}`)
if (args.at(-1) === '--keep') console.log(`\nKept ${join(loaded, name)}`)
else rmSync(loaded, { recursive: true, force: true })
process.exit(0)

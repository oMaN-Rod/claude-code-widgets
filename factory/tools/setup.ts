import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { BENCH, CONFIG, FACTORY, FLOOR, OPEN, allIds, readOrder, sh } from './lib'

const lines: string[] = []
let missing = 0
const report = (isGood: boolean, what: string, fix = ''): void => {
  if (!isGood) missing += 1
  lines.push(`${isGood ? 'ok  ' : 'TODO'}  ${what}${isGood || fix === '' ? '' : `\n      ${fix}`}`)
}
const version = (argv: string[]): string | undefined => {
  try {
    const ran = sh(argv)

    return ran.code === 0 ? ran.out.trim().split('\n')[0] : undefined
  } catch {
    return undefined
  }
}

const bun = version(['bun', '--version'])
const claude = version(['claude', '--version'])
report(bun !== undefined, `bun ${bun ?? 'is not installed'}`, 'Install it from https://bun.sh')
report(claude !== undefined, `Claude Code ${claude ?? 'is not installed'}`, 'Install Claude Code, with mod (function hook) support')

if (!existsSync(join(FACTORY, 'node_modules', 'three'))) sh(['bun', 'install'], FACTORY)
report(existsSync(join(FACTORY, 'node_modules', 'three')), 'factory dependencies installed', 'Run: bun install --cwd factory')

for (const folder of [OPEN, BENCH, join(FLOOR, 'reference')]) mkdirSync(folder, { recursive: true })
report(true, 'factory/floor is ready (open orders and widgets in progress live here, outside git)')

const isLoggedIn = existsSync(join(CONFIG, '.credentials.json'))
report(
  isLoggedIn,
  isLoggedIn ? `live runs are set up in ${CONFIG}` : `live runs need their own Claude Code login in ${CONFIG}`,
  `Start claude once with CLAUDE_CONFIG_DIR set to that folder and run /login. It keeps the factory out of your own setup.`,
)

const validated = claude === undefined ? undefined : sh(['claude', 'plugin', 'validate', join('plugins', 'widgets')])
report(validated?.out.includes('Validation passed') === true, 'the mod validator runs', 'Run `claude plugin validate plugins/widgets` and follow what it says')

const open = allIds().map(readOrder).filter(order => order.status === 'open')
console.log(lines.join('\n'))
console.log(`\n${open.length} order(s) on the floor, ${allIds().length - open.length} closed.`)
console.log(
  missing === 0
    ? `\nReady. Next:\n  bun run --cwd factory floor     the factory floor in your browser\n  bun run --cwd factory line      start the line with a director session\n  bun run --cwd factory board     the board in the terminal`
    : `\n${missing} thing(s) to do first, marked TODO above. Then run this again.`,
)
process.exit(missing === 0 ? 0 : 1)

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

import { BENCH, ROOT, TEMPLATE, fail, flag, readOrder, words } from './lib'

const USAGE = `Usage: bun factory/tools/scaffold.ts <order id>
       bun factory/tools/scaffold.ts --name <name>-widget --title <Title> --out <folder>
       bun factory/tools/scaffold.ts --restamp <widget folder>`

export const STAMPED = ['hooks/hooks.json', 'hooks/lib.ts', 'tests/kit.tsx', 'tests/standard.test.tsx']

const pascal = (slug: string): string => slug.split('-').map(part => (/^\d/.test(part) ? `N${part}` : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)).join('')

export const stamped = (file: string, name: string, title: string): string => {
  const slug = name.replace(/-widget$/, '')

  return readFileSync(join(TEMPLATE, file), 'utf8').replaceAll('__NAME__', slug).replaceAll('__PASCAL__', pascal(slug)).replaceAll('__TITLE__', title)
}

export const templateFiles = (base = TEMPLATE): string[] =>
  readdirSync(base).flatMap(entry => {
    const path = join(base, entry)

    return statSync(path).isDirectory() ? templateFiles(path) : [relative(TEMPLATE, path).replaceAll('\\', '/')]
  })

const syncLayout = (): void => {
  const copy = join(BENCH, 'widgets')
  rmSync(copy, { recursive: true, force: true })
  cpSync(join(ROOT, 'plugins', 'widgets'), copy, {
    recursive: true,
    filter: source => !source.replaceAll('\\', '/').includes('/.claude-plugin/types') && !source.endsWith('tsconfig.json'),
  })
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const worn = flag(args, 'restamp')
  if (worn !== undefined) {
    const { title } = JSON.parse(readFileSync(join(worn, 'widget.json'), 'utf8')) as { title: string }
    for (const file of STAMPED) writeFileSync(join(worn, file), stamped(file, basename(resolve(worn)), title))
    console.log(`Restamped ${STAMPED.join(', ')}`)
    process.exit(0)
  }
  const [id] = words(args)
  const order = id === undefined ? undefined : readOrder(id)
  const name = order?.widget ?? flag(args, 'name')
  const title = order?.title ?? flag(args, 'title')
  const out = order === undefined ? flag(args, 'out') : BENCH
  if (name === undefined || name === null || title === undefined || title === null || out === undefined) fail(USAGE)

  const folder = join(out as string, name as string)
  if (existsSync(folder)) fail(`${folder} already exists.`)
  if (existsSync(join(ROOT, 'plugins', name as string, 'hooks', 'register.tsx'))) fail(`${name} is already a shipped widget.`)

  for (const file of templateFiles()) {
    mkdirSync(join(folder, file, '..'), { recursive: true })
    writeFileSync(join(folder, file), stamped(file, name as string, title as string))
  }
  if (order !== undefined) syncLayout()
  console.log(folder)
}

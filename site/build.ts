import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const plugins = readdirSync(join(root, 'plugins')).filter(name => name.endsWith('-widget') && existsSync(join(root, 'plugins', name, 'hooks', 'register.tsx')))
const lines = [`import { widgets as kit } from '../plugins/widgets/hooks/kit.tsx'`]
const entries: string[] = []

plugins.forEach((name, index) => {
  const hooks = join(root, 'plugins', name, 'hooks')
  const clients = readdirSync(hooks).filter(file => file.endsWith('.tsx') && file !== 'register.tsx')
  lines.push(`import { register as r${index} } from '../plugins/${name}/hooks/register.tsx'`)
  clients.forEach((file, at) => lines.push(`import * as c${index}_${at} from '../plugins/${name}/hooks/${file}'`))
  const table = clients.map((file, at) => `'./${file}': c${index}_${at}`).join(', ')
  entries.push(`  '${name}': { register: r${index}, clients: { ${table} } },`)
})
lines.push('', 'globalThis.DEMO_MODS = {', '  kit,', '  mods: {', ...entries.map(entry => `  ${entry}`), '  },', '}', '')
writeFileSync(join(import.meta.dir, 'entry.ts'), lines.join('\n'))

const built = await Bun.build({
  entrypoints: [join(import.meta.dir, 'entry.ts')],
  outdir: join(root, 'docs'),
  naming: 'mods.js',
  format: 'iife',
  target: 'browser',
  minify: true,
  plugins: [
    {
      name: 'claude-code-shim',
      setup(build) {
        build.onResolve({ filter: /^claude-code$/ }, () => ({ path: join(import.meta.dir, 'claude-code.ts') }))
      },
    },
  ],
})
const catalog: object[] = []
let category = ''
for (const line of readFileSync(join(root, 'README.md'), 'utf8').split(/\r?\n/)) {
  if (line.startsWith('## Notes')) break
  if (line.startsWith('### ')) category = line.slice(4).trim()
  const row = /^\| `([a-z0-9-]+)` \| (.*?) \| (.*?)(?: \| ([^|]*))? \|$/.exec(line)
  if (row === null || !plugins.includes(row[1] ?? '')) continue
  const [, name = '', commands = '', shows = '', cost = ''] = row
  catalog.push({
    name,
    category,
    commands: [...commands.matchAll(/`([^`]+)`/g)].map(found => (found[1] ?? '').replaceAll('\\|', '|')),
    shows: shows.replace(/`([^`]+)`/g, '$1').replaceAll('\\|', '|'),
    cost: cost.trim(),
  })
}
writeFileSync(join(root, 'docs', 'catalog.js'), `window.DEMO_CATALOG = ${JSON.stringify(catalog)}\n`)
const unlisted = plugins.filter(name => !catalog.some(entry => (entry as { name: string }).name === name))
if (unlisted.length > 0) console.log(`not in the README tables: ${unlisted.join(', ')}`)

for (const log of built.logs) console.log(String(log))
console.log(built.success ? `bundled ${plugins.length} widgets` : 'build failed')
if (!built.success) process.exit(1)

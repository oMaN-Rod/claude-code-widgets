import { existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { FACTORY, FLOOR, fail, sh } from './lib'

const USAGE = `Usage: bun factory/tools/move.ts pack [file]     put factory/floor into one archive (default factory-floor.tgz)
       bun factory/tools/move.ts unpack <file>   restore it on another machine

The floor is outside git: open work orders, widgets in progress and reference copies.
Pack it before moving the factory, and unpack it after cloning.`

const [command, given] = process.argv.slice(2)
if (command === 'pack') {
  const file = resolve(given ?? 'factory-floor.tgz')
  if (!existsSync(FLOOR)) fail('There is no factory/floor to pack.')
  const packed = sh(['tar', '-czf', relative(FACTORY, file), '--exclude', 'floor/plugins/*/.claude-plugin/types', 'floor'], FACTORY)
  if (packed.code !== 0) fail(packed.out)
  console.log(`Packed the floor into ${file}`)
} else if (command === 'unpack' && given !== undefined) {
  if (existsSync(join(FLOOR, 'orders')) && sh(['git', 'status', '--short', '--ignored', 'factory/floor']).out.includes('orders')) {
    console.log('factory/floor already holds orders here; files in the archive replace files of the same name.')
  }
  const unpacked = sh(['tar', '-xzf', relative(FACTORY, resolve(given))], FACTORY)
  if (unpacked.code !== 0) fail(unpacked.out)
  console.log('Unpacked the floor. Check it with: bun factory/tools/order.ts board')
} else {
  console.log(USAGE)
}

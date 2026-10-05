import { ROOT, fail, flag } from './lib'

const USAGE = `Usage: bun factory/tools/line.ts [--until <n>] [--interactive] [--print] [-- <extra claude arguments>]

Starts a Claude Code session in this repository as the factory's director. It follows
factory/DIRECTOR.md: refill the floor, run the line, make the live runs, check what shipped.

  --until <n>     stop once <n> more orders have shipped or been scrapped (default 3)
  --interactive   open a normal session with the instruction typed in, to watch and steer
  --print         show the command and the instruction without starting anything
  -- ...          anything after -- is passed to claude, for example a permission mode`

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}
const split = args.indexOf('--')
const own = split < 0 ? args : args.slice(0, split)
const extra = split < 0 ? [] : args.slice(split + 1)
const until = Number(flag(own, 'until') ?? 3)
if (!Number.isInteger(until) || until < 1) fail(USAGE)

const instruction = [
  'You are the director of the Widget Factory in this repository.',
  'Read factory/README.md and factory/DIRECTOR.md, then run the loop in DIRECTOR.md.',
  `Use the widget-line workflow to run the line; I am asking for multi-agent orchestration.`,
  `Stop once ${until} more order${until === 1 ? ' has' : 's have'} shipped or been scrapped, or as soon as something needs me.`,
  'End with a short report: what shipped, what is still on the floor and at which station, and anything that needs my decision.',
].join(' ')
const argv = ['claude', ...(own.includes('--interactive') ? [] : ['-p']), instruction, ...extra]

if (own.includes('--print')) {
  console.log(argv.map(part => (part.includes(' ') ? JSON.stringify(part) : part)).join(' '))
  process.exit(0)
}
const session = Bun.spawn(argv, { cwd: ROOT, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
process.exit(await session.exited)

import type { ClientModule } from 'claude-code'

import type { MinesweeperProps } from '../types'

type Game = {
  mines: boolean[] | null
  shown: boolean[]
  flags: boolean[]
  status: 'play' | 'won' | 'lost'
  seed: number
  wins: number
  isFlagging: boolean
}

const COLUMNS = 12
const ROWS = 8
const CELLS = COLUMNS * ROWS
const MINES = 12
const COLORS = ['white', '#6fc3ff', '#6fdc8c', '#ffd24a', '#e39cf2', '#ff8a80', '#ff8a80', '#ff8a80', '#ff8a80']
const COVERED = ['#5b6380', '#4b5370']
const OPENED = ['#272a35', '#1f2129']
const FLAGGED = '#8a5a1c'
const BLOWN = '#8f2d2d'

const blank = (): boolean[] => Array.from({ length: CELLS }, () => false)

const fresh = (seed: number, wins: number): Game => ({
  mines: null,
  shown: blank(),
  flags: blank(),
  status: 'play',
  seed,
  wins,
  isFlagging: false,
})

const nearOf = (cell: number): number[] => {
  const x = cell % COLUMNS
  const y = Math.floor(cell / COLUMNS)
  const near: number[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const isInside = x + dx >= 0 && x + dx < COLUMNS && y + dy >= 0 && y + dy < ROWS
      if ((dx !== 0 || dy !== 0) && isInside) near.push((y + dy) * COLUMNS + x + dx)
    }
  }

  return near
}

const lay = (seed: number, safe: number): { mines: boolean[]; seed: number } => {
  const mines = blank()
  const kept = [safe, ...nearOf(safe)]
  let state = seed
  let laid = 0
  while (laid < MINES) {
    state = (state * 1103515245 + 12345) % 2147483648
    const cell = Math.floor(state / 65_536) % CELLS
    if (mines[cell] === true || kept.includes(cell)) continue
    mines[cell] = true
    laid += 1
  }

  return { mines, seed: state }
}

const countAt = (mines: readonly boolean[], cell: number): number =>
  nearOf(cell).filter(near => mines[near] === true).length

const reveal = (game: Game, cell: number): Game => {
  if (game.status !== 'play' || game.flags[cell] === true || game.shown[cell] === true) return game

  const laid = game.mines === null ? lay(game.seed, cell) : { mines: game.mines, seed: game.seed }
  if (laid.mines[cell] === true) return { ...game, ...laid, status: 'lost' }

  const shown = [...game.shown]
  const queue = [cell]
  while (queue.length > 0) {
    const at = queue.pop() ?? 0
    if (shown[at] === true) continue
    shown[at] = true
    if (countAt(laid.mines, at) === 0) queue.push(...nearOf(at).filter(near => shown[near] !== true))
  }
  const isWon = shown.filter(Boolean).length === CELLS - MINES

  return { ...game, ...laid, shown, status: isWon ? 'won' : 'play', wins: game.wins + (isWon ? 1 : 0) }
}

const flag = (game: Game, cell: number): Game =>
  game.status !== 'play' || game.shown[cell] === true
    ? game
    : { ...game, flags: game.flags.map((isFlagged, at) => (at === cell ? !isFlagged : isFlagged)) }

const Mines: ClientModule<MinesweeperProps, Game> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.setState(fresh(9, 0))
    surface.onPointer(event => {
      const now = surface.state
      const cell = event.y * COLUMNS + Math.floor(event.x / 2)
      if (now === undefined || event.type !== 'down' || event.y >= ROWS || event.x >= COLUMNS * 2) return
      if (now.status !== 'play') {
        surface.setState(fresh(now.seed + 1, now.wins))

        return
      }

      const after = event.button === 'right' || now.isFlagging ? flag(now, cell) : reveal(now, cell)
      if (after.status === 'won' && now.status === 'play') surface.post({ score: after.wins })
      surface.setState(after)
    })
    surface.onKey(event => {
      const now = surface.state
      if (now === undefined) return
      if (event.key === 'r') surface.setState(fresh(now.seed + 1, now.wins))
      if (event.key === 'f') surface.setState({ ...now, isFlagging: !now.isFlagging })
    })
  }

  const game = surface.state ?? fresh(9, 0)
  const flags = game.flags.filter(Boolean).length
  const mode = game.status === 'play' ? (game.isFlagging ? 'flagging' : 'revealing') : `${game.status}, click for a new board`

  return (
    <Box flexDirection="column">
      {Array.from({ length: ROWS }, (_, y) => (
        <Text>
          {Array.from({ length: COLUMNS }, (_unused, x) => {
            const cell = y * COLUMNS + x
            const shade = (x + y) % 2
            const isMine = game.mines?.[cell] === true
            if (game.status === 'lost' && isMine) return <Text bold color="white" backgroundColor={BLOWN}> *</Text>
            if (game.flags[cell] === true) return <Text bold color="#ffd24a" backgroundColor={FLAGGED}> F</Text>
            if (game.shown[cell] !== true) return <Text backgroundColor={COVERED[shade]}>{'  '}</Text>
            const count = countAt(game.mines ?? [], cell)

            return count === 0 ? (
              <Text backgroundColor={OPENED[shade]}>{'  '}</Text>
            ) : (
              <Text bold color={COLORS[count] ?? '#ff8a80'} backgroundColor={OPENED[shade]}> {count}</Text>
            )
          })}
        </Text>
      ))}
      <Text wrap="truncate-end">
        mines {MINES - flags}{' '}
        <Text dimColor>
          · wins {Math.max(props.best, game.wins)} · {mode}
        </Text>
      </Text>
      <Text dimColor wrap="truncate-end">
        click reveals · right-click or f flags · r restarts
      </Text>
    </Box>
  )
}

export default Mines

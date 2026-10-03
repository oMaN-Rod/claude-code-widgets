import type { ClientModule } from 'claude-code'

import type { TilesProps } from '../types'

type Way = 'up' | 'down' | 'left' | 'right'
type Game = {
  board: number[]
  score: number
  seed: number
  isAuto: boolean
  restartIn: number
}

const SIDE = 4
const TICK_MS = 400
const RESTART_TICKS = 8
const AUTO: readonly Way[] = ['down', 'left', 'right', 'up']
const KEYS: Record<string, Way> = {
  up: 'up',
  w: 'up',
  down: 'down',
  s: 'down',
  left: 'left',
  a: 'left',
  right: 'right',
  d: 'right',
}
const COLORS: Record<number, string> = {
  2: 'white',
  4: 'cyan',
  8: 'green',
  16: 'yellow',
  32: 'magenta',
  64: 'red',
}

const lineOf = (way: Way, index: number): number[] => {
  const cells = Array.from({ length: SIDE }, (_, step) =>
    way === 'left' || way === 'right' ? index * SIDE + step : step * SIDE + index,
  )

  return way === 'right' || way === 'down' ? cells.reverse() : cells
}

const slide = (board: readonly number[], way: Way): { board: number[]; gained: number } => {
  const after = [...board]
  let gained = 0

  for (let index = 0; index < SIDE; index += 1) {
    const cells = lineOf(way, index)
    const tiles = cells.map(cell => board[cell] ?? 0).filter(tile => tile !== 0)
    const merged: number[] = []
    for (let at = 0; at < tiles.length; at += 1) {
      const tile = tiles[at] ?? 0
      if (tile === tiles[at + 1]) {
        merged.push(tile * 2)
        gained += tile * 2
        at += 1
      } else {
        merged.push(tile)
      }
    }
    cells.forEach((cell, step) => {
      after[cell] = merged[step] ?? 0
    })
  }

  return { board: after, gained }
}

const isSame = (one: readonly number[], other: readonly number[]): boolean =>
  one.every((tile, cell) => tile === other[cell])

const spawn = (board: readonly number[], seed: number): { board: number[]; seed: number } => {
  const next = (seed * 1103515245 + 12345) % 2147483648
  const open = board.flatMap((tile, cell) => (tile === 0 ? [cell] : []))
  const cell = open[next % Math.max(1, open.length)]
  if (cell === undefined) return { board: [...board], seed: next }

  return { board: board.map((tile, at) => (at === cell ? (next % 10 === 0 ? 4 : 2) : tile)), seed: next }
}

const fresh = (seed: number): Game => {
  const first = spawn(Array.from({ length: SIDE * SIDE }, () => 0), seed)
  const second = spawn(first.board, first.seed)

  return { ...second, score: 0, isAuto: true, restartIn: 0 }
}

const move = (game: Game, way: Way): Game => {
  const slid = slide(game.board, way)
  if (isSame(slid.board, game.board)) return game

  return { ...game, ...spawn(slid.board, game.seed), score: game.score + slid.gained }
}

const isStuck = (game: Game): boolean => AUTO.every(way => isSame(slide(game.board, way).board, game.board))

const advance = (game: Game): Game => {
  if (game.restartIn > 0) {
    return game.restartIn === 1 ? fresh(game.seed) : { ...game, restartIn: game.restartIn - 1 }
  }
  if (isStuck(game)) return { ...game, restartIn: RESTART_TICKS }
  if (!game.isAuto) return game

  return AUTO.map(way => move(game, way)).find(after => after !== game) ?? game
}

const Tiles: ClientModule<TilesProps, Game> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.setState(fresh(11))
    surface.every(TICK_MS, () => {
      const now = surface.state
      if (now === undefined) return

      const after = advance(now)
      if (after.restartIn === RESTART_TICKS && now.restartIn === 0) surface.post({ score: now.score })
      surface.setState(after)
    })
    surface.onKey(event => {
      const now = surface.state
      const way = KEYS[event.key]
      if (now !== undefined && way !== undefined && now.restartIn === 0) {
        surface.setState({ ...move(now, way), isAuto: false })
      }
    })
  }

  const game = surface.state ?? fresh(11)
  const mode = game.restartIn > 0 ? 'game over' : game.isAuto ? 'auto-play' : 'you'

  return (
    <Box flexDirection="column">
      {Array.from({ length: SIDE }, (_, row) => (
        <Text>
          {Array.from({ length: SIDE }, (_unused, column) => {
            const tile = game.board[row * SIDE + column] ?? 0

            return tile === 0 ? (
              <Text dimColor>{'    ·'}</Text>
            ) : (
              <Text bold color={COLORS[tile] ?? 'greenBright'}>
                {String(tile).padStart(5)}
              </Text>
            )
          })}
        </Text>
      ))}
      <Text wrap="truncate-end">
        score {game.score} <Text dimColor>· best {Math.max(props.best, game.score)} · {mode}</Text>
      </Text>
      <Text dimColor wrap="truncate-end">
        click the board, then arrows or WASD
      </Text>
    </Box>
  )
}

export default Tiles

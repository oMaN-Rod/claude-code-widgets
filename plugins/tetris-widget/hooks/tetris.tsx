import type { ClientModule } from 'claude-code'

import type { TetrisProps } from '../types'

type Cell = readonly [x: number, y: number]
type Piece = { kind: number; turn: number; x: number; y: number }
type Game = {
  board: number[]
  piece: Piece
  aim: { turn: number; x: number }
  seed: number
  lines: number
  pieces: number
  isAuto: boolean
  restartIn: number
}

const COLUMNS = 10
const ROWS = 14
const TICK_MS = 250
const RESTART_TICKS = 8
const SHAPES: readonly { size: number; cells: readonly Cell[]; color: string }[] = [
  { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: 'cyan' },
  { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: 'yellow' },
  { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: 'magenta' },
  { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: 'green' },
  { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: 'red' },
  { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: 'blue' },
  { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: 'white' },
]

const cellsOf = (kind: number, turn: number): Cell[] => {
  const shape = SHAPES[kind] ?? SHAPES[0]
  let cells: Cell[] = [...(shape?.cells ?? [])]
  for (let step = 0; step < turn % 4; step += 1) {
    cells = cells.map(([x, y]) => [(shape?.size ?? 3) - 1 - y, x])
  }

  return cells
}

const fits = (board: readonly number[], piece: Piece): boolean =>
  cellsOf(piece.kind, piece.turn).every(([dx, dy]) => {
    const x = piece.x + dx
    const y = piece.y + dy

    return x >= 0 && x < COLUMNS && y < ROWS && (y < 0 || board[y * COLUMNS + x] === 0)
  })

const settle = (board: readonly number[], piece: Piece): Piece => {
  let y = piece.y
  while (fits(board, { ...piece, y: y + 1 })) y += 1

  return { ...piece, y }
}

const lock = (board: readonly number[], piece: Piece): { board: number[]; cleared: number } => {
  const filled = [...board]
  for (const [dx, dy] of cellsOf(piece.kind, piece.turn)) {
    const at = (piece.y + dy) * COLUMNS + piece.x + dx
    if (at >= 0) filled[at] = piece.kind + 1
  }
  const rows = Array.from({ length: ROWS }, (_, y) => filled.slice(y * COLUMNS, (y + 1) * COLUMNS))
  const kept = rows.filter(row => row.some(cell => cell === 0))
  const cleared = ROWS - kept.length

  return {
    board: [...Array.from({ length: cleared * COLUMNS }, () => 0), ...kept.flat()],
    cleared,
  }
}

const rate = (board: readonly number[], cleared: number): number => {
  let holes = 0
  let heights = 0
  let bumps = 0
  let last = -1
  for (let x = 0; x < COLUMNS; x += 1) {
    let top = ROWS
    for (let y = 0; y < ROWS; y += 1) {
      const isFilled = board[y * COLUMNS + x] !== 0
      if (isFilled && top === ROWS) top = y
      if (!isFilled && top !== ROWS) holes += 1
    }
    const height = ROWS - top
    heights += height
    if (last >= 0) bumps += Math.abs(height - last)
    last = height
  }

  return cleared * 8 - holes * 4 - heights * 0.5 - bumps * 0.3
}

const plan = (board: readonly number[], kind: number): { turn: number; x: number } => {
  let best = { turn: 0, x: 3 }
  let bestRating = -Infinity
  for (let turn = 0; turn < 4; turn += 1) {
    for (let x = -2; x < COLUMNS; x += 1) {
      const start = { kind, turn, x, y: 0 }
      if (!fits(board, start)) continue
      const landed = lock(board, settle(board, start))
      const rating = rate(landed.board, landed.cleared)
      if (rating > bestRating) {
        bestRating = rating
        best = { turn, x }
      }
    }
  }

  return best
}

const deal = (game: Omit<Game, 'piece' | 'aim'>): Game => {
  const seed = (game.seed * 1103515245 + 12345) % 2147483648
  const kind = Math.floor(seed / 65_536) % SHAPES.length
  const piece = { kind, turn: 0, x: 3, y: 0 }

  return { ...game, seed, piece, aim: plan(game.board, kind), restartIn: fits(game.board, piece) ? 0 : RESTART_TICKS }
}

const fresh = (seed: number): Game =>
  deal({
    board: Array.from({ length: COLUMNS * ROWS }, () => 0),
    seed,
    lines: 0,
    pieces: 0,
    isAuto: true,
    restartIn: 0,
  })

const shift = (game: Game, change: Partial<Piece>): Game => {
  const piece = { ...game.piece, ...change }

  return fits(game.board, piece) ? { ...game, piece } : game
}

const land = (game: Game): Game => {
  const landed = lock(game.board, game.piece)

  return deal({ ...game, board: landed.board, lines: game.lines + landed.cleared, pieces: game.pieces + 1 })
}

const advance = (game: Game): Game => {
  if (game.restartIn > 0) {
    return game.restartIn === 1 ? fresh(game.seed) : { ...game, restartIn: game.restartIn - 1 }
  }

  let now = game
  if (now.isAuto) {
    if (now.piece.turn !== now.aim.turn) now = shift(now, { turn: now.piece.turn + 1 })
    if (now.piece.x !== now.aim.x) now = shift(now, { x: now.piece.x + Math.sign(now.aim.x - now.piece.x) })
  }
  const lower = { ...now.piece, y: now.piece.y + 1 }

  return fits(now.board, lower) ? { ...now, piece: lower } : land(now)
}

const steer = (game: Game, key: string): Game => {
  if (key === 'left' || key === 'a') return shift(game, { x: game.piece.x - 1 })
  if (key === 'right' || key === 'd') return shift(game, { x: game.piece.x + 1 })
  if (key === 'up' || key === 'w') return shift(game, { turn: (game.piece.turn + 1) % 4 })
  if (key === 'down' || key === 's') return shift(game, { y: game.piece.y + 1 })
  if (key === ' ' || key === 'return') return land({ ...game, piece: settle(game.board, game.piece) })

  return game
}

const Tetris: ClientModule<TetrisProps, Game> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.setState(fresh(5))
    surface.every(TICK_MS, () => {
      const now = surface.state
      if (now === undefined) return

      const after = advance(now)
      if (after.restartIn === RESTART_TICKS && now.restartIn === 0) surface.post({ score: now.lines })
      surface.setState(after)
    })
    surface.onKey(event => {
      const now = surface.state
      if (now === undefined || now.restartIn > 0) return

      const after = steer(now, event.key)
      if (after !== now || event.key === 'up' || event.key === 'w') surface.setState({ ...after, isAuto: false })
    })
  }

  const game = surface.state ?? fresh(5)
  const falling = cellsOf(game.piece.kind, game.piece.turn).map(([dx, dy]) => (game.piece.y + dy) * COLUMNS + game.piece.x + dx)
  const mode = game.restartIn > 0 ? 'game over' : game.isAuto ? 'auto-play' : 'you'

  return (
    <Box flexDirection="column">
      {Array.from({ length: ROWS }, (_, y) => (
        <Text>
          {Array.from({ length: COLUMNS }, (_unused, x) => {
            const at = y * COLUMNS + x
            const kind = falling.includes(at) ? game.piece.kind + 1 : (game.board[at] ?? 0)

            return kind === 0 ? <Text dimColor> ·</Text> : <Text color={SHAPES[kind - 1]?.color ?? 'white'}>██</Text>
          })}
        </Text>
      ))}
      <Text wrap="truncate-end">
        lines {game.lines} · pieces {game.pieces}{' '}
        <Text dimColor>
          · best {Math.max(props.best, game.lines)} · {mode}
        </Text>
      </Text>
      <Text dimColor wrap="truncate-end">
        click, then arrows or WASD; space drops
      </Text>
    </Box>
  )
}

export default Tetris

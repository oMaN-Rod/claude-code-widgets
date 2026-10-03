import type { ClientModule } from 'claude-code'

import type { SnakeProps } from '../types'

type Cell = readonly [x: number, y: number]
type Game = {
  body: Cell[]
  heading: Cell
  turn: Cell | null
  food: Cell
  score: number
  seed: number
  isAuto: boolean
  restartIn: number
}

const COLUMNS = 16
const ROWS = 8
const TICK_MS = 160
const RESTART_TICKS = 10
const KEYS: Record<string, Cell> = {
  up: [0, -1],
  w: [0, -1],
  down: [0, 1],
  s: [0, 1],
  left: [-1, 0],
  a: [-1, 0],
  right: [1, 0],
  d: [1, 0],
}

const isAt = (one: Cell, other: Cell): boolean => one[0] === other[0] && one[1] === other[1]

const isBlocked = (body: readonly Cell[], cell: Cell): boolean =>
  cell[0] < 0 || cell[1] < 0 || cell[0] >= COLUMNS || cell[1] >= ROWS || body.some(part => isAt(part, cell))

const placeFood = (body: readonly Cell[], seed: number): { food: Cell; seed: number } => {
  let next = seed
  for (let tries = 0; tries < 200; tries += 1) {
    next = (next * 1103515245 + 12345) % 2147483648
    const food: Cell = [next % COLUMNS, Math.floor(next / COLUMNS) % ROWS]
    if (!isBlocked(body, food)) return { food, seed: next }
  }

  return { food: [0, 0], seed: next }
}

const fresh = (seed: number): Game => {
  const body: Cell[] = [
    [4, 4],
    [3, 4],
    [2, 4],
  ]

  return { body, heading: [1, 0], turn: null, score: 0, isAuto: true, restartIn: 0, ...placeFood(body, seed) }
}

const steer = (game: Game): Cell => {
  const [dx, dy] = game.heading
  const head = game.body[0] ?? [0, 0]
  const options: Cell[] = [game.heading, [-dy, dx], [dy, -dx]]
  const open = options.filter(way => !isBlocked(game.body.slice(0, -1), [head[0] + way[0], head[1] + way[1]]))
  const reach = (way: Cell): number =>
    Math.abs(head[0] + way[0] - game.food[0]) + Math.abs(head[1] + way[1] - game.food[1])

  return [...open].sort((one, other) => reach(one) - reach(other))[0] ?? game.heading
}

const advance = (game: Game): Game => {
  if (game.restartIn > 0) {
    return game.restartIn === 1 ? fresh(game.seed) : { ...game, restartIn: game.restartIn - 1 }
  }

  const wanted = game.isAuto ? steer(game) : (game.turn ?? game.heading)
  const isReversal = wanted[0] === -game.heading[0] && wanted[1] === -game.heading[1]
  const heading = isReversal ? game.heading : wanted
  const head = game.body[0] ?? [0, 0]
  const next: Cell = [head[0] + heading[0], head[1] + heading[1]]
  const isEating = isAt(next, game.food)
  const trail = isEating ? game.body : game.body.slice(0, -1)

  if (isBlocked(trail, next)) return { ...game, restartIn: RESTART_TICKS }

  const body = [next, ...trail]

  return {
    ...game,
    body,
    heading,
    turn: null,
    score: game.score + (isEating ? 1 : 0),
    ...(isEating ? placeFood(body, game.seed) : {}),
  }
}

const Snake: ClientModule<SnakeProps, Game> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.setState(fresh(7))
    surface.every(TICK_MS, () => {
      const now = surface.state
      if (now === undefined) return

      const after = advance(now)
      if (after.restartIn === RESTART_TICKS && now.restartIn === 0) surface.post({ score: now.score })
      surface.setState(after)
    })
    surface.onKey(event => {
      const now = surface.state
      const turn = KEYS[event.key]
      if (now !== undefined && turn !== undefined) surface.setState({ ...now, isAuto: false, turn })
    })
  }

  const game = surface.state ?? fresh(7)
  const head = game.body[0] ?? [0, 0]
  const lines = Array.from({ length: ROWS }, (_, y) => (
    <Text>
      {Array.from({ length: COLUMNS }, (_unused, x) => {
        const cell: Cell = [x, y]
        if (isAt(cell, head)) return <Text color="greenBright">██</Text>
        if (game.body.some(part => isAt(part, cell))) return <Text color="green">██</Text>
        if (isAt(cell, game.food)) return <Text color="red">██</Text>

        return <Text dimColor> ·</Text>
      })}
    </Text>
  ))
  const mode = game.restartIn > 0 ? 'game over' : game.isAuto ? 'auto-play' : 'you'

  return (
    <Box flexDirection="column">
      {lines}
      <Text wrap="truncate-end">
        score {game.score} <Text dimColor>· best {Math.max(props.best, game.score)} · {mode}</Text>
      </Text>
      <Text dimColor wrap="truncate-end">
        click the board, then arrows or WASD
      </Text>
    </Box>
  )
}

export default Snake

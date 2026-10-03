import type { ClientModule } from 'claude-code'

import type { TyperProps } from '../types'

type Falling = { text: string; x: number; y: number }
type Game = {
  falling: Falling[]
  typed: string
  score: number
  lives: number
  seed: number
  beat: number
  isStarted: boolean
  restartIn: number
}

const COLUMNS = 32
const ROWS = 9
const TICK_MS = 500
const SPAWN_EVERY = 3
const LIVES = 3
const RESTART_TICKS = 8
const SPARE = ['merge', 'branch', 'commit', 'cache', 'token', 'patch', 'build', 'lint', 'hook', 'stack', 'queue', 'parse']

const fresh = (seed: number): Game => ({
  falling: [],
  typed: '',
  score: 0,
  lives: LIVES,
  seed,
  beat: 0,
  isStarted: false,
  restartIn: 0,
})

const advance = (game: Game, words: readonly string[]): Game => {
  if (game.restartIn > 0) {
    return game.restartIn === 1 ? fresh(game.seed) : { ...game, restartIn: game.restartIn - 1 }
  }
  if (!game.isStarted) return game

  const moved = game.falling.map(word => ({ ...word, y: word.y + 1 }))
  const landed = moved.filter(word => word.y >= ROWS)
  const lives = game.lives - landed.length
  let falling = moved.filter(word => word.y < ROWS)
  let seed = game.seed

  if (game.beat % SPAWN_EVERY === 0) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    const pool = words.length > 0 ? words : SPARE
    const text = pool[Math.floor(seed / 65_536) % pool.length] ?? 'merge'
    falling = [...falling, { text, x: Math.floor(seed / 7) % Math.max(1, COLUMNS - text.length), y: 0 }]
  }

  return {
    ...game,
    falling,
    seed,
    lives,
    beat: game.beat + 1,
    typed: landed.some(word => word.text.startsWith(game.typed)) ? '' : game.typed,
    restartIn: lives <= 0 ? RESTART_TICKS : 0,
  }
}

const aimOf = (game: Game): Falling | undefined =>
  game.typed === ''
    ? undefined
    : [...game.falling].sort((one, other) => other.y - one.y).find(word => word.text.startsWith(game.typed))

const press = (game: Game, key: string): Game => {
  if (game.restartIn > 0 || !/^[a-z0-9]$/.test(key)) return game

  const started = { ...game, isStarted: true }
  const typed = `${started.typed}${key}`
  const next = started.falling.some(word => word.text.startsWith(typed))
    ? typed
    : started.falling.some(word => word.text.startsWith(key))
      ? key
      : ''
  const hit = [...started.falling].sort((one, other) => other.y - one.y).find(word => word.text === next)
  if (hit === undefined) return { ...started, typed: next }

  return {
    ...started,
    typed: '',
    score: started.score + hit.text.length,
    falling: started.falling.filter(word => word !== hit),
  }
}

const Typer: ClientModule<TyperProps, Game> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.setState(fresh(3))
    surface.every(TICK_MS, () => {
      const now = surface.state
      if (now === undefined) return

      const after = advance(now, props.words)
      if (after.restartIn === RESTART_TICKS && now.restartIn === 0) surface.post({ score: now.score })
      if (after !== now) surface.setState(after)
    })
    surface.onKey(event => {
      const now = surface.state
      if (now === undefined) return

      const after = press(now, event.key.toLowerCase())
      if (after !== now) surface.setState(after)
    })
  }

  const game = surface.state ?? fresh(3)
  const aim = aimOf(game)
  const mode = game.restartIn > 0 ? 'game over' : game.isStarted ? `${'♥'.repeat(Math.max(0, game.lives))}` : 'type to start'

  return (
    <Box flexDirection="column">
      {Array.from({ length: ROWS }, (_, y) => {
        const line = game.falling.filter(word => word.y === y).sort((one, other) => one.x - other.x)
        let at = 0

        return (
          <Text wrap="truncate-end">
            {line.length === 0 && ' '}
            {line.map(word => {
              const gap = ' '.repeat(Math.max(0, word.x - at))
              const done = word === aim ? game.typed.length : 0
              at = Math.max(at, word.x) + word.text.length

              return (
                <Text>
                  {gap}
                  <Text bold color="green">
                    {word.text.slice(0, done)}
                  </Text>
                  <Text color={y >= ROWS - 2 ? 'red' : 'white'}>{word.text.slice(done)}</Text>
                </Text>
              )
            })}
          </Text>
        )
      })}
      <Text wrap="truncate-end">
        score {game.score} <Text dimColor>· best {Math.max(props.best, game.score)} · {mode}</Text>
      </Text>
      <Text dimColor wrap="truncate-end">
        click the board, then type the falling words
      </Text>
    </Box>
  )
}

export default Typer

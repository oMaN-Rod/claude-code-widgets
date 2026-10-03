export type BreakoutGame = {
  x: number
  y: number
  dx: number
  dy: number
  bricks: string[]
  score: number
  walls: number
}

declare module 'claude-code' {
  interface PluginState {
    'breakout-widget': { isOn: boolean; game: BreakoutGame }
  }
}

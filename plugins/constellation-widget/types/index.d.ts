export type ConstellationStar = {
  across: number
  down: number
  size: number
}

export type ConstellationSky = {
  stars: ConstellationStar[]
  calls: number
  finished: number
}

declare module 'claude-code' {
  interface PluginState {
    'constellation-widget': { isOn: boolean; sky: ConstellationSky }
  }
}

export type WorldScene = {
  tick: number
  percent: number
  towers: number[]
  calls: number
  isWorking: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'world-widget': { isOn: boolean; scene: WorldScene }
  }
}

export type LifeBoard = {
  rows: string[]
  generation: number
  stale: number
}

declare module 'claude-code' {
  interface PluginState {
    'life-widget': { isOn: boolean; board: LifeBoard }
  }
}

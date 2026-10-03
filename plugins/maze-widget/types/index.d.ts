export type MazeTrek = {
  seed: number
  step: number
}

declare module 'claude-code' {
  interface PluginState {
    'maze-widget': { isOn: boolean; trek: MazeTrek }
  }
}

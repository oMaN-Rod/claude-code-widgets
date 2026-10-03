export type RainFlow = {
  phase: number
  running: number
}

declare module 'claude-code' {
  interface PluginState {
    'rain-widget': { isOn: boolean; flow: RainFlow }
  }
}

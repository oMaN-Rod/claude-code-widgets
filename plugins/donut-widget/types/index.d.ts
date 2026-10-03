export type DonutSpin = {
  phase: number
  running: number
}

declare module 'claude-code' {
  interface PluginState {
    'donut-widget': { isOn: boolean; spin: DonutSpin }
  }
}

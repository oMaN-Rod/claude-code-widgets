export type OrbitSpin = {
  phase: number
  running: number
}

declare module 'claude-code' {
  interface PluginState {
    'orbit-widget': { isOn: boolean; spin: OrbitSpin }
  }
}

export type FireworksShot = {
  at: number
  seed: number
  isDud: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'fireworks-widget': { isOn: boolean; tick: number; shots: FireworksShot[]; total: number }
  }
}

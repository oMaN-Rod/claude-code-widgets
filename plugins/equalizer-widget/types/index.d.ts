export type EqualizerMix = {
  levels: number[]
  calls: number
}

declare module 'claude-code' {
  interface PluginState {
    'equalizer-widget': { isOn: boolean; mix: EqualizerMix }
  }
}

export type GardenPlot = {
  leaves: number
  blooms: number
  wiltedUntil: number
}

declare module 'claude-code' {
  interface PluginState {
    'garden-widget': { isOn: boolean; plot: GardenPlot }
  }
}

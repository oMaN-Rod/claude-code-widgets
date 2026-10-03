export type ClocksZones = string[]

declare module 'claude-code' {
  interface PluginState {
    'clocks-widget': { isOn: boolean; tick: number; zones: ClocksZones }
  }
}

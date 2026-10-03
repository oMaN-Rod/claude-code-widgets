export type SkylineTurns = string[]

declare module 'claude-code' {
  interface PluginState {
    'skyline-widget': { isOn: boolean; turns: SkylineTurns }
  }
}

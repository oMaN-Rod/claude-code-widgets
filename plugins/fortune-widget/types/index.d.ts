export type FortuneDraw = number

declare module 'claude-code' {
  interface PluginState {
    'fortune-widget': { isOn: boolean; draw: FortuneDraw }
  }
}

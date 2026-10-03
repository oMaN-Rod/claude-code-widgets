export type TilesProps = { best: number }

declare module 'claude-code' {
  interface PluginState {
    '2048-widget': { isOn: boolean; best: number }
  }
}

export type SnakeProps = { best: number }

declare module 'claude-code' {
  interface PluginState {
    'snake-widget': { isOn: boolean; best: number }
  }
}

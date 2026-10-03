export type TetrisProps = { best: number }

declare module 'claude-code' {
  interface PluginState {
    'tetris-widget': { isOn: boolean; best: number }
  }
}

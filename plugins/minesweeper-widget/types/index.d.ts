export type MinesweeperProps = { best: number }

declare module 'claude-code' {
  interface PluginState {
    'minesweeper-widget': { isOn: boolean; best: number }
  }
}

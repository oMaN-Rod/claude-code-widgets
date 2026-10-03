export type SortingDeck = {
  bars: number[]
  cursor: number
  moved: number[]
  swaps: number
  sorted: number
}

declare module 'claude-code' {
  interface PluginState {
    'sorting-widget': { isOn: boolean; deck: SortingDeck }
  }
}

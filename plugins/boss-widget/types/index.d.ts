export type BossFight = {
  percent: number
  level: number
  downUntil: number
}

declare module 'claude-code' {
  interface PluginState {
    'boss-widget': { isOn: boolean; fight: BossFight }
  }
}

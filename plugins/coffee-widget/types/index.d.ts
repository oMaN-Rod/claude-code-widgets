export type CoffeeCup = {
  pouredAt: number
  lastsMs: number
  isNudged: boolean
  cups: number
}

declare module 'claude-code' {
  interface PluginState {
    'coffee-widget': { isOn: boolean; tick: number; cup: CoffeeCup }
  }
}

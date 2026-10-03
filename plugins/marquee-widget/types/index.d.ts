export type MarqueeSign = {
  items: string[]
  tick: number
}

declare module 'claude-code' {
  interface PluginState {
    'marquee-widget': { isOn: boolean; sign: MarqueeSign }
  }
}

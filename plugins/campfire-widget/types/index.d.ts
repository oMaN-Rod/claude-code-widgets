export type CampfireBlaze = {
  heat: number
  tick: number
}

declare module 'claude-code' {
  interface PluginState {
    'campfire-widget': { isOn: boolean; blaze: CampfireBlaze }
  }
}

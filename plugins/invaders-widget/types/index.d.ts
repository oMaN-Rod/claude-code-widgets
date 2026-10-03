export type InvadersFleet = {
  invaders: number
  downed: number
  firedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'invaders-widget': { isOn: boolean; tick: number; fleet: InvadersFleet }
  }
}

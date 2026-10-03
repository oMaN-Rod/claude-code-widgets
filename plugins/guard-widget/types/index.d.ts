export type GuardTally = {
  allow: number
  ask: number
  deny: number
  asked: Record<string, number>
  denied: Record<string, number>
}

declare module 'claude-code' {
  interface PluginState {
    'guard-widget': { isOn: boolean; tally: GuardTally }
  }
}

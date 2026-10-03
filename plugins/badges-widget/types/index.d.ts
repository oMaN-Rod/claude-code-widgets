export type BadgesStats = {
  calls: number
  streak: number
  greens: number
  edits: number
  longestTurnMs: number
  lateCalls: number
}

declare module 'claude-code' {
  interface PluginState {
    'badges-widget': { isOn: boolean; stats: BadgesStats; earned: string[] }
  }
}

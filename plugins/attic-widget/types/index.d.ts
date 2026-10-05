declare module 'claude-code' {
  interface PluginState {
    'attic-widget': {
      isOn: boolean
      book: {
        key: string
        sessions: number
        base: number
        keep: string[]
        stow: string[]
        tools: Record<string, { isEngine: boolean; isDeferred: boolean; since: number; seen: number; used: number[] }>
      }
      plan: {
        isReady: boolean
        n: number
        mode: 'dry' | 'airing' | 'blind' | 'live'
        moves: Record<string, 'away' | 'forward'>
      }
      run: {
        isCounted: boolean
        isDirty: boolean
        isMeasured: boolean
        onDemand: number
        fetched: string[]
      }
    }
  }
}

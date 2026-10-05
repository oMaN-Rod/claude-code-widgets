export type OutageSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'outage-widget': {
      isOn: OutageSwitch
      reports: {
        key: string
        name: string
        verdict: 'incident' | 'elsewhere' | 'clear' | 'unread' | 'stranger'
        checkedAt: number
        incident: {
          id: string
          name: string
          impact: 'minor' | 'major' | 'critical' | 'unknown'
          startedAt: number
          components: string[]
        } | null
        toldId: string | null
      }[]
    }
  }
}

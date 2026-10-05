export type SieveSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'sieve-widget': {
      isOn: SieveSwitch
      face: 'empty' | 'working' | 'outcome' | 'unread'
      preview: { total: number; talk: number; traffic: number; left: number; isEnough: boolean } | null
      last: {
        kind: 'sieved' | 'short' | 'asked' | 'failed'
        before: number
        after: number
        isMeasured: boolean
        kept: number
        calls: number
        lines: number
      } | null
    }
  }
}

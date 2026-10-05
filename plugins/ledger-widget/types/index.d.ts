export type LedgerSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'ledger-widget': {
      isOn: LedgerSwitch
      view: {
        key: string
        name: string
        roots: string[]
        id: string
        sessions: Record<string, { usd: number | null; at: number; size: number; isOurs: boolean }>
        scannedAt: number
        fault: boolean
      }
    }
  }
}

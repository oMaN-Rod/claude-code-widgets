export type UsageWindow = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

export type UsageSnapshot = {
  windows: UsageWindow[]
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-widget': { isOn: boolean; snapshot: UsageSnapshot | null }
  }
}

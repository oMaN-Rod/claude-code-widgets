export type ActivityCall = {
  tool: string
  detail: string
  ms: number
  isFailed: boolean
  isAsked?: boolean
}

export type ActivityLog = {
  calls: ActivityCall[]
  total: number
  failed: number
}

declare module 'claude-code' {
  interface PluginState {
    'activity-widget': { isOn: boolean; log: ActivityLog }
  }
}

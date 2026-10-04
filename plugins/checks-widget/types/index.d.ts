export type CheckRun = {
  command: string
  isPassed: boolean
  ms: number
  at: number
  isAsked?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'checks-widget': { isOn: boolean; tick: number; runs: CheckRun[] }
  }
}

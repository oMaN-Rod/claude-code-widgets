export type WatchRun = {
  command: string
  status: 'idle' | 'running' | 'passed' | 'failed'
  ms: number
  runs: number
  lines: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'watch-widget': { isOn: boolean; watch: WatchRun }
  }
}

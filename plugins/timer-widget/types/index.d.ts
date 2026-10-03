export type TimerTurns = {
  startedAt: number | null
  durations: number[]
}

declare module 'claude-code' {
  interface PluginState {
    'timer-widget': { isOn: boolean; tick: number; turns: TimerTurns }
  }
}

export type PomodoroRun = {
  kind: 'focus' | 'break' | null
  startedAt: number
  endsAt: number
  done: number
}

declare module 'claude-code' {
  interface PluginState {
    'pomodoro-widget': { isOn: boolean; tick: number; run: PomodoroRun }
  }
}

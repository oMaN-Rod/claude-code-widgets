export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type TaskRow = {
  id: string
  subject: string
  status: TaskStatus
}

declare module 'claude-code' {
  interface PluginState {
    'tasks-widget': { isOn: boolean; tasks: TaskRow[] }
  }
}

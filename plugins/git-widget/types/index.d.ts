export type GitStatus = {
  branch: string
  ahead: number
  behind: number
  staged: number
  changed: number
  untracked: number
  subject: string
}

declare module 'claude-code' {
  interface PluginState {
    'git-widget': { isOn: boolean; status: GitStatus | null }
  }
}

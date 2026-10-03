export type SessionsPeer = {
  id: string
  cwd: string
  branch: string
  isBusy: boolean
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'sessions-widget': { isOn: boolean; me: SessionsPeer; peers: SessionsPeer[] }
  }
}

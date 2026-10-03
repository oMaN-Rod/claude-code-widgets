export type CommitsRow = {
  hash: string
  subject: string
}

export type CommitsLog = {
  base: string
  rows: CommitsRow[]
  isRepo: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'commits-widget': { isOn: boolean; log: CommitsLog }
  }
}

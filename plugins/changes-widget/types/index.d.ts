export type ChangedFile = {
  path: string
  edits: number
}

declare module 'claude-code' {
  interface PluginState {
    'changes-widget': { isOn: boolean; root: string; files: ChangedFile[] }
  }
}

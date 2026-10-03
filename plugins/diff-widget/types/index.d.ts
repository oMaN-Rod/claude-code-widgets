export type DiffPatch = {
  path: string
  source: string
  added: number
  removed: number
}

declare module 'claude-code' {
  interface PluginState {
    'diff-widget': { isOn: boolean; patch: DiffPatch | null }
  }
}

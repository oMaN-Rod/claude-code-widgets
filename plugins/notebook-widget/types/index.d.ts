export type NotebookSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'notebook-widget': {
      isOn: NotebookSwitch
      book: { key: string; notes: string[]; fresh: string[]; isDue: boolean }
    }
  }
}

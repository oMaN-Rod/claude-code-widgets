export type BoardNotes = {
  goal: string
  findings: string[]
  questions: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'board-widget': { isOn: boolean; notes: BoardNotes }
  }
}

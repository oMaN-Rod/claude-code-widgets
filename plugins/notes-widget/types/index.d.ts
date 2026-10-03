export type NotesList = string[]

declare module 'claude-code' {
  interface PluginState {
    'notes-widget': { isOn: boolean; notes: NotesList }
  }
}

export type DoneSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'done-widget': {
      isOn: DoneSwitch
      list: { items: { text: string; evidence: string }[]; isDue: boolean; nudges: number }
    }
  }
}

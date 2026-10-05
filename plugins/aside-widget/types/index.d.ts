export type AsideSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'aside-widget': {
      isOn: AsideSwitch
      talk: { status: 'idle' | 'asking' | 'answered' | 'failed'; question: string; answer: string; turns: number; ticket: number }
    }
  }
}

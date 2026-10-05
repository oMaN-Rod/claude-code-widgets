export type PenSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'pen-widget': {
      isOn: PenSwitch
      pen: {
        id: string
        tool: string
        path: string
        phase: 'writing' | 'written' | 'stopped'
        lines: number
        chars: number
        pieces: number
        tail: string[]
      } | null
    }
  }
}

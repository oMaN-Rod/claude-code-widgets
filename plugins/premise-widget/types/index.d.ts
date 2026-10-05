export type PremiseSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'premise-widget': {
      isOn: PremiseSwitch
      turn: {
        id: string
        phase: 'idle' | 'live' | 'settled'
        sawThinking: boolean
        isBroken: boolean
        found: { quote: string; gist: string; isSaid: boolean }[]
      }
    }
  }
}

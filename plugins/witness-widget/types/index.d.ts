export type WitnessSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'witness-widget': {
      isOn: WitnessSwitch
      log: {
        prompts: number
        additions: number
        chars: number
        last: 'none' | 'added' | 'dropped'
        lastCount: number
        lastChars: number
        entries: { prompt: number; text: string; chars: number }[]
      }
    }
  }
}

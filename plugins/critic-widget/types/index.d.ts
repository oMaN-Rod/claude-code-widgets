export type CriticSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'critic-widget': {
      isOn: CriticSwitch
      review: {
        status: 'idle' | 'reading' | 'found' | 'clean' | 'failed'
        findings: string[]
        why: string
        isCut: boolean
        isTelling: boolean
        ticket: number
      }
    }
  }
}

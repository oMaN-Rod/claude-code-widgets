export type TrialSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'trial-widget': {
      isOn: TrialSwitch
      trial: { subject: string; runs: Record<string, { isWith: boolean; turns: number; clean: number }> }
      now: { id: string; phase: 'idle' | 'joined' | 'stalled'; isOpen: boolean; isFailing: boolean }
    }
  }
}

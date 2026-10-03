export type CountdownTarget = {
  at: number
  setAt: number
  label: string
  isRung: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'countdown-widget': { isOn: boolean; tick: number; target: CountdownTarget | null }
  }
}

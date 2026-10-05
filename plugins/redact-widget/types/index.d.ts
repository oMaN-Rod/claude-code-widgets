export type RedactSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'redact-widget': {
      isOn: RedactSwitch
      tally: {
        checked: number
        unchecked: number
        total: number
        kinds: Record<string, number>
        last: string
      }
    }
  }
}

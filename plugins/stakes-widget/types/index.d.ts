export type StakesSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'stakes-widget': {
      isOn: StakesSwitch
      cwd: string | undefined
      log: { command: string; line: string; kind: 'loss' | 'safe' | 'unmeasured' }[]
    }
  }
}

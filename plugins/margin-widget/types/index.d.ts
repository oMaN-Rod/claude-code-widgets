export type MarginSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'margin-widget': {
      isOn: MarginSwitch
      marks: { passage: string; remark: string; isCut: boolean }[]
      asking: number
      isSent: boolean
      said: string
    }
  }
}

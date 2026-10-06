export type EarshotSwitch = boolean

export type EarshotMessage = {
  text: string
  at: number
  turnId: string
  isTimed: boolean
  status: 'waiting' | 'heard' | 'missed' | 'own'
  settledAt: number
  changes: string[]
  changeCount: number
  readCount: number
  isPushed: boolean
}

export type EarshotCall = { id: string; label: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'earshot-widget': {
      isOn: EarshotSwitch
      messages: EarshotMessage[]
      flight: EarshotCall[]
    }
  }
}

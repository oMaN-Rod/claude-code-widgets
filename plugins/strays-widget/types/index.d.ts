export type StraysSwitch = boolean

export type StraysRow = {
  port: number
  pid: number
  born: number
  name: string
  hint: string
  turn: number
  isEarlier: boolean
  isShared: boolean
}

export type StraysWindow = { from: number; to: number; turn: number; isDocker: boolean }

declare module 'claude-code' {
  interface PluginState {
    'strays-widget': {
      isOn: StraysSwitch
      watch: {
        opened: number
        turn: number
        host: number
        at: number
        fault: string
        isBusy: boolean
        isQueued: boolean
        seen: string[] | null
        calls: StraysWindow[]
        rows: StraysRow[]
      }
    }
  }
}

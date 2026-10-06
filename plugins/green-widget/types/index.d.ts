export type GreenSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'green-widget': {
      isOn: GreenSwitch
      tick: number
      isPaused: boolean
      fault: string
      place: {
        top: string
        key: string
      }
      runs: {
        key: string
        command: string
        greenAt: number
        sha: string
        tree: string
        redAt: number
        fileCount: number
        added: number
        removed: number
        files: {
          path: string
          added: number
          removed: number
        }[]
        isSeen: boolean
      }[]
    }
  }
}

export type LandmarksSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'landmarks-widget': {
      isOn: LandmarksSwitch
      trail: {
        marks: {
          id: number
          turn: number
          kind: 'you' | 'edit' | 'red' | 'green' | 'commit' | 'asked'
          label: string
          row: string
          isNear: boolean
          isGone: boolean
        }[]
        edited: string[]
        mood: 'none' | 'red' | 'green'
        turn: number
        last: number
        waiting: number
        said: string
      }
    }
  }
}

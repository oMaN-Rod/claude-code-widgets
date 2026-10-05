export type SkimmedSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'skimmed-widget': {
      isOn: SkimmedSwitch
      book: {
        turn: number
        isBusy: boolean
        pages: {
          id: string
          turn: number
          isGrown: boolean
          isDoubted: boolean
          moved: number
          columns: number
          of: number
          size: number
          weight: number
          read: { at: number; weight: number; isFenced: boolean }
          on: { first: number; last: number; at: number } | null
          ms: number[]
          caveats: { text: string; before: number; weight: number }[]
        }[]
      }
    }
  }
}

export type BallReading = {
  question: string
  answer: number
}

declare module 'claude-code' {
  interface PluginState {
    '8ball-widget': { isOn: boolean; reading: BallReading | null }
  }
}

export type StreamFlow = {
  buckets: number[]
  turnChars: number
  peak: number
  isLive: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'stream-widget': { isOn: boolean; flow: StreamFlow }
  }
}

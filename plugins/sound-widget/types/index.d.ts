export type SoundRoll = {
  notes: number[]
  played: number
  isMuted: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'sound-widget': { isOn: boolean; roll: SoundRoll }
  }
}

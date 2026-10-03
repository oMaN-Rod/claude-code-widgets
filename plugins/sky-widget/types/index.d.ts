export type SkyPhase = 'night' | 'dawn' | 'day' | 'dusk'

declare module 'claude-code' {
  interface PluginState {
    'sky-widget': { isOn: boolean; tick: number; startedAt: number }
  }
}

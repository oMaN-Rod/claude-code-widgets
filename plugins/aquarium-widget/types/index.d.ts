export type Swimmer = { id: string; kind: 'tool' | 'agent'; until?: number }

declare module 'claude-code' {
  interface PluginState {
    'aquarium-widget': { isOn: boolean; tick: number; swimmers: Swimmer[] }
  }
}

export type SigilEntry = {
  id: number
  seed: number
  calls: number
}

export type SigilSession = {
  id: number
  tools: string
  fails: number
  turns: number
}

declare module 'claude-code' {
  interface PluginState {
    'sigil-widget': { isOn: boolean; session: SigilSession; gallery: SigilEntry[] }
  }
}

export type SquiggleSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'squiggle-widget': {
      isOn: SquiggleSwitch
      index: { status: 'building' | 'ready' | 'failed'; source: 'git' | 'folder'; count: number; isPartial: boolean; isStale: boolean; builtAt: number }
      paths: string[]
      found: { word: string; verdict: 'found' | 'missing'; to: string; matches: number }[]
    }
  }
}

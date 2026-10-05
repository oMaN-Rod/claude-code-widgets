export type FootnotesSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'footnotes-widget': {
      isOn: FootnotesSwitch
      last:
        | {
            refs: { token: string; name: string; kind: 'path' | 'symbol'; verdict: 'found' | 'missing' | 'short'; lines: number; isHard: boolean }[]
            unchecked: '' | 'no repository' | 'git failed'
          }
        | null
    }
  }
}

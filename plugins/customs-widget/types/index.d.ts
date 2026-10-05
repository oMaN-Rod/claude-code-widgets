export type CustomsSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'customs-widget': {
      isOn: CustomsSwitch
      list: {
        key: string
        name: string
        registry: 'npm' | 'pypi'
        kind: 'checking' | 'missing' | 'new' | 'behind' | 'ok' | 'unchecked' | 'skipped'
        fact: string
        line: string
        held: boolean
      }[]
      trusted: string[]
    }
  }
}

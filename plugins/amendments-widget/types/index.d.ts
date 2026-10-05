export type AmendmentsSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'amendments-widget': {
      isOn: AmendmentsSwitch
      held: {
        key: string
        texts: Record<string, string>
      }
      report: {
        kind: 'none' | 'new' | 'baseline' | 'same' | 'changed' | 'fault'
        version: string
        since: string
        age: string
        sections: number
        tools: number
        rows: {
          id: string
          label: string
          fact: string
        }[]
        fault: '' | 'read' | 'write'
      }
    }
  }
}

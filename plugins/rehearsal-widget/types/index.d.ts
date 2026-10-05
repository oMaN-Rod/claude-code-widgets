declare module 'claude-code' {
  interface PluginState {
    'rehearsal-widget': {
      isOn: boolean
      book: {
        key: string
        name: string
        root: string
        isDirty: boolean
        calls: { key: string; tool: string; input: Record<string, unknown>; label: string; seenAt: number; isKept: boolean }[]
      }
      verdicts: Record<string, { decision: 'allow' | 'ask' | 'deny' | 'unknown'; why: string }>
      run: {
        mode: string
        isRehearsing: boolean
        shown: string[]
      }
    }
  }
}

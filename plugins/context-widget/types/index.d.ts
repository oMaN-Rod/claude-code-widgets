export type ContextMode = 'auto' | 'detailed' | 'grid' | 'top' | 'bar' | 'line'

export type ContextSlice = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

export type ContextSnapshot = {
  model: string
  totalTokens: number
  maxTokens: number
  percentage: number
  slices: ContextSlice[]
}

declare module 'claude-code' {
  interface PluginState {
    'context-widget': {
      isOn: boolean
      mode: ContextMode
      snapshot: ContextSnapshot | null
    }
  }
}

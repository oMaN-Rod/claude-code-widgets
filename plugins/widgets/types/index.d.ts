export type WidgetsPlace = 'side' | 'above' | 'below'

declare module 'claude-code' {
  interface PluginState {
    'widgets': { site: WidgetsPlace | 'off'; last: WidgetsPlace }
  }
}

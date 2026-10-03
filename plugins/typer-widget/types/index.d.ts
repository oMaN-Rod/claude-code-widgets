export type TyperProps = { best: number; words: string[] }

declare module 'claude-code' {
  interface PluginState {
    'typer-widget': { isOn: boolean; best: number; words: string[] }
  }
}

export type TodosHit = {
  tag: string
  path: string
  line: number
  text: string
}

export type TodosScan = {
  hits: TodosHit[]
  isRepo: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'todos-widget': { isOn: boolean; scan: TodosScan }
  }
}

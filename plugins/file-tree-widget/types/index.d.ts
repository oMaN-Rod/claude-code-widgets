export type TreeEntry = { name: string; isDir: boolean }

export type TreeDir = { entries: TreeEntry[]; hidden: number }

export type Tree = {
  root: string
  dirs: Record<string, TreeDir>
  expanded: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'file-tree-widget': { isOn: boolean; tree: Tree | null }
  }
}

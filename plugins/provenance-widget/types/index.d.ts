export type ProvenanceSwitch = boolean

export type ProvenanceSaid = { text: string; at: number }

export type ProvenanceAsk = { text: string; at: number; files: string[] }

export type ProvenanceCommit = { short: string; subject: string; at: number; session: string; asks: ProvenanceAsk[] }

export type ProvenanceProject = { commits: ProvenanceCommit[]; sizes: Record<string, number>; scannedAt: number }

export type ProvenanceMap = { projects: Record<string, ProvenanceProject> }

export type ProvenanceKind = 'traced' | 'promptless' | 'untraced' | 'uncommitted' | 'unread'

declare module 'claude-code' {
  interface PluginState {
    'provenance-widget': {
      isOn: ProvenanceSwitch
      repo: {
        key: string
        name: string
        roots: string[]
        isRepo: boolean
        records: number
        traced: number
        total: number
      }
      run: {
        ask: ProvenanceSaid | null
        pending: Record<string, ProvenanceSaid>
        isLooking: boolean
      }
      finding: {
        kind: ProvenanceKind
        path: string
        first: number
        last: number
        hash: string
        lines: number
        of: number
        commitAt: number
        subject: string
        session: string
        ask: string
        askAt: number
        isMoved: boolean
      } | null
    }
  }
}

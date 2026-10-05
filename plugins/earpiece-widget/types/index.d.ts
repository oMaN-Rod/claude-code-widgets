export type EarpieceSwitch = boolean

export type EarpieceRow = {
  id: string
  number: number
  description: string
  status: 'live' | 'waiting' | 'done' | 'failed' | 'stopped'
  tool: string
  line: string
  isUnread: boolean
  whisper: { note: string; status: 'sent' | 'heard' | 'missed'; seen: number | null } | null
}

declare module 'claude-code' {
  interface PluginState {
    'earpiece-widget': {
      isOn: EarpieceSwitch
      roster: { rows: EarpieceRow[]; next: number; skipped: string[]; readAt: number; isBlind: boolean }
      lap: { begun: number; landed: number }
    }
  }
}

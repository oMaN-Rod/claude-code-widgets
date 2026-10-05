export type CollisionSwitch = boolean

export type CollisionHeld = { path: string; at: number }

export type CollisionMeet = {
  key: string
  path: string
  place: string
  at: number
  state: 'stopped' | 'changed' | 're-read'
}

export type CollisionWatch = {
  dir?: string | null
  slot: string
  wrote: string | null
  mine: Record<string, CollisionHeld>
  seen: Record<string, number>
  meets: CollisionMeet[]
  others: number
  isBlind: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'collision-widget': { isOn: CollisionSwitch; watch: CollisionWatch }
  }
}

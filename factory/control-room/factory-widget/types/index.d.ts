export type FactoryStation = 'ideation' | 'design' | 'build' | 'inspection' | 'shipping'

export type FactoryStamp = {
  at: string
  station: FactoryStation
  by: string
  result: 'pass' | 'send-back' | 'reject' | 'scrap'
  reason: string
  to?: FactoryStation
  subject?: string
}

export type FactoryEntry = {
  at: string
  agent: string
  station: string
  action: string
}

export type FactoryOrder = {
  id: string
  kind: 'new' | 'rebuild'
  widget: string | null
  status: 'open' | 'shipped' | 'scrapped'
  station: FactoryStation
  holder: string | null
  closedAt: string | null
  sendBacks: number
  stamps: FactoryStamp[]
  log: FactoryEntry[]
}

export type FactoryBoard = {
  at: string
  orders: FactoryOrder[]
}

declare module 'claude-code' {
  interface PluginState {
    'factory-widget': { isOn: boolean; board: FactoryBoard | null }
  }
}

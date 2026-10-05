import { markdown } from './markdown.js'
import { ROLE, createWorld, isBusy, syncClock } from './world.js'

const feed = document.getElementById('feed')
const stats = document.getElementById('stats')
const tiles = document.getElementById('stations')
const pulse = document.getElementById('pulse')
const pick = document.getElementById('pick')
const frame = document.getElementById('window')
const frameTitle = document.getElementById('window-title')
const frameBody = document.getElementById('window-body')
const map = document.getElementById('map')

const POLL_MS = 3000
const REPLAY_MS = 200
// A replay runs the factory's clock this many times faster, sits through at most REPLAY_QUIET_MS of nothing being logged,
// and speeds up further when the whole history would take longer than REPLAY_LONGEST_MS. Crates and crew move REPLAY_PACE times faster.
const REPLAY_RATE = 300
const REPLAY_QUIET_MS = 8 * 60_000
const REPLAY_LONGEST_MS = 180_000
const REPLAY_PACE = 10
const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4]
const STATIONS = [
  { name: 'ideation', title: 'Ideas loft', icon: '💡', resident: 'examiner', who: 'Three inventors, then the examiner', out: 'idea.md', gate: 'The examiner rejects any idea that is a variation on an existing widget. Its default answer is no.' },
  { name: 'design', title: 'Drafting studio', icon: '📐', resident: 'designer', who: 'The designer, reviewed by the inspector', out: 'spec.md', gate: 'The inspector rejects only blocking faults. Everything else goes to the machinist as notes.' },
  { name: 'build', title: 'Workshop', icon: '🔨', resident: 'machinist', who: 'The machinist', out: 'the widget, on the floor', gate: 'The checker passes: the rules of the standard, the validator, the tests and a render sweep.' },
  { name: 'inspection', title: 'Inspection lab', icon: '🔍', resident: 'inspector', who: 'The inspector, who did not build it', out: 'inspection.md', gate: 'Checker, renders and a live run. Then pass, send back to build or design, or scrap.' },
  { name: 'shipping', title: 'Shipping bay', icon: '📦', resident: 'clerk', who: 'The shipping clerk', out: 'demo page, README row, one commit', gate: 'The demo smoke test runs clean.' },
]
const PLACES = [...STATIONS.map(spec => ({ type: 'station', id: spec.name, label: spec.title.split(' ')[0], icon: spec.icon })), { type: 'dock', label: 'Truck', icon: '🚚' }, { type: 'scrap', label: 'Kiln', icon: '🔥' }]
const asked = new URLSearchParams(location.search)
const isDemo = asked.has('demo')
const isReplay = !isDemo && asked.has('replay')
const state = { board: null, key: '', selected: { type: 'home' }, doc: null, tab: 'log', isOpen: false }

const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...kids.filter(kid => kid !== null && kid !== undefined))

  return node
}
const clock = at => (at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
const short = order => (order.widget || 'unnamed').replace(/-widget$/, '')
const orders = () => state.board?.orders ?? []
const count = tokens => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(tokens)
const costLine = order => (order.cost ? `${order.cost.guessed > 0 ? '≈ ' : ''}${count(order.cost.tokens)} tokens · $${order.cost.usd.toFixed(2)}${order.status === 'open' ? ' so far' : ''}` : 'cost not recorded')
const costDetail = ({ cost }) =>
  cost
    ? `${count(cost.input)} input, ${count(cost.output)} output, ${count(cost.cacheWrite)} cache writes and ${count(cost.cacheRead)} cache reads over ${cost.agents} agent${cost.agents === 1 ? '' : 's'}, at API list prices. Not counted: the director's session and live runs.${cost.guessed > 0 ? ' Output tokens are partly estimated.' : ''}${cost.unpriced > 0 ? ` ${count(cost.unpriced)} tokens ran on a model with no known price.` : ''}`
    : 'The agents that worked on this order left no transcripts on this machine.'
const turnedBack = () => orders().flatMap(order => order.stamps.filter(stamp => stamp.result !== 'pass').map(stamp => ({ stamp, order })))
const sameTarget = (one, other) => one.type === other.type && one.id === other.id

const facts = rows => el('dl', { className: 'facts' }, ...rows.flatMap(([name, value]) => [el('dt', { textContent: name }), typeof value === 'string' ? el('dd', { textContent: value }) : el('dd', {}, value)]))

const stampLine = (stamp, order) => {
  const line = el(
    'li',
    { className: order ? 'link' : '' },
    el('span', { className: `tag ${stamp.result}`, textContent: stamp.result === 'send-back' ? `sent back to ${stamp.to}` : stamp.result }),
    el('span', { className: 'dim', textContent: `${clock(stamp.at)} · ${order ? `${order.id} · ` : ''}${stamp.station} · ${stamp.by}${stamp.subject ? ` · "${stamp.subject}"` : ''}` }),
    el('div', { className: order ? 'brief' : '', textContent: stamp.reason }),
  )
  if (order) line.addEventListener('click', () => select({ type: 'order', id: order.id }, true))

  return line
}

const orderRow = order => {
  const where = order.status === 'open' ? `${order.station} · ${isBusy(order) ? (order.holder ?? 'at work') : 'waiting'}` : `${order.status} ${clock(order.closedAt)}`
  const row = el('li', {}, el('b', { textContent: `${order.id} ${short(order)}` }), el('span', { className: 'dim', textContent: `  ${where} · ${order.agents} agents` }))
  row.addEventListener('click', () => select({ type: 'order', id: order.id }, true))

  return row
}

const journey = order => {
  const at = STATIONS.findIndex(spec => spec.name === order.station)
  const row = el('div', { className: 'row' })
  STATIONS.forEach((spec, index) => {
    const back = order.stamps.filter(stamp => stamp.station === spec.name && stamp.result !== 'pass').length
    const isSkipped = order.kind === 'rebuild' && spec.name === 'ideation'
    const cls = isSkipped ? '' : order.status === 'shipped' ? 'done' : order.status === 'scrapped' && index === at ? 'dead' : index < at ? 'done' : index === at ? 'here' : ''
    if (index > 0) row.append(el('span', { className: 'arrow', textContent: '›' }))
    row.append(el('span', { className: `chip ${cls}` }, isSkipped ? '—' : spec.name, back > 0 ? el('sup', { textContent: ` ${back}` }) : null))
  })

  return row
}

const showDoc = (order, name, holder, tabs) => {
  for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.dataset.name === name))
  if (name === 'stamps') {
    state.doc = { id: order.id, name, text: '' }
    holder.replaceChildren(order.stamps.length === 0 ? el('p', { className: 'dim', textContent: 'No stamps yet.' }) : el('ul', { className: 'stamps' }, ...order.stamps.toReversed().map(stamp => stampLine(stamp))))

    return
  }
  const isMarkdown = name.endsWith('.md')
  const body = isMarkdown ? el('div', { className: 'md' }) : el('pre')
  const put = text => {
    if (isMarkdown) body.replaceChildren(...markdown(text))
    else body.textContent = text
  }
  holder.replaceChildren(body)
  const kept = state.doc?.id === order.id && state.doc?.name === name ? state.doc.text : 'Loading…'
  put(kept)
  state.doc = { id: order.id, name, text: kept }
  if (name === 'log') {
    state.doc.text = order.log.map(entry => `${clock(entry.at)}  ${entry.agent} @ ${entry.station}\n          ${entry.action}`).join('\n')
    body.textContent = state.doc.text

    return
  }
  fetch(`/api/doc?id=${order.id}&name=${name}`)
    .then(reply => (reply.ok ? reply.text() : 'This document is no longer there.'))
    .then(text => {
      if (state.doc?.id !== order.id || state.doc?.name !== name) return
      state.doc.text = text
      put(text)
    })
}

const orderWindow = order => {
  const turned = order.stamps.filter(stamp => stamp.result !== 'pass')
  const holder = el('div')
  const tabs = el('div', { className: 'tabs' })
  const names = ['stamps', 'log', ...order.docs]
  for (const name of names) {
    const label = name === 'stamps' ? `stamps · ${order.stamps.length - turned.length} passed, ${turned.length} turned back` : name === 'log' ? `log · ${order.log.length}` : name.replace(/\.(md|txt)$/, '')
    const tab = el('button', { type: 'button', textContent: label })
    tab.dataset.name = name
    tab.addEventListener('click', () => showDoc(order, name, holder, tabs))
    tabs.append(tab)
  }
  frameTitle.textContent = `${order.id} · ${order.widget ?? 'unnamed'}`
  frameBody.replaceChildren(
    el('p', { className: 'dim', textContent: order.brief }),
    journey(order),
    facts([
      ['Kind', order.kind === 'new' ? 'new, invented by the line' : 'rebuild'],
      ['Status', order.status === 'open' ? `at ${order.station}, ${isBusy(order) ? `${order.holder ?? 'someone'} at work` : 'waiting'}` : `${order.status} ${new Date(order.closedAt).toLocaleString()}`],
      ['Opened', new Date(order.openedAt).toLocaleString()],
      ['Agents used', String(order.agents)],
      ['Cost', el('span', {}, el('b', { textContent: costLine(order) }), el('div', { className: 'dim', textContent: costDetail(order) }))],
      ['Sent back', `${order.sendBacks} time${order.sendBacks === 1 ? '' : 's'}`],
    ]),
    tabs,
    holder,
  )
  showDoc(order, state.doc?.id === order.id && names.includes(state.doc.name) ? state.doc.name : 'stamps', holder, tabs)
}

const stationWindow = spec => {
  const here = orders().filter(order => order.status === 'open' && order.station === spec.name)
  const stamps = orders().flatMap(order => order.stamps.filter(stamp => stamp.station === spec.name).map(stamp => ({ stamp, order })))
  const turned = stamps.filter(({ stamp }) => stamp.result !== 'pass')
  frameTitle.textContent = `${spec.icon} ${spec.title}`
  frameBody.replaceChildren(
    facts([
      ['Station', spec.name],
      ['Crew', spec.who],
      ['Output', spec.out],
      ['Gate', spec.gate],
      ['Passed', String(stamps.length - turned.length)],
      ['Turned back', String(turned.length)],
    ]),
    el('h4', { textContent: `Here now · ${here.length}` }),
    here.length === 0 ? el('p', { className: 'dim', textContent: 'Nothing in this area.' }) : el('ul', { className: 'rows' }, ...here.map(orderRow)),
    el('h4', { textContent: 'Turned back at this gate' }),
    turned.length === 0 ? el('p', { className: 'dim', textContent: 'Nothing turned back here.' }) : el('ul', { className: 'stamps' }, ...turned.reverse().map(({ stamp, order }) => stampLine(stamp, order))),
  )
}

const listWindow = (title, groups) => {
  frameTitle.textContent = title
  frameBody.replaceChildren(
    ...(title.includes('truck') ? [el('p', {}, el('a', { className: 'link', href: DEMO, target: '_blank', rel: 'noopener', textContent: 'See the shipped widgets running on the demo page ›' }))] : []),
    ...groups.flatMap(([heading, list, empty]) => [el('h4', { textContent: `${heading} · ${list.length}` }), list.length === 0 ? el('p', { className: 'dim', textContent: empty }) : el('ul', { className: 'rows' }, ...list.map(orderRow))]),
  )
}

const byStatus = status => orders().filter(order => order.status === status)

const paintWindow = () => {
  frame.hidden = !state.isOpen
  if (!state.isOpen) return
  const { type, id } = state.selected
  const order = orders().find(known => known.id === id)
  const spec = STATIONS.find(known => known.name === id)
  if (type === 'order' && order !== undefined) orderWindow(order)
  else if (type === 'station' && spec !== undefined) stationWindow(spec)
  else if (type === 'dock') listWindow('🚚 On the truck', [['Shipped', byStatus('shipped').reverse(), 'Nothing shipped yet.']])
  else if (type === 'scrap') listWindow('🔥 In the kiln', [['Scrapped', byStatus('scrapped').reverse(), 'Nothing scrapped.']])
  else listWindow('All orders', [['On the line', byStatus('open'), 'The line is clear.'], ['Shipped', byStatus('shipped').reverse(), 'Nothing shipped yet.'], ['Scrapped', byStatus('scrapped').reverse(), 'Nothing scrapped.']])
}

const paintPick = () => {
  const { type, id } = state.selected
  const order = orders().find(known => known.id === id)
  const spec = STATIONS.find(known => known.name === id)
  pick.hidden = type === 'home' || type === 'orders' || (type === 'order' && order === undefined)
  if (pick.hidden) return

  const badge = el('div', { className: 'badge' })
  const lines = []
  let title = ''
  if (type === 'order') {
    title = `${order.id} · ${short(order)}`
    badge.textContent = String(Number(order.id.slice(3)))
    badge.style.background = order.status === 'scrapped' ? '#6b6258' : order.kind === 'new' ? '#f2c14e' : '#6cb6e6'
    lines.push(
      el('div', { className: 'line', textContent: order.status === 'open' ? `${order.kind === 'new' ? 'New invention' : 'Rebuild'} · ${isBusy(order) ? `${order.holder ?? 'someone'} at work` : 'waiting'} · ${order.agents} agents · sent back ${order.sendBacks}×` : `${order.status} ${new Date(order.closedAt).toLocaleString()} · ${order.agents} agents` }),
      el('div', { className: 'line', textContent: `💰 ${costLine(order)}` }),
      journey(order),
    )
  } else if (type === 'station') {
    const here = byStatus('open').filter(known => known.station === spec.name)
    const turned = turnedBack().filter(({ stamp }) => stamp.station === spec.name).length
    title = spec.title
    badge.textContent = spec.icon
    lines.push(el('div', { className: 'line', textContent: spec.gate }), el('div', { className: 'row' }, el('span', { className: 'chip here', textContent: `${here.length} here now` }), el('span', { className: 'chip dead', textContent: `${turned} turned back` }), el('span', { className: 'chip', textContent: spec.who })))
  } else {
    const list = byStatus(type === 'dock' ? 'shipped' : 'scrapped')
    title = type === 'dock' ? 'The truck' : 'The scrap kiln'
    badge.textContent = type === 'dock' ? '🚚' : '🔥'
    lines.push(
      el('div', { className: 'line', textContent: type === 'dock' ? 'Shipped widgets ride here: each is one commit.' : 'Orders scrapped at a gate end here, with the reason on record.' }),
      el('div', { className: 'row' }, el('span', { className: 'chip here', textContent: `${list.length} ${type === 'dock' ? 'shipped' : 'scrapped'}` }), ...list.slice(-4).map(known => el('span', { className: 'chip done', textContent: short(known) }))),
    )
  }
  const close = el('button', { type: 'button', className: 'close', textContent: '✕' })
  close.setAttribute('aria-label', 'Close')
  close.addEventListener('click', () => select({ type: 'home' }))
  const more = el('button', { type: 'button', textContent: 'Open details ›' })
  more.addEventListener('click', () => {
    state.isOpen = true
    paintWindow()
  })
  const demo =
    type === 'dock' ? el('a', { className: 'link', href: DEMO, target: '_blank', rel: 'noopener', textContent: 'See them on the demo page ›' })
    : type === 'order' && order.status === 'shipped' ? el('a', { className: 'link', href: `${DEMO}#w=${encodeURIComponent(short(order))}`, target: '_blank', rel: 'noopener', textContent: 'Try it on the demo page ›' })
    : null
  pick.replaceChildren(badge, el('h3', { textContent: title }), ...lines, el('div', { className: 'row' }, more, demo), close)
}

const tileOf = new Map(
  PLACES.map(place => {
    const count = el('span', { className: 'count' })
    const tile = el('button', { type: 'button', className: 'tile' }, el('span', { className: 'disc', textContent: place.icon }), place.label, count)
    tile.addEventListener('click', () => select({ type: place.type, id: place.id }, false, true))
    tiles.append(tile)

    return [place, { tile, count }]
  }),
)
const paintTiles = () => {
  for (const [place, { tile, count }] of tileOf) {
    const total = place.type === 'station' ? byStatus('open').filter(order => order.station === place.id).length : byStatus(place.type === 'dock' ? 'shipped' : 'scrapped').length
    count.textContent = String(total)
    count.hidden = total === 0
    tile.setAttribute('aria-pressed', String(sameTarget(place, state.selected)))
  }
}

const paintStats = () => {
  const open = byStatus('open')
  const busy = open.filter(isBusy).length
  const stat = (icon, text, share) => el('div', { className: 'stat' }, share === undefined ? null : Object.assign(el('span', { className: 'fill' }), { style: `width:${Math.round(share * 100)}%` }), el('span', { className: 'icon', textContent: icon }), el('span', { textContent: text }))
  stats.replaceChildren(
    stat('🧰', `On the line: ${open.length}`),
    stat('🚚', `Shipped: ${byStatus('shipped').length}`),
    stat('⚡', `At work: ${busy}/${open.length}`, open.length === 0 ? 0 : busy / open.length),
    stat('↩', `Turned back: ${turnedBack().length}`),
    stat('🤖', `Agent shifts: ${orders().reduce((sum, order) => sum + order.agents, 0)}`),
  )
}

const paintFeed = () => {
  for (const tab of document.getElementById('log-tabs').children) tab.setAttribute('aria-pressed', String(tab.dataset.tab === state.tab))
  if (state.tab === 'turned') {
    const turned = turnedBack().slice(-30).reverse()
    feed.replaceChildren(
      ...(turned.length === 0 ? [el('li', { className: 'dim', textContent: 'Nothing turned back.' })] : turned.map(({ stamp, order }) => {
        const row = el('li', { title: stamp.reason }, el('b', { className: stamp.result, textContent: `${order.id} ${stamp.station}` }), `: ${stamp.result === 'send-back' ? `sent back to ${stamp.to}` : stamp.result}. ${stamp.reason}`)
        row.addEventListener('click', () => select({ type: 'order', id: order.id }, true))

        return row
      })),
    )

    return
  }
  const latest = orders().flatMap(order => order.log.map(entry => ({ ...entry, id: order.id }))).sort((one, other) => one.at.localeCompare(other.at)).slice(-40)
  feed.replaceChildren(
    ...latest.map(entry => {
      const who = el('b', { textContent: entry.agent })
      who.style.color = ROLE[entry.agent] ?? ''
      const row = el('li', { title: entry.action }, el('span', { className: 'dim', textContent: `${clock(entry.at)} ${entry.id} ` }), who, `: ${entry.action}`)
      row.addEventListener('click', () => select({ type: 'order', id: entry.id }))

      return row
    }),
  )
  feed.scrollTop = feed.scrollHeight
}

const paint = () => {
  paintPick()
  paintTiles()
  paintWindow()
}

const DEMO = '/demo/'

const select = (target, isOpen = false, isFocused = false) => {
  if (target.type === 'demo') {
    window.open(DEMO, '_blank', 'noopener')

    return
  }
  state.selected = target
  state.isOpen = isOpen || (state.isOpen && target.type !== 'home')
  history.replaceState(null, '', `${location.pathname}${location.search}${target.type === 'home' ? '' : `#${target.type}${target.id ? `=${target.id}` : ''}`}`)
  world.show(orders(), state.selected)
  if (isFocused) world.focus(target)
  paint()
}

const drawMap = () => {
  const chart = world.chart()
  const ctx = map.getContext('2d')
  const pad = 8
  const scale = Math.min((map.width - pad * 2) / chart.room.wide, (map.height - pad * 2) / chart.room.deep)
  const px = x => map.width / 2 + x * scale
  const pz = z => map.height / 2 + z * scale
  ctx.fillStyle = '#0a1c25'
  ctx.fillRect(0, 0, map.width, map.height)
  ctx.fillStyle = '#39414f'
  ctx.fillRect(px(-chart.room.wide / 2), pz(-chart.room.deep / 2), chart.room.wide * scale, chart.room.deep * scale)
  for (const area of chart.areas) {
    const [wide, deep] = [7, 5]
    ctx.fillStyle = area.color
    ctx.globalAlpha = sameTarget({ type: 'station', id: area.name }, state.selected) ? 1 : 0.75
    ctx.fillRect(px(area.x - wide / 2), pz(area.z - deep / 2), wide * scale, deep * scale)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = '#c4453d'
  ctx.fillRect(px(chart.truck[0] - 4), pz(chart.truck[1] - 1.8), 8 * scale, 3.6 * scale)
  ctx.fillStyle = '#ff8a3c'
  ctx.fillRect(px(chart.kiln[0] - 2), pz(chart.kiln[1] - 2), 4 * scale, 4 * scale)
  ctx.strokeStyle = '#9fe8f2'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.beginPath()
  chart.line.forEach(([x, z], at) => (at === 0 ? ctx.moveTo(px(x), pz(z)) : ctx.lineTo(px(x), pz(z))))
  ctx.stroke()
  for (const member of chart.crew) {
    ctx.fillStyle = member.color
    ctx.fillRect(px(member.x) - 1.5, pz(member.z) - 1.5, 3, 3)
  }
  for (const crate of chart.crates) {
    ctx.fillStyle = '#0a1c25'
    ctx.fillRect(px(crate.x) - 4, pz(crate.z) - 4, 8, 8)
    ctx.fillStyle = crate.color
    ctx.fillRect(px(crate.x) - 3, pz(crate.z) - 3, 6, 6)
    if (sameTarget({ type: 'order', id: crate.id }, state.selected)) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.strokeRect(px(crate.x) - 5.5, pz(crate.z) - 5.5, 11, 11)
    }
  }
  ctx.strokeStyle = '#f6b93b'
  ctx.lineWidth = 1.5
  ctx.strokeRect(px(chart.eye.x) - 16, pz(chart.eye.z) - 11, 32, 22)
  map.dataset.scale = String(scale)
}

const rehearsal = { tick: 0, orders: [] }
const rehearse = () => {
  const now = new Date().toISOString()
  const note = (order, agent, action) => order.log.push({ at: now, agent, station: order.station, action })
  if (rehearsal.orders.every(order => order.status !== 'open')) {
    rehearsal.orders = ['echo', 'tide', 'ember', 'quill', 'orbit'].map((name, at) => ({
      id: `WO-${String(at + 1).padStart(4, '0')}`,
      kind: at % 2 === 0 ? 'new' : 'rebuild',
      widget: `${name}-widget`,
      brief: 'A rehearsal order: nothing here is real.',
      status: 'open',
      station: at % 2 === 0 ? 'ideation' : 'design',
      holder: at % 2 === 0 ? 'examiner' : 'designer',
      openedAt: now,
      closedAt: null,
      sendBacks: 0,
      stamps: [],
      log: [{ at: now, agent: 'director', station: at % 2 === 0 ? 'ideation' : 'design', action: 'opened the order' }],
      docs: [],
    }))
  }
  rehearsal.tick += 1
  const open = rehearsal.orders.filter(order => order.status === 'open')
  const order = open[rehearsal.tick % open.length]
  if (rehearsal.tick % 2 === 0 && order !== undefined) {
    const at = STATIONS.findIndex(spec => spec.name === order.station)
    const roll = (rehearsal.tick * 7 + Number(order.id.slice(3)) * 3) % 10
    const stamp = (result, reason, to) => order.stamps.push({ at: now, station: order.station, by: order.holder, result, reason, ...(to ? { to } : {}) })
    if (order.station === 'inspection' && roll < 4 && order.sendBacks === 0) {
      stamp('send-back', 'The card wraps at 20 columns', 'build')
      note(order, 'inspector', 'stamped send-back to build: the card wraps at 20 columns')
      order.sendBacks += 1
      order.station = 'build'
    } else if (order.station === 'design' && order.id === 'WO-0004') {
      stamp('scrap', 'A variation on an existing widget')
      note(order, 'inspector', 'stamped scrap: a variation on an existing widget')
      order.status = 'scrapped'
      order.closedAt = now
    } else if (order.station === 'shipping') {
      stamp('pass', 'On the demo page; smoke test clean')
      note(order, 'clerk', 'stamped pass: shipped')
      order.status = 'shipped'
      order.closedAt = now
    } else {
      stamp('pass', 'Meets the gate')
      note(order, order.holder, 'stamped pass')
      order.station = STATIONS[at + 1].name
    }
    order.holder = order.status === 'open' ? STATIONS.find(spec => spec.name === order.station).resident : null
    if (order.status === 'open') note(order, order.holder, `took the order at ${order.station}`)
  }

  return { at: now, orders: rehearsal.orders.map(known => ({ ...known, agents: known.log.length })) }
}

const isShift = entry => entry.action.startsWith('took the order') || entry.agent === 'inventor'
const asOf = (order, at) => {
  const log = order.log.filter(entry => entry.at <= at)
  const stamps = order.stamps.filter(stamp => stamp.at <= at)
  const seen = { ...order, log, stamps, status: 'open', station: order.kind === 'new' ? 'ideation' : 'design', holder: null, closedAt: null, cost: null, workedAt: null }
  for (const stamp of stamps) {
    const here = STATIONS.findIndex(spec => spec.name === seen.station)
    if (stamp.result === 'send-back') seen.station = stamp.to
    else if (stamp.result === 'scrap') Object.assign(seen, { status: 'scrapped', closedAt: stamp.at })
    else if (stamp.result === 'pass' && here === STATIONS.length - 1) Object.assign(seen, { status: 'shipped', closedAt: stamp.at })
    else if (stamp.result === 'pass') seen.station = STATIONS[here + 1].name
  }
  for (const entry of log) {
    if (entry.action.startsWith('took the order')) seen.holder = entry.agent
    else if (entry.action.startsWith('stamped') && !entry.action.startsWith('stamped reject')) seen.holder = null
  }
  const isNamed = order.kind !== 'new' || log.some(entry => entry.action.startsWith('named the widget'))

  return { ...seen, widget: isNamed ? order.widget : null, title: isNamed ? order.title : null, sendBacks: stamps.filter(stamp => stamp.result === 'send-back').length, agents: log.filter(isShift).length }
}

const tape = { orders: null, marks: [], played: [], rate: REPLAY_RATE, speed: 1, at: 0, seenAt: 0, isDone: false, isPaused: false }
const replay = async () => {
  if (tape.orders === null) {
    tape.orders = (await (await fetch('/api/board')).json()).orders
    tape.marks = [...new Set(tape.orders.flatMap(order => order.log.map(entry => Date.parse(entry.at))))].sort((one, other) => one - other)
    tape.played = tape.marks.map(() => 0)
    for (let i = 1; i < tape.marks.length; i += 1) tape.played[i] = tape.played[i - 1] + Math.min(tape.marks[i] - tape.marks[i - 1], REPLAY_QUIET_MS)
    tape.rate = Math.max(REPLAY_RATE, (tape.played.at(-1) ?? 0) / REPLAY_LONGEST_MS)
    tape.seenAt = performance.now()
  }
  if (!tape.isPaused) tape.at += (performance.now() - tape.seenAt) * tape.rate * tape.speed
  tape.seenAt = performance.now()
  const played = tape.at
  const next = tape.played.findIndex(mark => mark > played)
  tape.isDone = next < 0
  const at = new Date(tape.isDone ? (tape.marks.at(-1) ?? Date.now()) : tape.marks[next - 1] + played - tape.played[next - 1]).toISOString()

  return { at, isDone: tape.isDone, orders: tape.orders.filter(order => order.openedAt <= at).map(order => asOf(order, at)) }
}
const day = at => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const poll = async () => {
  if (isReplay && tape.isDone) return
  try {
    const board = isDemo ? rehearse() : isReplay ? await replay() : await (await fetch('/api/board')).json()
    const key = JSON.stringify(board.orders)
    state.board = board
    syncClock(board.at)
    world.show(orders(), state.selected)
    pulse.textContent = isDemo ? `rehearsal · ${clock(board.at)}` : isReplay ? `${board.isDone ? 'replay done' : tape.isPaused ? 'paused' : 'replay'} · ${day(board.at)}` : `live · ${clock(board.at)}`
    pulse.classList.add('live')
    paintStats()
    if (key !== state.key) {
      state.key = key
      paintFeed()
      paint()
    }
  } catch {
    pulse.textContent = 'not connected'
    pulse.classList.remove('live')
  }
}

const world = createWorld(document.getElementById('floor'), target => select(target))
const speed = document.getElementById('speed')
const setSpeed = value => {
  tape.speed = REPLAY_SPEEDS.includes(value) ? value : 1
  speed.textContent = `${tape.speed}×`
  world.setPace(tape.isPaused ? 0 : REPLAY_PACE * tape.speed)
  try {
    localStorage.setItem('replay-speed', String(tape.speed))
  } catch {}
}
const pause = document.getElementById('pause')
const setPaused = isPaused => {
  tape.isPaused = isPaused
  pause.textContent = isPaused ? '▶' : '⏸'
  pause.setAttribute('aria-label', isPaused ? 'Play the replay' : 'Pause the replay')
  world.setPace(isPaused ? 0 : REPLAY_PACE * tape.speed)
}
if (isReplay) {
  pause.hidden = false
  pause.addEventListener('click', () => setPaused(!tape.isPaused))
  document.addEventListener('keydown', event => {
    if (event.key !== ' ' || event.target.closest('button, input, select, textarea')) return
    event.preventDefault()
    setPaused(!tape.isPaused)
  })
  speed.hidden = false
  document.getElementById('rehearse').hidden = true
  speed.addEventListener('click', () => setSpeed(REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(tape.speed) + 1) % REPLAY_SPEEDS.length]))
  let kept = 1
  try {
    kept = Number(localStorage.getItem('replay-speed') ?? 1)
  } catch {}
  setSpeed(kept)
}
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  if (state.isOpen) {
    state.isOpen = false
    paintWindow()
  } else {
    select({ type: 'home' })
  }
})
document.getElementById('home').addEventListener('click', () => world.resetView())
document.getElementById('window-close').addEventListener('click', () => {
  state.isOpen = false
  paintWindow()
})
document.getElementById('orders').addEventListener('click', () => select({ type: 'orders' }, true))
const mode = (name, isOn) => {
  asked.delete('demo')
  asked.delete('replay')
  if (!isOn) asked.set(name, '1')
  location.search = asked.toString()
}
document.getElementById('rehearse').textContent = isDemo ? '■ Live floor' : '▶ Rehearsal'
document.getElementById('rehearse').addEventListener('click', () => mode('demo', isDemo))
document.getElementById('replay').textContent = isReplay ? '■ Live floor' : '⏪ Replay'
document.getElementById('replay').addEventListener('click', () => mode('replay', isReplay))
for (const tab of document.getElementById('log-tabs').children) {
  tab.addEventListener('click', () => {
    state.tab = tab.dataset.tab
    paintFeed()
  })
}
map.addEventListener('click', event => {
  const edge = map.getBoundingClientRect()
  const scale = Number(map.dataset.scale) * (edge.width / map.width)
  world.panTo((event.clientX - edge.left - edge.width / 2) / scale, (event.clientY - edge.top - edge.height / 2) / scale)
})

const [type, id] = location.hash.slice(1).split('=')
if (['order', 'station', 'dock', 'scrap'].includes(type)) state.selected = { type, id }
paintStats()
paint()
poll()
setInterval(poll, isReplay ? REPLAY_MS : POLL_MS)
setInterval(drawMap, 200)

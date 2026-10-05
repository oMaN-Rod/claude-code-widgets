export const meta = {
  name: 'widget-line',
  description: 'Run open work orders through the Widget Factory line: ideation, design, build, inspection, shipping',
  whenToUse: 'After opening work orders with factory/tools/order.ts. Pass args { orders: [{ id, kind, from? }], limits? }; add inline: true if the crew agent types are not loaded in this session. A run starts at most limits.agentsPerRun agents (10 unless raised).',
  phases: [
    { title: 'Ideation', detail: 'three inventors, then the examiner' },
    { title: 'Design', detail: 'designer writes the spec, inspector reviews it' },
    { title: 'Build', detail: 'machinist builds from the scaffold' },
    { title: 'Inspection', detail: 'inspector judges the widget; send-backs loop here' },
    { title: 'Shipping', detail: 'clerk ships one widget at a time' },
  ],
}

const LIMITS = { agentsPerRun: 10, agentsPerOrder: 10, inventors: 3, ideationRounds: 1, specPasses: 2, sendBacks: 2, directorLive: false, ...args.limits }
const HAPPY_PATH = { ideation: LIMITS.inventors + 1, design: 2, build: 1, inspection: 1, shipping: 1 }
const STATIONS = ['ideation', 'design', 'build', 'inspection', 'shipping']
const OVER = 'over budget'
const LENSES = [
  { key: 'capability', text: 'Untapped capability: what the mods API and Claude Code make possible that no widget has used yet.' },
  { key: 'person', text: 'The person at the terminal: what they need in the moment, what wears them down, what they would otherwise have to remember or go and look up.' },
  { key: 'delight', text: 'Delight: what would make the person laugh, feel something, or stop and think. Human nature, not utility.' },
]

const IDEAS = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          name: { type: 'string' },
          shows: { type: 'string' },
          why: { type: 'string' },
          api: { type: 'string' },
          cost: { type: 'string' },
        },
        required: ['title', 'name', 'shows', 'why', 'api', 'cost'],
      },
    },
  },
  required: ['ideas'],
}
const EXAM = {
  type: 'object',
  properties: {
    isChosen: { type: 'boolean' },
    name: { type: 'string' },
    title: { type: 'string' },
    rejections: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, reason: { type: 'string' } }, required: ['title', 'reason'] } },
    advice: { type: 'string' },
  },
  required: ['isChosen', 'rejections'],
}
const REVIEW = {
  type: 'object',
  properties: { isPassed: { type: 'boolean' }, faults: { type: 'string', description: 'Blocking faults only; empty when passed' } },
  required: ['isPassed', 'faults'],
}
const BUILT = {
  type: 'object',
  properties: { result: { type: 'string', enum: ['pass', 'send-back'] }, note: { type: 'string' } },
  required: ['result', 'note'],
}
const VERDICT = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['pass', 'build', 'design', 'scrap', 'hold'] }, summary: { type: 'string' } },
  required: ['verdict', 'summary'],
}
const SHIPPED = {
  type: 'object',
  properties: { isShipped: { type: 'boolean' }, commit: { type: 'string' }, note: { type: 'string' } },
  required: ['isShipped', 'note'],
}

const isInline = args.inline === true
const spent = { run: 0 }

const startOf = order => order.from ?? (order.kind === 'new' ? 'ideation' : 'design')

const estimate = order => STATIONS.slice(STATIONS.indexOf(startOf(order))).reduce((sum, station) => sum + HAPPY_PATH[station], 0)

const hand = (id, role, task, options) => {
  if (spent.run >= LIMITS.agentsPerRun || (spent[id] ?? 0) >= LIMITS.agentsPerOrder) throw new Error(OVER)
  spent.run += 1
  spent[id] = (spent[id] ?? 0) + 1

  return agent(
    isInline ? `Your role on the Widget Factory floor is defined in .claude/agents/${role}.md. Read that file first and follow it exactly.\n\n${task}` : task,
    { ...(isInline ? {} : { agentType: role }), ...options },
  )
}

const record = (id, command) =>
  agent(`Run exactly this command from the repository root and return its output, nothing else:\n\nbun factory/tools/order.ts ${command}`, {
    label: `record:${id}`,
    effort: 'low',
  })

const ideate = async id => {
  const turned = []
  for (let round = 1; round <= LIMITS.ideationRounds; round += 1) {
    const sheets = await parallel(
      LENSES.slice(0, LIMITS.inventors).map(lens => () =>
        hand(
          id,
          'inventor',
          `Work order ${id}. Your lens: ${lens.text}${turned.length > 0 ? `\n\nAlready rejected for this order, with reasons. Do not bring these back:\n${JSON.stringify(turned)}` : ''}`,
          { label: `invent:${lens.key}:${id}`, phase: 'Ideation', schema: IDEAS },
        ),
      ),
    )
    const ideas = sheets.filter(Boolean).flatMap(sheet => sheet.ideas)
    const exam = await hand(id, 'examiner', `Work order ${id}, round ${round}. The inventors' ideas:\n${JSON.stringify(ideas, null, 2)}`, {
      label: `examine:${id}`,
      phase: 'Ideation',
      schema: EXAM,
    })
    if (exam?.isChosen) return exam
    turned.push(...(exam?.rejections ?? []))
    log(`${id}: no idea survived round ${round}`)
  }
  await record(id, `stamp ${id} examiner scrap --reason "No idea survived the ideation gate"`)

  return null
}

const design = async (id, notes) => {
  let faults = notes
  for (let pass = 1; pass <= LIMITS.specPasses; pass += 1) {
    await hand(id, 'designer', `Work order ${id}.${faults ? `\n\nWhat the last spec got wrong:\n${faults}` : ''}`, { label: `design:${id}`, phase: 'Design' })
    const review = await hand(id, 'inspector', `Review the spec of work order ${id}. It is at the design station.`, {
      label: `review-spec:${id}`,
      phase: 'Design',
      schema: REVIEW,
    })
    if (review?.isPassed) return true
    faults = review?.faults ?? 'The reviewer did not answer.'
  }

  return false
}

const work = async (order, at) => {
  const { id } = order
  if (at.station === 'ideation') {
    const idea = await ideate(id)
    if (idea === null) return { id, status: 'scrapped', note: 'No idea survived the ideation gate.' }
    log(`${id}: the examiner chose ${idea.name}`)
    at.station = 'design'
  }

  let station = at.station
  let notes = ''
  let sendBacks = 0
  while (station !== 'shipping') {
    at.station = station
    if (station === order.until) return { id, status: 'held', note: `Stopped before ${station}, as asked; resume with from: '${station}'.` }
    if (station === 'design') {
      if (!(await design(id, notes))) return { id, status: 'held', note: `The spec failed review ${LIMITS.specPasses} times.` }
      station = 'build'
    }
    else if (station === 'build') {
      at.station = 'build'
      const built = await hand(id, 'machinist', `Work order ${id}.${sendBacks > 0 ? ' It was sent back to you: read inspection.md in the order folder and fix every finding.' : ''}`, {
        label: `build:${id}`,
        phase: 'Build',
        schema: BUILT,
      })
      if (built === null) return { id, status: 'held', note: 'The machinist did not finish.' }
      if (built.result === 'send-back') {
        sendBacks += 1
        notes = built.note
        station = 'design'
      } else {
        station = 'inspection'
        at.station = station
        if (LIMITS.directorLive) return { id, status: 'held', note: "Built. Make the live run named in the spec, save it as live.txt in the order folder, then resume with from: 'inspection'." }
      }
    }
    else if (station === 'inspection') {
      at.station = 'inspection'
      const judged = await hand(id, 'inspector', `Inspect the widget of work order ${id}. It is at the inspection station.`, {
        label: `inspect:${id}`,
        phase: 'Inspection',
        schema: VERDICT,
      })
      if (judged === null) return { id, status: 'held', note: 'The inspector did not finish.' }
      if (judged.verdict === 'scrap') return { id, status: 'scrapped', note: judged.summary }
      if (judged.verdict === 'hold') return { id, status: 'held', note: judged.summary }
      if (judged.verdict === 'pass') station = 'shipping'
      else {
        sendBacks += 1
        notes = judged.summary
        station = judged.verdict
      }
    }
    if (station !== 'shipping' && sendBacks > LIMITS.sendBacks) return { id, status: 'held', note: `Sent back ${sendBacks} times; last reason: ${notes}` }
  }

  at.station = 'shipping'

  return { id, status: 'inspected', note: '' }
}

const make = async order => {
  const at = { station: startOf(order) }
  try {
    return { ...(await work(order, at)), station: at.station }
  } catch (error) {
    if (error?.message !== OVER) throw error

    return { id: order.id, status: 'held', station: at.station, note: `Out of agents at ${at.station}; resume with from: '${at.station}'.` }
  }
}

const admitted = []
const waiting = []
let reserved = 0
for (const order of args.orders) {
  const cost = estimate(order)
  if (reserved + cost <= LIMITS.agentsPerRun) {
    admitted.push(order)
    reserved += cost
  } else {
    waiting.push({ id: order.id, status: 'waiting', station: startOf(order), agents: 0, note: `Needs about ${cost} agents and ${LIMITS.agentsPerRun - reserved} of ${LIMITS.agentsPerRun} were unreserved. Left on the floor for the next run.` })
  }
}
log(`Admitted ${admitted.map(order => order.id).join(', ') || 'nothing'} (about ${reserved} of ${LIMITS.agentsPerRun} agents)${waiting.length > 0 ? `; left waiting: ${waiting.map(order => order.id).join(', ')}` : ''}`)

const made = await pipeline(admitted, order => make(order))
const results = made.map((result, at) => result ?? { id: admitted[at].id, status: 'held', station: startOf(admitted[at]), note: 'The line stopped on this order.' })

phase('Shipping')
for (const result of results) {
  if (result.status !== 'inspected') continue
  try {
    const shipped = await hand(result.id, 'clerk', `Ship work order ${result.id}. It is at the shipping station.`, { label: `ship:${result.id}`, phase: 'Shipping', schema: SHIPPED })
    result.status = shipped?.isShipped ? 'shipped' : 'held'
    result.note = shipped?.isShipped ? (shipped.commit ?? '') : (shipped?.note ?? 'The clerk did not finish.')
  } catch (error) {
    if (error?.message !== OVER) throw error
    result.status = 'held'
    result.note = "Out of agents at shipping; resume with from: 'shipping'."
  }
}
log(`Started ${spent.run} of ${LIMITS.agentsPerRun} agents`)

return { agents: spent.run, limits: LIMITS, orders: [...results.map(result => ({ ...result, agents: spent[result.id] ?? 0 })), ...waiting] }

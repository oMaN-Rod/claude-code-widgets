;(() => {
  const taped = window.DEMO || { styles: [], widgets: [] }
  const styles = taped.styles
  const width = 38
  const tapes = new Map(taped.widgets.map(widget => [widget.name, widget.frames]))
  const widgets = window.DEMO_CATALOG.map(entry => ({ ...entry, frames: tapes.get(entry.name) || [] })).sort((a, b) => a.name.localeCompare(b.name))
  const CW = 8, CH = 17, FONT = 13
  const FAMILY = getComputedStyle(document.documentElement).getPropertyValue('--mono')
  const TERM = '#262626', FG = '#d6d6da', EDGE = '#7c7d88'
  const STEP_MS = 620, HOLD_MS = 2600
  const DEFAULT_COLOR = 0x01000000
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  const QUADS = { '▖': 4, '▗': 8, '▘': 1, '▙': 13, '▚': 9, '▛': 7, '▜': 11, '▝': 2, '▞': 6, '▟': 14 }
  const INK = {
    red: '#e5484d', green: '#3dd68c', yellow: '#f5d90a', blue: '#55aaff', magenta: '#d37fe0', cyan: '#4cc9e0', white: '#ffffff',
    gray: '#8b8d98', grey: '#8b8d98', black: '#1c1c1f',
    redBright: '#ff7b80', greenBright: '#6ff0b0', yellowBright: '#ffec70', blueBright: '#8cc8ff', magentaBright: '#eaa5f5', cyanBright: '#8fe6f5', whiteBright: '#ffffff',
    claude: '#d97757', warning: '#f5d90a', permission: '#b1b9f9', promptBorder: '#9a9cab', inactive: '#6b6c78', success: '#3dd68c', error: '#e5484d', suggestion: '#55aaff', text: FG,
  }
  const SWIPE = 24
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'return', Backspace: 'backspace', Delete: 'delete', Tab: 'tab', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown' }
  const hex = value => (value === 'default' ? null : /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : value)
  const inkOf = value => (value === undefined ? undefined : (INK[value] ?? value))
  const rgb = value => `#${(value & 0xffffff).toString(16).padStart(6, '0')}`

  const glyph = (ctx, ch, x, y, color) => {
    const code = ch.codePointAt(0)
    ctx.fillStyle = color
    if (ch === '█') return ctx.fillRect(x, y, CW, CH)
    if (ch === '▀') return ctx.fillRect(x, y, CW, CH / 2)
    if (ch === '▄') return ctx.fillRect(x, y + CH / 2, CW, CH / 2)
    if (ch === '▌') return ctx.fillRect(x, y, CW / 2, CH)
    if (ch === '▐') return ctx.fillRect(x + CW / 2, y, CW / 2, CH)
    if (code >= 0x2581 && code <= 0x2587) { const h = ((code - 0x2580) / 8) * CH; return ctx.fillRect(x, y + CH - h, CW, h) }
    if (code >= 0x2589 && code <= 0x258f) return ctx.fillRect(x, y, ((0x2590 - code) / 8) * CW, CH)
    if (code >= 0x2591 && code <= 0x2593) {
      ctx.globalAlpha = (code - 0x2590) * 0.25
      ctx.fillRect(x, y, CW, CH)
      ctx.globalAlpha = 1
      return
    }
    if (QUADS[ch] !== undefined) {
      const bits = QUADS[ch]
      if (bits & 1) ctx.fillRect(x, y, CW / 2, CH / 2)
      if (bits & 2) ctx.fillRect(x + CW / 2, y, CW / 2, CH / 2)
      if (bits & 4) ctx.fillRect(x, y + CH / 2, CW / 2, CH / 2)
      if (bits & 8) ctx.fillRect(x + CW / 2, y + CH / 2, CW / 2, CH / 2)
      return
    }
    const mx = x + CW / 2, my = y + CH / 2
    if ('─│╭╮╰╯━╌'.includes(ch)) {
      ctx.strokeStyle = color
      ctx.lineWidth = ch === '━' ? 2 : 1
      ctx.setLineDash(ch === '╌' ? [3, 2] : [])
      ctx.beginPath()
      const px = Math.floor(mx) + 0.5, py = Math.floor(my) + 0.5, r = 4
      if (ch === '─' || ch === '━' || ch === '╌') { ctx.moveTo(x, py); ctx.lineTo(x + CW, py) }
      if (ch === '│') { ctx.moveTo(px, y); ctx.lineTo(px, y + CH) }
      if (ch === '╭') { ctx.moveTo(px, y + CH); ctx.lineTo(px, py + r); ctx.quadraticCurveTo(px, py, px + r, py); ctx.lineTo(x + CW, py) }
      if (ch === '╮') { ctx.moveTo(px, y + CH); ctx.lineTo(px, py + r); ctx.quadraticCurveTo(px, py, px - r, py); ctx.lineTo(x, py) }
      if (ch === '╰') { ctx.moveTo(px, y); ctx.lineTo(px, py - r); ctx.quadraticCurveTo(px, py, px + r, py); ctx.lineTo(x + CW, py) }
      if (ch === '╯') { ctx.moveTo(px, y); ctx.lineTo(px, py - r); ctx.quadraticCurveTo(px, py, px - r, py); ctx.lineTo(x, py) }
      ctx.stroke()
      ctx.setLineDash([])
      return
    }
    if (ch !== ' ') ctx.fillText(ch, mx, my + 1)
  }

  const sheet = (columns, rows) => {
    const canvas = document.createElement('canvas')
    canvas.width = columns * CW * ratio
    canvas.height = rows * CH * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    return { canvas, ctx }
  }

  const paint = (ctx, frame, rows) => {
    ctx.fillStyle = TERM
    ctx.fillRect(0, 0, width * CW, rows * CH)
    frame.forEach((row, line) => {
      let column = 0
      for (const [text, id] of row) {
        const [fg, bg, bold, italic, reverse] = styles[id]
        let ink = hex(fg) || FG, paper = hex(bg)
        const frameInk = hex(fg) ? ink : EDGE
        if (reverse) [ink, paper] = [paper || TERM, ink]
        ctx.font = `${italic ? 'italic ' : ''}${bold ? '600 ' : ''}${FONT}px ${FAMILY}`
        for (const ch of text) {
          const x = column * CW, y = line * CH
          if (paper && paper.toLowerCase() !== TERM) { ctx.fillStyle = paper; ctx.fillRect(x, y, CW, CH) }
          glyph(ctx, ch, x, y, '─│╭╮╰╯'.includes(ch) ? frameInk : ink)
          column += 1
        }
      }
    })
  }

  const raster = props => {
    const { canvas, ctx } = sheet(props.columns, props.rows)
    const bytes = Uint8Array.from(atob(props.cells), letter => letter.charCodeAt(0))
    const words = new Uint32Array(bytes.buffer)
    for (let at = 0; at < props.columns * props.rows; at += 1) {
      const x = (at % props.columns) * CW, y = Math.floor(at / props.columns) * CH
      const paper = words[at * 3 + 2], ink = words[at * 3 + 1]
      if (paper !== DEFAULT_COLOR) { ctx.fillStyle = rgb(paper); ctx.fillRect(x, y, CW, CH) }
      glyph(ctx, String.fromCodePoint(words[at * 3] || 32), x, y, ink === DEFAULT_COLOR ? FG : rgb(ink))
    }
    canvas.className = 'raster'
    canvas.style.width = `${props.columns}ch`
    canvas.style.height = `${props.rows * CH}px`

    return canvas
  }

  const mountClient = (live, props) => {
    const made = live.clients.get(props.key)
    if (made !== undefined) {
      made.props = { ...made.props, ...props.props }
      made.draw()

      return made.node
    }
    const table = live.engine.clients[props.module] || {}
    const component = table.default || Object.values(table).find(value => typeof value === 'function')
    const node = document.createElement('div')
    node.className = 'client'
    node.tabIndex = 0
    node.style.width = `${props.width}ch`
    node.style.height = `${props.height * CH}px`
    node.title = 'Click, then use the keyboard'
    const held = { node, props: props.props, state: undefined, keys: [], pointers: [], timers: [], draw: () => {} }
    const surface = {
      elements: DemoEngine.elements,
      get state() { return held.state },
      setState: next => { held.state = next; held.draw() },
      every: (ms, run) => { const id = setInterval(() => { if (live.isSeen) run() }, ms); held.timers.push(id); return { cancel: () => clearInterval(id) } },
      after: (ms, run) => { const id = setTimeout(run, ms); return { cancel: () => clearTimeout(id) } },
      onKey: run => void held.keys.push(run),
      onPointer: run => void held.pointers.push(run),
      post: data => { live.engine.message(data).then(result => { if (result && result.props) { held.props = { ...held.props, ...result.props }; held.draw() } }) },
      columns: props.width,
      rows: props.height,
      isFocused: false,
    }
    let isQueued = false
    held.draw = () => {
      if (isQueued) return
      isQueued = true
      requestAnimationFrame(() => {
        isQueued = false
        try {
          node.replaceChildren(build(live, component(held.props, surface), 'column'))
        } catch (error) {
          console.error(error)
        }
      })
    }
    node.addEventListener('keydown', event => {
      if (event.key === 'Escape') return node.blur()
      const key = KEYS[event.key] ?? (event.key.length === 1 ? event.key : undefined)
      if (key === undefined || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      for (const run of held.keys) run({ key, ...(event.shiftKey ? { shift: true } : {}) })
    })
    const point = (type, event) => {
      const box = node.getBoundingClientRect()
      const x = Math.floor(((event.clientX - box.left) / box.width) * props.width)
      const y = Math.floor(((event.clientY - box.top) / box.height) * props.height)
      for (const run of held.pointers) run({ type, x, y, button: event.button === 2 ? 'right' : 'left' })
    }
    let touch
    node.addEventListener('touchstart', event => { touch = event.touches.length === 1 ? event.touches[0] : undefined }, { passive: true })
    node.addEventListener('touchend', event => {
      const end = event.changedTouches[0]
      if (touch === undefined || end === undefined) return
      const [dx, dy] = [end.clientX - touch.clientX, end.clientY - touch.clientY]
      touch = undefined
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return
      event.preventDefault()
      const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      for (const run of held.keys) run({ key })
    })
    node.addEventListener('mousedown', event => point('down', event))
    node.addEventListener('mouseup', event => point('up', event))
    node.addEventListener('contextmenu', event => event.preventDefault())
    live.clients.set(props.key, held)
    held.draw()

    return node
  }

  const build = (live, node, flow) => {
    if (node === null || node === undefined || typeof node === 'boolean') return document.createTextNode('')
    if (typeof node !== 'object') return document.createTextNode(String(node))
    const props = node.props || {}
    const kids = node.children || []
    if (node.type === 'Raster') return raster(props)
    if (node.type === 'Client') return mountClient(live, props)
    if (node.type === 'Text' || node.type === 'Button') {
      const el = document.createElement(flow === 'inline' ? 'span' : 'div')
      el.className = `t${props.dimColor ? ' dim' : ''}${props.bold ? ' bold' : ''}${props.italic ? ' italic' : ''}${props.underline ? ' underline' : ''}`
      if (props.color !== undefined) el.style.color = inkOf(props.color)
      if (props.backgroundColor !== undefined) el.style.background = inkOf(props.backgroundColor)
      if (props.inverse) el.classList.add('inverse')
      if (flow !== 'inline') el.classList.add(props.wrap === 'truncate-end' || props.wrap === 'truncate' ? 'cut' : props.wrap === 'truncate-start' ? 'cut-start' : flow === 'row' ? 'cell' : 'wrap')
      if (node.type === 'Button') {
        el.textContent = props.label ?? ''
        el.classList.add('press')
        el.addEventListener('click', () => Promise.resolve(props.onPress?.()).then(() => live.draw()))

        return el
      }
      el.append(...kids.map(kid => build(live, kid, 'inline')))

      return el
    }
    if (node.type === 'Code') {
      const el = document.createElement('div')
      el.className = 'code'
      for (const line of String(props.source ?? '').replace(/\n$/, '').split('\n')) {
        const row = document.createElement('div')
        row.className = `cut${line.startsWith('+') ? ' plus' : line.startsWith('-') ? ' minus' : ' dim'}`
        row.textContent = line === '' ? ' ' : line
        el.append(row)
      }

      return el
    }
    const el = document.createElement('div')
    const direction = props.flexDirection === 'column' ? 'column' : 'row'
    el.className = 'b'
    el.style.flexDirection = direction
    if (props.columnGap) el.style.columnGap = `${props.columnGap}ch`
    if (props.rowGap) el.style.rowGap = `${props.rowGap * CH}px`
    if (props.justifyContent) el.style.justifyContent = props.justifyContent
    if (props.alignItems) el.style.alignItems = props.alignItems
    if (props.flexWrap) el.style.flexWrap = props.flexWrap
    if (props.flexGrow !== undefined) { el.style.flexGrow = props.flexGrow; el.style.flexBasis = '0' }
    if (props.flexShrink !== undefined) el.style.flexShrink = props.flexShrink
    if (props.width !== undefined) el.style.width = `${props.width}ch`
    if (props.height !== undefined) el.style.height = `${props.height * CH}px`
    if (props.paddingLeft) el.style.paddingLeft = `${props.paddingLeft}ch`
    if (props.borderStyle) el.classList.add('card')
    else if (props.paddingX) el.style.padding = `0 ${props.paddingX}ch`
    el.append(...kids.map(kid => build(live, kid, direction)))

    return el
  }

  const cardOf = node => {
    if (node === null || typeof node !== 'object') return undefined
    if (node.props && node.props.borderStyle) return node
    for (const kid of node.children || []) {
      const found = cardOf(kid)
      if (found !== undefined) return found
    }

    return undefined
  }

  const lives = new Set()
  const short = name => name.replace(/-widget$/, '')
  const fillOf = command => `${command.split(/ [\[<]/)[0]} `

  const boot = live => {
    if (live.engine !== undefined || live.isRecorded) return
    try {
      live.engine = DemoEngine.create(live.widget.name, {
        onChange: () => live.draw(),
        onToast: text => live.say(text, 'toast'),
        onPrint: text => live.say(text, 'said'),
      })
    } catch (error) {
      return live.record(error)
    }
    live.engine.start().then(() => live.draw(), error => live.record(error))
  }

  const terminal = widget => {
    const node = document.createElement('div')
    node.className = 'term'
    node.innerHTML =
      '<div class="bar"><u></u><u></u><u></u><span></span><em></em></div><div class="screen"></div><div class="out"></div>' +
      '<form class="line"><b>❯</b><input type="text" spellcheck="false" autocomplete="off" aria-label="Type a prompt or a slash command"></form>'
    const screen = node.querySelector('.screen')
    const out = node.querySelector('.out')
    const input = node.querySelector('input')
    const badge = node.querySelector('em')
    node.querySelector('.bar span').textContent = `/${widget.name}`
    input.placeholder = 'a prompt, or a /command'
    const go = document.createElement('button')
    go.type = 'button'
    go.className = 'go'
    go.textContent = '▶ run a turn'
    const chips = widget.commands.map(command => {
      const code = document.createElement('code')
      code.textContent = command
      code.tabIndex = 0
      code.title = 'Put this in the prompt'
      code.addEventListener('click', () => { input.value = fillOf(command); input.focus() })

      return code
    })
    const live = {
      widget, node, go, chips, input, title: short(widget.name), engine: undefined, clients: new Map(), isSeen: false,
      isRecorded: window.DEMO_MODS === undefined || window.DEMO_MODS.mods[widget.name] === undefined,
      isDrawing: false, isStale: false, at: still ? widget.frames.length - 1 : 0, due: 0, tape: undefined,
    }
    live.press = key => {
      for (const held of live.clients.values()) for (const run of held.keys) run({ key })
    }
    live.say = (text, kind) => {
      const row = document.createElement('div')
      row.className = kind
      row.textContent = text
      out.replaceChildren(row)
      if (kind === 'toast') setTimeout(() => row.isConnected && row.remove(), 6000)
    }
    live.record = error => {
      if (error !== undefined) console.warn(widget.name, error)
      live.isRecorded = true
      live.engine?.stop()
      node.classList.add('recorded')
      go.hidden = true
      if (widget.frames.length === 0) {
        badge.textContent = 'unavailable'
        screen.replaceChildren(Object.assign(document.createElement('div'), { className: 't dim wrap', textContent: 'This widget could not start in the browser.' }))

        return
      }
      const rows = Math.max(...widget.frames.map(frame => frame.length))
      const { canvas, ctx } = sheet(width, rows)
      canvas.style.width = '100%'
      canvas.style.aspectRatio = `${width * CW} / ${rows * CH}`
      live.tape = { ctx, rows }
      screen.replaceChildren(canvas)
      badge.textContent = 'recording'
      paint(ctx, widget.frames[live.at], rows)
    }
    live.draw = async () => {
      if (live.isRecorded || live.engine === undefined) return
      if (!live.isSeen || live.isDrawing) return void (live.isStale = true)
      live.isDrawing = true
      live.isStale = false
      try {
        const card = cardOf(await live.engine.render(width))
        const next = card === undefined ? Object.assign(document.createElement('div'), { className: 't dim wrap', textContent: `Switched off. /${widget.name} on brings the card back.` }) : build(live, card, 'column')
        screen.replaceChildren(next)
        go.disabled = live.engine.isBusy
        go.textContent = live.engine.isBusy ? '● working' : '▶ run a turn'
      } catch (error) {
        live.record(error)
      }
      live.isDrawing = false
      if (live.isStale) live.draw()
    }
    live.see = isSeen => {
      live.isSeen = isSeen
      if (isSeen) { boot(live); live.draw() }
    }
    live.turn = () => { if (live.engine !== undefined) { live.engine.turn(); live.draw() } }
    go.addEventListener('click', live.turn)
    node.querySelector('form').addEventListener('submit', event => {
      event.preventDefault()
      const text = input.value
      input.value = ''
      if (live.engine === undefined || text.trim() === '') return
      out.replaceChildren()
      live.engine.run(text).then(() => live.draw(), error => live.say(String(error), 'said'))
      live.draw()
    })
    badge.textContent = live.isRecorded ? 'recording' : 'live'
    if (live.isRecorded) live.record()
    lives.add(live)

    return live
  }

  const tick = now => {
    for (const live of lives) {
      if (!live.isSeen || !live.isRecorded || live.tape === undefined || still || live.widget.frames.length < 2 || now < live.due) continue
      live.at = (live.at + 1) % live.widget.frames.length
      paint(live.tape.ctx, live.widget.frames[live.at], live.tape.rows)
      live.due = now + (live.at === live.widget.frames.length - 1 ? HOLD_MS : STEP_MS)
    }
    requestAnimationFrame(tick)
  }
  document.fonts.ready.then(() => requestAnimationFrame(tick))

  const ORDER = ['Session', 'Project and git', 'Time and focus', 'Scenes', 'Visualizers', 'Games', 'Just for fun', 'Layout']
  const found = new Set(widgets.map(widget => widget.category))
  window.DemoView = {
    widgets,
    terminal,
    short,
    categories: [...ORDER.filter(name => found.has(name)), ...[...found].filter(name => !ORDER.includes(name))],
  }
})()

;(() => {
  const { widgets, terminal, categories } = window.DemoView
  const wall = document.getElementById('wall')
  const bench = document.getElementById('bench')
  const hero = document.getElementById('hero')
  const tools = document.getElementById('tools')
  const count = document.getElementById('count')
  const search = document.getElementById('search')
  const none = document.getElementById('none')
  const repo = document.getElementById('repo')
  const foot = document.getElementById('foot')
  const make = (tag, props = {}, ...kids) => {
    const el = Object.assign(document.createElement(tag), props)
    el.append(...kids)

    return el
  }
  const isPaid = widget => widget.cost && !/^free\.?$/i.test(widget.cost)
  const entries = widgets.map(widget => {
    const live = terminal(widget)
    const frame = make('div', { className: 'frame' }, live.node)
    const more = make('span', { className: 'more' },
      make('span', { className: 'desc', textContent: widget.shows }),
      make('span', { className: 'uses' }, ...widget.commands.map(command => make('code', { textContent: command }))),
      ...(isPaid(widget) ? [make('span', { className: 'cost', textContent: widget.cost.replaceAll('`', '') })] : []),
    )
    const thumb = make('button', { className: 'thumb', type: 'button' }, frame, make('span', { className: 'name', textContent: live.title }), make('span', { className: 'kind', textContent: widget.category }), more)
    thumb.setAttribute('aria-label', `Open ${live.title}`)
    wall.append(thumb)

    return { live, widget, frame, thumb, words: `${widget.name} ${widget.category} ${widget.shows} ${widget.commands.join(' ')}`.toLowerCase() }
  })
  const byThumb = new Map(entries.map(entry => [entry.thumb, entry]))
  let chosen = 'All'
  let open

  const watch = new IntersectionObserver(seen => {
    for (const item of seen) {
      const entry = byThumb.get(item.target)
      entry.isNear = item.isIntersecting
      if (entry !== open) entry.live.see(open === undefined && entry.isNear)
    }
  }, { rootMargin: '160px' })
  for (const entry of entries) watch.observe(entry.thumb)

  const probe = make('div', { className: 'term' })
  probe.style.cssText = 'position:absolute;visibility:hidden'
  document.body.append(probe)
  const natural = probe.offsetWidth
  probe.remove()
  const fit = () => {
    const tile = entries.find(entry => !entry.thumb.hidden && entry.frame.clientWidth > 0)
    if (tile !== undefined && natural > 0) wall.style.setProperty('--fit', String(tile.frame.clientWidth / natural))
  }
  new ResizeObserver(fit).observe(wall)

  const shown = () => {
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean)

    return entries.filter(entry => (chosen === 'All' || entry.widget.category === chosen) && words.every(word => entry.words.includes(word)))
  }

  const draw = () => {
    const list = shown()
    for (const entry of entries) entry.thumb.hidden = !list.includes(entry)
    count.textContent = `${list.length} of ${widgets.length}`
    none.hidden = list.length > 0 || open !== undefined
    hero.hidden = open !== undefined
    views.hidden = open !== undefined
    wall.hidden = open !== undefined
    bench.hidden = open === undefined
    ;(open === undefined ? foot : tools).append(repo)
    if (open === undefined) return fit()

    const rail = make('nav', { className: 'rail' })
    rail.setAttribute('aria-label', 'Widgets')
    for (const category of categories) {
      const inIt = list.filter(entry => entry.widget.category === category)
      if (inIt.length === 0) continue
      rail.append(make('h3', { textContent: `${category} · ${inIt.length}` }))
      for (const entry of inIt) {
        const item = make('button', { type: 'button', textContent: entry.live.title })
        item.setAttribute('aria-current', String(entry === open))
        item.addEventListener('click', () => show(entry))
        rail.append(item)
      }
    }
    const { live, widget } = open
    const back = make('button', { className: 'back', type: 'button', textContent: '← all widgets' })
    back.addEventListener('click', () => show(undefined))
    const prev = make('button', { type: 'button', textContent: '↑ previous' })
    const next = make('button', { type: 'button', textContent: '↓ next' })
    prev.addEventListener('click', () => step(-1))
    next.addEventListener('click', () => step(1))
    const desk = make('section', { className: 'desk' },
      make('div', { className: 'bay' }, live.node),
      make('div', { className: 'about' },
        make('span', { className: 'kind', textContent: widget.category }),
        make('h2', { textContent: live.title }),
        make('p', { className: 'desc', textContent: widget.shows }),
        live.go,
        make('h4', { textContent: 'Commands' }),
        make('div', { className: 'cmds' }, ...live.chips),
        ...(isPaid(widget) ? [make('h4', { textContent: 'Cost' }), make('div', { className: 'cost', textContent: widget.cost.replaceAll('`', '') })] : []),
        make('div', { className: 'pager' }, prev, next),
      ),
    )
    bench.replaceChildren(back, make('div', { className: 'bench' }, rail, desk))
    const mark = rail.querySelector('[aria-current="true"]')
    if (mark) rail.scrollTop = Math.max(0, mark.offsetTop - rail.clientHeight / 2)
  }

  const show = (entry, isHistory = false) => {
    if (open !== undefined && open !== entry) {
      open.frame.append(open.live.node)
      open.live.see(false)
    }
    const wasOpen = open !== undefined
    open = entry
    if (entry === undefined) {
      for (const other of entries) other.live.see(other.isNear === true)
    } else {
      for (const other of entries) if (other !== entry) other.live.see(false)
      entry.live.see(true)
    }
    draw()
    if (!isHistory) {
      const hash = entry === undefined ? location.pathname + location.search : `#w=${entry.live.title}`
      if (entry !== undefined && !wasOpen) history.pushState(null, '', hash)
      else history.replaceState(null, '', hash)
    }
    if (entry !== undefined) window.scrollTo(0, 0)
  }

  const step = by => {
    const list = categories.flatMap(category => shown().filter(entry => entry.widget.category === category))
    if (list.length === 0) return
    const at = list.indexOf(open)
    show(list[(Math.max(0, at) + by + list.length) % list.length])
  }

  for (const entry of entries) entry.thumb.addEventListener('click', () => show(entry))

  for (const category of ['All', ...categories]) {
    const chip = make('button', { className: 'chip', type: 'button', textContent: category })
    chip.setAttribute('aria-pressed', String(category === chosen))
    chip.addEventListener('click', () => {
      chosen = category
      for (const other of tools.querySelectorAll(':scope > .chip:not(.play, .repo)')) other.setAttribute('aria-pressed', String(other === chip))
      draw()
    })
    tools.insertBefore(chip, count)
  }
  const views = make('span', { className: 'views' })
  const look = name => {
    wall.classList.toggle('list', name === 'list')
    for (const button of views.children) button.setAttribute('aria-pressed', String(button.dataset.view === name))
    try {
      localStorage.setItem('widgets-view', name)
    } catch {}
    fit()
  }
  for (const [name, label] of [['grid', '▦ grid'], ['list', '☰ list']]) {
    const button = make('button', { className: 'chip', type: 'button', textContent: label })
    button.dataset.view = name
    button.addEventListener('click', () => look(name))
    views.append(button)
  }
  tools.append(views)
  const all = make('button', { className: 'chip play', type: 'button', textContent: '▶ run a turn' })
  all.title = 'Run a simulated turn in every widget on screen'
  const play = () => {
    for (const entry of entries) if (entry.live.isSeen) entry.live.turn()
  }
  all.addEventListener('click', play)
  tools.append(all)

  search.addEventListener('input', draw)
  document.addEventListener('keydown', event => {
    if (open === undefined || document.activeElement?.closest('.term, input')) return
    if (event.key === 'Escape') show(undefined)
    if (event.key === 'ArrowDown') { event.preventDefault(); step(1) }
    if (event.key === 'ArrowUp') { event.preventDefault(); step(-1) }
  })
  const fromHash = () => {
    const asked = new URLSearchParams(location.hash.slice(1))
    if (asked.has('q')) search.value = asked.get('q')

    return { entry: entries.find(entry => entry.live.title === asked.get('w')), isPlaying: asked.has('play'), view: asked.get('view') ?? undefined }
  }
  window.addEventListener('popstate', () => show(fromHash().entry, true))
  document.getElementById('total').textContent = `There are ${widgets.length}`
  const stars = document.getElementById('stars')
  fetch('https://api.github.com/repos/oMaN-Rod/claude-code-widgets')
    .then(reply => (reply.ok ? reply.json() : undefined))
    .then(repo => {
      if (!Number.isFinite(repo?.stargazers_count)) return
      stars.textContent = `★ ${new Intl.NumberFormat('en', { notation: 'compact' }).format(repo.stargazers_count)}`
      stars.setAttribute('aria-label', `${repo.stargazers_count} stars`)
      stars.hidden = false
    })
    .catch(() => {})
  let kept = 'grid'
  try {
    kept = localStorage.getItem('widgets-view') === 'list' ? 'list' : 'grid'
  } catch {}
  const first = fromHash()
  look(first.view ?? kept)
  show(first.entry, true)
  if (first.isPlaying) setTimeout(play, 1500)
})()

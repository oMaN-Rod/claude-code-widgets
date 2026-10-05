const INLINE = /(`+)(.+?)\1(?!`)|\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*$/
const RULE = /^(-{3,}|\*{3,}|_{3,})$/
const DIVIDER = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/

const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...kids)

  return node
}

const inline = text => {
  const out = []
  let last = 0
  for (const found of text.matchAll(INLINE)) {
    if (found.index > last) out.push(text.slice(last, found.index))
    if (found[1]) out.push(el('code', { textContent: found[2].replace(/^ (.*) $/, '$1') }))
    else if (found[3]) out.push(el('strong', {}, ...inline(found[3])))
    else out.push(el('a', { href: found[5], target: '_blank', rel: 'noopener', textContent: found[4] }))
    last = found.index + found[0].length
  }
  if (last < text.length) out.push(text.slice(last))

  return out
}

const cells = line => {
  const out = []
  let fence = ''
  for (const part of line.trim().split(/(`+|\\\||\|)/)) {
    if (part === '|' && fence === '') {
      out.push('')
      continue
    }
    if (/^`+$/.test(part)) fence = fence === '' ? part : fence === part ? '' : fence
    if (out.length > 0) out[out.length - 1] += part === '\\|' ? '|' : part
  }

  return (out.at(-1)?.trim() === '' ? out.slice(0, -1) : out).map(cell => cell.trim())
}

const isFence = line => line.trim().startsWith('```')
const startsBlock = line => isFence(line) || HEADING.test(line) || LIST.test(line) || /^\s*[|>]/.test(line) || RULE.test(line.trim())

export const markdown = text => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let at = 0

  const list = () => {
    const stack = []
    let item
    while (at < lines.length) {
      const line = lines[at]
      const found = LIST.exec(line)
      if (found === null) {
        if (line.trim() === '' && LIST.test(lines[at + 1] ?? '')) {
          at += 1
          continue
        }
        if (line.trim() === '' || !/^\s/.test(line) || startsBlock(line)) break
        item.append(' ', ...inline(line.trim()))
        at += 1
        continue
      }
      const indent = found[1].length
      const isOrdered = /\d/.test(found[2])
      while (stack.length > 1 && indent < stack.at(-1).indent) stack.pop()
      const top = stack.at(-1)
      if (top === undefined || indent > top.indent || (top.made.tagName === 'OL') !== isOrdered) {
        const made = el(isOrdered ? 'ol' : 'ul')
        if (isOrdered) made.start = parseInt(found[2], 10)
        if (top === undefined || (indent <= top.indent && stack.length === 1)) out.push(made)
        else if (indent > top.indent) item.append(made)
        else top.made.after(made)
        if (top !== undefined && indent <= top.indent) stack.pop()
        stack.push({ indent, made })
      }
      item = el('li', {}, ...inline(found[3]))
      stack.at(-1).made.append(item)
      at += 1
    }
  }

  while (at < lines.length) {
    const line = lines[at]
    const trimmed = line.trim()
    const heading = HEADING.exec(trimmed)
    if (trimmed === '') {
      at += 1
    } else if (isFence(line)) {
      const close = lines.findIndex((other, index) => index > at && isFence(other))
      const end = close < 0 ? lines.length : close
      out.push(el('pre', { textContent: lines.slice(at + 1, end).join('\n') }))
      at = end + 1
    } else if (heading !== null) {
      out.push(el(`h${heading[1].length}`, {}, ...inline(heading[2])))
      at += 1
    } else if (RULE.test(trimmed)) {
      out.push(el('hr'))
      at += 1
    } else if (trimmed.startsWith('|') && DIVIDER.test((lines[at + 1] ?? '').trim())) {
      const head = el('tr', {}, ...cells(line).map(cell => el('th', {}, ...inline(cell))))
      const body = el('tbody')
      at += 2
      while (at < lines.length && lines[at].trim().startsWith('|')) {
        body.append(el('tr', {}, ...cells(lines[at]).map(cell => el('td', {}, ...inline(cell)))))
        at += 1
      }
      out.push(el('div', { className: 'scroll' }, el('table', {}, el('thead', {}, head), body)))
    } else if (LIST.test(line)) {
      list()
    } else if (trimmed.startsWith('>')) {
      const quoted = []
      while (at < lines.length && lines[at].trim().startsWith('>')) {
        quoted.push(lines[at].trim().replace(/^>\s?/, ''))
        at += 1
      }
      out.push(el('blockquote', {}, ...inline(quoted.join(' '))))
    } else {
      const said = [trimmed]
      at += 1
      while (at < lines.length && lines[at].trim() !== '' && !startsBlock(lines[at])) {
        said.push(lines[at].trim())
        at += 1
      }
      out.push(el('p', {}, ...inline(said.join(' '))))
    }
  }

  return out
}

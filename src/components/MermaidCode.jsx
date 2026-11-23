import { Children, Fragment, useCallback, useEffect, useId, useRef, useState } from 'react'
import { getCodeString } from 'rehype-rewrite'
import { useDarkMode } from '../theme.js'

let mermaidMod = null
let mermaidKey = null
let renderSeq = 0

const WRAP_WIDTH = 200
const MERMAID_CONFIG_REV = 4

/** Fence languages / diagram headers Mermaid understands. */
const MERMAID_LANG = /(?:^|\s)language-(mermaid|sequencediagram|flowchart|graph|classdiagram|statediagram|erdiagram|gantt|journey|pie|mindmap|timeline|gitgraph|c4context|block-beta|quadrantchart|xychart-beta|sankey-beta|requirementdiagram)\b/i
const MERMAID_HEADER = /^(?:\s*(?:---[\s\S]*?---|%%%[\s\S]*?%%%)\s*)?(sequenceDiagram|flowchart|graph(?:\s+\w+)?|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|pie|mindmap|timeline|gitGraph|C4Context|block-beta|quadrantChart|xychart-beta|sankey-beta|requirementDiagram)\b/m

async function loadMermaid(dark) {
  if (!mermaidMod) {
    mermaidMod = (await import('mermaid')).default
  }
  const key = `${dark ? 'dark' : 'light'}:r${MERMAID_CONFIG_REV}`
  if (mermaidKey !== key) {
    mermaidMod.initialize({
      startOnLoad: false,
      // loose: sequence/message arrows and markers survive; antiscript+DOMPurify can blank them.
      securityLevel: 'loose',
      theme: dark ? 'dark' : 'default',
      darkMode: !!dark,
      fontFamily: 'inherit',
      flowchart: {
        htmlLabels: true,
        useMaxWidth: false,
        wrappingWidth: WRAP_WIDTH,
        padding: 12,
        nodeSpacing: 50,
        rankSpacing: 60,
      },
      sequence: {
        useMaxWidth: false,
        diagramMarginX: 16,
        diagramMarginY: 16,
        actorMargin: 64,
        width: 160,
        height: 45,
        boxMargin: 8,
        messageMargin: 40,
        messageAlign: 'center',
      },
    })
    mermaidKey = key
  }
  return mermaidMod
}

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function codeFrom(children, node) {
  if (node?.children?.length) {
    try {
      const fromNode = getCodeString(node.children)
      if (fromNode) return decodeEntities(fromNode)
    } catch {
      /* fall through */
    }
  }
  const walk = (value) => {
    if (value == null || value === false) return ''
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    if (Array.isArray(value)) return value.map(walk).join('')
    if (value?.props?.children != null) return walk(value.props.children)
    return ''
  }
  return decodeEntities(walk(children)).replace(/\n$/, '')
}

function isMermaidBlock(className, code) {
  if (typeof className === 'string' && MERMAID_LANG.test(className)) return true
  return MERMAID_HEADER.test(code || '')
}

function isFlowchart(code) {
  return /^(?:\s*(?:---[\s\S]*?---|%%%[\s\S]*?%%%)\s*)?(flowchart|graph)\b/m.test(code || '')
}

/**
 * Mermaid often leaves long flowchart labels as nowrap (HiDPI bug). Force wrap and
 * grow rects. Skip for sequenceDiagram and other types — resizing breaks them.
 */
function fitFlowchartNodes(container) {
  const svg = container.querySelector('svg')
  if (!svg) return

  svg.querySelectorAll('g.node').forEach((node) => {
    const fo = node.querySelector('foreignObject')
    if (!fo) return
    const label = fo.querySelector('div')
    if (!label) return
    const shape = node.querySelector(':scope > rect, :scope > circle, :scope > ellipse')

    const shapeW = shape?.tagName === 'rect'
      ? Number(shape.getAttribute('width')) || 0
      : Number(fo.getAttribute('width')) || WRAP_WIDTH
    const wrapW = Math.max(80, Math.min(WRAP_WIDTH, shapeW || WRAP_WIDTH))

    label.style.setProperty('display', 'block', 'important')
    label.style.setProperty('white-space', 'pre-wrap', 'important')
    label.style.setProperty('overflow-wrap', 'anywhere', 'important')
    label.style.setProperty('word-break', 'break-word', 'important')
    label.style.setProperty('width', `${wrapW}px`, 'important')
    label.style.setProperty('max-width', `${wrapW}px`, 'important')
    label.style.setProperty('box-sizing', 'border-box', 'important')
    label.style.setProperty('line-height', '1.35', 'important')
    label.style.setProperty('text-align', 'center', 'important')
    label.style.setProperty('overflow', 'hidden', 'important')

    const span = label.querySelector('.nodeLabel, span')
    if (span) {
      span.style.setProperty('white-space', 'pre-wrap', 'important')
      span.style.setProperty('overflow-wrap', 'anywhere', 'important')
      span.style.setProperty('word-break', 'break-word', 'important')
      span.style.setProperty('display', 'block', 'important')
    }

    const padX = 18
    const padY = 16
    const contentW = Math.ceil(Math.max(label.scrollWidth, label.offsetWidth, wrapW))
    const contentH = Math.ceil(Math.max(label.scrollHeight, label.offsetHeight, 20))
    const nextW = Math.max(contentW + 4, wrapW)
    const nextH = contentH + 4

    const prevW = Number(fo.getAttribute('width')) || nextW
    const prevH = Number(fo.getAttribute('height')) || nextH
    const prevX = Number(fo.getAttribute('x')) || 0
    const prevY = Number(fo.getAttribute('y')) || 0
    fo.setAttribute('width', String(nextW))
    fo.setAttribute('height', String(nextH))
    fo.setAttribute('x', String(prevX - (nextW - prevW) / 2))
    fo.setAttribute('y', String(prevY - (nextH - prevH) / 2))
    fo.style.overflow = 'hidden'

    if (shape?.tagName === 'rect') {
      const rx = Number(shape.getAttribute('x')) || 0
      const ry = Number(shape.getAttribute('y')) || 0
      const rw = Number(shape.getAttribute('width')) || nextW
      const rh = Number(shape.getAttribute('height')) || nextH
      const targetW = Math.max(rw, nextW + padX)
      const targetH = Math.max(rh, nextH + padY)
      const growW = targetW - rw
      const growH = targetH - rh
      shape.setAttribute('x', String(rx - growW / 2))
      shape.setAttribute('y', String(ry - growH / 2))
      shape.setAttribute('width', String(targetW))
      shape.setAttribute('height', String(targetH))
    } else if (shape?.tagName === 'circle') {
      const need = Math.max(nextW, nextH) / 2 + 8
      const r = Number(shape.getAttribute('r')) || need
      if (need > r) shape.setAttribute('r', String(need))
    } else if (shape?.tagName === 'ellipse') {
      const rx = Number(shape.getAttribute('rx')) || nextW / 2
      const ry = Number(shape.getAttribute('ry')) || nextH / 2
      shape.setAttribute('rx', String(Math.max(rx, nextW / 2 + 8)))
      shape.setAttribute('ry', String(Math.max(ry, nextH / 2 + 8)))
    }
  })

  try {
    const bbox = svg.getBBox()
    if (bbox.width > 0 && bbox.height > 0) {
      const pad = 12
      svg.setAttribute(
        'viewBox',
        `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`,
      )
      svg.removeAttribute('width')
      svg.removeAttribute('height')
      svg.style.width = `${Math.ceil(bbox.width + pad * 2)}px`
      svg.style.height = `${Math.ceil(bbox.height + pad * 2)}px`
      svg.style.maxWidth = 'none'
    }
  } catch {
    /* getBBox can fail if SVG is not rendered yet */
  }
}

/** Keep sequence / non-flowchart SVGs at a readable intrinsic size. */
function sizeDiagramSvg(container) {
  const svg = container.querySelector('svg')
  if (!svg) return
  svg.style.maxWidth = 'none'
  svg.style.height = 'auto'
  svg.style.display = 'block'
  svg.style.margin = '0 auto'

  const vb = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (vb?.length === 4 && vb.every((n) => Number.isFinite(n))) {
    const [, , w, h] = vb
    if (w > 0 && h > 0) {
      svg.style.width = `${Math.ceil(w)}px`
      svg.style.height = `${Math.ceil(h)}px`
    }
  }
}

/** Renders ```mermaid (and ```sequenceDiagram) fences as diagrams. */
export default function MermaidCode({ children = [], className, node, inline, ...props }) {
  const { dark } = useDarkMode()
  const reactId = useId().replace(/:/g, '')
  const [container, setContainer] = useState(null)
  const [error, setError] = useState(null)
  const code = codeFrom(children, node)
  const mermaid = !inline && isMermaidBlock(className, code)

  useEffect(() => {
    if (!container || !mermaid || !code.trim()) return
    let cancelled = false
    const renderId = `mmd${reactId}${++renderSeq}`
    setError(null)

    loadMermaid(dark)
      .then((api) => api.render(renderId, code))
      .then(({ svg, bindFunctions }) => {
        if (cancelled) return
        container.innerHTML = svg
        bindFunctions?.(container)
        requestAnimationFrame(() => {
          if (cancelled) return
          if (isFlowchart(code)) fitFlowchartNodes(container)
          else sizeDiagramSvg(container)
        })
      })
      .catch((err) => {
        if (cancelled) return
        document.getElementById(renderId)?.remove()
        document.getElementById(`d${renderId}`)?.remove()
        container.innerHTML = ''
        setError(err?.str || err?.message || 'Could not render Mermaid diagram.')
      })

    return () => {
      cancelled = true
      document.getElementById(renderId)?.remove()
      document.getElementById(`d${renderId}`)?.remove()
    }
  }, [container, mermaid, code, dark, reactId])

  const refElement = useCallback((el) => {
    setContainer(el)
  }, [])

  if (mermaid) {
    if (error) {
      return (
        <pre className="mermaid-error" role="alert">
          {error}
          {'\n\n'}
          {code}
        </pre>
      )
    }
    return <div className="mermaid-diagram" ref={refElement} data-name="mermaid" />
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  )
}

/** Avoid <pre> clipping / scroll traps around Mermaid blocks in the preview. */
export function MermaidPre({ children, ...props }) {
  const list = Children.toArray(children)
  const only = list.length === 1 ? list[0] : null
  const className = only?.props?.className
  const childCode = only ? codeFrom(only.props?.children, only.props?.node) : ''
  if (only && isMermaidBlock(className, childCode)) {
    return <Fragment>{children}</Fragment>
  }
  return <pre {...props}>{children}</pre>
}

export const markdownComponents = {
  code: MermaidCode,
  pre: MermaidPre,
}
export const markdownPreviewOptions = { components: markdownComponents }

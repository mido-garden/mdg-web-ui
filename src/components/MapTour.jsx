import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

const KEY = 'mitdo-map-edu-v3'

/**
 * Spotlight steps for the tempo-only chart.
 * `focus: 'inset'` → small hole in the map center (card stays near demos).
 */
const STEPS = [
  {
    id: 'map',
    target: '[data-tour="map"]',
    focus: 'inset',
    focusSize: { w: 340, h: 240 },
    title: 'Your tempos',
    body: 'Cards for what you’re learning. Open a card to review it.',
    placement: 'bottom',
  },
  {
    id: 'create',
    target: '[data-tour="create"]',
    fallback: '[data-tour="map"]',
    title: 'Create a tempo',
    body: 'The first card on the left creates a tempo. Fill in the details, then save.',
    placement: 'bottom',
  },
  {
    id: 'tags',
    target: '[data-tour="map"]',
    focus: 'inset',
    focusSize: { w: 320, h: 220 },
    live: 'tempo',
    title: 'Tags keep order',
    body: 'Tag tempos in the detail popup, then filter the list by tag.',
    placement: 'right',
    demo: 'tags',
  },
  {
    id: 'review',
    target: '[data-tour="review"]',
    fallback: '[data-tour="map"]',
    title: 'Review when due',
    body: 'Click Review. One tempo at a time: say it in your own words, flip the card, then rate it.',
    placement: 'right',
  },
]

export function mapTourSeen() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

export function markMapTourSeen() {
  try {
    localStorage.setItem(KEY, '1')
  } catch { /* ignore */ }
}

function rectOf(el) {
  const r = el.getBoundingClientRect()
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    right: r.right,
    bottom: r.bottom,
  }
}

function measure(selector, fallback) {
  const el = document.querySelector(selector) || (fallback ? document.querySelector(fallback) : null)
  if (!el) return null
  const r = rectOf(el)
  if (r.width < 8 || r.height < 8) return null
  return r
}

function insetFocus(map, size = { w: 300, h: 220 }) {
  const w = Math.min(size.w, Math.max(200, map.width * 0.5))
  const h = Math.min(size.h, Math.max(160, map.height * 0.45))
  const left = map.left + (map.width - w) / 2
  const top = map.top + (map.height - h) / 2
  return { top, left, width: w, height: h, right: left + w, bottom: top + h }
}

function unionEls(els, pad = 28) {
  const list = els.filter(Boolean)
  if (!list.length) return null
  let minL = Infinity
  let minT = Infinity
  let maxR = -Infinity
  let maxB = -Infinity
  for (const el of list) {
    const r = el.getBoundingClientRect()
    minL = Math.min(minL, r.left)
    minT = Math.min(minT, r.top)
    maxR = Math.max(maxR, r.right)
    maxB = Math.max(maxB, r.bottom)
  }
  return {
    left: minL - pad,
    top: minT - pad,
    width: maxR - minL + pad * 2,
    height: maxB - minT + pad * 2,
    right: maxR + pad,
    bottom: maxB + pad,
  }
}

function liveHole(kind) {
  if (kind === 'tempo') {
    return unionEls([...document.querySelectorAll('.tempo-board .tempo-card')].slice(0, 3), 12)
  }
  return null
}

function resolveHole(step) {
  if (step.live) {
    const live = liveHole(step.live)
    if (live && live.width > 40 && live.height > 40) return { hole: live, showDemo: false }
  }
  const base = measure(step.target, step.fallback)
  if (!base) return { hole: null, showDemo: !!step.demo }
  if (step.focus === 'inset') {
    return { hole: insetFocus(base, step.focusSize), showDemo: !!step.demo }
  }
  return { hole: base, showDemo: !!step.demo }
}

function placeCard(hole, preferred, cardW = 292, cardH = 170) {
  const pad = 12
  const vw = window.innerWidth
  const vh = window.innerHeight
  const order = [preferred, 'right', 'bottom', 'left', 'top'].filter((v, i, a) => a.indexOf(v) === i)

  for (const placement of order) {
    let left = hole.left
    let top = hole.bottom + pad
    if (placement === 'right') {
      left = hole.right + pad
      top = hole.top + Math.max(0, (hole.height - cardH) / 2)
    } else if (placement === 'left') {
      left = hole.left - cardW - pad
      top = hole.top + Math.max(0, (hole.height - cardH) / 2)
    } else if (placement === 'top') {
      left = hole.left + (hole.width - cardW) / 2
      top = hole.top - cardH - pad
    } else {
      left = hole.left + (hole.width - cardW) / 2
      top = hole.bottom + pad
    }
    const fits =
      left >= 8 &&
      top >= 8 &&
      left + cardW <= vw - 8 &&
      top + cardH <= vh - 8
    if (fits) return { left, top, width: cardW }
  }

  return {
    left: Math.min(Math.max(8, hole.right + pad), vw - cardW - 8),
    top: Math.min(Math.max(8, hole.top), vh - cardH - 8),
    width: cardW,
  }
}

function DemoLayer({ demo, hole }) {
  if (!demo || !hole) return null
  const style = {
    position: 'fixed',
    top: hole.top,
    left: hole.left,
    width: hole.width,
    height: hole.height,
    pointerEvents: 'none',
    zIndex: 10002,
    overflow: 'hidden',
  }

  if (demo === 'tags') {
    return (
      <div className="tour-demo" style={style} aria-hidden>
        <div className="tour-demo-bub tempo" style={{ left: '36%', top: '48%' }}>
          <i /><span>DNS</span>
        </div>
        <div className="tour-demo-tags">
          <span>naming</span>
          <span>networks</span>
        </div>
        <div className="tour-demo-caption">Filter by tag · skip the filing cabinet</div>
      </div>
    )
  }

  return null
}

/** Spotlight coach-marks focused on real map UI regions. */
export default function MapTour({ open, onDone }) {
  const [step, setStep] = useState(0)
  const [hole, setHole] = useState(null)
  const [showDemo, setShowDemo] = useState(false)

  const current = STEPS[step] || STEPS[0]
  const last = step >= STEPS.length - 1

  const finish = useCallback(() => {
    markMapTourSeen()
    onDone?.()
  }, [onDone])

  const next = useCallback(() => {
    setStep((s) => {
      if (s >= STEPS.length - 1) {
        finish()
        return s
      }
      return s + 1
    })
  }, [finish])

  const refresh = useCallback(() => {
    const s = STEPS[step]
    if (!s) return
    const resolved = resolveHole(s)
    setHole(resolved.hole)
    setShowDemo(resolved.showDemo)
  }, [step])

  useLayoutEffect(() => {
    if (!open) return undefined
    refresh()
    const onResize = () => refresh()
    window.addEventListener('resize', onResize)
    const id = window.setInterval(refresh, 400)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearInterval(id)
    }
  }, [open, refresh])

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish, next])

  if (!open) return null

  const card = hole ? placeCard(hole, current.placement) : { left: 24, top: 24, width: 292 }
  const radius = current.id === 'review' ? 14 : 20

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-labelledby="map-tour-title">
      <div className="tour-veil" aria-hidden />

      {hole && (
        <div
          className="tour-spot"
          style={{
            top: hole.top - 4,
            left: hole.left - 4,
            width: hole.width + 8,
            height: hole.height + 8,
            borderRadius: radius,
          }}
        />
      )}

      {showDemo && <DemoLayer demo={current.demo} hole={hole} />}

      <div
        className="tour-card"
        style={{ left: card.left, top: card.top, width: card.width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tour-kicker">Tour · {step + 1} / {STEPS.length}</div>
        <h2 id="map-tour-title">{current.title}</h2>
        <p className="sm muted">{current.body}</p>
        <div className="tour-dots" aria-hidden>
          {STEPS.map((s, i) => (
            <i key={s.id} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="ghost" onClick={finish}>Skip</button>
          <span className="sp" />
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)}>Back</button>
          )}
          <button type="button" className="primary" onClick={next}>
            {last ? 'Chart ahoy' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

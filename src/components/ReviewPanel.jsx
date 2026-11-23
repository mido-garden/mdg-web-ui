import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { useStore } from '../store.jsx'
import MarkdownPreview from './MarkdownPreview.jsx'
import { isDue, tone, LEVELS } from '../lib.js'
import { useDarkMode } from '../theme.js'
import { paths } from '../paths.js'
import Burst from './Burst.jsx'
import { ExampleList } from './InlineExample.jsx'
import MediaGallery, { MediaHints } from './MediaGallery.jsx'
import {
  applyScheduleToStore,
  getReview,
  getReviewTempo,
  postExample,
  postReview,
  reviewQueueItemToStore,
  reviewTempoToStore,
  tempoApiEnabled,
  tryTempo,
} from '../tempoApi.js'

function buildLocalSession(tempos, preferId) {
  const due = tempos.filter(isDue)
  const list = due.length ? due : [...tempos].sort((a, b) => a.confidence - b.confidence).slice(0, 5)
  const queue = list.map((t) => t.id)
  const at = preferId ? queue.indexOf(preferId) : 0
  return {
    queue,
    i: at >= 0 ? at : 0,
    flip: false,
    results: [],
    source: 'local',
    items: Object.fromEntries(list.map((t) => [t.id, { id: t.id, name: t.name, tags: t.tags || [] }])),
  }
}

function buildApiSession(review, preferId) {
  const items = review?.items || []
  const queue = items.map((t) => t.id)
  const at = preferId ? queue.indexOf(preferId) : 0
  return {
    queue,
    i: at >= 0 ? at : 0,
    flip: false,
    results: [],
    source: review?.source || 'due',
    items: Object.fromEntries(items.map((t) => [t.id, t])),
  }
}

// Inline review queue for tempos.
export default function ReviewPanel({ onOpen }) {
  const { state, dispatch } = useStore()
  const { dark } = useDarkMode()
  const navigate = useNavigate()
  const { id: routeId } = useParams()
  const routeIdRef = useRef(routeId)
  routeIdRef.current = routeId
  const [s, setS] = useState(() => buildLocalSession(state.tempos, routeId))
  const [loading, setLoading] = useState(tempoApiEnabled())
  const [readyIds, setReadyIds] = useState(() => new Set())
  const readyRef = useRef(readyIds)
  readyRef.current = readyIds
  const inflightRef = useRef(new Set())
  const [detailLoading, setDetailLoading] = useState(false)
  const [burst, setBurst] = useState(0)
  const [example, setExample] = useState('')
  const [busy, setBusy] = useState(false)

  const loadSession = useCallback(async () => {
    const preferId = routeIdRef.current
    setReadyIds(new Set())
    inflightRef.current = new Set()
    if (!tempoApiEnabled()) {
      setS(buildLocalSession(state.tempos, preferId))
      setLoading(false)
      return
    }
    setLoading(true)
    const review = await tryTempo(() => getReview())
    if (review?.items) {
      for (const item of review.items) {
        const local = state.tempos.find((t) => t.id === item.id)
        dispatch({ type: 'hydrateTempo', tempo: reviewQueueItemToStore(item, local) })
      }
      setS(buildApiSession(review, preferId))
    } else {
      setS(buildLocalSession(state.tempos, preferId))
    }
    setLoading(false)
  }, [dispatch, state.tempos])

  useEffect(() => {
    loadSession()
    // Only on mount — "Review again" calls loadSession explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = !loading && s.i >= s.queue.length
  const currentId = !done ? s.queue[s.i] : null
  const queueItem = currentId ? s.items?.[currentId] : null
  const stored = currentId ? state.tempos.find((x) => x.id === currentId) : null
  const t = done
    ? null
    : (stored
      ? { ...reviewQueueItemToStore(queueItem || {}, stored), ...stored, name: stored.name || queueItem?.name }
      : (queueItem ? reviewQueueItemToStore(queueItem) : null))

  const detailReady = !tempoApiEnabled() || (currentId ? readyIds.has(currentId) : false)

  // Fetch the active (and next) review card on demand.
  useEffect(() => {
    if (loading || done || !tempoApiEnabled() || !currentId) return
    let stop = false

    const pull = async (id, { showSpinner } = {}) => {
      if (!id || readyRef.current.has(id) || inflightRef.current.has(id)) return
      inflightRef.current.add(id)
      if (showSpinner) setDetailLoading(true)
      try {
        const rt = await tryTempo(() => getReviewTempo(id))
        if (stop) return
        if (rt) {
          const local = state.tempos.find((x) => x.id === id)
          dispatch({ type: 'hydrateTempo', tempo: reviewTempoToStore(rt, local) })
          setReadyIds((prev) => {
            if (prev.has(id)) return prev
            const next = new Set(prev)
            next.add(id)
            return next
          })
        }
      } finally {
        inflightRef.current.delete(id)
        if (showSpinner && !stop) setDetailLoading(false)
      }
    }

    pull(currentId, { showSpinner: !readyRef.current.has(currentId) })
    const nextId = s.queue[s.i + 1]
    if (nextId) pull(nextId, { showSpinner: false })

    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, done, currentId, s.i, dispatch])

  // Keep the URL on /review/:id while reviewing (and /review when done).
  useEffect(() => {
    if (loading) return
    const next = done || !currentId ? paths.review : paths.reviewTempo(currentId)
    if (window.location.pathname !== next) {
      navigate({ pathname: next, search: window.location.search }, { replace: true })
    }
  }, [loading, done, currentId, navigate])

  useEffect(() => { setExample('') }, [currentId])

  const rate = async (n) => {
    if (!t || busy || detailLoading) return
    setBusy(true)
    let schedule = null
    if (tempoApiEnabled()) {
      const res = await tryTempo(() => postReview(t.id, n))
      if (res) schedule = applyScheduleToStore(res)
    }
    dispatch({
      type: 'rate',
      id: t.id,
      rating: n,
      schedule: schedule
        ? { confidence: schedule.confidence, ease: schedule.ease, interval: schedule.interval, due: schedule.due }
        : undefined,
    })
    setS((p) => ({ ...p, i: p.i + 1, flip: false, results: [...p.results, { id: t.id, n }] }))
    if (n >= 4) setBurst((b) => b + 1)
    setBusy(false)
  }

  const flip = () => {
    if (detailLoading) return
    setS((p) => ({ ...p, flip: !p.flip }))
  }

  const addExample = async (e) => {
    e.preventDefault()
    if (!t || !example.trim() || busy || detailLoading) return
    const text = example.trim()
    setBusy(true)
    let created = null
    if (tempoApiEnabled()) {
      created = await tryTempo(() => postExample(t.id, text))
    }
    dispatch({
      type: 'addExample',
      id: t.id,
      text,
      example: created || undefined,
      exampleId: created?.id,
    })
    setExample('')
    setBusy(false)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) return
      if (e.code === 'Space') { e.preventDefault(); flip() }
      else if (s.flip && !done && !busy && !detailLoading && /^[1-5]$/.test(e.key)) rate(Number(e.key))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (loading) {
    return (
      <div className="review">
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p className="muted">Loading review…</p>
        </div>
      </div>
    )
  }

  if (done) {
    const good = s.results.filter((r) => r.n >= 4).length
    return (
      <div className="review">
        <div className="card" style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
          <Burst k={burst} />
          <h1>All done!</h1>
          <p className="muted">
            {s.results.length === 0
              ? 'Nothing due right now. Add tempos or wait for the next review window.'
              : `You reviewed ${s.results.length} tempos, ${good} stuck firmly. Your brain just hit the gym.`}
          </p>
          <div style={{ textAlign: 'left', margin: '16px 0' }}>
            {s.results.map((r, k) => {
              const x = state.tempos.find((y) => y.id === r.id) || s.items?.[r.id]
              return (
                <div className="trow" key={k}>
                  <span style={{ flex: 1 }}>{x?.name || r.id}</span>
                  <span className={`pill tone-${tone(r.n)}`}>{LEVELS[r.n - 1]}</span>
                  <button className="ghost xs" onClick={() => onOpen(r.id)}>Open</button>
                </div>
              )
            })}
          </div>
          <button className="primary" onClick={() => loadSession()}>Review again</button>
        </div>
      </div>
    )
  }

  if (!t) {
    return (
      <div className="review">
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p className="muted">Couldn’t load this tempo.</p>
        </div>
      </div>
    )
  }

  const examples = (t.examples || []).slice(-3)
  const tags = t.tags || queueItem?.tags || []
  const ready = detailReady && !detailLoading

  return (
    <div className="review">
      <div className="head">
        <b style={{ fontWeight: 500 }}>{s.i + 1} / {s.queue.length}</b>
        <div className="sp" />
        <button
          type="button"
          className="ghost"
          onClick={() => onOpen(t.id)}
          title="Open tempo to edit content, tags, or media"
        >
          Open tempo <ArrowUpRight size={14} aria-hidden />
        </button>
      </div>
      <div className="bar"><i style={{ width: `${(s.i / s.queue.length) * 100}%` }} /></div>

      <div
        className={`card flash ${s.flip ? 'is-back' : ''}`}
        key={t.id + String(s.flip)}
        onClick={ready ? flip : undefined}
        role="button"
        tabIndex={0}
        aria-label="Flip tempo"
        aria-busy={detailLoading || undefined}
        onKeyDown={(e) => e.key === 'Enter' && ready && flip()}
      >
        <Burst k={burst} />
        {!s.flip ? (
          <>
            <div className="xs muted">Write an example in your own words, then flip the tempo</div>
            <h1>{t.name}</h1>
            {tags.length > 0 && (
              <div className="tag-row review-tags" aria-label="Tags" onClick={(e) => e.stopPropagation()}>
                {tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            )}
            {ready ? <MediaHints items={t.media} /> : <p className="xs muted" style={{ marginTop: 10 }}>Loading card…</p>}
            <div className="xs faint">{ready ? 'Click the tempo or press Space to flip' : 'Fetching content…'}</div>
          </>
        ) : (
          <>
            <div className="row" style={{ width: '100%', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div className="xs muted">Content</div>
              <div className="sp" />
              {tags.length > 0 && (
                <div className="tag-row review-tags" aria-label="Tags" onClick={(e) => e.stopPropagation()}>
                  {tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}
            </div>
            {!ready ? (
              <p className="muted">Loading content…</p>
            ) : (
              <>
                <div className="review-md" data-color-mode={dark ? 'dark' : 'light'}>
                  {t.content?.trim() ? (
                    <MarkdownPreview source={t.content} />
                  ) : (
                    <p className="muted">No content yet.</p>
                  )}
                </div>
                {examples.length > 0 && (
                  <section className="review-examples" aria-label="Examples">
                    <div className="review-examples-label">Examples</div>
                    <ExampleList examples={examples} readOnly />
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>

      {s.flip && ready && (t.media || []).length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2>On this tempo</h2>
          <MediaGallery key={t.id} items={t.media} />
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <ExampleList
          examples={[]}
          addValue={example}
          onAddChange={setExample}
          onAdd={addExample}
          addPlaceholder="Write an example in your own words"
          addLabel="Add example"
          adding={busy || !ready}
        />
      </div>

      <div className="rate" style={{ marginTop: 14, opacity: s.flip && ready ? 1 : 0.4 }}>
        {LEVELS.map((l, k) => (
          <button key={l} disabled={!s.flip || busy || !ready} onClick={() => rate(k + 1)}><b>{k + 1}</b>{l}</button>
        ))}
      </div>
      <div className="xs faint" style={{ textAlign: 'center', marginTop: 8 }}>Space flips the card. Then press 1–5.</div>
    </div>
  )
}

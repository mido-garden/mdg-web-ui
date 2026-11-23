import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useStore } from '../store.jsx'
import { selectMapNodes } from '../selectors.js'
import { paths, screenPath, readMapSearch, mapSearch } from '../paths.js'
import TempoMap from '../components/TempoMap.jsx'
import TagFilter from '../components/TagFilter.jsx'
import ReviewPanel from '../components/ReviewPanel.jsx'
import MapTour, { mapTourSeen } from '../components/MapTour.jsx'
import { loadGarden, loadMoreGarden, MAP_PAGE_SIZE, tempoApiEnabled } from '../tempoApi.js'

export default function MapView({ onOpen }) {
  const { state, dispatch } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const reviewing = location.pathname.startsWith('/review') || screenPath(location).startsWith('/review')
  const [creating, setCreating] = useState(false)
  const { q: query, tag, due: onlyDue } = readMapSearch(location.search)
  const [tourOpen, setTourOpen] = useState(() => !mapTourSeen())
  const [listBusy, setListBusy] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const filtersReady = useRef(false)

  const pushFilters = (patch) => {
    const search = mapSearch({
      q: Object.prototype.hasOwnProperty.call(patch, 'q') ? patch.q : query,
      tag: Object.prototype.hasOwnProperty.call(patch, 'tag') ? patch.tag : tag,
      due: Object.prototype.hasOwnProperty.call(patch, 'due') ? patch.due : onlyDue,
    })
    navigate({ pathname: location.pathname, search }, { replace: true })
  }

  const closeReview = () => navigate({ pathname: paths.map, search: location.search }, { replace: true })

  useEffect(() => {
    if (!location.pathname.startsWith('/review')) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      e.preventDefault()
      navigate({ pathname: paths.map, search: location.search }, { replace: true })
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [location.pathname, location.search, navigate])

  const mapParams = useMemo(() => {
    const q = query.trim()
    return {
      q: q || undefined,
      tag: tag || undefined,
      due: onlyDue || undefined,
      limit: MAP_PAGE_SIZE,
    }
  }, [query, tag, onlyDue])

  // Skip the first run — App already loaded the unfiltered page.
  // Do not reset that skip on cleanup: a filter change re-runs this effect,
  // and resetting the flag made every change look like the first run.
  useEffect(() => {
    if (!tempoApiEnabled()) return undefined
    const hasFilter = Boolean(mapParams.q || mapParams.tag || mapParams.due)
    if (!filtersReady.current) {
      filtersReady.current = true
      if (!hasFilter) return undefined
    }
    let stop = false
    const delay = mapParams.q ? 280 : 0
    const timer = setTimeout(() => {
      setListBusy(true)
      loadGarden(dispatch, { ...mapParams, offset: 0 })
        .catch((err) => console.warn('map reload failed', err))
        .finally(() => { if (!stop) setListBusy(false) })
    }, delay)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [mapParams, dispatch])

  const nodes = useMemo(() => selectMapNodes(state), [state])
  const mapMeta = state.mapMeta || {}
  const dueCount = Number.isFinite(mapMeta.dueCount) ? mapMeta.dueCount : nodes.filter((n) => n.due <= Date.now()).length
  const total = Number.isFinite(mapMeta.total) ? mapMeta.total : nodes.length
  const hasMore = Boolean(mapMeta.hasMore)
  const tempoCount = nodes.length

  const onLoadMore = () => {
    if (!hasMore || moreBusy || listBusy) return
    setMoreBusy(true)
    loadMoreGarden(dispatch, { ...mapParams, offset: tempoCount })
      .catch((err) => console.warn('map load more failed', err))
      .finally(() => setMoreBusy(false))
  }

  const reviewButton = (
    <button type="button" data-tour="review" aria-pressed={reviewing} onClick={() => navigate({ pathname: paths.review, search: location.search })}>
      Review{dueCount ? ` ${dueCount}` : ''}
    </button>
  )

  const filters = (
    <>
      <button className={`chip ${onlyDue ? '' : 'on'}`} onClick={() => pushFilters({ due: false })}>All</button>
      <button className={`chip ${onlyDue ? 'on' : ''}`} onClick={() => pushFilters({ due: true })}>Due ({dueCount})</button>
      <input value={query} onChange={(e) => pushFilters({ q: e.target.value })} placeholder="Hunt a tempo…" aria-label="Search tempos" style={{ width: 150 }} />
      <TagFilter value={tag} onChange={(name) => pushFilters({ tag: name })} />
    </>
  )

  return (
    <>
      <section className="map-pane">
        <div className="map-toolbar">
          <div className="map-toolbar-filters">{filters}</div>
        </div>

        <TempoMap
          nodes={nodes}
          onOpen={onOpen}
          onCreate={() => setCreating(true)}
          review={reviewButton}
          creating={creating}
          onCloseCreate={() => setCreating(false)}
          loadMore={hasMore ? {
            busy: moreBusy || listBusy,
            label: moreBusy ? 'Loading…' : `Load more (${tempoCount}/${total})`,
            onClick: onLoadMore,
          } : null}
        />
      </section>

      {reviewing && (
        <div
          className="tempo-peek-backdrop"
          role="presentation"
          onPointerDown={(e) => { if (e.target === e.currentTarget) closeReview() }}
        >
          <div
            className="tempo-peek tempo-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="tempo-peek-head">
              <div className="tempo-peek-titles">
                <h2 id="review-title">Review</h2>
                <p className="sm muted" style={{ margin: 0 }}>
                  {dueCount
                    ? `${dueCount} ${dueCount === 1 ? 'tempo is' : 'tempos are'} waiting. Say each one in your own words.`
                    : 'Nothing is due. A short extra round is ready if you want it.'}
                </p>
              </div>
              <button type="button" className="ghost" aria-label="Close" onClick={closeReview}>
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="tempo-peek-body">
              <ReviewPanel onOpen={onOpen} />
            </div>
          </div>
        </div>
      )}

      <MapTour open={tourOpen} onDone={() => setTourOpen(false)} />
    </>
  )
}

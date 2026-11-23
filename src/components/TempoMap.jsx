import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store.jsx'
import { DAY, dueLabel, isDue, tone, LEVELS } from '../lib.js'
import CreateTempoDialog from './CreateTempoDialog.jsx'
import { useConfirm } from './ConfirmDialog.jsx'
import { deleteAndDispatch } from '../garden.js'
import { tempoApiEnabled } from '../tempoApi.js'

const MIN_COLS = 1
const MAX_COLS = 8

function clampCols(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 3
  return Math.min(MAX_COLS, Math.max(MIN_COLS, v))
}

function ColsControl({ value, onPreview, onChange }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const preview = (n) => {
    setHover(n)
    onPreview(n)
  }
  const clear = () => {
    setHover(0)
    onPreview(0)
  }
  return (
    <div className="tempo-cols">
      <div
        className="tempo-signal"
        role="radiogroup"
        aria-label="Cards across"
        onMouseLeave={clear}
      >
        {Array.from({ length: MAX_COLS }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} ${n === 1 ? 'column' : 'columns'}`}
            className={n <= shown ? 'on' : ''}
            style={{ '--bar': `${8 + (n - 1) * 4}px` }}
            onMouseEnter={() => preview(n)}
            onFocus={() => preview(n)}
            onBlur={clear}
            onClick={() => onChange(n)}
          >
            <span />
          </button>
        ))}
      </div>
    </div>
  )
}

function TempoTags({ tags }) {
  return (
    <span className="tag-row" title={tags.join(', ')}>
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`}>{tag}</span>
      ))}
    </span>
  )
}

function TempoGrid({ cols, children }) {
  return (
    <div className="tempo-grid" style={{ '--tempo-cols': cols }}>
      {children}
    </div>
  )
}

export default function TempoMap({ nodes, onOpen, onCreate, review = null, loadMore = null, creating = false, onCloseCreate }) {
  const { state, dispatch } = useStore()
  const confirm = useConfirm()
  const cols = clampCols(state.settings?.mapCols)
  const [previewCols, setPreviewCols] = useState(0)
  const shownCols = previewCols || cols
  const setCols = (mapCols) => {
    setPreviewCols(0)
    dispatch({ type: 'setting', patch: { mapCols } })
  }
  const tempos = nodes || []
  const createCard = onCreate ? (
    <button type="button" className="tempo-card tempo-card-create" data-tour="create" aria-label="Create tempo" onClick={onCreate}>
      <Plus size={48} strokeWidth={1.5} aria-hidden />
    </button>
  ) : null

  const remove = async (tempo) => {
    const ok = await confirm({
      title: `Delete “${tempo.name}”?`,
      message: 'Tags, examples, and review history for this tempo go with it. This can’t be undone.',
    })
    if (!ok) return
    try {
      if (tempoApiEnabled()) {
        await deleteAndDispatch(dispatch, tempo.id)
      } else {
        dispatch({ type: 'delete', id: tempo.id })
      }
    } catch (err) {
      console.error('delete failed', err)
      alert(err.message || 'Could not delete.')
    }
  }

  return (
    <div className="tempo-board" data-tour="map">
      <div className="tempo-board-bar">
        {review}
        <ColsControl value={cols} onPreview={setPreviewCols} onChange={setCols} />
      </div>

      <TempoGrid cols={shownCols}>
        {createCard}
        {tempos.map((t) => {
          const level = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, (t.confidence || 1) - 1))]
          const ink = tone(t.confidence)
          const due = isDue(t)
          const overdue = due && Date.now() - t.due > DAY
          const when = due ? dueLabel(t) : ''
          const tags = t.tags || []
          return (
                  <article
                    key={t.id}
                    className={`tempo-card tone-${ink}${due ? ' is-due' : ''}${overdue ? ' is-overdue' : ''}`}
                  >
                    <button
                      type="button"
                      className="tempo-card-hit"
                      onClick={() => onOpen(t.id)}
                    >
                      <span className="tempo-card-name">{t.name}</span>
                      {due && (
                        <span
                          className={`tempo-bang${overdue ? ' is-overdue' : ''}`}
                          title={when}
                          aria-hidden
                        >
                          !
                        </span>
                      )}
                      {due && <span className="tempo-card-status">{when}</span>}
                      {tags.length > 0 && <TempoTags tags={tags} />}
                      <span className="seg" title={level} aria-label={level}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <i key={n} className={n <= (t.confidence || 0) ? `f-${ink}` : ''} />
                        ))}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ghost tempo-card-delete"
                      onClick={() => remove(t)}
                      aria-label={`Delete ${t.name}`}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </article>
                )
        })}
      </TempoGrid>
      {tempos.length === 0 && (
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          No tempos in this view. Create one, or loosen the search and tag filters.
        </p>
      )}

      {loadMore && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" disabled={loadMore.busy} onClick={loadMore.onClick}>
            {loadMore.label}
          </button>
        </div>
      )}

      {creating && <CreateTempoDialog onClose={onCloseCreate} />}
    </div>
  )
}

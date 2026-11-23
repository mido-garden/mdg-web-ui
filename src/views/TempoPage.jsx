import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Sparkles, Trash2, X } from 'lucide-react'
import { useStore } from '../store.jsx'
import { tone, LEVELS, CHANNELS, MODES, generateExample, MAX_ENTITY_NAME, clampEntityName, scaleForName, nameLen } from '../lib.js'
import { selectTempo } from '../selectors.js'
import MediaGallery from '../components/MediaGallery.jsx'
import Burst from '../components/Burst.jsx'
import MarkdownEditor from '../components/MarkdownEditor.jsx'
import DueBadge from '../components/DueBadge.jsx'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import { useDarkMode } from '../theme.js'
import {
  applyScheduleToStore,
  deleteExample,
  deleteMedia,
  ensureTempoDetail,
  exampleId,
  exampleText,
  generateExampleApi,
  patchExample,
  patchReminder,
  postExample,
  postMedia,
  postReview,
  putTags,
  tempoApiEnabled,
  tryTempo,
} from '../tempoApi.js'
import { apiUpdateTempo, deleteAndDispatch } from '../garden.js'
import { ExampleList } from '../components/InlineExample.jsx'
import TagSearchStatus from '../components/TagSearchStatus.jsx'
import { buildTagChoices, normalizeTag, useTagLookup } from '../tagSuggest.js'

function ContentLoading() {
  return (
    <div className="detail-loading" role="status" aria-label="Loading content">
      <Loader2 className="spin" size={22} aria-hidden />
    </div>
  )
}

function ContentEditor({ content, onSave }) {
  const [draft, setDraft] = useState(content ?? '')
  const draftRef = useRef(content ?? '')
  const savedRef = useRef(content ?? '')
  const dirtyRef = useRef(false)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    if (dirtyRef.current) return
    const next = content ?? ''
    if (next === draftRef.current) return
    draftRef.current = next
    savedRef.current = next
    setDraft(next)
  }, [content])

  const flush = () => {
    const next = draftRef.current ?? ''
    if (next === savedRef.current) return
    savedRef.current = next
    dirtyRef.current = false
    onSaveRef.current(next)
  }

  useEffect(() => () => flush(), [])

  return (
    <MarkdownEditor
      value={draft}
      onChange={(v) => {
        dirtyRef.current = true
        draftRef.current = v
        setDraft(v)
      }}
      onBlur={flush}
      ariaLabel="Content"
      height={280}
    />
  )
}

function NameField({ name, onSave }) {
  const [draft, setDraft] = useState(name ?? '')
  const draftRef = useRef(name ?? '')
  const savedRef = useRef(name ?? '')
  const dirtyRef = useRef(false)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    if (dirtyRef.current) return
    const next = name ?? ''
    if (next === draftRef.current) return
    draftRef.current = next
    savedRef.current = next
    setDraft(next)
  }, [name])

  const flush = () => {
    const next = clampEntityName(draftRef.current ?? '')
    draftRef.current = next
    if (next === savedRef.current) return
    savedRef.current = next
    dirtyRef.current = false
    onSaveRef.current(next)
  }

  useEffect(() => () => flush(), [])

  return (
    <>
      <input
        value={draft}
        onChange={(e) => {
          const next = clampEntityName(e.target.value)
          dirtyRef.current = true
          draftRef.current = next
          setDraft(next)
        }}
        onBlur={flush}
        maxLength={MAX_ENTITY_NAME}
        aria-label="Tempo name"
        style={{ width: '100%', fontSize: 18, fontWeight: 500 }}
      />
      <div className="xs faint" style={{ marginTop: 4 }}>{nameLen(draft)}/{MAX_ENTITY_NAME}</div>
    </>
  )
}

const TABS = [
  ['content', 'Content'],
  ['examples', 'Examples'],
  ['review', 'Review'],
  ['reminder', 'Reminder'],
]

export default function TempoPage({ id, tab = 'content', onTab, onBack }) {
  const { state, dispatch } = useStore()
  const { dark } = useDarkMode()
  const t = selectTempo(state, id)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(() => Boolean(tempoApiEnabled() && id && !t?.detailLoaded))
  const [custom, setCustom] = useState('')
  const [burst, setBurst] = useState(0)
  const [saved, setSaved] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [tagOpen, setTagOpen] = useState(false)
  const confirm = useConfirm()
  const closeRef = useRef(null)
  const [tagHi, setTagHi] = useState(0)
  const tagLookup = useTagLookup(tagOpen, tagDraft)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onBack])

  useEffect(() => { setTagDraft(''); setTagOpen(false); setTagHi(0); setCustom('') }, [id])

  useEffect(() => {
    let active = true
    if (!tempoApiEnabled() || !id) {
      setLoading(false)
      return undefined
    }
    if (t?.detailLoaded) {
      setLoading(false)
      return undefined
    }
    setLoading(true)
    ensureTempoDetail(dispatch, id, t || {})
      .catch((err) => console.error('load tempo failed', err))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t?.detailLoaded])

  const shell = (title, body, actions = null, nav = null) => createPortal(
    <div
      className="tempo-peek-backdrop"
      role="presentation"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onBack() }}
    >
      <div
        className="tempo-peek tempo-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tempo-detail-title"
        onPointerDown={(e) => e.stopPropagation()}
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="tempo-peek-head">
          <div className="tempo-peek-titles">
            <h2 id="tempo-detail-title">{title}</h2>
          </div>
          <div className="tempo-peek-actions">
            {actions}
            <button ref={closeRef} type="button" className="ghost" aria-label="Close" onClick={onBack}>
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
        {nav}
        <div className="tempo-peek-body" data-color-mode={dark ? 'dark' : 'light'}>
          {body}
        </div>
      </div>
    </div>,
    document.body,
  )

  const tabs = (
    <div className="tabs" role="tablist" aria-label="Tempo">
      {TABS.map(([tabId, label]) => (
        <button
          key={tabId}
          type="button"
          role="tab"
          aria-selected={tab === tabId}
          className={tab === tabId ? 'on' : ''}
          onClick={() => onTab(tabId)}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (!t) {
    if (loading) {
      return shell(
        'Tempo',
        <section className="card tempo-content">
          <h2>Content</h2>
          <ContentLoading />
        </section>,
        null,
        tabs,
      )
    }
    return shell('Tempo', <p className="muted">This tempo is gone.</p>)
  }

  const { tempos } = state

  const saveName = (name) => {
    dispatch({ type: 'updateTempo', id: t.id, patch: { name, scale: scaleForName(name) } })
    if (!tempoApiEnabled()) return
    apiUpdateTempo(t.id, { name, scale: scaleForName(name) }).catch((err) => console.error('update tempo failed', err))
  }

  const saveContent = (content) => {
    dispatch({ type: 'updateTempo', id: t.id, patch: { content } })
    if (!tempoApiEnabled()) return
    apiUpdateTempo(t.id, { content }).catch((err) => console.error('update tempo failed', err))
  }

  const rem = async (patch) => {
    dispatch({ type: 'remind', id: t.id, patch })
    if (tempoApiEnabled()) {
      await tryTempo(() => patchReminder(t.id, patch))
    }
  }

  const gen = async () => {
    setBusy(true)
    let created = null
    if (tempoApiEnabled()) {
      created = await tryTempo(() => generateExampleApi(t.id))
    }
    if (created) {
      dispatch({ type: 'addExample', id: t.id, example: created })
    } else {
      const text = await generateExample(t, t.examples.length)
      dispatch({ type: 'addExample', id: t.id, text })
    }
    setBusy(false)
  }

  const addCustom = async (e) => {
    e.preventDefault()
    if (!custom.trim()) return
    const text = custom.trim()
    setCustom('')
    let created = null
    if (tempoApiEnabled()) {
      created = await tryTempo(() => postExample(t.id, text))
    }
    dispatch({ type: 'addExample', id: t.id, text, example: created || undefined, exampleId: created?.id })
  }

  const saveEx = async ({ example, index, text, exampleId: eid }) => {
    if (tempoApiEnabled() && eid) {
      const updated = await tryTempo(() => patchExample(t.id, eid, text))
      if (!updated) throw new Error('Could not save example')
    }
    dispatch({ type: 'updateExample', id: t.id, index, exampleId: eid || undefined, text })
  }

  const removeEx = async (ex, index) => {
    const text = exampleText(ex)
    const ok = await confirm({
      title: 'Delete this example?',
      message: text ? `“${text.slice(0, 80)}${text.length > 80 ? '…' : ''}”` : 'This can’t be undone.',
    })
    if (!ok) return
    const eid = exampleId(ex)
    if (tempoApiEnabled() && eid) {
      await tryTempo(() => deleteExample(t.id, eid))
    }
    dispatch({ type: 'removeExample', id: t.id, index, exampleId: eid || undefined })
  }

  const tags = t.tags || []
  const tagChoices = buildTagChoices({
    query: tagDraft,
    existing: tags,
    found: tagLookup.found,
    local: tempos.flatMap((item) => item.tags || []),
    settled: tagLookup.settled,
  })
  const tagIndex = Math.min(tagHi, Math.max(0, tagChoices.length - 1))
  const tagMenuOpen = tagOpen && (tagChoices.length > 0 || tagLookup.loading)

  const commitTag = async (raw) => {
    const next = normalizeTag(raw)
    setTagDraft('')
    setTagOpen(false)
    setTagHi(0)
    if (!next || tags.some((tag) => normalizeTag(tag) === next)) return
    const nextTags = [...tags, next]
    dispatch({ type: 'update', id: t.id, patch: { tags: nextTags } })
    if (tempoApiEnabled()) await tryTempo(() => putTags(t.id, nextTags))
  }

  const removeTag = async (tag) => {
    const nextTags = tags.filter((x) => x !== tag)
    dispatch({ type: 'update', id: t.id, patch: { tags: nextTags } })
    if (tempoApiEnabled()) await tryTempo(() => putTags(t.id, nextTags))
  }

  const addTag = (e) => {
    e.preventDefault()
    const choice = tagOpen && tagChoices[tagIndex]
    commitTag(choice ? choice.label : tagDraft)
  }

  const rate = async (n) => {
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
    if (n >= 4) setBurst((b) => b + 1)
  }

  const onAddMedia = async (item) => {
    let media = null
    if (tempoApiEnabled() && item.url && !String(item.url).startsWith('data:')) {
      media = await tryTempo(() => postMedia(t.id, item))
    }
    dispatch({
      type: 'addMedia',
      id: t.id,
      kind: item.kind,
      url: media?.url || item.url,
      title: media?.title || item.title || '',
      mediaId: media?.id,
    })
  }

  const onRemoveMedia = async (mediaId) => {
    const item = (t.media || []).find((m) => m.id === mediaId)
    const ok = await confirm({
      title: 'Remove this media?',
      message: item?.title ? `“${item.title}”` : 'This can’t be undone.',
      confirmLabel: 'Remove',
    })
    if (!ok) return
    if (tempoApiEnabled()) await tryTempo(() => deleteMedia(t.id, mediaId))
    dispatch({ type: 'removeMedia', id: t.id, mediaId })
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      message: 'It will be removed from your garden. This can’t be undone.',
    })
    if (!ok) return
    try {
      if (tempoApiEnabled()) {
        await deleteAndDispatch(dispatch, t.id)
      } else {
        dispatch({ type: 'delete', id: t.id })
      }
      onBack()
    } catch (err) {
      alert(err.message || 'Could not delete.')
    }
  }

  const flashSaved = async () => {
    if (tempoApiEnabled()) await tryTempo(() => patchReminder(t.id, t.reminder))
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const pts = (t.history || []).slice(-10)
  const spark = pts.map((h, i) => `${(i / Math.max(1, pts.length - 1)) * 200},${50 - (h.r - 1) * 11}`).join(' ')

  return shell(
    t.name || 'Tempo',
    <>
      {tab === 'reminder' ? (
        <section className="card">
          <h2>Reminders</h2>
          <div className="xs muted">Channels</div>
          <div className="row" style={{ gap: 6, margin: '4px 0 10px' }}>
            {Object.entries(CHANNELS).map(([k, label]) => (
              <button key={k} type="button" className={`chip ${t.reminder.channels[k] ? 'on' : ''}`} aria-pressed={t.reminder.channels[k]}
                onClick={() => rem({ channels: { ...t.reminder.channels, [k]: !t.reminder.channels[k] } })}>{label}</button>
            ))}
          </div>
          <div className="row">
            <select value={t.reminder.mode} onChange={(e) => rem({ mode: e.target.value })} aria-label="Frequency">
              {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="time" value={t.reminder.time} onChange={(e) => rem({ time: e.target.value })} aria-label="Reminder time" />
          </div>
          <label className="row sm" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={t.reminder.fun} onChange={(e) => rem({ fun: e.target.checked })} /> Funny tone
          </label>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" onClick={flashSaved}>Save reminders</button>
            {saved && <span className="sm" style={{ color: 'var(--grn)' }}>Saved</span>}
          </div>
        </section>
      ) : tab === 'examples' ? (
        <section className="card">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>Examples ({(t.examples || []).length})</h2>
            <div className="sp" />
            <button type="button" onClick={gen} disabled={busy}><Sparkles size={15} aria-hidden /> {busy ? 'Thinking of an example...' : 'Generate example'}</button>
          </div>
          <ExampleList
            examples={t.examples || []}
            onSave={saveEx}
            onDelete={removeEx}
            addValue={custom}
            onAddChange={setCustom}
            onAdd={addCustom}
            addPlaceholder="Write your own example"
          />
        </section>
      ) : tab === 'review' ? (
        <section className="card" style={{ position: 'relative' }}>
          <h2>How confident are you?</h2>
          <div className="rate">
            {LEVELS.map((l, i) => (
              <button key={l} type="button" className={t.confidence === i + 1 ? `tone-${tone(i + 1)}` : ''} onClick={() => rate(i + 1)}><b>{i + 1}</b>{l}</button>
            ))}
          </div>
          <Burst k={burst} />
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="sm muted">Reviewed {(t.history || []).length} times</span>
            <DueBadge tempo={t} />
          </div>
          {pts.length > 1 && (
            <svg viewBox="0 0 200 56" width="100%" height="56" style={{ marginTop: 8 }} role="img" aria-label="Confidence trend">
              <polyline points={spark} fill="none" stroke="var(--accent)" strokeWidth="2" />
            </svg>
          )}
        </section>
      ) : (
        <div className="stack">
      <section className="card">
        <h2>Name</h2>
        <NameField key={t.id} name={t.name ?? ''} onSave={saveName} />
      </section>
      <section className="card">
        <h2>Tags</h2>
      <div className="tag-row" aria-label="Tags">
        {tags.map((tag) => (
          <span key={tag}>
            {tag}
            <button type="button" className="tag-x" aria-label={`Remove ${tag}`} onClick={() => removeTag(tag)}>×</button>
          </span>
        ))}
        <form className="tag-add" onSubmit={addTag}>
          <input
            value={tagDraft}
            onChange={(e) => { setTagDraft(e.target.value); setTagHi(0); setTagOpen(true) }}
            onFocus={() => setTagOpen(true)}
            onBlur={() => setTagOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setTagOpen(true); setTagHi((n) => Math.min(tagChoices.length - 1, n + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setTagHi((n) => Math.max(0, n - 1)) }
              else if (e.key === 'Escape' && tagOpen) { e.stopPropagation(); setTagOpen(false) }
            }}
            placeholder="Add a tag"
            aria-label="New tag"
            role="combobox"
            aria-expanded={tagMenuOpen}
            aria-autocomplete="list"
            aria-controls="tag-choices"
          />
          {tagMenuOpen && (
            <ul className="tag-menu" id="tag-choices" role="listbox" aria-busy={tagLookup.loading || undefined}>
              {tagLookup.loading && <TagSearchStatus />}
              {tagChoices.map((choice, i) => (
                <li key={choice.create ? `new:${choice.label}` : choice.label} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === tagIndex}
                    className={i === tagIndex ? 'on' : ''}
                    onMouseDown={(e) => { e.preventDefault(); commitTag(choice.label) }}
                    onMouseEnter={() => setTagHi(i)}
                  >
                    {choice.create ? `Add “${choice.label}”` : choice.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      </div>
      </section>

      <section className="card tempo-content" aria-busy={loading || undefined}>
        <h2>Content</h2>
        {loading
          ? <ContentLoading />
          : <ContentEditor key={t.id} content={t.content ?? ''} onSave={saveContent} />}
      </section>

      <section className="card">
        <h2>Media ({(t.media || []).length})</h2>
        <MediaGallery
          key={t.id}
          mode="edit"
          items={t.media}
          onAdd={onAddMedia}
          onRemove={onRemoveMedia}
        />
      </section>
        </div>
      )}
    </>,
    <button type="button" className="ghost" style={{ color: 'var(--red)' }} onClick={onDelete} aria-label="Delete tempo"><Trash2 size={15} aria-hidden /></button>,
    tabs,
  )
}

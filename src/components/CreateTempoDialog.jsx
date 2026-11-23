import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../store.jsx'
import {
  CHANNELS,
  LEVELS,
  MAX_ENTITY_NAME,
  MODES,
  clampEntityName,
  defaultReminder,
  nameLen,
  scaleForName,
  tone,
  validEntityName,
} from '../lib.js'
import { useDarkMode } from '../theme.js'
import { useConfirm } from './ConfirmDialog.jsx'
import DueBadge from './DueBadge.jsx'
import MarkdownEditor from './MarkdownEditor.jsx'
import { ExampleList } from './InlineExample.jsx'
import MediaGallery from './MediaGallery.jsx'
import { createAndDispatch } from '../garden.js'
import { patchReminder, postExample, postMedia, putTags, tempoApiEnabled } from '../tempoApi.js'
import TagSearchStatus from './TagSearchStatus.jsx'
import { buildTagChoices, normalizeTag, useTagLookup } from '../tagSuggest.js'

function localDueValue(ms = Date.now()) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CreateTempoDialog({ onClose }) {
  const { state, dispatch } = useStore()
  const { dark } = useDarkMode()
  const confirm = useConfirm()
  const closeRef = useRef(null)
  const nameRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState([])
  const [tagDraft, setTagDraft] = useState('')
  const [tagOpen, setTagOpen] = useState(false)
  const [tagHi, setTagHi] = useState(0)
  const [examples, setExamples] = useState([])
  const [exampleDraft, setExampleDraft] = useState('')
  const [media, setMedia] = useState([])
  const [confidence, setConfidence] = useState(1)
  const [dueLocal, setDueLocal] = useState(() => localDueValue())
  const [reminder, setReminder] = useState(() => defaultReminder())
  const [tab, setTab] = useState('content')
  const [seenTabs, setSeenTabs] = useState(() => new Set(['content']))

  const showTab = (id) => {
    setTab(id)
    setSeenTabs((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }
  const unseen = CREATE_TABS.find(([id]) => !seenTabs.has(id))
  const readyToCreate = !unseen

  const dirty = Boolean(
    name.trim() || content.trim() || tags.length || examples.length || media.length || exampleDraft.trim() || tagDraft.trim(),
  )

  const requestClose = async () => {
    if (busy) return
    if (dirty) {
      const ok = await confirm({
        title: 'Discard this tempo?',
        message: 'The name, content, and other details in this popup will be lost.',
        confirmLabel: 'Discard',
        danger: true,
      })
      if (!ok) return
    }
    onClose()
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    nameRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
    // Close handler reads the latest draft via requestClose on each keypress through state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, busy])

  const tagLookup = useTagLookup(tagOpen, tagDraft)
  const tagChoices = buildTagChoices({
    query: tagDraft,
    existing: tags,
    found: tagLookup.found,
    local: (state.tempos || []).flatMap((t) => t.tags || []),
    settled: tagLookup.settled,
  })
  const tagIndex = Math.min(tagHi, Math.max(0, tagChoices.length - 1))
  const tagMenuOpen = tagOpen && (tagChoices.length > 0 || tagLookup.loading)

  const commitTag = (raw) => {
    const next = normalizeTag(raw)
    setTagDraft('')
    setTagOpen(false)
    setTagHi(0)
    if (!next || tags.some((tag) => normalizeTag(tag) === next)) return
    setTags((list) => [...list, next])
  }

  const addExample = (e) => {
    e.preventDefault()
    const text = exampleDraft.trim()
    if (!text) return
    setExamples((list) => [...list, text])
    setExampleDraft('')
  }

  const dueMs = Date.parse(dueLocal)
  const previewDue = Number.isFinite(dueMs) ? dueMs : Date.now()
  const previewTempo = { due: previewDue }

  const save = async () => {
    if (!validEntityName(name) || busy) return
    const trimmed = clampEntityName(name.trim())
    const exampleTexts = examples.map((text) => text.trim()).filter(Boolean)
    const dueIso = new Date(previewDue).toISOString()
    setBusy(true)
    try {
      if (!tempoApiEnabled()) {
        dispatch({
          type: 'add',
          name: trimmed,
          content,
          confidence,
          due: previewDue,
          tags,
          examples: exampleTexts,
          media,
          reminder,
          scale: scaleForName(trimmed),
        })
        onClose()
        return
      }
      const created = await createAndDispatch(dispatch, {
        name: trimmed,
        content,
        confidence,
        due: dueIso,
        scale: scaleForName(trimmed),
      })
      const id = created?.id
      if (!id) throw new Error('Could not create.')
      const jobs = []
      if (tags.length) {
        jobs.push(putTags(id, tags).then((res) => {
          dispatch({ type: 'updateTempo', id, patch: { tags: res?.tags || tags } })
        }))
      }
      for (const text of exampleTexts) {
        jobs.push(postExample(id, text).then((example) => {
          dispatch({ type: 'addExample', id, text, example: example || undefined, exampleId: example?.id })
        }))
      }
      for (const item of media) {
        if (item.url && !String(item.url).startsWith('data:')) {
          jobs.push(postMedia(id, item).then((saved) => {
            dispatch({
              type: 'addMedia',
              id,
              kind: item.kind,
              url: saved?.url || item.url,
              title: saved?.title || item.title || '',
              mediaId: saved?.id || item.id,
            })
          }))
        } else {
          dispatch({
            type: 'addMedia',
            id,
            kind: item.kind,
            url: item.url,
            title: item.title || '',
            mediaId: item.id,
          })
        }
      }
      jobs.push(patchReminder(id, reminder).then(() => {
        dispatch({ type: 'remind', id, patch: reminder })
      }))
      const settled = await Promise.allSettled(jobs)
      if (settled.some((result) => result.status === 'rejected')) {
        console.error('create details failed', settled)
        alert('The tempo was created, but some details could not be saved. Open it to finish.')
      }
      onClose()
    } catch (err) {
      console.error('create tempo failed', err)
      alert(err.message || 'Could not create.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="tempo-peek-backdrop"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div
        className="tempo-peek create-tempo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tempo-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="tempo-peek-head">
          <div className="tempo-peek-titles">
            <h2 id="create-tempo-title">{name.trim() || 'Create tempo'}</h2>
          </div>
          <div className="tempo-peek-actions">
            <button ref={closeRef} type="button" className="ghost" aria-label="Close" onClick={requestClose}>
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Tempo">
          {CREATE_TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'on' : ''}
              onClick={() => showTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="tempo-peek-body" data-color-mode={dark ? 'dark' : 'light'}>
            {tab === 'examples' ? (
              <section className="card">
                <h2>Examples ({examples.length})</h2>
                <ExampleList
                  examples={examples}
                  onSave={({ index, text }) => setExamples((list) => list.map((item, i) => (i === index ? text : item)))}
                  onDelete={(_example, index) => setExamples((list) => list.filter((_, i) => i !== index))}
                  addValue={exampleDraft}
                  onAddChange={setExampleDraft}
                  onAdd={addExample}
                />
              </section>
            ) : tab === 'review' ? (
              <section className="card">
                <h2>How confident are you?</h2>
                <div className="rate">
                  {LEVELS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      className={confidence === i + 1 ? `tone-${tone(i + 1)}` : ''}
                      onClick={() => setConfidence(i + 1)}
                    >
                      <b>{i + 1}</b>{label}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="sm muted">Due</span>
                  <input type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} aria-label="Due" />
                  <DueBadge tempo={previewTempo} />
                </div>
              </section>
            ) : tab === 'reminder' ? (
              <section className="card">
                <h2>Reminders</h2>
                <div className="xs muted">Channels</div>
                <div className="row" style={{ gap: 6, margin: '4px 0 10px' }}>
                  {Object.entries(CHANNELS).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`chip ${reminder.channels[key] ? 'on' : ''}`}
                      aria-pressed={reminder.channels[key]}
                      onClick={() => setReminder((current) => ({
                        ...current,
                        channels: { ...current.channels, [key]: !current.channels[key] },
                      }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <select
                    value={reminder.mode}
                    onChange={(e) => setReminder((current) => ({ ...current, mode: e.target.value }))}
                    aria-label="Frequency"
                  >
                    {Object.entries(MODES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <input
                    type="time"
                    value={reminder.time}
                    onChange={(e) => setReminder((current) => ({ ...current, time: e.target.value }))}
                    aria-label="Reminder time"
                  />
                </div>
                <label className="row sm" style={{ marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={reminder.fun}
                    onChange={(e) => setReminder((current) => ({ ...current, fun: e.target.checked }))}
                  />
                  Funny tone
                </label>
              </section>
            ) : (
              <div className="stack">
                <section className="card">
                  <h2>Name</h2>
                  <input
                    ref={nameRef}
                    value={name}
                    onChange={(e) => setName(clampEntityName(e.target.value))}
                    maxLength={MAX_ENTITY_NAME}
                    placeholder="Name this tempo"
                    aria-label="Tempo name"
                    style={{ width: '100%', fontSize: 18, fontWeight: 500 }}
                  />
                  <div className="xs faint" style={{ marginTop: 4 }}>{nameLen(name)}/{MAX_ENTITY_NAME}</div>
                </section>

                <section className="card">
                  <h2>Tags</h2>
                  <div className="tag-row" aria-label="Tags">
                    {tags.map((tag) => (
                      <span key={tag}>
                        {tag}
                        <button type="button" className="tag-x" aria-label={`Remove ${tag}`} onClick={() => setTags((list) => list.filter((item) => item !== tag))}>×</button>
                      </span>
                    ))}
                    <form className="tag-add" onSubmit={(e) => { e.preventDefault(); commitTag(tagOpen && tagChoices[tagIndex] ? tagChoices[tagIndex].label : tagDraft) }}>
                      <input
                        value={tagDraft}
                        onChange={(e) => { setTagDraft(e.target.value); setTagHi(0); setTagOpen(true) }}
                        onFocus={() => setTagOpen(true)}
                        onBlur={() => setTagOpen(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') { e.preventDefault(); setTagOpen(true); setTagHi((n) => Math.min(tagChoices.length - 1, n + 1)) }
                          else if (e.key === 'ArrowUp') { e.preventDefault(); setTagHi((n) => Math.max(0, n - 1)) }
                          else if (e.key === 'Escape') { e.stopPropagation(); setTagOpen(false) }
                        }}
                        placeholder="Add a tag"
                        aria-label="New tag"
                        role="combobox"
                        aria-expanded={tagMenuOpen}
                        aria-autocomplete="list"
                      />
                      {tagMenuOpen && (
                        <ul className="tag-menu" role="listbox" aria-busy={tagLookup.loading || undefined}>
                          {tagLookup.loading && <TagSearchStatus />}
                          {tagChoices.map((choice, i) => (
                            <li key={choice.label} role="presentation">
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

                <section className="card tempo-content">
                  <h2>Content</h2>
                  <MarkdownEditor value={content} onChange={setContent} ariaLabel="Content" height={240} />
                </section>

                <section className="card">
                  <h2>Media ({media.length})</h2>
                  <MediaGallery
                    mode="edit"
                    items={media}
                    onAdd={(item) => setMedia((list) => [...list, { ...item, id: `m${Date.now()}` }])}
                    onRemove={(mediaId) => setMedia((list) => list.filter((item) => item.id !== mediaId))}
                  />
                </section>
              </div>
            )}
        </div>
        <div className="create-tempo-foot">
          <button type="button" className="ghost" onClick={requestClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="primary"
            onClick={() => (readyToCreate ? save() : showTab(unseen[0]))}
            disabled={busy || (readyToCreate && !validEntityName(name))}
          >
            {busy ? 'Creating…' : readyToCreate ? 'Create tempo' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const CREATE_TABS = [
  ['content', 'Content'],
  ['examples', 'Examples'],
  ['review', 'Review'],
  ['reminder', 'Reminder'],
]

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { MEDIA_KINDS, youtubeId } from '../lib.js'

const FILE_LIMIT = 1_200_000

function groupsOf(items = []) {
  return MEDIA_KINDS.map((kind) => ({
    ...kind,
    items: items.filter((m) => m.kind === kind.id),
  }))
}

function Video({ item }) {
  const yt = youtubeId(item.url)
  if (yt) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${yt}`}
        title={item.title || 'Video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    )
  }
  return <video src={item.url} controls preload="metadata" />
}

function RemoveButton({ item, onRemove }) {
  if (!onRemove) return null
  return (
    <button type="button" className="ghost" aria-label={`Remove ${item.title || item.kind}`} onClick={() => onRemove(item.id)}>
      <Trash2 size={14} aria-hidden />
    </button>
  )
}

function Lightbox({ items, index, onClose, onIndex }) {
  const closeRef = useRef(null)
  const item = items[index]

  useEffect(() => {
    closeRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onClose()
      } else if (e.key === 'ArrowRight' && items.length > 1) {
        e.preventDefault()
        e.stopImmediatePropagation()
        onIndex((index + 1) % items.length)
      } else if (e.key === 'ArrowLeft' && items.length > 1) {
        e.preventDefault()
        e.stopImmediatePropagation()
        onIndex((index - 1 + items.length) % items.length)
      } else if (e.code === 'Space' || /^[1-5]$/.test(e.key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey, true)
    }
  }, [index, items.length, onClose, onIndex])

  if (!item) return null

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.title || 'Image'} onClick={onClose}>
      <button ref={closeRef} type="button" className="lightbox-close" aria-label="Close" onClick={onClose}><X size={18} aria-hidden /></button>
      {items.length > 1 && (
        <button
          type="button"
          className="lightbox-nav prev"
          aria-label="Previous image"
          onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + items.length) % items.length) }}
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
      )}
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={item.url} alt={item.title || 'Image'} />
        {item.title && <figcaption>{item.title}{items.length > 1 ? ` · ${index + 1} / ${items.length}` : ''}</figcaption>}
      </figure>
      {items.length > 1 && (
        <button
          type="button"
          className="lightbox-nav next"
          aria-label="Next image"
          onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % items.length) }}
        >
          <ChevronRight size={22} aria-hidden />
        </button>
      )}
    </div>,
    document.body,
  )
}

function ImageShelf({ items, onRemove }) {
  const [openId, setOpenId] = useState(null)
  const index = items.findIndex((m) => m.id === openId)

  return (
    <>
      <div className="media-images">
        {items.map((m) => (
          <figure key={m.id} className="media-shot">
            <button type="button" className="media-open" aria-label={`View ${m.title || 'image'} larger`} onClick={() => setOpenId(m.id)}>
              <img src={m.url} alt="" />
            </button>
            <figcaption>
              <span>{m.title || 'Image'}</span>
              <RemoveButton item={m} onRemove={onRemove} />
            </figcaption>
          </figure>
        ))}
      </div>
      {index >= 0 && (
        <Lightbox
          items={items}
          index={index}
          onClose={() => setOpenId(null)}
          onIndex={(next) => setOpenId(items[next].id)}
        />
      )}
    </>
  )
}

function Clip({ item, onRemove, children }) {
  return (
    <div className="media-clip">
      <div className="media-clip-head">
        <span>{item.title || (item.kind === 'audio' ? 'Sound' : 'Video')}</span>
        <RemoveButton item={item} onRemove={onRemove} />
      </div>
      {children}
    </div>
  )
}

function SoundShelf({ items, onRemove }) {
  return items.map((m) => (
    <Clip key={m.id} item={m} onRemove={onRemove}>
      <audio src={m.url} controls preload="metadata" />
    </Clip>
  ))
}

function VideoShelf({ items, onRemove, oneAtATime }) {
  const [picked, setPicked] = useState(items[0]?.id)
  if (oneAtATime && items.length > 1) {
    const current = items.find((m) => m.id === picked) || items[0]
    return (
      <>
        <div className="media-pick" role="tablist" aria-label="Videos">
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === current.id}
              className={m.id === current.id ? 'on' : ''}
              onClick={() => setPicked(m.id)}
            >
              {m.title || `Video ${i + 1}`}
            </button>
          ))}
        </div>
        <div className="media-clip">
          <Video item={current} />
        </div>
      </>
    )
  }
  return items.map((m) => (
    <Clip key={m.id} item={m} onRemove={onRemove}>
      <Video item={m} />
    </Clip>
  ))
}

function Shelf({ kind, items, onRemove, oneAtATime }) {
  if (!items.length) return <p className="sm faint media-empty">No {kind.plural.toLowerCase()} yet.</p>
  if (kind.id === 'image') return <ImageShelf items={items} onRemove={onRemove} />
  if (kind.id === 'audio') return <SoundShelf items={items} onRemove={onRemove} />
  return <VideoShelf items={items} onRemove={onRemove} oneAtATime={oneAtATime} />
}

function AddForm({ kind, onAdd }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')

  const add = (next) => {
    onAdd(next)
    setTitle('')
    setUrl('')
    setErr('')
  }

  const submit = (e) => {
    e.preventDefault()
    const link = url.trim()
    if (!link) return
    if (kind.id !== 'video' && youtubeId(link)) {
      setErr('YouTube links go on the Video tab.')
      return
    }
    add({ kind: kind.id, url: link, title: title.trim() })
  }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const prefix = kind.id === 'image' ? 'image/' : kind.id === 'audio' ? 'audio/' : 'video/'
    if (!file.type.startsWith(prefix)) {
      setErr(`Choose a ${kind.label.toLowerCase()} file.`)
      return
    }
    if (file.size > FILE_LIMIT) {
      setErr('That file is too large to keep in the app. Paste a link instead.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => add({ kind: kind.id, url: reader.result, title: title.trim() || file.name })
    reader.readAsDataURL(file)
  }

  const linkHint = kind.id === 'video' ? 'Paste a video or YouTube link' : kind.id === 'image' ? 'Paste an image link' : 'Paste a sound link'

  return (
    <form className="media-add" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Caption" aria-label={`${kind.label} caption`} />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={linkHint} aria-label={`${kind.label} link`} />
      <div className="row">
        <button type="submit" disabled={!url.trim()}>Add {kind.label.toLowerCase()}</button>
        <label className="ghost" style={{ cursor: 'pointer' }}>
          Upload
          <input type="file" accept={kind.accept} hidden onChange={onFile} aria-label={`Upload ${kind.label.toLowerCase()}`} />
        </label>
      </div>
      {err && <div className="xs" style={{ color: 'var(--red)' }}>{err}</div>}
      <div className="xs faint">
        {kind.id === 'video'
          ? 'A link is the better choice for video. Uploads stay under 1 MB.'
          : 'Uploads stay under 1 MB.'}
      </div>
    </form>
  )
}

export function MediaHints({ items = [] }) {
  const groups = groupsOf(items).filter((g) => g.items.length)
  if (!groups.length) return null
  return (
    <div className="media-hints">
      <span className="xs faint">After the flip</span>
      {groups.map((g) => (
        <span key={g.id} className="pill">{g.plural} {g.items.length}</span>
      ))}
    </div>
  )
}

export default function MediaGallery({ items = [], mode = 'view', onAdd, onRemove }) {
  const editing = mode === 'edit'
  const groups = groupsOf(items).filter((g) => editing || g.items.length)
  const [tab, setTab] = useState(() => (groups.find((g) => g.items.length) || groups[0])?.id || 'image')
  const current = groups.find((g) => g.id === tab) || groups[0]
  if (!current) return null

  const showTabs = groups.length > 1

  return (
    <div className={`media-board ${editing ? '' : 'media-compact'}`}>
      {showTabs && (
        <div className="tabs" role="tablist" aria-label="Media">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === current.id}
              className={g.id === current.id ? 'on' : ''}
              onClick={() => setTab(g.id)}
            >
              {g.plural}{g.items.length ? ` ${g.items.length}` : ''}
            </button>
          ))}
        </div>
      )}
      {!showTabs && <h3>{current.plural}</h3>}
      <Shelf kind={current} items={current.items} onRemove={onRemove} oneAtATime={!editing} />
      {editing && <AddForm key={current.id} kind={current} onAdd={onAdd} />}
    </div>
  )
}

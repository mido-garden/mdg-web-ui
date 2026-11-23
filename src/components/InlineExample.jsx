import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { exampleId, exampleText } from '../tempoApi.js'

/**
 * Click-to-edit example text in place (no modal / separate page).
 */
export default function InlineExample({
  example,
  index,
  onSave,
  onDelete,
  showIndex = true,
  readOnly = false,
  className = 'ex',
}) {
  const text = exampleText(example)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!editing) setDraft(text)
  }, [text, editing])

  useEffect(() => {
    if (!editing || !ref.current) return
    const el = ref.current
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editing])

  const start = (e) => {
    e?.stopPropagation()
    if (busy || readOnly || !onSave) return
    setDraft(text)
    setEditing(true)
  }

  const cancel = () => {
    setDraft(text)
    setEditing(false)
  }

  const commit = async () => {
    const next = draft.trim()
    if (!next || next === text) {
      cancel()
      return
    }
    setBusy(true)
    try {
      await onSave?.({ example, index, text: next, exampleId: exampleId(example) })
      setEditing(false)
    } catch (err) {
      console.error('update example failed', err)
      setDraft(text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      {showIndex && <span className="ex-n" aria-hidden>{index + 1}</span>}
      {editing ? (
        <textarea
          ref={ref}
          className="ex-input"
          value={draft}
          disabled={busy}
          rows={2}
          aria-label={`Edit example ${index + 1}`}
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commit()
            }
          }}
          onBlur={() => { if (!busy) commit() }}
        />
      ) : (
        readOnly || !onSave ? (
          <p className="ex-text is-static">{text || 'Empty example'}</p>
        ) : (
          <button
            type="button"
            className="ex-text"
            onClick={start}
            title="Click to edit"
          >
            {text || 'Empty example'}
          </button>
        )
      )}
      {onDelete && !readOnly && (
        <button
          type="button"
          className="ghost"
          aria-label="Delete example"
          disabled={busy || editing}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(example, index)
          }}
        >
          <Trash2 size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}

export function ExampleList({
  examples = [],
  onSave,
  onDelete,
  readOnly = false,
  addValue,
  onAddChange,
  onAdd,
  addPlaceholder = 'Write an example',
  addLabel = 'Add',
  adding = false,
}) {
  return (
    <div className="ex-list" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {examples.map((example, index) => (
        <InlineExample
          key={exampleId(example) || `${index}-${exampleText(example).slice(0, 12)}`}
          example={example}
          index={index}
          onSave={onSave}
          onDelete={onDelete}
          readOnly={readOnly}
        />
      ))}
      {onAdd && (
        <form className="ex-composer" onSubmit={onAdd}>
          <input
            value={addValue}
            onChange={(e) => onAddChange(e.target.value)}
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
          />
          <button type="submit" disabled={adding || !String(addValue || '').trim()}>{addLabel}</button>
        </form>
      )}
    </div>
  )
}

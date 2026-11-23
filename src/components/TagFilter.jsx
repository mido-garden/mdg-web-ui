import { useEffect, useState } from 'react'
import { searchTags, tryTempo } from '../tempoApi.js'

function tagRows(res) {
  return (res?.tags || [])
    .map((row) => ({
      name: row.name || row.tag || '',
      count: row.count ?? 0,
    }))
    .filter((row) => row.name)
}

export default function TagFilter({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [options, setOptions] = useState([])
  const [hi, setHi] = useState(0)
  const [busy, setBusy] = useState(false)

  const choices = [
    ...(draft.trim() ? [] : [{ name: '', label: 'Every tag' }]),
    ...options.map((row) => ({ name: row.name, label: row.name, count: row.count })),
  ]
  const active = Math.min(hi, Math.max(0, choices.length - 1))

  useEffect(() => {
    if (!open) return undefined
    let stop = false
    const q = draft.trim()
    const timer = setTimeout(() => {
      setBusy(true)
      tryTempo(() => searchTags(q))
        .then((res) => {
          if (stop) return
          setOptions(tagRows(res))
          setHi(0)
        })
        .finally(() => { if (!stop) setBusy(false) })
    }, q ? 280 : 0)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [open, draft])

  const pick = (name) => {
    onChange(name)
    setDraft('')
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHi((n) => Math.min(choices.length - 1, n + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((n) => Math.max(0, n - 1))
    } else if (e.key === 'Enter' && open && choices[active]) {
      e.preventDefault()
      pick(choices[active].name)
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
      setDraft('')
    }
  }

  return (
    <div className="tag-filter">
      {value && (
        <span className="tag-filter-picked" title={value}>
          {value}
          <button type="button" className="tag-x" aria-label={`Clear ${value}`} onClick={() => pick('')}>×</button>
        </span>
      )}
      <input
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setHi(0); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={value ? 'Change tag' : 'Search tags'}
        aria-label="Filter by tag"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="tag-filter-list"
        autoComplete="off"
      />
      {open && (
        <ul className="tag-menu" id="tag-filter-list" role="listbox">
          {choices.map((choice, i) => (
            <li key={choice.name || 'every'} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? 'on' : ''}
                onMouseDown={(e) => { e.preventDefault(); pick(choice.name) }}
                onMouseEnter={() => setHi(i)}
              >
                <span className="tag-filter-name">{choice.label}</span>
                {choice.count ? <span className="tag-filter-count">{choice.count}</span> : null}
              </button>
            </li>
          ))}
          {!busy && draft.trim() && options.length === 0 && (
            <li className="tag-filter-empty">No tags match</li>
          )}
          {busy && options.length === 0 && (
            <li className="tag-filter-empty">Searching…</li>
          )}
        </ul>
      )}
    </div>
  )
}

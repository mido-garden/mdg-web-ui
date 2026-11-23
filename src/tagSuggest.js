import { useEffect, useState } from 'react'
import { searchTags, tempoApiEnabled, tryTempo } from './tempoApi.js'

export function normalizeTag(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Existing tags first. "Create" only after a lookup of this query has finished. */
export function buildTagChoices({ query, existing = [], found = [], local = [], settled = true }) {
  const tagQuery = normalizeTag(query)
  const have = new Set(existing.map(normalizeTag))
  const known = new Set()
  for (const raw of [...found, ...local]) {
    const key = normalizeTag(raw)
    if (key && !have.has(key)) known.add(key)
  }
  const choices = [...known]
    .filter((tag) => !tagQuery || tag.includes(tagQuery))
    .sort()
    .map((label) => ({ label }))
  if (tagQuery && settled && !have.has(tagQuery) && !known.has(tagQuery)) {
    choices.push({ label: tagQuery, create: true })
  }
  return choices
}

export function useTagLookup(open, draft) {
  const query = String(draft || '').trim()
  const [found, setFound] = useState([])
  const [settledFor, setSettledFor] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setLoading(false)
      return undefined
    }
    if (!tempoApiEnabled()) {
      setFound([])
      setSettledFor(query)
      setLoading(false)
      return undefined
    }
    let stop = false
    setLoading(true)
    const timer = setTimeout(() => {
      tryTempo(() => searchTags(normalizeTag(query)))
        .then((res) => {
          if (stop) return
          const names = (res?.tags || [])
            .map((row) => row.name || row.tag || '')
            .filter(Boolean)
          setFound(names)
          setSettledFor(query)
        })
        .finally(() => { if (!stop) setLoading(false) })
    }, query ? 200 : 0)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [open, query])

  return { found, loading: open && loading, settled: !open || settledFor === query }
}

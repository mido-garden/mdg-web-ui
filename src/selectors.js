/**
 * Garden selectors — tempos only.
 */

export function selectTempo(state, id) {
  return (state.tempos || []).find((t) => t.id === id) || null
}

/** Rows for the tempo list. Filtering is done by GET /map. */
export function selectMapNodes(state) {
  return (state.tempos || []).map((t) => ({
    id: t.id,
    name: t.name,
    confidence: t.confidence,
    due: t.due,
    tags: t.tags || [],
  }))
}

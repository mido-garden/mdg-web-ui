/**
 * mdg-tempo-svc client. Auth stays on config.apiBaseUrl; garden data uses tempoApiBaseUrl.
 * Falls back: callers should catch errors and keep using the local store.
 */

import { apiJson } from './api.js'
import { config, tempoURL } from './config.js'
import { clampBubbleScale, defaultReminder } from './lib.js'

export const tempoApiEnabled = () => Boolean(config.tempoApiBaseUrl)

// Share in-flight GETs so React Strict Mode (dev double-mount) does not hit the
// network twice for the same resource.
const inflightGet = new Map()

async function tempoJson(path, init = {}) {
  if (!tempoApiEnabled()) {
    const err = new Error('tempo API not configured')
    err.status = 0
    throw err
  }
  const method = String(init.method || 'GET').toUpperCase()
  const url = tempoURL(path)
  if (method === 'GET') {
    const existing = inflightGet.get(url)
    if (existing) return existing
    const pending = apiJson(url, init).finally(() => {
      if (inflightGet.get(url) === pending) inflightGet.delete(url)
    })
    inflightGet.set(url, pending)
    return pending
  }
  return apiJson(url, init)
}

export function exampleText(ex) {
  if (ex == null) return ''
  return typeof ex === 'string' ? ex : String(ex.text || '')
}

export function exampleId(ex) {
  if (ex == null || typeof ex === 'string') return null
  return ex.id || null
}

/** Map API tempo detail → store tempo fields (keeps history from local when merging). */
export function apiTempoToStore(api, local = {}) {
  const dueMs = api.due ? Date.parse(api.due) : local.due ?? Date.now()
  return {
    id: api.id,
    name: api.name,
    content: api.content ?? '',
    examples: Array.isArray(api.examples) ? api.examples.map((e) => ({ id: e.id, text: e.text })) : (local.examples || []),
    tags: Array.isArray(api.tags) ? api.tags : (local.tags || []),
    media: Array.isArray(api.media) ? api.media : (local.media || []),
    confidence: api.confidence ?? local.confidence ?? 3,
    due: Number.isFinite(dueMs) ? dueMs : (local.due ?? Date.now()),
    ease: api.ease ?? local.ease ?? 2.3,
    interval: api.intervalDays ?? local.interval ?? 0,
    reminder: api.reminder || local.reminder,
    history: local.history || [],
    scale: clampBubbleScale(api.scale ?? local.scale ?? 1),
  }
}

export function reviewTempoToStore(tempo, local = {}) {
  return {
    ...local,
    id: tempo.id,
    name: tempo.name,
    content: tempo.content ?? local.content ?? '',
    examples: Array.isArray(tempo.examples)
      ? tempo.examples.map((e) => ({ id: e.id, text: e.text }))
      : (local.examples || []),
    tags: Array.isArray(tempo.tags) ? tempo.tags : (local.tags || []),
    media: Array.isArray(tempo.media) ? tempo.media : (local.media || []),
    detailLoaded: true,
  }
}

/** Merge a lightweight review queue item into store fields. */
export function reviewQueueItemToStore(item, local = {}) {
  return {
    ...local,
    id: item.id,
    name: item.name,
    tags: Array.isArray(item.tags) ? item.tags : (local.tags || []),
    confidence: item.confidence ?? local.confidence,
    due: item.due ? (Date.parse(item.due) || local.due) : local.due,
  }
}

export function applyScheduleToStore(schedule, local = {}) {
  const dueMs = schedule.due ? Date.parse(schedule.due) : Date.now()
  return {
    ...local,
    confidence: schedule.confidence,
    ease: schedule.ease,
    interval: schedule.intervalDays,
    due: Number.isFinite(dueMs) ? dueMs : Date.now(),
  }
}

// ---- Review ----

/** Lightweight queue: { source, items: [{ id, name, tags, confidence, due }] }. */
export function getReview() {
  return tempoJson('/tempos/review')
}

/** Card payload for one review tempo (content, examples, media, tags). */
export function getReviewTempo(id) {
  return tempoJson(`/tempos/review/${encodeURIComponent(id)}`)
}

export function postReview(id, rating) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ rating }),
  })
}

export function postExample(id, text) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/examples`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function generateExampleApi(id) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/examples/generate`, { method: 'POST' })
}

export function patchExample(id, exampleId, text) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/examples/${encodeURIComponent(exampleId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  })
}

export function deleteExample(id, exampleId) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/examples/${encodeURIComponent(exampleId)}`, {
    method: 'DELETE',
  })
}

// ---- Tempo ----

export function getTempo(id) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}`)
}

/**
 * Load full tempo detail once and cache on the store (`detailLoaded`).
 * Hover → peek → page share this so the same id is not fetched three times.
 */
export async function ensureTempoDetail(dispatch, id, local = {}) {
  if (!id) return local
  if (local.detailLoaded) return local
  if (!tempoApiEnabled()) return local
  const api = await getTempo(id)
  const merged = { ...apiTempoToStore(api, local), detailLoaded: true }
  dispatch({ type: 'hydrateTempo', tempo: merged })
  return merged
}

export function createTempo(body) {
  return tempoJson('/tempos', { method: 'POST', body: JSON.stringify(body) })
}

export function patchTempo(id, patch) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteTempo(id) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function putTags(id, tags) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  })
}

export function searchTags(q) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : ''
  return tempoJson(`/tempos/tags${qs}`)
}

export function postMedia(id, { kind, url, title }) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/media`, {
    method: 'POST',
    body: JSON.stringify({ kind, url, title }),
  })
}

export function deleteMedia(id, mediaId) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE',
  })
}

export function getTelegramChat() {
  return tempoJson('/tempos/settings/telegram')
}

export function saveTelegramChat(chatId) {
  return tempoJson('/tempos/settings/telegram', {
    method: 'PATCH',
    body: JSON.stringify({ chatId }),
  })
}

export function patchReminder(id, patch) {
  return tempoJson(`/tempos/${encodeURIComponent(id)}/reminder`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// ---- Map ----

export const MAP_PAGE_SIZE = 40

export function getMap(params = {}) {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.due) qs.set('due', 'true')
  if (params.tag) qs.set('tag', params.tag)
  const limit = Number.isFinite(params.limit) ? params.limit : MAP_PAGE_SIZE
  const offset = Number.isFinite(params.offset) ? params.offset : 0
  qs.set('limit', String(limit))
  qs.set('offset', String(Math.max(0, offset)))
  const suffix = qs.toString() ? `?${qs}` : ''
  return tempoJson(`/tempos/map${suffix}`)
}

/** List stubs from GET /tempos/map (no content — detail via getTempo). */
export function mapToGarden(map) {
  const tempos = (map?.tempos || []).map((item) => {
    const dueMs = item.due ? Date.parse(item.due) : Date.now()
    return {
      id: item.id,
      name: item.name,
      tags: item.tags || [],
      confidence: item.confidence ?? 3,
      due: Number.isFinite(dueMs) ? dueMs : Date.now(),
      ease: item.ease ?? 2.3,
      interval: item.intervalDays ?? 0,
      content: '',
      examples: [],
      media: [],
      history: [],
      reminder: defaultReminder(),
      scale: clampBubbleScale(item.scale ?? 1),
      detailLoaded: false,
    }
  })

  return {
    tempos,
    mapMeta: {
      total: Number(map?.total) || tempos.length,
      limit: Number(map?.limit) || MAP_PAGE_SIZE,
      offset: Number(map?.offset) || 0,
      hasMore: Boolean(map?.hasMore),
      dueCount: Number(map?.dueCount) || 0,
    },
  }
}

function gardenLoadKey(params = {}) {
  return JSON.stringify({
    q: params.q || '',
    tag: params.tag || '',
    due: Boolean(params.due),
    offset: Number.isFinite(params.offset) ? params.offset : 0,
    limit: Number.isFinite(params.limit) ? params.limit : MAP_PAGE_SIZE,
  })
}

// Share in-flight /map loads (App boot + MapView Strict Mode remount).
const inflightGarden = new Map()

/** Load garden page from tempo-svc (list stubs only). */
export async function loadGarden(dispatch, params = {}) {
  if (!tempoApiEnabled()) {
    dispatch({ type: 'replaceGarden', tempos: [], mapMeta: { total: 0, hasMore: false, dueCount: 0, limit: MAP_PAGE_SIZE, offset: 0 } })
    return { ok: false }
  }
  const key = gardenLoadKey(params)
  let pending = inflightGarden.get(key)
  if (!pending) {
    pending = (async () => {
      const map = await getMap({
        ...params,
        limit: params.limit ?? MAP_PAGE_SIZE,
        offset: params.offset ?? 0,
      })
      return mapToGarden(map)
    })()
    inflightGarden.set(key, pending)
    pending.finally(() => {
      // Brief hold so React Strict Mode remount reuses the same response.
      setTimeout(() => {
        if (inflightGarden.get(key) === pending) inflightGarden.delete(key)
      }, 750)
    })
  }
  const garden = await pending
  dispatch({ type: 'replaceGarden', tempos: garden.tempos, mapMeta: garden.mapMeta })
  return {
    ok: true,
    tempoCount: garden.tempos.length,
    mapMeta: garden.mapMeta,
  }
}

/** Append the next map page (same filters). */
export async function loadMoreGarden(dispatch, params = {}) {
  if (!tempoApiEnabled()) return { ok: false }
  const offset = Number.isFinite(params.offset) ? params.offset : 0
  const map = await getMap({ ...params, limit: params.limit ?? MAP_PAGE_SIZE, offset })
  const garden = mapToGarden(map)
  dispatch({ type: 'appendGarden', tempos: garden.tempos, mapMeta: garden.mapMeta })
  return {
    ok: true,
    tempoCount: garden.tempos.length,
    mapMeta: garden.mapMeta,
  }
}

/** Soft API helper: returns null on failure instead of throwing. */
export async function tryTempo(fn) {
  if (!tempoApiEnabled()) return null
  try {
    return await fn()
  } catch {
    return null
  }
}

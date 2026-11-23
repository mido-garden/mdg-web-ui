/**
 * Garden mutations: create / update / delete tempos via mdg-tempo-svc.
 */

import {
  apiTempoToStore,
  createTempo,
  deleteTempo,
  patchTempo,
  tempoApiEnabled,
} from './tempoApi.js'
import { scaleForName } from './lib.js'

function requireApi() {
  if (!tempoApiEnabled()) {
    const err = new Error('Tempo API is not configured (VITE_TEMPO_API_BASE_URL).')
    err.status = 0
    throw err
  }
}

/** POST /tempos. */
export async function apiCreateTempo(body) {
  requireApi()
  return createTempo({
    name: body.name,
    content: body.content,
    confidence: body.confidence,
    due: body.due,
    ease: body.ease,
    intervalDays: body.intervalDays ?? body.interval,
  })
}

export async function apiUpdateTempo(id, patch) {
  requireApi()
  return patchTempo(id, patch)
}

export async function apiDeleteTempo(id) {
  requireApi()
  return deleteTempo(id)
}

/** Apply a create response into the store. */
export function dispatchCreated(dispatch, created, local = {}) {
  if (!created) return
  dispatch({
    type: 'hydrateTempo',
    tempo: apiTempoToStore(created, local),
  })
}

/** Create via API and hydrate the store. Existing tempos are left as they are. */
export async function createAndDispatch(dispatch, body) {
  const name = body.name
  const payload = {
    name,
    content: body.content,
    confidence: body.confidence,
    due: body.due,
    ease: body.ease,
    intervalDays: body.intervalDays ?? body.interval,
    scale: body.scale ?? scaleForName(name),
  }
  const created = await apiCreateTempo(payload)
  dispatchCreated(dispatch, created, payload)
  return created
}

export async function deleteAndDispatch(dispatch, id) {
  await apiDeleteTempo(id)
  dispatch({ type: 'deleteTempo', id })
}

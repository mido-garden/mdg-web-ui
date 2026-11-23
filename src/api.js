/**
 * Shared credentialed API client for Mitdo.
 * On 401: single-flight refresh via cookie, then one retry (unless skipRefresh).
 * If refresh fails, the session is marked dead — no more refresh storms —
 * and session-expired handlers run so the UI can return to login.
 */

import { apiURL } from './config.js'

let refreshInFlight = null
const sessionExpiredHandlers = new Set()
/** After a failed refresh / bootstrap 401, stop calling /auth/refresh until a new login. */
let sessionDead = false

/** Register a callback for failed session refresh (e.g. sign out → login). */
export function onSessionExpired(handler) {
  if (typeof handler !== 'function') return () => {}
  sessionExpiredHandlers.add(handler)
  return () => sessionExpiredHandlers.delete(handler)
}

export function isSessionDead() {
  return sessionDead
}

/** Clear the dead-session gate after a successful sign-in. */
export function resetSessionGate() {
  sessionDead = false
}

/** Mark session unusable without calling /auth/refresh (bootstrap /me 401). */
export function markSessionExpired() {
  if (sessionDead) return
  notifySessionExpired()
}

function notifySessionExpired() {
  sessionDead = true
  for (const handler of [...sessionExpiredHandlers]) {
    try {
      handler()
    } catch (err) {
      console.warn('session expired handler failed', err)
    }
  }
}

async function refreshSession() {
  if (sessionDead) return false
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const res = await fetch(apiURL('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        notifySessionExpired()
        return false
      }
      return true
    } catch {
      notifySessionExpired()
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function isRefreshRequest(path) {
  return typeof path === 'string' && path.includes('/auth/refresh')
}

/**
 * @param {string} path - path under api base, e.g. '/me' or '/auth/logout'
 * @param {RequestInit & { skipRefresh?: boolean }} [init]
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, init = {}) {
  const { skipRefresh = false, ...rest } = init
  const url = path.startsWith('http') ? path : apiURL(path)
  const opts = {
    ...rest,
    credentials: 'include',
    headers: { ...(rest.headers || {}) },
  }

  let res = await fetch(url, opts)
  if (res.status !== 401 || isRefreshRequest(path) || skipRefresh || sessionDead) {
    return res
  }

  if (!(await refreshSession())) {
    return res
  }
  return fetch(url, opts)
}

/** @param {string} path @param {RequestInit & { skipRefresh?: boolean }} [init] */
export async function apiJson(path, init = {}) {
  const res = await apiFetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    let message = `API ${res.status}`
    let code = null
    try {
      const body = await res.clone().json()
      if (body?.error?.message) message = body.error.message
      if (body?.error?.code) code = body.error.code
    } catch { /* non-JSON error body */ }
    const err = new Error(message)
    err.status = res.status
    err.code = code
    err.response = res
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

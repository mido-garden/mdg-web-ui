// OAuth helpers + session. Authenticated HTTP goes through apiFetch (401 → refresh → retry).

import { apiFetch, isSessionDead, markSessionExpired, resetSessionGate } from './api.js'
import { apiURL } from './config.js'

function startProvider(path) {
  const url = new URL(apiURL(path), window.location.origin)
  url.searchParams.set('next', window.location.origin)
  window.location.assign(url.toString())
}

export function startGoogle() {
  startProvider('/auth/google')
}

export function startGithub() {
  startProvider('/auth/github')
}

/** Short cache so React Strict Mode (dev double-mount) does not double-hit /auth/me. */
let meInFlight = null
let meCached = undefined
let meCachedAt = 0
const ME_CACHE_MS = 2000

export function clearMeCache() {
  meCached = undefined
  meCachedAt = 0
  // Do not clear meInFlight here — that lets a second /auth/me start mid-request and loops.
}

/**
 * Load the current user.
 * Uses apiFetch so a 401 triggers /auth/refresh + one retry when the access cookie expired.
 */
export async function fetchMe() {
  if (isSessionDead()) {
    meCached = null
    meCachedAt = Date.now()
    return null
  }
  if (meInFlight) return meInFlight
  if (meCached !== undefined && Date.now() - meCachedAt < ME_CACHE_MS) {
    return meCached
  }
  meInFlight = (async () => {
    try {
      const res = await apiFetch('/auth/me')
      if (!res.ok) {
        meCached = null
        meCachedAt = Date.now()
        // Refresh already tried inside apiFetch; still 401 → session is gone.
        if (res.status === 401) markSessionExpired()
        return null
      }
      const user = normalizeUser(await res.json())
      meCached = user
      meCachedAt = Date.now()
      if (user) resetSessionGate()
      return user
    } catch {
      meCached = null
      meCachedAt = Date.now()
      return null
    } finally {
      meInFlight = null
    }
  })()
  return meInFlight
}

export async function logout() {
  clearMeCache()
  meInFlight = null
  try {
    await apiFetch('/auth/logout', { method: 'POST', skipRefresh: true })
  } catch { /* cookies cleared on next successful call */ }
}

export function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null
  if (user.provider !== 'google' && user.provider !== 'github') return null
  if (typeof user.id !== 'string' || !user.id) return null
  if (typeof user.name !== 'string' || !user.name) return null
  return {
    id: user.id,
    name: user.name,
    email: typeof user.email === 'string' ? user.email : null,
    avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : null,
    provider: user.provider,
  }
}

export function providerLabel(provider) {
  return provider === 'github' ? 'GitHub' : 'Google'
}

export const AUTH_ERRORS = {
  access_denied: 'Sign-in was cancelled.',
  invalid_state: 'That sign-in expired. Try again.',
  provider_not_configured: 'That sign-in provider is not configured on mdg-auth-svc yet.',
  google_not_configured: 'Google sign-in is not configured on mdg-auth-svc.',
  token_exchange: 'Sign-in did not complete. Check the OAuth callback URL in the provider console.',
  server: 'Sign-in failed on the auth service. Check that mdg-auth-svc is running.',
}

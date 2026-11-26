/**
 * Runtime config from Vite mode env files.
 *
 * Files (see Vite docs):
 *   .env                  shared defaults
 *   .env.development      npm run dev
 *   .env.test             --mode test
 *   .env.production       npm run build
 *   .env*.local           gitignored machine overrides
 *
 * Only VITE_* keys are exposed to browser code. AUTH_API_ORIGIN is build-time
 * only (vite.config.js proxy) and must not be prefixed with VITE_.
 */
const mode = import.meta.env.MODE
const appEnv = import.meta.env.VITE_APP_ENV || mode

export const config = Object.freeze({
  /** development | test | production */
  env: appEnv,
  mode,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  isTest: appEnv === 'test',
  /** Auth API base: absolute (https://api.example.com) or same-origin (''). */
  apiBaseUrl: stripTrailingSlash(import.meta.env.VITE_API_BASE_URL || ''),

  /**
   * Tempo/garden API (mdg-tempo-svc). Empty disables remote garden calls (local store only).
   * Dev default: http://localhost:8081
   */
  tempoApiBaseUrl: stripTrailingSlash(import.meta.env.VITE_TEMPO_API_BASE_URL || ''),
  appName: import.meta.env.VITE_APP_NAME || 'Mitdo',
})

export function apiURL(path = '') {
  return joinBase(withPageHost(config.apiBaseUrl), path)
}

export function tempoURL(path = '') {
  return joinBase(withPageHost(config.tempoApiBaseUrl || config.apiBaseUrl), path)
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

// Dev env points at localhost ports. When the page is opened on a public host,
// keep those ports and use the page host so the browser does not call localhost.
function withPageHost(base) {
  if (!base || typeof window === 'undefined') return base
  const pageHost = window.location.hostname
  if (!pageHost || localHosts.has(pageHost)) return base
  let url
  try {
    url = new URL(base, window.location.origin)
  } catch {
    return base
  }
  if (!localHosts.has(url.hostname)) return stripTrailingSlash(url.href)
  url.hostname = pageHost
  return stripTrailingSlash(url.href)
}

function joinBase(base, path = '') {
  const p = path.startsWith('/') ? path : `/${path}`
  if (!path) return base
  if (!base) return p
  return `${base}${p}`
}

function stripTrailingSlash(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.replace(/\/+$/, '') || ''
}

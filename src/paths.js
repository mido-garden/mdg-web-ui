/** App URL paths. Keep in sync with <Routes> in App.jsx. */

export const paths = {
  map: '/',
  review: '/review',
  reviewTempo: (id) => `/review/${encodeURIComponent(id)}`,
  track: '/track',
  profile: '/profile',
  tempo: (id) => `/tempos/${encodeURIComponent(id)}`,
  tempoTab: (id, tab) => (
    tab && tab !== 'content'
      ? `/tempos/${encodeURIComponent(id)}/${tab}`
      : `/tempos/${encodeURIComponent(id)}`
  ),
}

/** Path for a tempo id. */
export function entityPath(_state, id) {
  return paths.tempo(id)
}

/** Screen under a /tempos/:id popup. Direct links fall back to the map. */
export function screenPath(location) {
  const pathname = location?.pathname || paths.map
  if (!pathname.startsWith('/tempos/')) return pathname
  const bg = location.state?.background?.pathname
  if (typeof bg === 'string' && !bg.startsWith('/tempos')) return bg
  const from = location.state?.from
  if (typeof from === 'string' && !from.startsWith('/tempos')) return from
  return paths.map
}

/** Location the shell should keep mounted behind a tempo popup. */
export function backgroundLocation(location) {
  if (!location?.pathname?.startsWith('/tempos/')) return location
  const bg = location.state?.background
  if (bg && typeof bg.pathname === 'string' && !bg.pathname.startsWith('/tempos')) return bg
  return { pathname: screenPath(location), search: location.search || '', hash: '', state: null, key: 'bg' }
}

/** Map filters live in the query string: ?q=&tag=&due=1 */
export function readMapSearch(search) {
  const params = new URLSearchParams(search || '')
  return {
    q: params.get('q') || '',
    tag: params.get('tag') || '',
    due: params.get('due') === '1',
  }
}

export function mapSearch({ q = '', tag = '', due = false } = {}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (tag) params.set('tag', tag)
  if (due) params.set('due', '1')
  const search = params.toString()
  return search ? `?${search}` : ''
}

/** Sidebar section for the current location. */
export function navSection(pathname, fromPath) {
  if (pathname.startsWith('/track')) return 'track'
  if (pathname.startsWith('/profile')) return 'profile'
  if (pathname.startsWith('/tempos')) {
    if (typeof fromPath === 'string' && fromPath.startsWith('/track')) return 'track'
    if (typeof fromPath === 'string' && fromPath.startsWith('/profile')) return 'profile'
  }
  return 'map'
}

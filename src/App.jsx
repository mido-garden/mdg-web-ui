import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { onSessionExpired } from './api.js'
import { useStore } from './store.jsx'
import { clearMeCache, fetchMe } from './auth.js'
import { loadGarden, tempoApiEnabled } from './tempoApi.js'
import { backgroundLocation, entityPath, paths, screenPath } from './paths.js'
import Sidebar from './components/Sidebar.jsx'
import LoginScreen from './views/LoginScreen.jsx'
import MapView from './views/MapView.jsx'
import TempoPage from './views/TempoPage.jsx'
import TrackView from './views/TrackView.jsx'
import ProfileView from './views/ProfileView.jsx'

function useOpenEntity() {
  const { state } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  return (id) => {
    if (!id) return
    const onTempo = location.pathname.startsWith('/tempos')
    const from = onTempo ? screenPath(location) : location.pathname
    const background = onTempo
      ? (location.state?.background || { pathname: from, search: location.search || '', hash: '', state: null, key: 'bg' })
      : location
    navigate({ pathname: entityPath(state, id), search: location.search }, { state: { from, background } })
  }
}

function Shell() {
  const [collapsed, setCollapsed] = useState(false)
  const open = useOpenEntity()

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main className="main">
        <Outlet context={{ open }} />
      </main>
    </div>
  )
}

/** Shared map+review shell so / ↔ /review/:id does not remount the session. */
function MapLayout() {
  const { open } = useOutletContext()
  return (
    <>
      <MapView onOpen={open} />
      <Outlet />
    </>
  )
}

function Blank() {
  return null
}

function TrackRoute() {
  const { open } = useOutletContext()
  return <TrackView onOpen={open} />
}

const TEMPO_TABS = ['examples', 'review', 'reminder']

function TempoRoute() {
  const { id, tab } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const from = screenPath(location)
  const active = TEMPO_TABS.includes(tab) ? tab : 'content'

  return (
    <TempoPage
      id={id}
      tab={active}
      onTab={(next) => navigate({ pathname: paths.tempoTab(id, next), search: location.search }, { replace: true, state: location.state })}
      onBack={() => navigate({ pathname: from, search: location.search }, { replace: true })}
    />
  )
}

/** Auth + garden gate, then URL routes. */
export default function App() {
  const { state, dispatch } = useStore()
  const location = useLocation()
  const [ready, setReady] = useState(false)
  const [gardenReady, setGardenReady] = useState(!tempoApiEnabled())
  const loadedFor = useRef(null)

  // Refresh cookie failed → clear local session and show login (once).
  useEffect(() => {
    return onSessionExpired(() => {
      clearMeCache()
      loadedFor.current = null
      dispatch({ type: 'signOut' })
      setReady(true)
    })
  }, [dispatch])

  useEffect(() => {
    let stop = false
    // Probe /auth/me once; on 401 apiFetch will try /auth/refresh then retry (expired access cookie).
    fetchMe().then((me) => {
      if (stop) return
      if (me) dispatch({ type: 'signIn', user: me })
      else {
        clearMeCache()
        dispatch({ type: 'signOut' })
      }
      setReady(true)
    })
    return () => { stop = true }
    // Bootstrap once on mount — do not re-run on signOut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!state.user) loadedFor.current = null
  }, [state.user])

  useEffect(() => {
    if (!ready || !state.user || !tempoApiEnabled()) {
      if (ready) setGardenReady(true)
      return
    }
    const key = state.user.id || state.user.email || 'user'
    if (loadedFor.current === key) {
      setGardenReady(true)
      return
    }
    loadedFor.current = key
    setGardenReady(false)
    loadGarden(dispatch)
      .catch((err) => {
        console.warn('garden load failed', err)
        loadedFor.current = null
        if (err?.status === 401) {
          clearMeCache()
          dispatch({ type: 'signOut' })
          return
        }
        dispatch({ type: 'replaceGarden', tempos: [], mapMeta: { total: 0, hasMore: false, dueCount: 0 } })
      })
      .finally(() => setGardenReady(true))
  }, [ready, state.user, dispatch])

  if (!ready) return <div className="login" />
  if (!state.user) return <LoginScreen />
  if (!gardenReady) return <div className="login" />

  const tempoOpen = location.pathname.startsWith('/tempos/')

  return (
    <>
      <Routes location={backgroundLocation(location)}>
        <Route element={<Shell />}>
          <Route element={<MapLayout />}>
            <Route index element={<Blank />} />
            <Route path="review" element={<Blank />} />
            <Route path="review/:id" element={<Blank />} />
          </Route>
          <Route path={paths.track} element={<TrackRoute />} />
          <Route path={paths.profile} element={<ProfileView />} />
          <Route path="*" element={<Navigate to={paths.map} replace />} />
        </Route>
      </Routes>
      {tempoOpen && (
        <Routes>
          <Route path="/tempos/:id/:tab?" element={<TempoRoute />} />
        </Routes>
      )}
    </>
  )
}

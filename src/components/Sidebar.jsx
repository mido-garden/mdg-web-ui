import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Map, Bell, Flame, ChevronLeft, ChevronRight, Moon, Sun, LogOut } from 'lucide-react'
import { useStore } from '../store.jsx'
import { isDue, streak } from '../lib.js'
import { useDarkMode } from '../theme.js'
import { logout, providerLabel } from '../auth.js'
import { navSection, paths } from '../paths.js'

const NAV = [
  { to: paths.map, id: 'map', label: 'Tempo map', Icon: Map, end: true },
  { to: paths.track, id: 'track', label: 'Reminders', Icon: Bell },
]

export default function Sidebar({ collapsed, setCollapsed }) {
  const { state, dispatch } = useStore()
  const { dark, toggle } = useDarkMode()
  const location = useLocation()
  const navigate = useNavigate()
  const { tempos, user } = state
  const due = tempos.filter(isDue).length
  const days = streak(tempos)
  const section = navSection(location.pathname, location.state?.from)

  return (
    <aside className={`side ${collapsed ? 'side-collapsed' : ''}`}>
      <div className="side-head">
        {!collapsed && <div className="logo">Mitdo</div>}
        <button
          className="ghost side-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="nav" aria-label="Navigation">
        {!collapsed && <div className="nav-label">Menu</div>}
        {NAV.map(({ to, id, label, Icon, end }) => (
          <NavLink
            key={id}
            to={to}
            end={end}
            className={() => `nav-item ${section === id ? 'on' : ''}`}
            title={collapsed ? label : undefined}
            onClick={() => window.scrollTo(0, 0)}
          >
            <Icon size={16} aria-hidden />
            {!collapsed && <span>{label}</span>}
            {id === 'map' && due > 0 && <span className={`badge ${collapsed ? 'badge-float' : ''}`}>{due}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="side-foot">
        {collapsed ? (
          <button
            className="ghost side-toggle"
            onClick={toggle}
            aria-pressed={dark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        ) : (
          <div className="theme-switch">
            <span>{dark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />} Dark mode</span>
            <button className={`toggle ${dark ? 'on' : ''}`} role="switch" aria-checked={dark} aria-label="Dark mode" onClick={toggle} />
          </div>
        )}
        {user && (
          <div className={`account ${collapsed ? 'account-mini' : ''}`}>
            <NavLink
              to={paths.profile}
              className={() => `account-open ${section === 'profile' ? 'on' : ''}`}
              aria-label="Profile"
              title="Profile"
              onClick={() => window.scrollTo(0, 0)}
            >
              <span className="avatar" aria-hidden>
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="" />
                  : user.name.slice(0, 1).toUpperCase()}
              </span>
              {!collapsed && (
                <span className="account-id">
                  <b>{user.name}</b>
                  <span className="xs faint">{providerLabel(user.provider)}</span>
                </span>
              )}
            </NavLink>
            <button
              type="button"
              className="ghost side-toggle"
              onClick={async () => { await logout(); dispatch({ type: 'signOut' }) }}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} aria-hidden />
            </button>
          </div>
        )}
        {!collapsed && (
          <div className="streak">
            <div className="streak-row">
              <Flame size={15} style={{ color: due ? 'var(--amb)' : 'var(--grn)' }} aria-hidden />
              <b style={{ fontWeight: 500 }}>{days}-day streak</b>
            </div>
            <div className="muted xs" style={{ marginTop: 4 }}>
              {due ? `${due} tempo${due === 1 ? '' : 's'} waiting for you.` : 'All caught up today!'}
            </div>
            {due > 0 && (
              <button
                className="primary"
                style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
                onClick={() => { navigate(paths.review); window.scrollTo(0, 0) }}
              >
                Start review
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

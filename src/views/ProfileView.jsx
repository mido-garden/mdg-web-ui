import { LogOut } from 'lucide-react'
import { useStore } from '../store.jsx'
import { logout, providerLabel } from '../auth.js'
import TelegramChatSetting from '../components/TelegramChatSetting.jsx'

const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export default function ProfileView() {
  const { state, dispatch } = useStore()
  const user = state.user
  const theme = state.settings.theme === 'light' || state.settings.theme === 'dark' ? state.settings.theme : 'system'
  if (!user) return null

  const signOut = async () => {
    await logout()
    dispatch({ type: 'signOut' })
  }

  return (
    <>
      <div className="head"><h1>Profile</h1></div>
      <div className="stack profile">
        <section className="card profile-card">
          <span className="avatar avatar-lg" aria-hidden>
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt="" />
              : user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="profile-id">
            <h2>{user.name}</h2>
            <div className="sm muted">{user.email || 'No email'}</div>
            <span className="pill" style={{ borderColor: 'var(--line2)' }}>{providerLabel(user.provider)}</span>
          </div>
        </section>

        <TelegramChatSetting />

        <section className="card">
          <h2>Appearance</h2>
          <div className="row" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                className={`chip ${theme === id ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'setting', patch: { theme: id } })}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <div>
          <button type="button" onClick={signOut}>
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </div>
      </div>
    </>
  )
}

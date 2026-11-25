import { useEffect, useState } from 'react'
import { Github, Moon, Sun } from 'lucide-react'
import { useDarkMode } from '../theme.js'
import { AUTH_ERRORS, startGithub, startGoogle } from '../auth.js'

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

export default function LoginScreen() {
  const { dark, toggle } = useDarkMode()
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    if (!code) return
    setError(AUTH_ERRORS[code] || 'Sign-in failed. Try again.')
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [])

  const signIn = (provider) => {
    setPending(provider)
    setError(null)
    if (provider === 'github') startGithub()
    else startGoogle()
  }

  return (
    <div className="login">
      <button
        type="button"
        className="ghost login-theme"
        onClick={toggle}
        aria-pressed={dark}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
        {dark ? 'Light mode' : 'Dark mode'}
      </button>
      <section className="login-card" aria-labelledby="login-title">
        <div className="logo">Mitdo</div>
        <h1 id="login-title">Sign In</h1>
        <p className="muted sm">Access your garden with this account.</p>
        {error && <p className="login-error sm" role="alert">{error}</p>}
        <button type="button" className="auth-btn" disabled={!!pending} onClick={() => signIn('google')}>
          <GoogleMark /> Continue with Google
        </button>
        <button type="button" className="auth-btn" disabled={!!pending} onClick={() => signIn('github')}>
          <Github size={18} aria-hidden /> Continue with GitHub
        </button>
      </section>
    </div>
  )
}

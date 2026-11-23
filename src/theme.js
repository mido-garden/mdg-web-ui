import { useEffect, useState } from 'react'
import { useStore } from './store.jsx'

const KEY = 'recall-react-v3'

export function savedTheme() {
  try {
    const theme = JSON.parse(localStorage.getItem(KEY) || 'null')?.settings?.theme
    return theme === 'light' || theme === 'dark' ? theme : null
  } catch {
    return null
  }
}

export function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(theme) {
  const dark = theme === 'dark' || (theme !== 'light' && systemPrefersDark())
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  return dark
}

export function useDarkMode() {
  const { state, dispatch } = useStore()
  const theme = state.settings.theme
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const dark = theme === 'dark' || (theme !== 'light' && systemDark)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  const toggle = () => dispatch({ type: 'setting', patch: { theme: dark ? 'light' : 'dark' } })
  return { dark, toggle }
}

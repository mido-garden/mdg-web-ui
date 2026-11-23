export const DAY = 864e5
const HOUR = 36e5
const MIN = 6e4

export const LEVELS = ['Blank', 'Fuzzy', 'Okay', 'Solid', 'Locked in']
export const CHANNELS = { push: 'Push', email: 'Email', telegram: 'Telegram', slack: 'Slack' }
export const MODES = { auto: 'Auto spaced repetition', daily: 'Daily', weekly: 'Weekly' }

export const MEDIA_KINDS = [
  { id: 'image', label: 'Image', plural: 'Images', accept: 'image/*' },
  { id: 'audio', label: 'Sound', plural: 'Sound', accept: 'audio/*' },
  { id: 'video', label: 'Video', plural: 'Video', accept: 'video/*' },
]

export function youtubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0]
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2]
      return u.searchParams.get('v')
    }
  } catch {}
  return null
}

export const defaultReminder = () => ({
  channels: { push: true, email: false, telegram: false, slack: false },
  mode: 'auto',
  time: '08:00',
  fun: true,
})

/* ---------- tempo model helpers ---------- */
export const tone = (c) => (c <= 2 ? 'red' : c === 3 ? 'amb' : 'grn')
export const isDue = (t) => !!t && t.due <= Date.now()
/** Allowed user bubble scale (must match tempo-svc). */
export const MIN_BUBBLE_SCALE = 0.35
export const MAX_BUBBLE_SCALE = 3
/** Max runes for tempo names — fits a map bubble label. */
export const MAX_ENTITY_NAME = 48

export function clampBubbleScale(n) {
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(MAX_BUBBLE_SCALE, Math.max(MIN_BUBBLE_SCALE, n))
}

export function normalizeName(name) {
  return String(name ?? '').trim()
}

/** Rune-aware length (matches Go utf8.RuneCountInString). */
export function nameLen(name) {
  return Array.from(normalizeName(name)).length
}

export function clampEntityName(name) {
  const raw = String(name ?? '')
  if (Array.from(raw).length <= MAX_ENTITY_NAME) return raw
  return Array.from(raw).slice(0, MAX_ENTITY_NAME).join('')
}

export function validEntityName(name) {
  const n = nameLen(name)
  return n > 0 && n <= MAX_ENTITY_NAME
}

/**
 * Bubble scale that fits the label. Short names <1×; long names grow toward ~2×.
 * Must match tempo-svc ScaleForName.
 */
export function scaleForName(name) {
  const n = nameLen(name)
  if (n <= 0) return 1
  let s
  if (n <= 8) s = 0.7 + (n - 1) * (0.25 / 7)
  else if (n <= 20) s = 0.95 + (n - 8) * (0.35 / 12)
  else if (n <= 36) s = 1.3 + (n - 20) * (0.4 / 16)
  else s = 1.7 + (n - 36) * (0.5 / 12)
  return clampBubbleScale(s)
}

/* ---------- scheduling: SM-2-lite. Swap for FSRS when you add a backend ---------- */
/** Must match mdg-tempo-svc/internal/schedule.MaxIntervalDays */
export const MAX_INTERVAL_DAYS = 365

export function schedule(t, rating) {
  const ease = Math.min(3, Math.max(1.3, (t.ease || 2.3) + (rating - 3) * 0.1))
  const days = Math.min(MAX_INTERVAL_DAYS, Math.max(0, t.interval || 0))
  let nextDays
  if (rating === 1) {
    return { ease, interval: (10 * MIN) / DAY, due: Date.now() + 10 * MIN }
  }
  if (rating === 2) nextDays = 1
  else if (rating === 3) nextDays = Math.max(2, Math.round(days * 1.5))
  else if (rating === 4) nextDays = Math.max(4, Math.round(days * ease))
  else nextDays = Math.max(7, Math.round(days * ease * 1.4))
  nextDays = Math.min(MAX_INTERVAL_DAYS, nextDays)
  return { ease, interval: nextDays, due: Date.now() + nextDays * DAY }
}

export function rel(ms) {
  const d = ms - Date.now()
  const a = Math.abs(d)
  let n, u
  if (a < HOUR) { n = Math.max(1, Math.round(a / MIN)); u = 'min' }
  else if (a < DAY) { n = Math.round(a / HOUR); u = 'h' }
  else if (a < DAY * 60) { n = Math.round(a / DAY); u = 'd' }
  else if (a < DAY * 700) { n = Math.round(a / (DAY * 30)); u = 'mo' }
  else { n = Math.round(a / (DAY * 365)); u = 'y' }
  return d < 0 ? `${n} ${u} ago` : `in ${n} ${u}`
}

/** Format a due timestamp (UTC ms) in the viewer's local timezone. */
export function formatDueLocal(ms, opts = {}) {
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString(undefined, {
    weekday: opts.weekday ?? 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...opts,
  })
}

/**
 * Hover line for a tempo’s review status. The time stays attached so the joke is not the only clue.
 */
export function dueLabel(t) {
  if (!t || !Number.isFinite(t.due)) return ''
  const when = `${formatDueLocal(t.due)} · ${rel(t.due)}`
  if (isDue(t)) {
    if (Date.now() - t.due > DAY) return `This one thinks you ghosted it · ${when}`
    return `Psst. This one is due · ${when}`
  }
  const ahead = t.due - Date.now()
  if (ahead < DAY) return `After coffee is fine · ${when}`
  if (ahead < DAY * 7) return `No rush this week · ${when}`
  return `Napping until then · ${when}`
}

/** Playful mark for a tempo’s review status. */
export function dueMark(t) {
  if (!t || !Number.isFinite(t.due)) return ''
  if (isDue(t)) return Date.now() - t.due > DAY ? '👻⏰' : '👀🔔'
  const ahead = t.due - Date.now()
  if (ahead < DAY) return '☕✨'
  if (ahead < DAY * 7) return '🐢📅'
  return '🦥💤'
}

export const dayKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function streak(tempos) {
  const days = new Set(tempos.flatMap((t) => t.history.map((h) => dayKey(h.t))))
  let n = 0
  for (let i = 0; days.has(dayKey(Date.now() - i * DAY)) || (i === 0 && days.has(dayKey(Date.now() - DAY))); i++) n++
  return n
}

/* ---------- AI stub. Replace with a real LLM call on your backend ---------- */
export function generateExample(t, n) {
  const pool = [
    `Explain "${t.name}" to a 10-year-old in 2 sentences.`,
    `Find a situation at work where "${t.name}" shows up.`,
    `What is a common mistake when applying "${t.name}"? Give a wrong example and fix it.`,
    `Compare "${t.name}" with a concept you already know well.`,
  ]
  return new Promise((res) => setTimeout(() => res(pool[n % pool.length]), 800))
}

import { createContext, useContext, useEffect, useReducer } from 'react'
import { DEFAULT_SETTINGS, settleTempos } from './data.js'
import { schedule, defaultReminder, clampBubbleScale, scaleForName } from './lib.js'
import { normalizeUser } from './auth.js'

const KEY = 'recall-react-v3'
const Ctx = createContext(null)

const emptyMapMeta = () => ({ total: 0, limit: 40, offset: 0, hasMore: false, dueCount: 0 })
const empty = () => ({ tempos: [], log: [], settings: DEFAULT_SETTINGS, user: null, mapMeta: emptyMapMeta() })

function mergeSettings(settings) {
  const extra = settings && typeof settings === 'object' ? settings : {}
  return {
    ...DEFAULT_SETTINGS,
    ...extra,
    channels: { ...DEFAULT_SETTINGS.channels, ...(extra.channels || {}) },
  }
}

function load() {
  try {
    const current = localStorage.getItem(KEY)
    const parsed = current ? JSON.parse(current) : null
    // Keep user + settings locally; garden data comes from the API after sign-in.
    if (parsed && typeof parsed === 'object') {
      return {
        tempos: [],
        log: [],
        settings: mergeSettings(parsed.settings),
        user: normalizeUser(parsed.user),
        mapMeta: emptyMapMeta(),
      }
    }
  } catch {}
  return empty()
}

function updTempo(s, id, fn) {
  return { ...s, tempos: s.tempos.map((t) => (t.id === id ? fn(t) : t)) }
}

function withoutPosition(t) {
  if (!t || typeof t !== 'object') return t
  const { x: _x, y: _y, ...rest } = t
  return rest
}

function applyEntityPatch(entity, patch) {
  if (!patch || typeof patch !== 'object') return entity
  const clean = withoutPosition(patch)
  const next = { ...withoutPosition(entity), ...clean }
  if ('scale' in clean) next.scale = clampBubbleScale(clean.scale)
  return next
}

function reducer(s, a) {
  switch (a.type) {
    case 'updateTempo':
      return updTempo(s, a.id, (t) => applyEntityPatch(t, a.patch))
    case 'update': {
      if (!s.tempos.some((t) => t.id === a.id)) return s
      return updTempo(s, a.id, (t) => applyEntityPatch(t, a.patch))
    }
    case 'remind':
      return updTempo(s, a.id, (t) => ({ ...t, reminder: { ...t.reminder, ...a.patch } }))
    case 'rate': {
      const sched = a.schedule
        ? { confidence: a.schedule.confidence, ease: a.schedule.ease, interval: a.schedule.interval, due: a.schedule.due }
        : { ...schedule(s.tempos.find((t) => t.id === a.id) || { ease: 2.3, interval: 0 }, a.rating), confidence: a.rating }
      const next = updTempo(s, a.id, (t) => ({
        ...t,
        ...sched,
        confidence: a.rating ?? sched.confidence,
        history: [...(t.history || []), { t: Date.now(), r: a.rating }],
      }))
      return { ...next, log: [{ t: Date.now(), id: a.id, ch: 'app', st: 'Reviewed' }, ...s.log] }
    }
    case 'addExample': {
      const entry = a.example && typeof a.example === 'object'
        ? a.example
        : (a.exampleId ? { id: a.exampleId, text: a.text } : a.text)
      return updTempo(s, a.id, (t) => ({ ...t, examples: [...(t.examples || []), entry] }))
    }
    case 'addMedia':
      return updTempo(s, a.id, (t) => ({
        ...t,
        media: [...(t.media || []), { id: a.mediaId || ('m' + Date.now()), kind: a.kind, url: a.url, title: a.title || '' }],
      }))
    case 'removeMedia':
      return updTempo(s, a.id, (t) => ({ ...t, media: (t.media || []).filter((m) => m.id !== a.mediaId) }))
    case 'updateExample':
      return updTempo(s, a.id, (t) => ({
        ...t,
        examples: (t.examples || []).map((ex, i) => {
          const text = a.text
          if (a.exampleId) {
            if (typeof ex === 'object' && ex.id === a.exampleId) return { ...ex, text }
            return ex
          }
          if (i !== a.index) return ex
          return typeof ex === 'object' ? { ...ex, text } : text
        }),
      }))
    case 'removeExample':
      return updTempo(s, a.id, (t) => ({
        ...t,
        examples: (t.examples || []).filter((ex, i) => {
          if (a.exampleId) return (typeof ex === 'object' ? ex.id : null) !== a.exampleId
          return i !== a.index
        }),
      }))
    case 'hydrateTempo': {
      const existing = s.tempos.find((t) => t.id === a.tempo.id)
      const merged = withoutPosition({
        ...(existing || {}),
        ...a.tempo,
        history: a.tempo.history || existing?.history || [],
        reminder: a.tempo.reminder || existing?.reminder || defaultReminder(),
        tags: Array.isArray(a.tempo.tags) ? a.tempo.tags : (existing?.tags || []),
        detailLoaded: a.tempo.detailLoaded ?? existing?.detailLoaded ?? false,
      })
      if (existing) return updTempo(s, a.tempo.id, () => merged)
      return { ...s, tempos: [...s.tempos, merged] }
    }
    case 'hydrate':
      return reducer(s, { type: 'hydrateTempo', tempo: a.tempo })
    case 'replaceGarden': {
      const tempos = settleTempos(a.tempos || []).map(withoutPosition)
      return {
        ...s,
        tempos,
        mapMeta: a.mapMeta !== undefined
          ? { ...emptyMapMeta(), ...a.mapMeta }
          : emptyMapMeta(),
      }
    }
    case 'appendGarden': {
      const incoming = settleTempos(a.tempos || []).map(withoutPosition)
      if (!incoming.length && !a.mapMeta) return s
      const seen = new Set(s.tempos.map((t) => t.id))
      const fresh = incoming.filter((t) => !seen.has(t.id))
      const nextMeta = a.mapMeta
        ? {
            ...emptyMapMeta(),
            ...s.mapMeta,
            ...a.mapMeta,
            // offset in response is the page start; loaded count is tempos.length after merge
          }
        : s.mapMeta
      return {
        ...s,
        tempos: [...s.tempos.map(withoutPosition), ...fresh],
        mapMeta: nextMeta,
      }
    }
    case 'setMapMeta':
      return { ...s, mapMeta: { ...emptyMapMeta(), ...s.mapMeta, ...(a.mapMeta || a.meta || {}) } }
    case 'replaceTempos': {
      return reducer(s, { type: 'replaceGarden', tempos: a.tempos || [], mapMeta: a.mapMeta })
    }
    case 'addTempo':
    case 'add': {
      const id = a.id || ('t' + Date.now())
      return {
        ...s,
        tempos: [
          ...s.tempos,
          {
            id,
            name: a.name,
            scale: clampBubbleScale(a.scale ?? scaleForName(a.name)),
            confidence: a.confidence ?? 1,
            due: a.due ?? Date.now(),
            ease: a.ease ?? 2.3,
            interval: a.interval ?? 0,
            content: a.content ?? 'Write 1-2 sentences capturing the content of this tempo.',
            examples: a.examples || [],
            media: a.media || [],
            tags: a.tags || [],
            history: a.history || [],
            reminder: a.reminder || defaultReminder(),
          },
        ],
      }
    }
    case 'deleteTempo':
    case 'delete': {
      const gone = s.tempos.find((t) => t.id === a.id)
      if (!gone) return s
      return {
        ...s,
        tempos: s.tempos.filter((t) => t.id !== a.id),
      }
    }
    case 'setting':
      return { ...s, settings: { ...s.settings, ...a.patch } }
    case 'signIn': {
      const user = normalizeUser(a.user)
      return user ? { ...s, user } : s
    }
    case 'signOut': {
      if (!s.user && !(s.tempos || []).length && !(s.log || []).length) return s
      return { ...s, user: null, tempos: [], log: [], mapMeta: emptyMapMeta() }
    }
    case 'reset':
      return { ...empty(), user: s.user }
    default:
      return s
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        settings: state.settings,
        user: state.user,
        tempos: [],
        log: [],
      }))
    } catch {}
  }, [state.settings, state.user])
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)

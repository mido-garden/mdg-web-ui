import { useState } from 'react'
import { useStore } from '../store.jsx'
import { isDue, dueLabel, tone, rel, dayKey, DAY, CHANNELS, MODES } from '../lib.js'
import TelegramChatSetting from '../components/TelegramChatSetting.jsx'

const CH_LABEL = { ...CHANNELS, app: 'In app' }
const ST_TONE = { Reviewed: 'grn', Opened: 'amb', Ignored: 'red' }

export default function TrackView({ onOpen }) {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState('track')
  const { tempos, log, settings } = state
  const R = tempos

  const counts = {}
  tempos.forEach((t) => (t.history || []).forEach((h) => { counts[dayKey(h.t)] = (counts[dayKey(h.t)] || 0) + 1 }))
  const cells = Array.from({ length: 28 }, (_, i) => counts[dayKey(Date.now() - (27 - i) * DAY)] || 0)
  const total = R.reduce((s, t) => s + (t.history || []).length, 0)
  const avg = (R.reduce((s, t) => s + t.confidence, 0) / Math.max(1, R.length)).toFixed(1)
  const dueCount = Number.isFinite(state.mapMeta?.dueCount)
    ? state.mapMeta.dueCount
    : R.filter(isDue).length
  const week = cells.slice(-7).reduce((a, b) => a + b, 0)
  const name = (id) => tempos.find((x) => x.id === id)?.name || id

  return (
    <>
      <div className="head"><h1>Reminders and tracking</h1></div>
      <div className="stack" style={{ marginBottom: 14 }}>
        <TelegramChatSetting />
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'track'} className={tab === 'track' ? 'on' : ''} onClick={() => setTab('track')}>Tracking</button>
        <button role="tab" aria-selected={tab === 'rem'} className={tab === 'rem' ? 'on' : ''} onClick={() => setTab('rem')}>Reminder settings</button>
      </div>

      {tab === 'track' && (
        <>
          <div className="stats">
            <div className="stat"><small>Due today</small><b>{dueCount}</b></div>
            <div className="stat"><small>Average confidence</small><b>{avg}/5</b></div>
            <div className="stat"><small>Reviews in last 7 days</small><b>{week}</b></div>
            <div className="stat"><small>Total reviews</small><b>{total}</b></div>
          </div>
          <div className="grid2">
            <section className="card">
              <h2>Confidence by tempo</h2>
              {R.map((t) => (
                <div className="trow" key={t.id}>
                  <button className="ghost" style={{ flex: 1, justifyContent: 'flex-start', padding: 0 }} onClick={() => onOpen(t.id)}>{t.name}</button>
                  <div className="seg">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= t.confidence ? `f-${tone(t.confidence)}` : ''} />)}</div>
                  {isDue(t) && (
                    <span
                      className={`tempo-bang${Date.now() - t.due > DAY ? ' is-overdue' : ''}`}
                      title={dueLabel(t)}
                      aria-label={dueLabel(t)}
                    >
                      !
                    </span>
                  )}
                </div>
              ))}
            </section>
            <div className="stack">
              <section className="card">
                <h2>Last 28 days</h2>
                <div className="heat">
                  {cells.map((c, i) => <i key={i} className={c ? `l${Math.min(3, c)}` : ''} title={`${c} reviews`} />)}
                </div>
              </section>
              <section className="card">
                <h2>Reminder log</h2>
                {log.slice(0, 8).map((l, i) => (
                  <div className="trow" key={i}>
                    <span style={{ flex: 1 }}>{name(l.id)}</span>
                    <span className="xs faint">{CH_LABEL[l.ch]} · {rel(l.t)}</span>
                    <span className={`pill tone-${ST_TONE[l.st]}`}>{l.st}</span>
                  </div>
                ))}
              </section>
            </div>
          </div>
        </>
      )}

      {tab === 'rem' && (
        <div className="stack">
          <section className="card">
            <h2>Connected channels</h2>
            {Object.entries(CHANNELS).map(([k, label]) => (
              <div className="trow" key={k}>
                <span style={{ flex: 1 }}>{label}</span>
                <span className="xs muted">{settings.channels[k] ? 'On' : 'Off'}</span>
                <button className={`toggle ${settings.channels[k] ? 'on' : ''}`} role="switch" aria-checked={settings.channels[k]} aria-label={label}
                  onClick={() => dispatch({ type: 'setting', patch: { channels: { ...settings.channels, [k]: !settings.channels[k] } } })} />
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <span className="sm muted">Quiet hours</span>
              <input type="time" value={settings.quietFrom} onChange={(e) => dispatch({ type: 'setting', patch: { quietFrom: e.target.value } })} aria-label="From" />
              <span className="sm muted">to</span>
              <input type="time" value={settings.quietTo} onChange={(e) => dispatch({ type: 'setting', patch: { quietTo: e.target.value } })} aria-label="To" />
            </div>
          </section>

          <section className="card">
            <h2>Reminders by tempo</h2>
            {R.map((t) => (
              <div className="trow" key={t.id}>
                <span style={{ flex: 1, minWidth: 120 }}>{t.name}</span>
                <div className="row" style={{ gap: 4 }}>
                  {Object.entries(CHANNELS).map(([k, label]) => (
                    <button key={k} className={`chip xs ${t.reminder.channels[k] ? 'on' : ''}`} disabled={!settings.channels[k]}
                      onClick={() => dispatch({ type: 'remind', id: t.id, patch: { channels: { ...t.reminder.channels, [k]: !t.reminder.channels[k] } } })}>{label}</button>
                  ))}
                </div>
                <select value={t.reminder.mode} onChange={(e) => dispatch({ type: 'remind', id: t.id, patch: { mode: e.target.value } })} aria-label={`Frequency for ${t.name}`}>
                  {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="time" value={t.reminder.time} onChange={(e) => dispatch({ type: 'remind', id: t.id, patch: { time: e.target.value } })} aria-label={`Reminder time for ${t.name}`} />
              </div>
            ))}
          </section>
          <div><button onClick={() => dispatch({ type: 'reset' })}>Reset sample data</button></div>
        </div>
      )}
    </>
  )
}

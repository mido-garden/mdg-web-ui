import { useEffect, useRef, useState } from 'react'
import { getTelegramChat, saveTelegramChat, tempoApiEnabled } from '../tempoApi.js'

const CHAT_ID = /^-?[1-9]\d{0,19}$/

export default function TelegramChatSetting() {
  const [chatId, setChatId] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    if (!tempoApiEnabled()) return undefined
    getTelegramChat()
      .then((res) => {
        if (alive.current) setChatId(res?.chatId || '')
      })
      .catch((err) => {
        if (alive.current) setError(err.message || 'Could not load the chat id.')
      })
    return () => { alive.current = false }
  }, [])

  const save = async (event) => {
    event.preventDefault()
    const next = chatId.trim()
    if (next && !CHAT_ID.test(next)) {
      setStatus('')
      setError('Use the numeric chat id, or leave the field blank to clear it.')
      return
    }
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const res = await saveTelegramChat(next)
      if (!alive.current) return
      setChatId(res?.chatId || '')
      setStatus(res?.chatId ? 'Saved for this account.' : 'Cleared for this account.')
    } catch (err) {
      if (alive.current) setError(err.message || 'Could not save the chat id.')
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  return (
    <section className="card" aria-labelledby="telegram-chat-heading">
      <h2 id="telegram-chat-heading">Telegram chat id</h2>
      <p className="sm muted" style={{ marginTop: 0 }}>
        Reminders for your tempos go to this chat.
      </p>
      <form className="row" onSubmit={save}>
        <label className="sm" htmlFor="telegram-chat-id">Chat id</label>
        <input
          id="telegram-chat-id"
          name="chatId"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="123456789"
          autoComplete="off"
          spellCheck={false}
          aria-label="Telegram chat id"
          disabled={saving}
          style={{ width: 180 }}
        />
        <button type="submit" disabled={saving || !tempoApiEnabled()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
      {status ? <p className="sm muted" role="status" style={{ margin: '8px 0 0' }}>{status}</p> : null}
      {error ? <p className="sm" role="alert" style={{ color: 'var(--red)', margin: '8px 0 0' }}>{error}</p> : null}
    </section>
  )
}

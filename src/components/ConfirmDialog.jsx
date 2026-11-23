import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const ConfirmContext = createContext(null)

/**
 * Promise-based confirm — drop-in replacement for window.confirm.
 *   const ok = await confirm({ title, message?, confirmLabel?, danger? })
 */
export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null)
  const askRef = useRef(null)
  askRef.current = ask

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      // Resolve any prior pending confirm as cancelled.
      askRef.current?.resolve(false)
      setAsk({
        title: opts.title || 'Are you sure?',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Delete',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: opts.danger !== false,
        resolve,
      })
    })
  }, [])

  const close = useCallback((value) => {
    const current = askRef.current
    if (!current) return
    current.resolve(value)
    setAsk(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {ask && (
        <ConfirmDialog
          title={ask.title}
          message={ask.message}
          confirmLabel={ask.confirmLabel}
          cancelLabel={ask.cancelLabel}
          danger={ask.danger}
          onCancel={() => close(false)}
          onConfirm={() => close(true)}
        />
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    // Fallback if provider is missing — still never use native confirm for UX consistency.
    return async (opts) => window.confirm(opts?.title || 'Are you sure?')
  }
  return confirm
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onCancel])

  return createPortal(
    <div
      className="confirm-backdrop"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={panelRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? 'confirm-message' : undefined}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        {message ? <p id="confirm-message" className="sm muted">{message}</p> : null}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'confirm-danger' : 'primary'}
            onClick={onConfirm}
            autoFocus={false}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import MDEditor, { commands } from '@uiw/react-md-editor'
import { useDarkMode } from '../theme.js'
import { markdownPreviewOptions } from './MermaidCode.jsx'

export default function MarkdownEditor({
  value,
  onChange,
  onBlur,
  ariaLabel,
  preview = 'live',
  height = 520,
}) {
  const { dark } = useDarkMode()
  const [full, setFull] = useState(false)
  const [mode, setMode] = useState(preview)

  const keepView = (command) => ({
    ...command,
    execute: (...args) => {
      command.execute?.(...args)
      setMode(command.value)
    },
  })

  // The dialog backdrop uses backdrop-filter and overflow clipping, which
  // traps the editor's own fullscreen mode and splits the panes around the form.
  // Fullscreen moves the editor to document.body, which remounts it, so the
  // chosen view (edit, live, preview) has to live in this state.
  const extraCommands = useMemo(() => [
    keepView(commands.codeEdit),
    keepView(commands.codeLive),
    keepView(commands.codePreview),
    commands.divider,
    {
      ...commands.fullscreen,
      name: 'fullmarkdown',
      // The toolbar disables every command except preview/fullscreen while
      // preview-only is on. Keep "fullscreen" in the name so this button stays on.
      keyCommand: 'md-fullscreen',
      buttonProps: {
        'aria-label': full ? 'Close full markdown' : 'Full markdown',
        title: full ? 'Close full markdown' : 'Full markdown',
      },
      execute: () => setFull((on) => !on),
    },
  ], [full])

  useEffect(() => {
    if (!full) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setFull(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [full])

  const editor = (
    <div className={`md-wrap${full ? ' md-fullscreen' : ''}`} data-color-mode={dark ? 'dark' : 'light'} aria-label={ariaLabel}>
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? '')}
        preview={mode}
        height={full ? '100%' : height}
        visibleDragbar={false}
        previewOptions={markdownPreviewOptions}
        extraCommands={extraCommands}
        textareaProps={onBlur ? { onBlur } : undefined}
      />
    </div>
  )

  return full ? createPortal(editor, document.body) : editor
}

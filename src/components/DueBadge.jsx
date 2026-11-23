import { dueLabel, dueMark } from '../lib.js'

/** Illustrated review-status mark. The words stay on the tooltip. */
export default function DueBadge({ tempo, className = '' }) {
  if (!tempo || !Number.isFinite(tempo.due)) return null
  const label = dueLabel(tempo)
  return (
    <span
      className={`due-badge${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
    >
      {dueMark(tempo)}
    </span>
  )
}

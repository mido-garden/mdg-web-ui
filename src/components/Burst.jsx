import { useMemo } from 'react'

const COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#D4537E', '#EF9F27']

// Confetti burst. Change the `k` prop to fire it again. Parent needs position: relative.
export default function Burst({ k }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 22
        const d = 70 + Math.random() * 90
        return { c: COLORS[i % 5], dx: Math.cos(a) * d, dy: Math.sin(a) * d + 40 }
      }),
    [k]
  )
  if (!k) return null
  return (
    <div className="burst" key={k} aria-hidden>
      {bits.map((b, i) => (
        <i key={i} style={{ background: b.c, '--dx': b.dx + 'px', '--dy': b.dy + 'px' }} />
      ))}
    </div>
  )
}

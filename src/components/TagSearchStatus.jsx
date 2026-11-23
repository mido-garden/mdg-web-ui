import { Loader2 } from 'lucide-react'

export default function TagSearchStatus() {
  return (
    <li className="tag-lookup-loading" role="status" aria-label="Searching tags">
      <Loader2 className="spin" size={16} aria-hidden />
    </li>
  )
}

import MDEditor from '@uiw/react-md-editor'
import { markdownComponents } from './MermaidCode.jsx'

/** Read-only markdown with Mermaid ```mermaid fences rendered as diagrams. */
export default function MarkdownPreview({ source, className }) {
  if (!source?.trim()) return null
  return (
    <MDEditor.Markdown
      className={className}
      source={source}
      components={markdownComponents}
    />
  )
}

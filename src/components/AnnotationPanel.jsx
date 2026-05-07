import React from 'react'
import useStore from '../store'

export default function AnnotationPanel({ onJumpToBlock }) {
  const { annotations, setAnnotations } = useStore()

  const open = (annotations || []).filter(a => !a.resolved)
  const resolved = (annotations || []).filter(a => a.resolved)

  async function handleResolve(id) {
    await window.api.resolveAnnotation(id)
    setAnnotations((annotations || []).map(a => a.id === id ? { ...a, resolved: 1 } : a))
  }

  async function handleDelete(id) {
    await window.api.deleteAnnotation(id)
    setAnnotations((annotations || []).filter(a => a.id !== id))
  }

  return (
    <div style={{
      width: 280, borderLeft: '1px solid var(--border-subtle)',
      background: 'var(--bg-panel)', display: 'flex',
      flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{
        padding: '12px 14px 10px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--amber)', letterSpacing: '-0.01em' }}>
          Comments
          {open.length > 0 && (
            <span style={{
              marginLeft: 6, background: 'var(--amber)', color: '#000',
              borderRadius: 999, fontSize: 10, padding: '1px 6px',
              fontFamily: 'var(--font-ui)', fontWeight: 600,
            }}>
              {open.length}
            </span>
          )}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {open.length === 0 && resolved.length === 0 && (
          <div style={{
            padding: '28px 14px', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: 12,
            fontFamily: 'var(--font-ui)', lineHeight: 1.7,
          }}>
            No comments yet.<br />Right-click any block<br />to add one.
          </div>
        )}
        {open.map(a => (
          <AnnotationCard
            key={a.id} annotation={a}
            onJump={() => onJumpToBlock && onJumpToBlock(a.anchor_text)}
            onResolve={() => handleResolve(a.id)}
            onDelete={() => handleDelete(a.id)}
          />
        ))}
        {resolved.length > 0 && (
          <>
            <div style={{
              padding: '10px 14px 4px', fontSize: 10,
              color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>Resolved</div>
            {resolved.map(a => (
              <AnnotationCard
                key={a.id} annotation={a} resolved
                onJump={() => onJumpToBlock && onJumpToBlock(a.anchor_text)}
                onDelete={() => handleDelete(a.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function AnnotationCard({ annotation, resolved, onJump, onResolve, onDelete }) {
  return (
    <div style={{
      margin: '4px 8px', padding: '10px 12px',
      background: resolved ? 'transparent' : 'var(--bg-raised)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6, opacity: resolved ? 0.5 : 1,
    }}>
      <div
        style={{
          fontFamily: 'var(--font-screenplay)', fontSize: 10,
          color: 'var(--amber)', marginBottom: 5,
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', cursor: 'pointer', opacity: 0.8,
        }}
        onClick={onJump} title={annotation.anchor_text}
      >
        "{annotation.anchor_text}"
      </div>
      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: 12,
        color: 'var(--text-primary)', lineHeight: 1.5,
        marginBottom: 8, wordBreak: 'break-word',
      }}>
        {annotation.comment}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {!resolved && (
          <button className="btn btn-ghost btn-sm" onClick={onResolve}
            style={{ fontSize: 10, padding: '2px 8px', height: 22, color: '#5a9e6f', borderColor: '#5a9e6f' }}>
            Resolve
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onDelete}
          style={{ fontSize: 10, padding: '2px 8px', height: 22 }}>
          Delete
        </button>
      </div>
    </div>
  )
}

import React, { useMemo, useState } from 'react'
import useStore from '../store'

function formatDateTime(value) {
  if (!value) return 'Unknown'

  // SQLite CURRENT_TIMESTAMP is stored as UTC in the shape "YYYY-MM-DD HH:mm:ss".
  // Parse that shape explicitly as UTC, then display it in Central time.
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z'
    : value

  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value

  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(d)
}

function countWords(text = '') {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function getDocumentType(doc) {
  const title = doc.title || ''
  if (title.startsWith('Chat Export')) return 'Chat Export'
  return 'Project Document'
}

export default function DocumentsWorkspace({ onClose }) {
  const {
    currentProject,
    currentDocument,
    documents,
    setDocuments,
    setCurrentDocument,
    setActiveWorkspace,
    addNotification
  } = useStore()

  const [deletingId, setDeletingId] = useState(null)

  const sortedDocuments = useMemo(() => {
    return [...(documents || [])].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime()
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime()
      return bTime - aTime
    })
  }, [documents])

  async function refreshDocuments() {
    if (!currentProject) return []
    const docs = await window.api.getAllDocuments(currentProject.id)
    setDocuments(docs)
    return docs
  }

  function openDocument(doc) {
    setCurrentDocument(doc)
    setActiveWorkspace('editor')
  }

  async function deleteDocument(doc) {
    if (!doc?.id || deletingId) return

    const title = doc.title || 'Untitled Document'
    const isCurrent = currentDocument?.id === doc.id
    const warning = isCurrent
      ? `Delete "${title}"? This is currently open. This cannot be undone.`
      : `Delete "${title}"? This cannot be undone.`

    if (!confirm(warning)) return

    setDeletingId(doc.id)

    try {
      await window.api.deleteDocument(doc.id)
      const docs = await refreshDocuments()

      if (isCurrent) {
        const nextDoc = docs[0] || null
        setCurrentDocument(nextDoc)
      }

      addNotification('Deleted project document.', 'success')
    } catch (err) {
      addNotification('Could not delete document: ' + err.message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="documents-workspace">
      <div className="documents-workspace-header">
        <div>
          <div className="documents-eyebrow">Project Documents</div>
          <h1 className="documents-title">Documents</h1>
          <p className="documents-subtitle">
            Saved chat exports and project documents live here. Your screenplay stays in the Screenplay workspace.
          </p>
        </div>
        {onClose && (
          <button className="btn btn-secondary no-drag" onClick={onClose}>
            Back to Dashboard
          </button>
        )}
      </div>

      {sortedDocuments.length === 0 ? (
        <div className="documents-empty">
          <div className="documents-empty-icon">▤</div>
          <h2>No saved documents yet</h2>
          <p>Use Save Chat from the chat panel to save an important conversation into this project.</p>
        </div>
      ) : (
        <div className="documents-list">
          {sortedDocuments.map(doc => {
            const title = doc.title || 'Untitled Document'
            const type = getDocumentType(doc)
            const isChatExport = type === 'Chat Export'
            const words = doc.word_count || countWords(doc.content || '')
            const contentLength = doc.content?.length || 0
            const updated = formatDateTime(doc.updated_at || doc.created_at)
            const isCurrent = currentDocument?.id === doc.id
            const isDeleting = deletingId === doc.id

            return (
              <div
                key={doc.id}
                className={`documents-row ${isCurrent ? 'documents-row--active' : ''}`}
              >
                <button
                  className="documents-row-main no-drag"
                  onClick={() => openDocument(doc)}
                  title="Open document"
                >
                  <span className="documents-row-icon">{isChatExport ? '💬' : '✏'}</span>
                  <span className="documents-row-text">
                    <span className="documents-row-title">{title}</span>
                    <span className="documents-row-meta">
                      {type} • Updated {updated} • {words.toLocaleString()} words • {contentLength.toLocaleString()} chars
                    </span>
                  </span>
                </button>

                <div className="documents-row-actions">
                  {isCurrent && <span className="documents-current-pill">Current</span>}
                  <button
                    className="documents-delete-btn no-drag"
                    onClick={() => deleteDocument(doc)}
                    disabled={isDeleting}
                    title="Delete document"
                  >
                    {isDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

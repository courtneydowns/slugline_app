import React, { useEffect, useMemo, useState } from 'react'
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
  if (doc.document_type === 'chat-export') return 'Chat Export'
  if (doc.document_type === 'screenplay') return 'Screenplay Document'
  if (doc.document_type === 'project-document') return 'Project Document'

  const title = doc.title || ''
  const content = doc.content || ''
  if (title.startsWith('Chat Export')) return 'Chat Export'
  if (/\nChat: .+\nExported: /m.test(content)) return 'Chat Export'
  if (content.includes('\n## User\n\n') || content.includes('\n## Assistant\n\n')) return 'Chat Export'
  return 'Screenplay Document'
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
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [creatingKind, setCreatingKind] = useState(null)
  const [newDocumentTitle, setNewDocumentTitle] = useState('')
  const [openedDocument, setOpenedDocument] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [savingContent, setSavingContent] = useState(false)

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

  function isScreenplayDocument(doc) {
    return (doc?.document_type || 'screenplay') === 'screenplay' && getDocumentType(doc) === 'Screenplay Document'
  }

  useEffect(() => {
    if (currentDocument && !isScreenplayDocument(currentDocument)) {
      setOpenedDocument(currentDocument)
      setEditingContent(currentDocument.content || '')
    }
  }, [currentDocument?.id, currentDocument?.content, currentDocument?.document_type])

  function openDocument(doc) {
    if (isScreenplayDocument(doc)) {
      setCurrentDocument(doc)
      setActiveWorkspace('editor')
      return
    }

    setOpenedDocument(doc)
    setEditingContent(doc.content || '')
    setCurrentDocument(doc)
  }

  async function saveDocumentContent() {
    if (!openedDocument?.id || isScreenplayDocument(openedDocument) || savingContent) return

    setSavingContent(true)
    try {
      const updated = await window.api.updateDocument(openedDocument.id, { content: editingContent })
      const docs = await refreshDocuments()
      const freshDoc = docs.find(doc => doc.id === updated.id) || updated
      setOpenedDocument(freshDoc)
      setCurrentDocument(freshDoc)
      setEditingContent(freshDoc.content || '')
      addNotification(`Saved ${freshDoc.title || 'document'}.`, 'success')
    } catch (err) {
      addNotification('Could not save document: ' + err.message, 'error')
    } finally {
      setSavingContent(false)
    }
  }

  function startCreateDocument(kind) {
    setCreatingKind(kind)
    setNewDocumentTitle(kind === 'screenplay' ? 'Pilot / Episode 1' : 'New Project Document')
  }

  function cancelCreateDocument() {
    setCreatingKind(null)
    setNewDocumentTitle('')
  }

  async function createNamedDocument() {
    if (!currentProject || !creatingKind) return

    const title = newDocumentTitle.trim()
    if (!title) {
      addNotification('Please name the document first.', 'warning')
      return
    }

    try {
      const created = await window.api.createDocument({
        project_id: currentProject.id,
        title,
        content: '',
        document_type: creatingKind === 'screenplay' ? 'screenplay' : 'project-document'
      })
      const docs = await refreshDocuments()
      const selected = docs.find(doc => doc.id === created.id) || created

      if (creatingKind === 'screenplay') {
        setCurrentDocument(selected)
        setActiveWorkspace('editor')
      } else {
        setOpenedDocument(selected)
        setCurrentDocument(selected)
        setEditingContent(selected.content || '')
      }

      addNotification(
        creatingKind === 'screenplay'
          ? `Created screenplay document: ${title}.`
          : `Created project document: ${title}.`,
        'success'
      )
      cancelCreateDocument()
    } catch (err) {
      addNotification('Could not create document: ' + err.message, 'error')
    }
  }

  function requestDeleteDocument(doc) {
    if (!doc?.id || deletingId) return
    setDeleteTarget(doc)
  }

  function cancelDeleteDocument() {
    if (deletingId) return
    setDeleteTarget(null)
  }

  async function confirmDeleteDocument() {
    const doc = deleteTarget
    if (!doc?.id || deletingId) return

    const isCurrent = currentDocument?.id === doc.id
    setDeletingId(doc.id)

    try {
      await window.api.deleteDocument(doc.id)
      const docs = await refreshDocuments()

      if (openedDocument?.id === doc.id) {
        setOpenedDocument(null)
        setEditingContent('')
      }

      if (isCurrent) {
        const nextDoc = docs.find(item => isScreenplayDocument(item)) || docs[0] || null
        setCurrentDocument(nextDoc)
      }

      setDeleteTarget(null)
      addNotification('Deleted document.', 'success')
    } catch (err) {
      addNotification('Could not delete document: ' + err.message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  function startRenameDocument(doc) {
    if (!doc?.id) return
    setRenamingId(doc.id)
    setRenameTitle(doc.title || 'Untitled Document')
  }

  function cancelRenameDocument() {
    setRenamingId(null)
    setRenameTitle('')
  }

  async function saveRenameDocument(doc) {
    if (!doc?.id) return

    const title = renameTitle.trim()
    if (!title) {
      addNotification('Please enter a document name.', 'warning')
      return
    }

    try {
      const updated = await window.api.updateDocument(doc.id, { title })
      const docs = await refreshDocuments()

      if (currentDocument?.id === doc.id) {
        setCurrentDocument(docs.find(item => item.id === doc.id) || updated)
      }

      setRenamingId(null)
      setRenameTitle('')

      const freshDoc = docs.find(item => item.id === doc.id) || updated

      if (openedDocument?.id === doc.id) {
        setOpenedDocument(freshDoc)
        setEditingContent(freshDoc.content || '')
      }

      if (currentDocument?.id === doc.id) {
        setCurrentDocument(freshDoc)
      }

      addNotification(`Renamed document to ${title}.`, 'success')
    } catch (err) {
      addNotification('Could not rename document: ' + err.message, 'error')
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <button className="btn btn-primary no-drag" onClick={() => startCreateDocument('screenplay')}>
            + New Screenplay Document
          </button>
          <button className="btn btn-secondary no-drag" onClick={() => startCreateDocument('project')}>
            + New Project Document
          </button>
          {onClose && (
            <button className="btn btn-secondary no-drag" onClick={onClose}>
              Back to Dashboard
            </button>
          )}
        </div>
      </div>

      {creatingKind && (
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          marginBottom: 18,
          padding: 14,
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          background: 'var(--bg-panel)'
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 650 }}>
            {creatingKind === 'screenplay' ? 'New screenplay:' : 'New project document:'}
          </div>
          <input
            className="input selectable"
            value={newDocumentTitle}
            onChange={e => setNewDocumentTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') createNamedDocument()
              if (e.key === 'Escape') cancelCreateDocument()
            }}
            autoFocus
            style={{ flex: 1, fontSize: 13 }}
          />
          <button
            className="btn btn-primary no-drag"
            onClick={createNamedDocument}
            disabled={!newDocumentTitle.trim()}
            style={{ opacity: newDocumentTitle.trim() ? 1 : 0.5 }}
          >
            Create
          </button>
          <button className="btn btn-ghost no-drag" onClick={cancelCreateDocument}>
            Cancel
          </button>
        </div>
      )}

      {openedDocument && !isScreenplayDocument(openedDocument) && (
        <div
          style={{
            marginBottom: 18,
            padding: 16,
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            background: 'var(--bg-panel)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Open Document
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-primary)' }}>
                {openedDocument.title || 'Untitled Document'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {getDocumentType(openedDocument)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary no-drag"
              onClick={saveDocumentContent}
              disabled={savingContent}
            >
              {savingContent ? 'Saving…' : 'Save Document'}
            </button>
          </div>

          <textarea
            className="input selectable"
            value={editingContent}
            onChange={e => setEditingContent(e.target.value)}
            placeholder={openedDocument.document_type === 'chat-export' ? 'Saved chat transcript' : 'Write project notes here...'}
            style={{
              width: '100%',
              minHeight: 260,
              resize: 'vertical',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.6,
              padding: 14
            }}
          />
        </div>
      )}

      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
          onMouseDown={cancelDeleteDocument}
        >
          <div
            style={{
              width: 'min(460px, 100%)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
              padding: 22
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
              Delete document?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 18 }}>
              Delete <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget.title || 'Untitled Document'}</strong>? This cannot be undone.
              {currentDocument?.id === deleteTarget.id && (
                <span> This document is currently open.</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost no-drag"
                onClick={cancelDeleteDocument}
                disabled={deletingId === deleteTarget.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary no-drag"
                onClick={confirmDeleteDocument}
                disabled={deletingId === deleteTarget.id}
              >
                {deletingId === deleteTarget.id ? 'Deleting…' : 'Yes, delete document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sortedDocuments.length === 0 ? (
        <div className="documents-empty">
          <div className="documents-empty-icon">▤</div>
          <h2>No saved documents yet</h2>
          <p>Use Save Chat for transcripts, or create a named screenplay/project document yourself.</p>
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
                <div
                  className="documents-row-main no-drag"
                  onClick={() => {
                    if (renamingId !== doc.id) openDocument(doc)
                  }}
                  role="button"
                  tabIndex={renamingId === doc.id ? -1 : 0}
                  onKeyDown={e => {
                    if (renamingId === doc.id) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openDocument(doc)
                    }
                  }}
                  title={renamingId === doc.id ? 'Renaming document' : 'Open document'}
                >
                  <span className="documents-row-icon">{isChatExport ? '💬' : '✏'}</span>
                  <span className="documents-row-text">
                    {renamingId === doc.id ? (
                      <span
                        style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          className="input selectable"
                          value={renameTitle}
                          onChange={e => setRenameTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveRenameDocument(doc)
                            if (e.key === 'Escape') cancelRenameDocument()
                          }}
                          autoFocus
                          style={{ flex: 1, fontSize: 13 }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm no-drag"
                          onClick={e => {
                            e.stopPropagation()
                            saveRenameDocument(doc)
                          }}
                          disabled={!renameTitle.trim()}
                          style={{ opacity: renameTitle.trim() ? 1 : 0.5 }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm no-drag"
                          onClick={e => {
                            e.stopPropagation()
                            cancelRenameDocument()
                          }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="documents-row-title">{title}</span>
                    )}
                    <span className="documents-row-meta">
                      {type} • Updated {updated} • {words.toLocaleString()} words • {contentLength.toLocaleString()} chars
                    </span>
                  </span>
                </div>

                <div className="documents-row-actions">
                  {isCurrent && <span className="documents-current-pill">Current</span>}
                  {renamingId !== doc.id && (
                    <button
                      className="btn btn-ghost btn-sm no-drag"
                      onClick={e => {
                        e.stopPropagation()
                        startRenameDocument(doc)
                      }}
                      title="Rename document"
                    >
                      Rename
                    </button>
                  )}
                  <button
                    className="documents-delete-btn no-drag"
                    onClick={e => {
                      e.stopPropagation()
                      requestDeleteDocument(doc)
                    }}
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

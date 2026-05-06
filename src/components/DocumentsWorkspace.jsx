import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  if (doc?.document_type === 'chat-export') return 'Chat Export'
  if (doc?.document_type === 'screenplay') return 'Screenplay Document'
  if (doc?.document_type === 'project-document') return 'Project Document'

  const title = doc?.title || ''
  const content = doc?.content || ''

  if (title.startsWith('Chat Export')) return 'Chat Export'
  if (/\nChat: .+\nExported: /m.test(content)) return 'Chat Export'
  if (content.includes('\n## User\n\n') || content.includes('\n## Assistant\n\n')) return 'Chat Export'

  // Legacy/ambiguous rows should stay editable in Documents instead of being
  // routed into Screenplay Editor. Only explicit document_type='screenplay'
  // should behave as a screenplay document.
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
    addNotification,
    focusedScreenplayBlockIndex
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
  const [sendTarget, setSendTarget] = useState(null)
  const [sendingToScreenplay, setSendingToScreenplay] = useState(false)

  // ── Autosave refs (notes/project documents only) ───────────────────────────
  const autosaveTimerRef = useRef(null)
  const pendingSaveRef = useRef(null)
  const latestEditingContentRef = useRef('')

  useEffect(() => {
    if (currentProject?.id) refreshDocuments()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openedDocument?.id || openedDocument.document_type === 'screenplay') {
      pendingSaveRef.current = null
      return
    }

    pendingSaveRef.current = { docId: openedDocument.id, content: editingContent }

    const docId = openedDocument.id
    const content = editingContent
    const timerId = setTimeout(async () => {
      autosaveTimerRef.current = null
      const pending = pendingSaveRef.current
      if (!pending || pending.docId !== docId) return
      pendingSaveRef.current = null
      try {
        await window.api.updateDocument(docId, { content })
        if (currentProject?.id) {
          const docs = await window.api.getAllDocuments(currentProject.id)
          setDocuments(docs)
        }
      } catch (err) {
        console.error('[DocumentsWorkspace] autosave error:', err)
      }
    }, 1500)
    autosaveTimerRef.current = timerId

    return () => clearTimeout(timerId)
  }, [editingContent, openedDocument?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Unmount flush — last-resort for genuine unmounts (Dashboard/Screenplay nav).
  // Back to Documents does NOT unmount, so closeOpenedDocument handles that path.
  useEffect(() => {
    return () => {
      const pending = pendingSaveRef.current
      if (!pending) return
      pendingSaveRef.current = null
      window.api.updateDocument(pending.docId, { content: pending.content })
        .catch(err => console.error('[DocumentsWorkspace] unmount flush error:', err))
    }
  }, [])

  const sortedDocuments = useMemo(() => {
    return [...(documents || [])].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime()
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime()
      return bTime - aTime
    })
  }, [documents])

  const screenplayDocuments = useMemo(() => {
    return (documents || []).filter(doc => isScreenplayDocument(doc))
  }, [documents])

  function buildAppendedScreenplayContent(existingContent = '', appendedContent = '') {
    const existing = existingContent.trimEnd()
    const appended = appendedContent.trim()

    if (!existing) return appended
    return `${existing}\n\n${appended}`
  }

  function buildInsertedScreenplayContent(existingContent = '', insertedContent = '', insertAfterIndex = null) {
    const existingLines = existingContent.split('\n')
    const inserted = insertedContent.trim()
    const index = Number(insertAfterIndex)

    if (!Number.isInteger(index) || index < 0) {
      return buildAppendedScreenplayContent(existingContent, inserted)
    }

    const nonEmptyLineIndexes = existingLines
      .map((line, lineIndex) => line.trim() ? lineIndex : null)
      .filter(lineIndex => lineIndex !== null)

    const afterLineIndex = nonEmptyLineIndexes[index]

    if (afterLineIndex === undefined) {
      return buildAppendedScreenplayContent(existingContent, inserted)
    }

    const before = existingLines.slice(0, afterLineIndex + 1).join('\n').trimEnd()
    const after = existingLines.slice(afterLineIndex + 1).join('\n').trimStart()

    return after
      ? `${before}\n\n${inserted}\n\n${after}`
      : `${before}\n\n${inserted}`
  }

  async function refreshDocuments() {
    if (!currentProject) return []
    const docs = await window.api.getAllDocuments(currentProject.id)
    setDocuments(docs)
    return docs
  }

  function isScreenplayDocument(doc) {
    return doc?.document_type === 'screenplay' && getDocumentType(doc) === 'Screenplay Document'
  }

  async function flushOpenedDocumentNow(reason) {
    if (!openedDocument?.id || openedDocument.document_type === 'screenplay') return
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    pendingSaveRef.current = null
    const content = latestEditingContentRef.current
    try {
      const updated = await window.api.updateDocument(openedDocument.id, { content })
      await refreshDocuments()
      return updated || null
    } catch (err) {
      console.error(`[DocumentsWorkspace] ${reason} flush error:`, err)
    }
  }

  // Keep Documents editor state local. Do not auto-expand a document just because
  // currentDocument changes elsewhere; screenplay state may redirect non-screenplay docs.
  async function openDocument(doc) {
    await flushOpenedDocumentNow('switch')

    if (isScreenplayDocument(doc)) {
      setCurrentDocument(doc)
      setActiveWorkspace('editor')
      return
    }

    setOpenedDocument(doc)
    setEditingContent(doc.content || '')
    latestEditingContentRef.current = doc.content || ''
  }

  async function closeOpenedDocument() {
    await flushOpenedDocumentNow('close')
    setOpenedDocument(null)
    setEditingContent('')
    latestEditingContentRef.current = ''
  }

  async function saveDocumentContent() {
    if (!openedDocument?.id || isScreenplayDocument(openedDocument) || savingContent) return

    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = null
    pendingSaveRef.current = null

    setSavingContent(true)
    try {
      const updated = await window.api.updateDocument(openedDocument.id, { content: latestEditingContentRef.current })
      const docs = await refreshDocuments()
      const freshDoc = docs.find(doc => doc.id === updated.id) || updated
      setOpenedDocument(freshDoc)
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
    setNewDocumentTitle(kind === 'screenplay' ? 'Untitled Script Draft' : 'New Project Notes')
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
        setEditingContent(selected.content || '')
      }

      addNotification(
        creatingKind === 'screenplay'
          ? `Created script draft: ${title}.`
          : `Created notes document: ${title}.`,
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

  async function duplicateChatExport(doc) {
    if (!currentProject || !doc?.id) return
    try {
      const newTitle = `${doc.title || 'Chat Export'} — Copy`
      const created = await window.api.createDocument({
        project_id: currentProject.id,
        title: newTitle,
        content: doc.content || '',
        document_type: 'project-document'
      })
      const docs = await refreshDocuments()
      const fresh = docs.find(d => d.id === created.id) || created
      setOpenedDocument(fresh)
      setEditingContent(fresh.content || '')
      latestEditingContentRef.current = fresh.content || ''
      addNotification(`Duplicated as editable document: ${newTitle}.`, 'success')
    } catch (err) {
      addNotification('Could not duplicate document: ' + err.message, 'error')
    }
  }

  function requestCreateScreenplayCopy() {
    if (!openedDocument || isScreenplayDocument(openedDocument)) return

    const content = editingContent.trim()
    if (!content) {
      addNotification('Add document text before sending it to screenplay.', 'warning')
      return
    }

    setSendTarget({
      mode: 'create',
      source: openedDocument,
      title: `${openedDocument.title || 'Untitled Document'} — Screenplay Copy`,
      content,
      targetScreenplayId: screenplayDocuments[0]?.id || ''
    })
  }

  function cancelCreateScreenplayCopy() {
    if (sendingToScreenplay) return
    setSendTarget(null)
  }

  async function confirmCreateScreenplayCopy() {
    if (!currentProject || !sendTarget || sendingToScreenplay) return

    setSendingToScreenplay(true)
    try {
      if (sendTarget.mode === 'append' || sendTarget.mode === 'insert-after-focused') {
        const targetDoc = screenplayDocuments.find(doc => String(doc.id) === String(sendTarget.targetScreenplayId))

        if (!targetDoc) {
          addNotification('Choose a screenplay document first.', 'warning')
          return
        }

        if (sendTarget.mode === 'insert-after-focused' && !Number.isInteger(sendTarget.insertAfterIndex)) {
          addNotification('Click a line in Screenplay first, then try inserting again.', 'warning')
          return
        }

        const updatedContent = sendTarget.mode === 'insert-after-focused'
          ? buildInsertedScreenplayContent(targetDoc.content || '', sendTarget.content, sendTarget.insertAfterIndex)
          : buildAppendedScreenplayContent(targetDoc.content || '', sendTarget.content)

        const updated = await window.api.updateDocument(targetDoc.id, {
          content: updatedContent
        })

        const docs = await refreshDocuments()
        const freshDoc = docs.find(doc => doc.id === updated.id) || updated

        setSendTarget(null)
        setCurrentDocument(freshDoc)
        setActiveWorkspace('editor')
        addNotification(
          sendTarget.mode === 'insert-after-focused'
            ? `Inserted into screenplay: ${freshDoc.title || targetDoc.title}.`
            : `Appended to screenplay: ${freshDoc.title || targetDoc.title}.`,
          'success'
        )
        return
      }

      const created = await window.api.createDocument({
        project_id: currentProject.id,
        title: sendTarget.title,
        content: sendTarget.content,
        document_type: 'screenplay'
      })

      const docs = await refreshDocuments()
      const freshDoc = docs.find(doc => doc.id === created.id) || created

      setSendTarget(null)
      setCurrentDocument(freshDoc)
      setActiveWorkspace('editor')
      addNotification(`Created screenplay copy: ${freshDoc.title || sendTarget.title}.`, 'success')
    } catch (err) {
      addNotification('Could not send to screenplay: ' + err.message, 'error')
    } finally {
      setSendingToScreenplay(false)
    }
  }

  return (
    <div className="documents-workspace">
      <div className="documents-workspace-header">
        <div>
          <div className="documents-eyebrow">Project Documents</div>
          <h1 className="documents-title">Documents</h1>
          <p className="documents-subtitle">
            Saved chat exports, notes, and reference docs live here. Script drafts open in the Screenplay workspace.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <button className="btn btn-primary no-drag" onClick={() => startCreateDocument('screenplay')}>
            🎬 New Script Draft
          </button>
          <button className="btn btn-secondary no-drag" onClick={() => startCreateDocument('project')}>
            🗒️ New Notes Document
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
            {creatingKind === 'screenplay' ? 'New script draft:' : 'New notes document:'}
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
              className="btn btn-ghost btn-sm no-drag"
              onClick={closeOpenedDocument}
              title="Return to the Documents list"
            >
              Back to Documents
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            {openedDocument.document_type !== 'chat-export' && (
              <button
                type="button"
                className="btn btn-primary no-drag"
                onClick={saveDocumentContent}
                disabled={savingContent}
              >
                {savingContent ? 'Saving…' : 'Save Document'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary no-drag"
              onClick={requestCreateScreenplayCopy}
              disabled={!editingContent.trim()}
              title="Create a new screenplay document from this document without changing the original"
              style={{ opacity: editingContent.trim() ? 1 : 0.5 }}
            >
              Send to Screenplay
            </button>
          </div>

          <textarea
            className="input selectable"
            value={editingContent}
            onChange={openedDocument.document_type === 'chat-export' ? undefined : e => { setEditingContent(e.target.value); latestEditingContentRef.current = e.target.value }}
            readOnly={openedDocument.document_type === 'chat-export'}
            placeholder={openedDocument.document_type === 'chat-export' ? 'Saved chat transcript' : 'Write project notes here...'}
            style={{
              width: '100%',
              minHeight: 260,
              resize: 'vertical',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.6,
              padding: 14,
              ...(openedDocument.document_type === 'chat-export' && { opacity: 0.8, cursor: 'default' })
            }}
          />
        </div>
      )}

      {sendTarget && (
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
          onMouseDown={cancelCreateScreenplayCopy}
        >
          <div
            style={{
              width: 'min(680px, 100%)',
              maxHeight: '82vh',
              overflow: 'auto',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
              padding: 22
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
              Send to screenplay?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
              Send text from <strong style={{ color: 'var(--text-primary)' }}>{sendTarget.source?.title || 'Untitled Document'}</strong> to a screenplay document. The source document will not be changed.
            </div>

            <div style={{
              display: 'grid',
              gap: 8,
              marginBottom: 14
            }}>
              <button
                type="button"
                className={`btn ${sendTarget.mode === 'create' ? 'btn-primary' : 'btn-secondary'} no-drag`}
                onClick={() => setSendTarget(target => ({ ...target, mode: 'create' }))}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  padding: '11px 12px',
                  height: 'auto',
                  lineHeight: 1.25
                }}
              >
                <span style={{ display: 'grid', gap: 3 }}>
                  <strong>🎬 Create new script copy</strong>
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
                    Make a separate screenplay draft from this document.
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={`btn ${sendTarget.mode === 'append' ? 'btn-primary' : 'btn-secondary'} no-drag`}
                onClick={() => setSendTarget(target => ({
                  ...target,
                  mode: 'append',
                  targetScreenplayId: target.targetScreenplayId || screenplayDocuments[0]?.id || ''
                }))}
                disabled={screenplayDocuments.length === 0}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  padding: '11px 12px',
                  height: 'auto',
                  lineHeight: 1.25,
                  opacity: screenplayDocuments.length ? 1 : 0.5
                }}
                title={screenplayDocuments.length ? 'Append this text to the end of an existing screenplay document' : 'Create a screenplay document first'}
              >
                <span style={{ display: 'grid', gap: 3 }}>
                  <strong>➕ Append to end</strong>
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
                    Add this text after the selected screenplay’s current content.
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={`btn ${sendTarget.mode === 'insert-after-focused' ? 'btn-primary' : 'btn-secondary'} no-drag`}
                onClick={() => setSendTarget(target => ({
                  ...target,
                  mode: 'insert-after-focused',
                  targetScreenplayId: target.targetScreenplayId || currentDocument?.id || screenplayDocuments[0]?.id || '',
                  insertAfterIndex: focusedScreenplayBlockIndex
                }))}
                disabled={screenplayDocuments.length === 0 || !Number.isInteger(focusedScreenplayBlockIndex)}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  padding: '11px 12px',
                  height: 'auto',
                  lineHeight: 1.25,
                  opacity: screenplayDocuments.length && Number.isInteger(focusedScreenplayBlockIndex) ? 1 : 0.5
                }}
                title={
                  screenplayDocuments.length === 0
                    ? 'Create a screenplay document first'
                    : Number.isInteger(focusedScreenplayBlockIndex)
                      ? 'Insert this text after the last focused screenplay line'
                      : 'Click a line in Screenplay first'
                }
              >
                <span style={{ display: 'grid', gap: 3 }}>
                  <strong>↳ Insert after focused line</strong>
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
                    Place this text after the last line you clicked in Screenplay.
                  </span>
                </span>
              </button>
            </div>

            {sendTarget.mode === 'create' ? (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  New screenplay title
                </label>
                <input
                  className="input selectable"
                  value={sendTarget.title}
                  onChange={e => setSendTarget(target => ({ ...target, title: e.target.value }))}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {sendTarget.mode === 'insert-after-focused' ? 'Insert into screenplay document' : 'Append to screenplay document'}
                </label>
                <select
                  className="input selectable"
                  value={sendTarget.targetScreenplayId || ''}
                  onChange={e => setSendTarget(target => ({ ...target, targetScreenplayId: e.target.value }))}
                  style={{ width: '100%', fontSize: 13 }}
                >
                  <option value="">Choose a screenplay document…</option>
                  {screenplayDocuments.map(doc => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title || 'Untitled Screenplay'}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8 }}>
                  {sendTarget.mode === 'insert-after-focused'
                    ? 'This will insert the preview text after the last focused screenplay line. Existing screenplay text will be preserved.'
                    : 'This will add the preview text to the end of the selected screenplay. Existing screenplay text will be preserved.'}
                </div>
              </div>
            )}
            <div style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              background: 'var(--bg-base)',
              padding: 14,
              marginBottom: 18
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                {sendTarget.mode === 'insert-after-focused'
                  ? 'Insert Preview'
                  : sendTarget.mode === 'append'
                    ? 'Append Preview'
                    : 'Preview'}
              </div>
              <pre className="selectable" style={{
                margin: 0,
                maxHeight: 260,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-screenplay)',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--text-secondary)'
              }}>{sendTarget.content}</pre>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost no-drag"
                onClick={cancelCreateScreenplayCopy}
                disabled={sendingToScreenplay}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary no-drag"
                onClick={confirmCreateScreenplayCopy}
                disabled={
                  sendingToScreenplay ||
                  (sendTarget.mode === 'create' && !sendTarget.title.trim()) ||
                  (sendTarget.mode === 'append' && !sendTarget.targetScreenplayId) ||
                  (sendTarget.mode === 'insert-after-focused' && (!sendTarget.targetScreenplayId || !Number.isInteger(sendTarget.insertAfterIndex)))
                }
                style={{
                  opacity: !sendingToScreenplay &&
                    ((sendTarget.mode === 'create' && sendTarget.title.trim()) ||
                    (sendTarget.mode === 'append' && sendTarget.targetScreenplayId) ||
                    (sendTarget.mode === 'insert-after-focused' && sendTarget.targetScreenplayId && Number.isInteger(sendTarget.insertAfterIndex)))
                    ? 1
                    : 0.5
                }}
              >
                {sendingToScreenplay
                  ? sendTarget.mode === 'insert-after-focused'
                    ? 'Inserting…'
                    : sendTarget.mode === 'append'
                      ? 'Appending…'
                      : 'Creating…'
                  : sendTarget.mode === 'insert-after-focused'
                    ? 'Insert into Screenplay'
                    : sendTarget.mode === 'append'
                      ? 'Append to Screenplay'
                      : 'Create Screenplay Copy'}
              </button>
            </div>
          </div>
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
          <p>Use Save Chat for transcripts, create script drafts for screenplay work, or create notes docs for reference material.</p>
        </div>
      ) : (
        <div className="documents-list">
          {sortedDocuments.map(doc => {
            const title = doc.title || 'Untitled Document'
            const type = getDocumentType(doc)
            const isChatExport = type === 'Chat Export'
            const isScreenplayDoc = type === 'Screenplay Document'
            const rowOpenLabel = isScreenplayDoc ? 'Open in Screenplay' : 'Open document'
            const rowIcon = isScreenplayDoc ? '🎬' : (isChatExport ? '💬' : '🗒️')
            const rowMetaType = isScreenplayDoc ? 'Screenplay Document — opens in Screenplay' : type
            const words = doc.word_count || countWords(doc.content || '')
            const contentLength = doc.content?.length || 0
            const updated = formatDateTime(doc.updated_at || doc.created_at)
            const isCurrent = isScreenplayDoc
              ? currentDocument?.id === doc.id
              : openedDocument?.id === doc.id
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
                  title={renamingId === doc.id ? 'Renaming document' : rowOpenLabel}
                  aria-label={renamingId === doc.id ? 'Renaming document' : rowOpenLabel}
                >
                  <span className="documents-row-icon">{rowIcon}</span>
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
                      {rowMetaType} • Updated {updated} • {words.toLocaleString()} words • {contentLength.toLocaleString()} chars
                    </span>
                  </span>
                </div>

                <div className="documents-row-actions">
                  {isCurrent && <span className="documents-current-pill">Current</span>}
                  {isScreenplayDoc && renamingId !== doc.id && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm no-drag"
                      onClick={e => {
                        e.stopPropagation()
                        openDocument(doc)
                      }}
                      disabled={isDeleting}
                      title="Open in Screenplay"
                    >
                      Open in Screenplay
                    </button>
                  )}
                  {isChatExport && renamingId !== doc.id && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm no-drag"
                      onClick={e => {
                        e.stopPropagation()
                        duplicateChatExport(doc)
                      }}
                      disabled={isDeleting}
                      title="Duplicate as an editable project document"
                    >
                      Duplicate &amp; Edit
                    </button>
                  )}
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

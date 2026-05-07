import React, { useEffect, useState } from 'react'
import useStore from '../store'

const FORMATS = [
  { id: 'fountain', label: '.fountain', desc: 'Industry standard plain text format. Works with Highland, Fade In, and most screenplay apps.' },
  { id: 'fdx', label: '.fdx', desc: 'Final Draft format. Import directly into Final Draft software.' },
  { id: 'pdf', label: '.pdf', desc: 'Print-ready PDF in proper screenplay format.' },
  { id: 'docx', label: '.docx', desc: 'Microsoft Word document with screenplay formatting.' },
  { id: 'md', label: '.md', desc: 'Markdown file. Good for version control or sharing as text.' },
]

export default function ExportModal({ onClose }) {
  const { currentProject, currentDocument, activeRevision, addNotification } = useStore()
  const [format, setFormat] = useState('fountain')
  const [exporting, setExporting] = useState(false)
  const [includeRevisionMarks, setIncludeRevisionMarks] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleExport() {
    if (!currentDocument) { addNotification('No document to export', 'warning'); return }
    setExporting(true)
    const result = await window.api.exportFile({
      projectId: currentProject.id,
      documentId: currentDocument.id,
      format,
      revisionId: (includeRevisionMarks && activeRevision?.locked_at) ? activeRevision.id : null,
      includeRevisionMarks: includeRevisionMarks && !!(activeRevision?.locked_at),
    })
    setExporting(false)
    if (result.success) {
      addNotification(`Exported to ${result.path}`, 'success')
      onClose()
    } else if (!result.canceled) {
      addNotification(`Export failed: ${result.error}`, 'error')
    }
  }

  async function handleImport() {
    const result = await window.api.openFileDialog({
      properties: ['openFile'],
      filters: [{ name: 'Screenplay Files', extensions: ['fountain', 'txt', 'md', 'fdx'] }]
    })
    if (result.canceled || !result.filePaths[0]) return
    if (!window.confirm('Import will replace the current document content. This cannot be undone. Continue?')) return
    const imported = await window.api.importFile(result.filePaths[0])
    if (imported.success && currentDocument) {
      await window.api.updateDocument(currentDocument.id, { content: imported.content, title: imported.title })
      useStore.getState().setCurrentDocument({ ...currentDocument, content: imported.content })
      addNotification(`Imported "${imported.title}"`, 'success')
      onClose()
    } else {
      addNotification(`Import failed: ${imported.error}`, 'error')
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width: 480, maxHeight: '88vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Export / Import</div>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            title="Close Export"
            aria-label="Close Export"
            style={{ minWidth: 36, height: 32, padding: '0 10px', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Export Format</div>
          {FORMATS.map(f => (
            <div
              key={f.id}
              onClick={() => setFormat(f.id)}
              style={{
                padding: '12px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                background: format === f.id ? 'var(--amber-subtle)' : 'var(--bg-raised)',
                border: `1px solid ${format === f.id ? 'var(--amber)' : 'var(--border)'}`,
                transition: 'all 0.1s'
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-screenplay)', fontSize: 13, fontWeight: 700, color: format === f.id ? 'var(--amber)' : 'var(--text-primary)' }}>{f.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{f.desc}</span>
              </div>
            </div>
          ))}

          {activeRevision?.locked_at && (format === 'pdf' || format === 'docx') && (
            <div
              onClick={() => setIncludeRevisionMarks(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer', background: includeRevisionMarks ? 'var(--amber-subtle)' : 'var(--bg-raised)', border: `1px solid ${includeRevisionMarks ? 'var(--amber)' : 'var(--border)'}`, transition: 'all 0.1s' }}
            >
              <input type="checkbox" checked={includeRevisionMarks} onChange={() => {}} style={{ accentColor: 'var(--amber)', cursor: 'pointer' }} />
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Include revision marks</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Scene numbers and change asterisks from the active locked draft</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ flex: 1, justifyContent: 'center' }}>
              {exporting ? 'Exporting…' : `Export as ${format.toUpperCase()}`}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Import</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
              Import a .fountain, .fdx, .txt, or .md file into this project. This will replace the current document content.
            </p>
            <button className="btn btn-ghost" onClick={handleImport}>Import File…</button>
          </div>
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

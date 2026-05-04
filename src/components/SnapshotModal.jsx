import React, { useState, useEffect } from 'react'
import useStore from '../store'

export default function SnapshotModal({ onClose }) {
  const { currentProject, addNotification } = useStore()
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [restoring, setRestoring] = useState(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function load() {
    const s = await window.api.getSnapshots(currentProject.id)
    setSnapshots(s)
    setLoading(false)
  }

  async function create() {
    const s = await window.api.createSnapshot(currentProject.id, label || `Manual snapshot — ${new Date().toLocaleString()}`)
    setSnapshots(prev => [s, ...prev])
    setCreating(false)
    setLabel('')
    addNotification('Snapshot saved', 'success')
  }

  async function restore(id) {
    if (!confirm('Restore this snapshot? Your current script will be replaced with this version.')) return
    setRestoring(id)
    const result = await window.api.restoreSnapshot(id)
    if (result.success) {
      addNotification('Snapshot restored', 'success')
      // Reload document
      const docs = await window.api.getAllDocuments(currentProject.id)
      if (docs[0]) useStore.getState().setCurrentDocument(docs[0])
      onClose()
    } else {
      addNotification('Restore failed: ' + result.error, 'error')
    }
    setRestoring(null)
  }

  const typeColors = { manual: 'var(--amber)', daily: 'var(--blue)', panic: 'var(--red)' }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Snapshots</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Save Snapshot</button>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        {creating && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, background: 'var(--amber-subtle)' }}>
            <input
              className="input selectable"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder='e.g. "Before Act 2 rewrite"'
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') create() }}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary btn-sm" onClick={create}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading…</div>
          ) : snapshots.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontStyle: 'italic' }}>
              No snapshots yet. Save one before making big changes.
            </div>
          ) : (
            snapshots.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="tag" style={{ background: 'transparent', border: `1px solid ${typeColors[s.snapshot_type]}`, color: typeColors[s.snapshot_type], fontSize: 10 }}>
                      {s.snapshot_type}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => restore(s.id)}
                  disabled={restoring === s.id}
                >
                  {restoring === s.id ? '…' : 'Restore'}
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Daily snapshots are kept for 30 days, then thinned to weekly. Manual snapshots are kept forever.
        </div>
      </div>
    </div>
  )
}

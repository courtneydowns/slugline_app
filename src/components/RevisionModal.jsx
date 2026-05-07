import React, { useEffect, useState } from 'react'
import useStore from '../store'

const DRAFT_COLORS = [
  { id: 'white',       label: 'White',       bg: '#e8e8e8', text: '#1a1a1a' },
  { id: 'blue',        label: 'Blue',        bg: '#c5d8f5', text: '#1a2a4a' },
  { id: 'pink',        label: 'Pink',        bg: '#f5c5d8', text: '#4a1a2a' },
  { id: 'yellow',      label: 'Yellow',      bg: '#f5f0c5', text: '#4a3a1a' },
  { id: 'green',       label: 'Green',       bg: '#c5f5d0', text: '#1a4a2a' },
  { id: 'goldenrod',   label: 'Goldenrod',   bg: '#f5dfa0', text: '#4a3010' },
  { id: 'buff',        label: 'Buff',        bg: '#f5edd5', text: '#4a3a1a' },
  { id: 'salmon',      label: 'Salmon',      bg: '#f5c5b0', text: '#4a2a1a' },
  { id: 'cherry',      label: 'Cherry',      bg: '#f5a0a0', text: '#4a1010' },
  { id: 'tan',         label: 'Tan',         bg: '#d5c5a5', text: '#3a2a10' },
  { id: 'double-blue', label: 'Double Blue', bg: '#8bafdf', text: '#0a1a3a' },
  { id: 'double-pink', label: 'Double Pink', bg: '#df8baf', text: '#3a0a1a' },
]

export const REVISION_COLOR_HEX = {
  white: '#c0c0c0', blue: '#7bb3f5', pink: '#f57bb3', yellow: '#e8d060',
  green: '#60d880', goldenrod: '#d4a030', buff: '#c8a870', salmon: '#e88060',
  cherry: '#e06060', tan: '#b09060', 'double-blue': '#4a8fd4', 'double-pink': '#c44a8f',
}

function buildSceneNumberMap(content) {
  const map = {}
  let n = 1
  const lines = (content || '').split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (/^(INT\.|EXT\.|INT\/EXT\.)/i.test(t)) {
      const key = t.toUpperCase()
      if (!(key in map)) map[key] = n++
    }
  }
  return map
}

export default function RevisionModal({ onClose }) {
  const {
    currentProject, currentDocument,
    revisions, activeRevision,
    setActiveRevision, loadRevisions, addNotification,
  } = useStore()

  const [selectedColor, setSelectedColor] = useState('blue')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (currentDocument?.id) loadRevisions(currentDocument.id)
  }, [currentDocument?.id])

  const unlockedDraft = revisions.find(r => !r.locked_at)

  async function handleStartDraft() {
    if (!currentDocument) return
    setLoading(true)
    const revision = await window.api.createRevision(currentDocument.id, selectedColor)
    if (revision) {
      await loadRevisions(currentDocument.id)
      setActiveRevision(revision)
      const label = DRAFT_COLORS.find(c => c.id === selectedColor)?.label || selectedColor
      addNotification(`Started ${label} draft`, 'success')
    }
    setLoading(false)
  }

  async function handleLockDraft() {
    if (!activeRevision || activeRevision.locked_at || !currentDocument) return
    const colorLabel = DRAFT_COLORS.find(c => c.id === activeRevision.draft_color)?.label || activeRevision.draft_color
    if (!window.confirm(`Lock this ${colorLabel} draft? Scene numbers will be frozen and a snapshot will be created. This cannot be undone.`)) return
    setLoading(true)
    const sceneNumberMap = buildSceneNumberMap(currentDocument.content)
    const result = await window.api.lockRevision(
      activeRevision.id, sceneNumberMap, currentDocument.content, currentProject.id
    )
    if (result?.success) {
      await loadRevisions(currentDocument.id)
      setActiveRevision(result.revision)
      addNotification(`${colorLabel} draft locked — scene numbers frozen`, 'success')
    } else {
      addNotification('Failed to lock draft', 'error')
    }
    setLoading(false)
  }

  function handleSelectRevision(rev) {
    setActiveRevision(activeRevision?.id === rev.id ? null : rev)
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ width: 520, maxHeight: '88vh', overflow: 'auto' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Revision Drafts</div>
          <button className="btn btn-ghost" onClick={onClose} style={{ minWidth: 36, height: 32, padding: '0 10px', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 24 }}>
          {activeRevision && (
            <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 8, background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Active Draft</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <DraftChip color={activeRevision.draft_color} number={activeRevision.draft_number} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
                  {activeRevision.locked_at
                    ? `Locked ${new Date(activeRevision.locked_at).toLocaleDateString()} · scene numbers active`
                    : 'In progress · not yet locked'}
                </span>
                {!activeRevision.locked_at && (
                  <button className="btn btn-primary btn-sm" onClick={handleLockDraft} disabled={loading}>
                    Lock Draft
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveRevision(null)}>
                  Deactivate
                </button>
              </div>
            </div>
          )}

          {!unlockedDraft && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Start New Draft</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {DRAFT_COLORS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedColor(c.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 999, fontSize: 12,
                      fontFamily: 'var(--font-ui)', background: c.bg, color: c.text,
                      border: `2px solid ${selectedColor === c.id ? 'rgba(0,0,0,0.4)' : 'transparent'}`,
                      cursor: 'pointer', fontWeight: selectedColor === c.id ? 700 : 400,
                      transition: 'border 0.1s',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-primary"
                onClick={handleStartDraft}
                disabled={loading || !currentDocument}
              >
                Start {DRAFT_COLORS.find(c => c.id === selectedColor)?.label || 'New'} Draft
              </button>
            </div>
          )}

          {unlockedDraft && !activeRevision && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--amber-subtle)', border: '1px solid var(--amber)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You have an in-progress <strong style={{ textTransform: 'capitalize' }}>{unlockedDraft.draft_color}</strong> draft. Select it below to activate it, then lock it when ready.
            </div>
          )}

          {revisions.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                Draft History
              </div>
              {revisions.map(rev => {
                const isActive = activeRevision?.id === rev.id
                return (
                  <div
                    key={rev.id}
                    onClick={() => handleSelectRevision(rev)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                      background: isActive ? 'var(--amber-subtle)' : 'var(--bg-raised)',
                      border: `1px solid ${isActive ? 'var(--amber)' : 'var(--border)'}`,
                      transition: 'all 0.1s',
                    }}
                  >
                    <DraftChip color={rev.draft_color} number={rev.draft_number} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                        {rev.draft_color} Draft #{rev.draft_number}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {rev.locked_at ? `Locked ${new Date(rev.locked_at).toLocaleDateString()}` : 'In progress · not locked'}
                      </div>
                    </div>
                    {isActive && (
                      <span style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Active</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {revisions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
              No revision drafts yet.<br />Start a new draft above to begin tracking colored revisions.
            </div>
          )}
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>WGA: White → Blue → Pink → Yellow → Green → Goldenrod…</span>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export function DraftChip({ color, number }) {
  const c = DRAFT_COLORS.find(d => d.id === color) || { bg: '#888', text: '#fff' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 30, height: 20, borderRadius: 999,
      background: c.bg, color: c.text,
      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-ui)',
      padding: '0 7px', flexShrink: 0, letterSpacing: '0.02em',
    }}>
      #{number}
    </span>
  )
}

import React, { useEffect, useState, useCallback, useRef } from 'react'
import useStore from '../store'

function isSceneHeading(line) {
  const t = line.trim()
  if (!t) return false
  if (/^[.][^.]/.test(t)) return true
  return /^(INT|EXT|INT[./]EXT|EXT[./]INT|I\/E)([\s.]|$)/i.test(t)
}

function parseScenes(content) {
  const lines = (content || '').split('\n')
  const scenes = []
  let current = null
  let lineIdx = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (isSceneHeading(line)) {
      if (current) scenes.push(current)
      current = { heading: line.replace(/^[.]/, ''), actionText: '', lineStart: lineIdx, lineCount: 1 }
    } else if (current) {
      current.lineCount++
      if (!current.actionText && line.length > 0 && !/^[A-Z0-9 ]+$/.test(line)) {
        current.actionText = line
      }
    }
    lineIdx++
  }
  if (current) scenes.push(current)
  return scenes
}

function estimatePage(scene, totalLines, pageCount) {
  if (!pageCount || !totalLines) return null
  return Math.max(1, Math.round((scene.lineStart / totalLines) * pageCount))
}

export default function SceneCards({ onClose }) {
  const { currentProject, addNotification } = useStore()
  const [documents, setDocuments] = useState([])
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [cards, setCards] = useState([])   // { id, heading, actionText, page, sceneNumber }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const dragIdx = useRef(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  // Load screenplay documents for project
  useEffect(() => {
    if (!currentProject) return
    window.api.getAllDocuments(currentProject.id).then(docs => {
      const screenplays = docs.filter(d => d.document_type === 'screenplay')
      setDocuments(screenplays)
      if (screenplays.length > 0) setSelectedDocId(screenplays[0].id)
      else setLoading(false)
    })
  }, [currentProject])

  // Load and derive cards whenever selected doc changes
  useEffect(() => {
    if (!selectedDocId || !currentProject) return
    setLoading(true)
    setDirty(false)

    Promise.all([
      window.api.getDocument(selectedDocId),
      window.api.getScenesForDocument(selectedDocId),
    ]).then(([doc, savedScenes]) => {
      const parsed = parseScenes(doc.content || '')
      const totalLines = (doc.content || '').split('\n').length
      const pageCount = doc.page_count || 0

      if (savedScenes.length > 0) {
        // Merge: savedScenes gives order, parsed gives fresh heading/actionText
        const headingMap = {}
        parsed.forEach(s => { headingMap[s.heading] = s })
        const merged = savedScenes.map((s, i) => {
          const fresh = headingMap[s.heading] || {}
          return {
            id: `scene-${i}`,
            heading: s.heading,
            actionText: fresh.actionText || '',
            page: estimatePage(fresh, totalLines, pageCount),
            sceneNumber: i + 1,
          }
        })
        // Append any newly added scenes not in DB yet
        const savedHeadings = new Set(savedScenes.map(s => s.heading))
        parsed.forEach((s, i) => {
          if (!savedHeadings.has(s.heading)) {
            merged.push({
              id: `scene-new-${i}`,
              heading: s.heading,
              actionText: s.actionText,
              page: estimatePage(s, totalLines, pageCount),
              sceneNumber: merged.length + 1,
            })
          }
        })
        setCards(merged)
      } else {
        // No DB record yet — use block order directly
        const derived = parsed.map((s, i) => ({
          id: `scene-${i}`,
          heading: s.heading,
          actionText: s.actionText,
          page: estimatePage(s, totalLines, pageCount),
          sceneNumber: i + 1,
        }))
        setCards(derived)
      }
      setLoading(false)
    })
  }, [selectedDocId, currentProject])

  // Drag handlers
  function handleDragStart(e, idx) {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (idx !== dragOverIdx) setDragOverIdx(idx)
  }

  function handleDrop(e, idx) {
    e.preventDefault()
    const from = dragIdx.current
    if (from === null || from === idx) { setDragOverIdx(null); return }
    const next = [...cards]
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    const renumbered = next.map((c, i) => ({ ...c, sceneNumber: i + 1 }))
    setCards(renumbered)
    setDirty(true)
    dragIdx.current = null
    setDragOverIdx(null)
  }

  function handleDragEnd() {
    dragIdx.current = null
    setDragOverIdx(null)
  }

  async function handleSave() {
    if (!selectedDocId || !currentProject) return
    setSaving(true)
    const scenes = cards.map(c => ({ heading: c.heading, content: c.actionText }))
    await window.api.syncScenes(selectedDocId, currentProject.id, scenes)
    setSaving(false)
    setDirty(false)
    addNotification('Scene order saved', 'success')
  }

  const selectedDoc = documents.find(d => d.id === selectedDocId)

  const containerStyle = {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--bg-base)', color: 'var(--text)',
  }

  const headerStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px', borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  }

  const titleStyle = {
    fontFamily: 'var(--font-display)', fontSize: 16,
    color: 'var(--text)', letterSpacing: '-0.01em',
  }

  const btnBase = {
    border: '1px solid var(--border)', borderRadius: 4, fontSize: 12,
    padding: '4px 14px', cursor: 'pointer', background: 'none',
    color: 'var(--text-muted)',
  }

  const gridStyle = {
    flex: 1, overflowY: 'auto', padding: 24,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 16, alignContent: 'start',
  }

  function cardStyle(idx) {
    const isOver = dragOverIdx === idx
    return {
      background: 'var(--bg-elevated)',
      border: isOver ? '2px solid var(--amber)' : '1px solid var(--border)',
      borderRadius: 6, padding: '12px 14px',
      cursor: 'grab', userSelect: 'none',
      transition: 'border-color 0.1s, transform 0.1s',
      transform: isOver ? 'scale(1.02)' : 'none',
      display: 'flex', flexDirection: 'column', gap: 6,
      minHeight: 110,
    }
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={titleStyle}>Scene Cards</span>
          {documents.length > 1 && (
            <select
              value={selectedDocId || ''}
              onChange={e => setSelectedDocId(Number(e.target.value))}
              style={{ ...btnBase, padding: '3px 8px' }}
            >
              {documents.map(d => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          )}
          {selectedDoc && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {cards.length} scene{cards.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dirty && (
            <button
              style={{ ...btnBase, borderColor: 'var(--amber)', color: 'var(--amber)' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Order'}
            </button>
          )}
          <button style={btnBase} onClick={onClose}>← Back</button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Loading…
        </div>
      ) : documents.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <span style={{ fontSize: 32 }}>▦</span>
          <span style={{ fontSize: 14 }}>No screenplay documents in this project.</span>
        </div>
      ) : cards.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <span style={{ fontSize: 32 }}>▦</span>
          <span style={{ fontSize: 14 }}>No scenes found. Add scene headings in the editor.</span>
        </div>
      ) : (
        <div style={gridStyle}>
          {cards.map((card, idx) => (
            <div
              key={card.id}
              style={cardStyle(idx)}
              draggable
              onDragStart={e => handleDragStart(e, idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={e => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
            >
              {/* Scene number badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                  color: 'var(--amber)', background: 'var(--amber-subtle, rgba(255,176,0,0.12))',
                  borderRadius: 3, padding: '1px 6px',
                }}>
                  #{card.sceneNumber}
                </span>
                {card.page && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>p. {card.page}</span>
                )}
              </div>
              {/* Heading */}
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                color: 'var(--text)', lineHeight: 1.4,
                fontFamily: 'var(--font-mono, monospace)',
                wordBreak: 'break-word',
              }}>
                {card.heading || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Untitled</span>}
              </div>
              {/* Action preview */}
              {card.actionText && (
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                }}>
                  {card.actionText}
                </div>
              )}
              {/* Drag handle hint */}
              <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 10, color: 'var(--border)', letterSpacing: 2 }}>⠿</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <div style={{
          flexShrink: 0, padding: '8px 20px', borderTop: '1px solid var(--border)',
          background: 'var(--bg-elevated)', fontSize: 12, color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: 'var(--amber)' }}>●</span>
          Reorder is display-only — it does not reorder blocks in the screenplay editor.
          <button
            style={{ ...btnBase, marginLeft: 'auto', borderColor: 'var(--amber)', color: 'var(--amber)' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Order'}
          </button>
        </div>
      )}
    </div>
  )
}

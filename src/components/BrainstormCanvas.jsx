import React, { useState, useRef } from 'react'
import useStore from '../store'

const CATEGORIES = ['idea', 'notes', 'character', 'scene', 'dialogue', 'theme', 'question', 'research']
const CAT_COLORS = {
  idea: 'var(--amber)', notes: 'var(--text-primary)', character: 'var(--blue)', scene: 'var(--green)',
  dialogue: '#B07AC8', theme: '#C8963E', question: 'var(--red)', research: 'var(--text-secondary)'
}

export default function BrainstormCanvas({ onClose, embedded, ...props }) {
  const { currentProject, brainstorm, setBrainstorm, addNotification } = useStore()
  const [entries, setEntries] = useState(brainstorm || [])
  const [newText, setNewText] = useState('')
  const [newCat, setNewCat] = useState('idea')
  const [claudeInput, setClaudeInput] = useState('')
  const [loadingClaude, setLoadingClaude] = useState(false)
  const [filter, setFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const textRef = useRef()

  async function addEntry(text, category) {
    const t = text.trim()
    if (!t) return

    try {
      const entry = await window.api.addBrainstormEntry({
        project_id: currentProject.id,
        content: t,
        category: category || newCat,
        status: 'active'
      })

      if (!entry?.id) {
        throw new Error('Brainstorm entry was not returned from the database.')
      }

      const updated = [...entries, entry]
      setEntries(updated)
      setBrainstorm(updated)
      setNewText('')
      addNotification('Brainstorm entry added', 'success')
    } catch (err) {
      console.error('Failed to add brainstorm entry:', err)
      addNotification(`Could not add brainstorm entry: ${err.message || err}`, 'error')
    }
  }

  async function deleteEntry(id) {
    await window.api.deleteBrainstormEntry(id)
    const updated = entries.filter(e => e.id !== id)
    setEntries(updated)
    setBrainstorm(updated)
  }

  async function resolveEntry(id) {
    const resolvedAt = new Date().toISOString()
    await window.api.updateBrainstormEntry(id, { status: 'resolved', resolved_at: resolvedAt })
    const updated = entries.map(e => e.id === id ? { ...e, status: 'resolved', resolved_at: resolvedAt } : e)
    setEntries(updated)
    setBrainstorm(updated)
    addNotification('Brainstorm entry resolved', 'success')
  }

  async function restoreEntry(id) {
    await window.api.updateBrainstormEntry(id, { status: 'active', resolved_at: null })
    const updated = entries.map(e => e.id === id ? { ...e, status: 'active', resolved_at: null } : e)
    setEntries(updated)
    setBrainstorm(updated)
    addNotification('Brainstorm entry restored', 'success')
  }

  function toggleExpanded(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleClaudeExpand() {
    if (!claudeInput.trim()) return
    setLoadingClaude(true)
    // Use chat to generate brainstorm ideas
    const result = await window.api.claudeChat({
      projectId: currentProject.id,
      message: `I'm brainstorming for my screenplay. Help me expand on this idea with 5 specific, concrete suggestions I can add as brainstorm cards:\n\n"${claudeInput}"\n\nGive me 5 ideas, one per line, each starting with a category in brackets like [character], [scene], [idea], [notes], [theme], [dialogue].`,
      chatHistory: [],
      documentContext: ''
    })
    // Parse response from chat history
    const history = await window.api.getChatHistory(currentProject.id, 'chat')
    const lastAssistant = [...history].reverse().find(m => m.role === 'assistant')
    if (lastAssistant) {
      const lines = lastAssistant.content.split('\n').filter(l => l.trim() && l.match(/^\[/))
      for (const line of lines) {
        const catMatch = line.match(/^\[(\w+)\]/)
        const cat = catMatch ? catMatch[1].toLowerCase() : 'idea'
        const text = line.replace(/^\[\w+\]\s*/, '').trim()
        if (text) await addEntry(text, CATEGORIES.includes(cat) ? cat : 'idea')
      }
    }
    setClaudeInput('')
    setLoadingClaude(false)
    addNotification('Ideas added to canvas', 'success')
  }

  const visible = entries.filter(e => {
    const status = e.status || 'active'
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && status !== 'resolved') ||
      (statusFilter === 'archive' && status === 'resolved')
    const matchesCategory = filter === 'all' || e.category === filter
    return matchesStatus && matchesCategory
  })

  return (
    <div style={embedded
      ? { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }
      : { position: 'fixed', inset: 0, background: 'var(--bg-base)', zIndex: 50, display: 'flex', flexDirection: 'column' }
    }>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 16, paddingTop: embedded ? 20 : 48 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--amber)' }}>Brainstorm Canvas</div>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          <button onClick={() => setStatusFilter('active')} className="btn btn-ghost btn-sm" style={{ opacity: statusFilter === 'active' ? 1 : 0.5 }}>Active</button>
          <button onClick={() => setStatusFilter('archive')} className="btn btn-ghost btn-sm" style={{ opacity: statusFilter === 'archive' ? 1 : 0.5 }}>Archive</button>
          <button onClick={() => setStatusFilter('all')} className="btn btn-ghost btn-sm" style={{ opacity: statusFilter === 'all' ? 1 : 0.5 }}>All Status</button>
          <span style={{ width: 1, background: 'var(--border-subtle)', margin: '0 4px' }} />
          <button onClick={() => setFilter('all')} className="btn btn-ghost btn-sm" style={{ opacity: filter === 'all' ? 1 : 0.5 }}>All Types</button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilter(c)} className="btn btn-ghost btn-sm" style={{ opacity: filter === c ? 1 : 0.5, borderColor: CAT_COLORS[c], color: CAT_COLORS[c] }}>
              {c}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
      </div>

      {/* Add entry */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 10 }}>
        <select value={newCat} onChange={e => setNewCat(e.target.value)} className="input" style={{ width: 120, flex: 'none' }}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          ref={textRef}
          className="input selectable"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="New idea, note, scene, dialogue, question…"
          onKeyDown={e => { if (e.key === 'Enter') { addEntry(newText, newCat); textRef.current?.focus() } }}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={() => addEntry(newText, newCat)} disabled={!newText.trim()}>Add</button>
      </div>

      {/* Claude expand */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 10, background: 'var(--amber-subtle)' }}>
        <input
          className="input selectable"
          value={claudeInput}
          onChange={e => setClaudeInput(e.target.value)}
          placeholder="Ask Claude to expand an idea (e.g. 'What if the protagonist is also hiding something?')"
          onKeyDown={e => { if (e.key === 'Enter') handleClaudeExpand() }}
          style={{ flex: 1, background: 'transparent', borderColor: 'var(--amber-dim)' }}
        />
        <button className="btn btn-primary btn-sm" onClick={handleClaudeExpand} disabled={loadingClaude || !claudeInput.trim()}>
          {loadingClaude ? '…' : '✨ Expand'}
        </button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💡</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8 }}>Canvas is empty</div>
            <div style={{ fontSize: 13 }}>Add ideas above or ask Claude to generate some</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
            alignItems: 'start'
          }}>
            {visible.map(e => {
              const isResolved = (e.status || 'active') === 'resolved'
              const isExpanded = expandedIds.has(e.id)
              const lineCount = String(e.content || '').split('\n').length
              const longByLength = String(e.content || '').length > 320
              const isLong = lineCount > 5 || longByLength

              return (
                <div key={e.id} style={{
                  background: 'var(--bg-panel)',
                  border: `1px solid var(--border)`,
                  borderTop: `3px solid ${CAT_COLORS[e.category] || 'var(--border)'}`,
                  borderRadius: 8,
                  padding: 14,
                  position: 'relative',
                  opacity: isResolved ? 0.72 : 1
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: CAT_COLORS[e.category], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {isResolved ? '✓ ' : ''}{e.category}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isResolved ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => restoreEntry(e.id)} style={{ padding: '2px 6px', fontSize: 11 }}>
                          Restore
                        </button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => resolveEntry(e.id)} style={{ padding: '2px 6px', fontSize: 11 }}>
                          Resolve
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteEntry(e.id)} style={{ padding: '2px 6px', fontSize: 11 }}>
                        Delete
                      </button>
                    </div>
                  </div>

                  <div style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    display: !isExpanded && isLong ? '-webkit-box' : 'block',
                    WebkitLineClamp: !isExpanded && isLong ? 5 : 'unset',
                    WebkitBoxOrient: 'vertical',
                    overflow: !isExpanded && isLong ? 'hidden' : 'visible'
                  }}>
                    {e.content}
                  </div>

                  {isLong && (
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleExpanded(e.id)} style={{ marginTop: 8, padding: '2px 6px', fontSize: 11 }}>
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}

                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                    {new Date(e.created_at).toLocaleDateString()}
                    {isResolved && e.resolved_at ? ` • Resolved ${new Date(e.resolved_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)' }}>
        {entries.filter(e => (e.status || 'active') !== 'resolved').length} active • {entries.filter(e => (e.status || 'active') === 'resolved').length} archived • Press Enter to add quickly
      </div>
    </div>
  )
}

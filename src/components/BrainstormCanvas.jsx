import React, { useState, useRef } from 'react'
import useStore from '../store'

const CATEGORIES = ['idea', 'character', 'scene', 'dialogue', 'theme', 'question', 'research']
const CAT_COLORS = {
  idea: 'var(--amber)', character: 'var(--blue)', scene: 'var(--green)',
  dialogue: '#B07AC8', theme: '#C8963E', question: 'var(--red)', research: 'var(--text-secondary)'
}

export default function BrainstormCanvas({ onClose }) {
  const { currentProject, brainstorm, setBrainstorm, addNotification } = useStore()
  const [entries, setEntries] = useState(brainstorm || [])
  const [newText, setNewText] = useState('')
  const [newCat, setNewCat] = useState('idea')
  const [claudeInput, setClaudeInput] = useState('')
  const [loadingClaude, setLoadingClaude] = useState(false)
  const [filter, setFilter] = useState('all')
  const textRef = useRef()

  async function addEntry(text, category) {
    const t = text.trim()
    if (!t) return
    const entry = await window.api.addBrainstormEntry({
      project_id: currentProject.id,
      content: t,
      category: category || newCat
    })
    const updated = [...entries, entry]
    setEntries(updated)
    setBrainstorm(updated)
    setNewText('')
  }

  async function deleteEntry(id) {
    await window.api.deleteBrainstormEntry(id)
    const updated = entries.filter(e => e.id !== id)
    setEntries(updated)
    setBrainstorm(updated)
  }

  async function handleClaudeExpand() {
    if (!claudeInput.trim()) return
    setLoadingClaude(true)
    // Use chat to generate brainstorm ideas
    const result = await window.api.claudeChat({
      projectId: currentProject.id,
      message: `I'm brainstorming for my screenplay. Help me expand on this idea with 5 specific, concrete suggestions I can add as brainstorm cards:\n\n"${claudeInput}"\n\nGive me 5 ideas, one per line, each starting with a category in brackets like [character], [scene], [idea], [theme], [dialogue].`,
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

  const visible = filter === 'all' ? entries : entries.filter(e => e.category === filter)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-base)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 16, paddingTop: 48 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--amber)' }}>Brainstorm Canvas</div>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} className="btn btn-ghost btn-sm" style={{ opacity: filter === 'all' ? 1 : 0.5 }}>All</button>
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
          placeholder="New idea, scene, dialogue, question…"
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
            {visible.map(e => (
              <div key={e.id} style={{
                background: 'var(--bg-panel)',
                border: `1px solid var(--border)`,
                borderTop: `3px solid ${CAT_COLORS[e.category] || 'var(--border)'}`,
                borderRadius: 8,
                padding: 14,
                position: 'relative'
              }}>
                <div style={{ fontSize: 10, color: CAT_COLORS[e.category], textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  {e.category}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {e.content}
                </div>
                <button
                  onClick={() => deleteEntry(e.id)}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 14, opacity: 0, transition: 'opacity 0.15s', padding: '2px 4px'
                  }}
                  onMouseEnter={e2 => e2.currentTarget.style.opacity = '1'}
                  onMouseLeave={e2 => e2.currentTarget.style.opacity = '0'}
                >
                  ×
                </button>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                  {new Date(e.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)' }}>
        {entries.length} ideas • Press Enter to add quickly
      </div>
    </div>
  )
}

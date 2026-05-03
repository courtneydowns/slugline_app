import React, { useState, useEffect } from 'react'
import useStore from '../store'

export default function StoryBible() {
  const [activeTab, setActiveTab] = useState('characters')
  const { currentProject, characters, worldBuilding, research, setCharacters, setWorldBuilding, setResearch } = useStore()

  useEffect(() => {
    if (!currentProject?.id) return
    window.api.getCharacters(currentProject.id).then(setCharacters).catch(console.error)
    window.api.getWorldBuilding(currentProject.id).then(setWorldBuilding).catch(console.error)
    window.api.getResearch(currentProject.id).then(setResearch).catch(console.error)
  }, [currentProject?.id])

  const tabs = [
    { id: 'characters', label: 'Characters' },
    { id: 'world', label: 'World' },
    { id: 'research', label: 'Research' }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)' }}>
      <div style={{ padding: '16px 16px 0', paddingTop: 48, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--amber)', marginBottom: 12 }}>Story Bible</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: '6px 12px', borderRadius: '6px 6px 0 0', fontSize: 12, border: 'none', cursor: 'pointer',
              background: activeTab === t.id ? 'var(--bg-raised)' : 'transparent',
              color: activeTab === t.id ? 'var(--amber)' : 'var(--text-muted)',
              borderBottom: activeTab === t.id ? '2px solid var(--amber)' : '2px solid transparent'
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activeTab === 'characters' && <CharactersTab />}
        {activeTab === 'world' && <WorldTab />}
        {activeTab === 'research' && <ResearchTab />}
      </div>
    </div>
  )
}

function CharactersTab() {
  const { currentProject, characters, setCharacters } = useStore()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  async function save() {
    const saved = await window.api.upsertCharacter({ project_id: currentProject.id, ...form })
    const updated = await window.api.getCharacters(currentProject.id)
    setCharacters(updated)
    setEditing(null)
    setForm({})
  }

  async function del(id) {
    if (!confirm('Delete this character?')) return
    await window.api.deleteCharacter(id)
    setCharacters(characters.filter(c => c.id !== id))
  }

  function startEdit(char) {
    setForm(char)
    setEditing(char.id || 'new')
  }

  const Field = ({ label, field, multiline }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</label>
      {multiline ? (
        <textarea className="input selectable" value={form[field] || ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} rows={3} style={{ width: '100%' }} />
      ) : (
        <input className="input selectable" value={form[field] || ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} style={{ width: '100%' }} />
      )}
    </div>
  )

  if (editing) return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', marginBottom: 16, color: 'var(--text-primary)' }}>
        {editing === 'new' ? 'New Character' : form.name}
      </div>
      <Field label="Name" field="name" />
      <Field label="Role" field="role" />
      <Field label="Arc" field="arc" multiline />
      <Field label="Traits" field="traits" multiline />
      <Field label="Relationships" field="relationships" multiline />
      <Field label="Notes" field="notes" multiline />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(null); setForm({}) }}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => startEdit({})} style={{ marginBottom: 12, width: '100%', justifyContent: 'center' }}>
        + Add Character
      </button>
      {characters.map(c => (
        <div key={c.id} style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{c.name}</div>
              {c.role && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>{c.role}</div>}
              {c.arc && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{c.arc.slice(0, 120)}{c.arc.length > 120 ? '…' : ''}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => del(c.id)} style={{ color: 'var(--red)' }}>×</button>
            </div>
          </div>
        </div>
      ))}
      {characters.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '24px 0', fontStyle: 'italic' }}>
          No characters yet.
        </div>
      )}
    </div>
  )
}

function WorldTab() {
  const { currentProject, worldBuilding, setWorldBuilding } = useStore()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  async function save() {
    await window.api.upsertWorldBuilding({ project_id: currentProject.id, ...form })
    const updated = await window.api.getWorldBuilding(currentProject.id)
    setWorldBuilding(updated)
    setEditing(null)
  }

  async function del(id) {
    await window.api.deleteWorldBuilding(id)
    setWorldBuilding(worldBuilding.filter(w => w.id !== id))
  }

  if (editing) return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Category</label>
        <input className="input selectable" value={form.category || ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Setting, Rules, History" style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Title</label>
        <input className="input selectable" value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Notes</label>
        <textarea className="input selectable" value={form.content || ''} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={8} style={{ width: '100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ category: 'General' }); setEditing('new') }} style={{ marginBottom: 12, width: '100%', justifyContent: 'center' }}>
        + Add Note
      </button>
      {worldBuilding.map(w => (
        <div key={w.id} style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{w.category}</span>
              <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{w.title}</div>
              {w.content && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{w.content.slice(0, 120)}{w.content.length > 120 ? '…' : ''}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setForm(w); setEditing(w.id) }}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => del(w.id)} style={{ color: 'var(--red)' }}>×</button>
            </div>
          </div>
        </div>
      ))}
      {worldBuilding.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '24px 0', fontStyle: 'italic' }}>
          No world notes yet.
        </div>
      )}
    </div>
  )
}

function ResearchTab() {
  const { currentProject, research, setResearch, addNotification } = useStore()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', sourceType: 'note', sourceUrl: '' })
  const [ingesting, setIngesting] = useState(false)

  async function ingest() {
    if (!form.title || !form.content) return
    setIngesting(true)
    const result = await window.api.claudeResearchIngest({
      projectId: currentProject.id,
      title: form.title,
      content: form.content,
      sourceType: form.sourceType,
      sourceUrl: form.sourceUrl
    })
    const updated = await window.api.getResearch(currentProject.id)
    setResearch(updated)
    addNotification('Research ingested and summarized', 'success')
    setAdding(false)
    setIngesting(false)
    setForm({ title: '', content: '', sourceType: 'note', sourceUrl: '' })
  }

  async function del(id) {
    await window.api.deleteResearch(id)
    setResearch(research.filter(r => r.id !== id))
  }

  if (adding) return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Title</label>
        <input className="input selectable" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Research topic" style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Source URL (optional)</label>
        <input className="input selectable" value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://..." style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Content</label>
        <textarea className="input selectable" value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={8} placeholder="Paste research content here." style={{ width: '100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={ingest} disabled={ingesting}>
          {ingesting ? 'Summarizing…' : 'Add & Summarize'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)} style={{ marginBottom: 12, width: '100%', justifyContent: 'center' }}>
        + Add Research
      </button>
      {research.map(r => (
        <div key={r.id} style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
              {r.source_url && <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>{r.source_url.slice(0, 50)}</div>}
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>{r.summary}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => del(r.id)} style={{ color: 'var(--red)', flexShrink: 0 }}>×</button>
          </div>
        </div>
      ))}
      {research.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '24px 0', fontStyle: 'italic' }}>
          No research yet.
        </div>
      )}
    </div>
  )
}

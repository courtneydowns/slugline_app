import React, { useEffect, useState } from 'react'
import useStore from '../store'

export default function ProjectList() {
  const { projects, loadProjects, openProject, setCurrentProject, addNotification } = useStore()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    loadProjects().then(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    const project = await window.api.createProject({ title: newTitle.trim() })
    await openProject(project.id)
  }

  async function handleOpen(id) {
    await openProject(id)
  }

  async function handleDelete(e, id, title) {
    e.stopPropagation()
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    await window.api.deleteProject(id)
    loadProjects()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-base)' }}>
      <div style={{ color: 'var(--text-muted)' }}>Loading projects…</div>
    </div>
  )

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-base)' }}>
      <div style={{ width: 600, maxHeight: '80vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--amber)', letterSpacing: '-0.02em' }}>
              Slugline
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Your projects</div>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New Project
          </button>
        </div>

        {/* New project form */}
        {creating && (
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--amber-dim)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Name your project</div>
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10 }}>
              <input
                className="input"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. The Long Way Home, Pilot: Eden Falls…"
                autoFocus
              />
              <button className="btn btn-primary" type="submit">Create</button>
              <button className="btn btn-ghost" type="button" onClick={() => { setCreating(false); setNewTitle('') }}>Cancel</button>
            </form>
          </div>
        )}

        {/* Project list */}
        {projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
            <div style={{ fontSize: 15, marginBottom: 6, color: 'var(--text-secondary)' }}>No projects yet</div>
            <div style={{ fontSize: 13 }}>Create your first project to get started</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => handleOpen(p.id)}
                style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '16px 20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--amber-dim)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {p.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="tag tag-muted">{p.format === 'pilot' ? 'TV Pilot' : p.format === 'episode' ? 'Episode' : 'Feature'}</span>
                    {p.genre && <span className="tag tag-amber">{p.genre}</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  {p.logline && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic', maxWidth: 400 }}>
                      {p.logline.slice(0, 120)}{p.logline.length > 120 ? '…' : ''}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={e => handleDelete(e, p.id, p.title)}
                  style={{ opacity: 0.5 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

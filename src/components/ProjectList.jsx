import React, { useEffect, useState } from 'react'
import useStore from '../store'

export default function ProjectList() {
  const { projects, currentProject, loadProjects, openProject, setCurrentProject, addNotification, setActiveWorkspace } = useStore()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({
    title: '',
    format: 'feature',
    genre: '',
    tone: '',
    logline: '',
    premise: '',
    target_audience: '',
    comparable_titles: ''
  })
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    loadProjects().then(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    const project = await window.api.createProject({ title: newTitle.trim() })
    await openProject(project.id)
    setActiveWorkspace('dashboard')
  }

  async function handleOpen(id) {
    await openProject(id)
    setActiveWorkspace('dashboard')
  }

  function requestEdit(e, project) {
    e.stopPropagation()
    setEditTarget(project)
    setEditForm({
      title: project.title || '',
      format: project.format || 'feature',
      genre: project.genre || '',
      tone: project.tone || '',
      logline: project.logline || '',
      premise: project.premise || '',
      target_audience: project.target_audience || '',
      comparable_titles: project.comparable_titles || ''
    })
  }

  function cancelEdit() {
    if (savingEdit) return
    setEditTarget(null)
  }

  function updateEditField(field, value) {
    setEditForm(form => ({ ...form, [field]: value }))
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!editTarget || savingEdit) return

    const title = editForm.title.trim()
    if (!title) {
      addNotification('Project title is required.', 'error')
      return
    }

    setSavingEdit(true)
    try {
      const updated = await window.api.updateProject(editTarget.id, {
        title,
        format: editForm.format || 'feature',
        genre: editForm.genre.trim() || null,
        tone: editForm.tone.trim() || null,
        logline: editForm.logline.trim() || null,
        premise: editForm.premise.trim() || null,
        target_audience: editForm.target_audience.trim() || null,
        comparable_titles: editForm.comparable_titles.trim() || null
      })

      if (currentProject?.id === updated.id) {
        setCurrentProject(updated)
      }

      await loadProjects()
      addNotification(`Updated "${updated.title}"`, 'success')
      setEditTarget(null)
    } catch (err) {
      console.error('Failed to update project:', err)
      addNotification(`Could not update project: ${err.message || err}`, 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  function requestDelete(e, project) {
    e.stopPropagation()
    setDeleteTarget(project)
  }

  function cancelDelete() {
    if (deleting) return
    setDeleteTarget(null)
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return

    setDeleting(true)
    try {
      await window.api.deleteProject(deleteTarget.id)
      addNotification(`Deleted "${deleteTarget.title}"`, 'success')
      setDeleteTarget(null)
      await loadProjects()
    } catch (err) {
      console.error('Failed to delete project:', err)
      addNotification(`Could not delete project: ${err.message || err}`, 'error')
    } finally {
      setDeleting(false)
    }
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={e => requestEdit(e, p)}
                    style={{ opacity: 0.65 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.65'}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={e => requestDelete(e, p)}
                    style={{ opacity: 0.5 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-project-title"
          onClick={cancelEdit}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.58)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
        >
          <form
            onSubmit={saveEdit}
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(620px, 100%)',
              maxHeight: '86vh',
              overflowY: 'auto',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-lg)',
              padding: 22
            }}
          >
            <div
              id="edit-project-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                color: 'var(--text-primary)',
                marginBottom: 4
              }}
            >
              Edit project details
            </div>

            <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
              Update the project card details without touching script drafts, notes, or saved chats.
            </div>

            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              Title
            </label>
            <input
              className="input"
              value={editForm.title}
              onChange={e => updateEditField('title', e.target.value)}
              placeholder="Project title"
              autoFocus
              style={{ marginBottom: 12 }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Format
                </label>
                <select
                  className="input"
                  value={editForm.format}
                  onChange={e => updateEditField('format', e.target.value)}
                >
                  <option value="feature">Feature Film</option>
                  <option value="pilot">TV Pilot</option>
                  <option value="episode">Episode</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Genre
                </label>
                <input
                  className="input"
                  value={editForm.genre}
                  onChange={e => updateEditField('genre', e.target.value)}
                  placeholder="Drama, comedy, thriller…"
                />
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              Logline
            </label>
            <textarea
              className="input"
              value={editForm.logline}
              onChange={e => updateEditField('logline', e.target.value)}
              placeholder="One-sentence summary of the project…"
              rows={3}
              style={{ marginBottom: 12 }}
            />

            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              Premise / related project info
            </label>
            <textarea
              className="input"
              value={editForm.premise}
              onChange={e => updateEditField('premise', e.target.value)}
              placeholder="Useful context, related episode/series info, or broader project notes…"
              rows={3}
              style={{ marginBottom: 12 }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Tone
                </label>
                <input
                  className="input"
                  value={editForm.tone}
                  onChange={e => updateEditField('tone', e.target.value)}
                  placeholder="Darkly funny, grounded…"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Comparable titles
                </label>
                <input
                  className="input"
                  value={editForm.comparable_titles}
                  onChange={e => updateEditField('comparable_titles', e.target.value)}
                  placeholder="Fleabag, Barry…"
                />
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              Target audience / metadata
            </label>
            <input
              className="input"
              value={editForm.target_audience}
              onChange={e => updateEditField('target_audience', e.target.value)}
              placeholder="Audience, date notes, market notes, or metadata…"
              style={{ marginBottom: 20 }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" type="button" onClick={cancelEdit} disabled={savingEdit}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
          onClick={cancelDelete}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.58)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(460px, 100%)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-lg)',
              padding: 22
            }}
          >
            <div
              id="delete-project-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                color: 'var(--red)',
                marginBottom: 10
              }}
            >
              Delete this project?
            </div>

            <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
              You are about to permanently delete:
            </div>

            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                padding: '10px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                marginBottom: 12
              }}
            >
              {deleteTarget.title}
            </div>

            <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
              This cannot be undone. All project documents, notes, brainstorm cards, chats, and related materials for this project will be removed.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" type="button" onClick={cancelDelete} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, delete project'}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}

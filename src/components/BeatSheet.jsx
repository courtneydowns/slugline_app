import React, { useState, useEffect } from 'react'
import useStore from '../store'

const ACT_LABELS = {
  act1: 'Act One', act2a: 'Act Two A', act2b: 'Act Two B', act3: 'Act Three',
  teaser: 'Teaser', tag: 'Tag'
}
const ACT_COLORS = {
  act1: 'var(--blue)', act2a: 'var(--amber)', act2b: '#B07AC8',
  act3: 'var(--green)', teaser: 'var(--text-muted)', tag: 'var(--text-muted)'
}

export default function BeatSheet({ onClose, embedded }) {
  const { currentProject, beats, setBeats, currentDocument, addNotification } = useStore()
  const [loading, setLoading] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editData, setEditData] = useState({})

  useEffect(() => {
    if (!beats.length && currentProject) {
      window.api.initBeats(currentProject.id, currentProject.format).then(b => setBeats(b))
    }
  }, [])

  async function saveEdit() {
    const updated = await window.api.upsertBeat(editData)
    setBeats(beats.map(b => b.id === updated.id ? updated : b))
    setEditing(null)
  }

  async function markComplete() {
    // Mark beat sheet as complete in project
    await window.api.updateProject(currentProject.id, { beat_sheet_complete: 1 })
    useStore.getState().setCurrentProject({ ...currentProject, beat_sheet_complete: 1 })
    addNotification('Beat sheet locked in! You can now write freely.', 'success')
    onClose()
  }

  async function analyse() {
    setAnalysing(true)
    const result = await window.api.claudeBeatSheetAnalysis({
      projectId: currentProject.id,
      beats,
      documentContent: currentDocument?.content
    })
    setAnalysis(result.analysis)
    setAnalysing(false)
  }

  // Group by act
  const groups = beats.reduce((acc, b) => {
    const act = b.beat_type || 'act1'
    if (!acc[act]) acc[act] = []
    acc[act].push(b)
    return acc
  }, {})

  const pageCount = currentDocument?.page_count || 0

  const inner = (
    <div style={embedded
      ? { display: 'flex', flexDirection: 'column', height: '100%' }
      : { width: '90vw', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      className={embedded ? '' : 'modal'}
    >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--amber)' }}>Beat Sheet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {currentProject?.format === 'pilot' ? 'TV Pilot Structure' : 'Feature Film — Blake Snyder Beat Sheet'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={analyse} disabled={analysing}>
              {analysing ? '…' : '✨ Analyse Structure'}
            </button>
            {!currentProject?.beat_sheet_complete && (
              <button className="btn btn-primary" onClick={markComplete}>
                ✓ Lock In Beat Sheet
              </button>
            )}
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: 0 }}>
          {/* Beat list */}
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            {Object.entries(groups).map(([act, actBeats]) => (
              <div key={act} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACT_COLORS[act], marginBottom: 10, fontWeight: 600 }}>
                  {ACT_LABELS[act] || act}
                </div>
                {actBeats.map(b => {
                  const isEditing = editing === b.id
                  const progress = b.actual_page ? Math.min(100, (b.actual_page / b.target_page) * 100) : 0
                  const onTarget = b.actual_page && Math.abs(b.actual_page - b.target_page) <= 3

                  if (isEditing) return (
                    <div key={b.id} style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: 14, marginBottom: 8, borderLeft: `3px solid ${ACT_COLORS[act]}` }}>
                      <input className="input selectable" value={editData.beat_name || ''} onChange={e => setEditData(d => ({ ...d, beat_name: e.target.value }))} style={{ marginBottom: 8 }} />
                      <textarea className="input selectable" value={editData.description || ''} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} placeholder="Description (what happens at this beat?)" rows={3} style={{ marginBottom: 8 }} />
                      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Target Page</label>
                          <input className="input selectable" type="number" value={editData.target_page || ''} onChange={e => setEditData(d => ({ ...d, target_page: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Actual Page</label>
                          <input className="input selectable" type="number" value={editData.actual_page || ''} onChange={e => setEditData(d => ({ ...d, actual_page: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  )

                  return (
                    <div
                      key={b.id}
                      onClick={() => { setEditing(b.id); setEditData(b) }}
                      style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: '12px 14px', marginBottom: 8, borderLeft: `3px solid ${ACT_COLORS[act]}`, cursor: 'pointer', transition: 'all 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-raised)'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{b.beat_name}</div>
                          {b.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b.description}</div>}
                        </div>
                        <div style={{ textAlign: 'right', marginLeft: 16, flexShrink: 0 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>p. {b.target_page}</div>
                          {b.actual_page && (
                            <div style={{ fontSize: 11, color: onTarget ? 'var(--green)' : 'var(--red)' }}>
                              ↳ p. {b.actual_page}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Analysis panel */}
          {analysis && (
            <div style={{ width: 300, borderLeft: '1px solid var(--border)', padding: 20, overflow: 'auto' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--amber)', marginBottom: 16 }}>Structure Analysis</div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Overall Score</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: analysis.overall_structure_score >= 7 ? 'var(--green)' : analysis.overall_structure_score >= 5 ? 'var(--amber)' : 'var(--red)' }}>
                  {analysis.overall_structure_score}/10
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{analysis.pacing_assessment}</div>
              </div>

              {analysis.weak_beats?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Needs Work</div>
                  {analysis.weak_beats.map((w, i) => (
                    <div key={i} style={{ background: 'rgba(200,75,75,0.1)', border: '1px solid rgba(200,75,75,0.2)', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>{w.beat}</div>
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 4 }}>{w.issue}</div>
                      <div style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>{w.suggestion}</div>
                    </div>
                  ))}
                </div>
              )}

              {analysis.strengths?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Strengths</div>
                  {analysis.strengths.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--green)', marginBottom: 4, lineHeight: 1.5 }}>✓ {s}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {!currentProject?.beat_sheet_complete && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', background: 'var(--amber-subtle)', fontSize: 13, color: 'var(--text-secondary)' }}>
            ⚠ Fill in your beat sheet before writing your script. When you're happy, click <strong>Lock In Beat Sheet</strong>.
          </div>
        )}
      </div>
  )

  if (embedded) return inner
  return (
    <div className="modal-overlay">
      {inner}
    </div>
  )
}

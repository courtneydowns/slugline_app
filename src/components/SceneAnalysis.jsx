import React, { useState, useEffect } from 'react'
import useStore from '../store'

export default function SceneAnalysis({ onClose }) {
  const { currentProject, currentDocument, addNotification } = useStore()
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sceneText, setSceneText] = useState('')

  useEffect(() => {
    // Pre-populate with current document content
    if (currentDocument?.content) {
      // Get last ~2000 chars (likely the current scene)
      setSceneText(currentDocument.content.slice(-2000))
    }
  }, [])

  async function analyse() {
    if (!sceneText.trim()) return
    setLoading(true)
    const result = await window.api.claudeSceneAnalysis({
      projectId: currentProject.id,
      sceneContent: sceneText
    })
    setAnalysis(result.analysis)
    setLoading(false)
  }

  const scoreColor = (n) => n >= 7 ? 'var(--green)' : n >= 5 ? 'var(--amber)' : 'var(--red)'

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Scene Analysis</div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Scene to analyse (paste or edit)
            </label>
            <textarea
              className="input selectable"
              value={sceneText}
              onChange={e => setSceneText(e.target.value)}
              rows={8}
              style={{ fontFamily: 'var(--font-screenplay)', fontSize: 11, lineHeight: 1.7 }}
            />
          </div>

          <button className="btn btn-primary" onClick={analyse} disabled={loading || !sceneText.trim()} style={{ alignSelf: 'flex-start' }}>
            {loading ? 'Analysing…' : '✨ Analyse Scene'}
          </button>

          {analysis && (
            <div>
              {/* Metrics row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <Metric label="Tension" value={analysis.tension} max={10} color={scoreColor(analysis.tension)} />
                <Metric label="Pacing" value={analysis.pacing} isString />
                <Metric label="Dialogue" value={`${analysis.dialogueRatio}%`} isString />
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <Flag label="Has Conflict" val={analysis.hasConflict} />
                <Flag label="Moves Story Forward" val={analysis.movesStoryForward} />
              </div>

              {analysis.conflict && (
                <InfoBox label="Conflict" content={analysis.conflict} />
              )}

              {analysis.issues?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Issues to Address</div>
                  {analysis.issues.map((issue, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'rgba(200,75,75,0.08)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.5, borderLeft: '3px solid var(--red)' }}>
                      {issue}
                    </div>
                  ))}
                </div>
              )}

              {analysis.strengths?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Strengths</div>
                  {analysis.strengths.map((s, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'rgba(75,174,138,0.08)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.5, borderLeft: '3px solid var(--green)' }}>
                      {s}
                    </div>
                  ))}
                </div>
              )}

              {analysis.suggestions?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Suggestions</div>
                  {analysis.suggestions.map((s, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-raised)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.5, borderLeft: '3px solid var(--amber)' }}>
                      💡 {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, max, color, isString }) {
  return (
    <div style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text-primary)' }}>
        {isString ? value : `${value}${max ? `/${max}` : ''}`}
      </div>
    </div>
  )
}

function Flag({ label, val }) {
  return (
    <div style={{ flex: 1, background: val ? 'rgba(75,174,138,0.1)' : 'rgba(200,75,75,0.1)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14 }}>{val ? '✓' : '✗'}</span>
      <span style={{ fontSize: 12, color: val ? 'var(--green)' : 'var(--red)' }}>{label}</span>
    </div>
  )
}

function InfoBox({ label, content }) {
  return (
    <div style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{content}</div>
    </div>
  )
}

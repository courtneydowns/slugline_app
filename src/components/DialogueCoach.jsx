import React, { useState, useEffect } from 'react'
import useStore from '../store'

export default function DialogueCoach({ onClose }) {
  const { currentProject, currentDocument } = useStore()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    if (currentDocument?.content) setContent(currentDocument.content.slice(-3000))
  }, [])

  async function analyse() {
    setLoading(true)
    const result = await window.api.claudeDialogueCoach({ projectId: currentProject.id, content })
    setAnalysis(result.analysis)
    setLoading(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 700, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Dialogue Coach</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Checks for on-the-nose dialogue, character voice issues, and redundancy</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Script excerpt</label>
            <textarea
              className="input selectable"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              style={{ fontFamily: 'var(--font-screenplay)', fontSize: 11, lineHeight: 1.7 }}
            />
          </div>

          <button className="btn btn-primary" onClick={analyse} disabled={loading || !content.trim()} style={{ alignSelf: 'flex-start' }}>
            {loading ? 'Coaching…' : '✨ Run Dialogue Coach'}
          </button>

          {analysis && (
            <div>
              {/* Score */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 40, fontWeight: 700, color: analysis.overallScore >= 7 ? 'var(--green)' : analysis.overallScore >= 5 ? 'var(--amber)' : 'var(--red)' }}>
                    {analysis.overallScore}/10
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dialogue Score</div>
                </div>
                <div style={{ flex: 1, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>
                  "{analysis.summary}"
                </div>
              </div>

              {analysis.onTheNoseLines?.length > 0 && (
                <Section label="On-the-Nose Lines" color="var(--red)">
                  {analysis.onTheNoseLines.map((o, i) => (
                    <div key={i} style={{ marginBottom: 10, background: 'var(--bg-raised)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: 11, color: 'var(--red)', marginBottom: 6, textDecoration: 'line-through' }}>"{o.line}"</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--green)' }}>Better: </strong>{o.suggestion}
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {analysis.characterVoiceIssues?.length > 0 && (
                <Section label="Character Voice Issues" color="var(--amber)">
                  {analysis.characterVoiceIssues.map((v, i) => (
                    <div key={i} style={{ marginBottom: 8, background: 'var(--bg-raised)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--amber)', marginBottom: 4 }}>{v.character}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{v.issue}</div>
                      {v.example && <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>e.g. "{v.example}"</div>}
                    </div>
                  ))}
                </Section>
              )}

              {analysis.redundantLines?.length > 0 && (
                <Section label="Lines You Can Cut" color="var(--text-muted)">
                  {analysis.redundantLines.map((r, i) => (
                    <div key={i} style={{ marginBottom: 8, background: 'var(--bg-raised)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>"{r.line}"</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.reason}</div>
                    </div>
                  ))}
                </Section>
              )}

              {analysis.tooLongMonologues?.length > 0 && (
                <Section label="Long Monologues to Break Up" color="var(--blue)">
                  {analysis.tooLongMonologues.map((m, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <strong>{m.character}</strong> — {m.lineCount} lines. Consider breaking this up or cutting.
                    </div>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ label, color, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  )
}

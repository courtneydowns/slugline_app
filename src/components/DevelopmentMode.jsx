import React, { useState } from 'react'
import useStore from '../store'

const QUESTIONS = [
  { id: 'kernel', label: "What's the one image, moment, or feeling your story starts from?", placeholder: "e.g. A soldier finds a letter that was never meant to be sent. Or: the feeling of arriving home after years away and realising it's changed." },
  { id: 'protagonist', label: "Who is your main character? Describe them in a few sentences.", placeholder: "Who are they? What do they want on the surface? What do they secretly need?" },
  { id: 'wound', label: "What's the wound or flaw your protagonist carries into the story?", placeholder: "A belief, fear, or trauma that shapes how they see the world and holds them back." },
  { id: 'want_vs_need', label: "What does your protagonist WANT vs. what do they actually NEED?", placeholder: "WANT is the external goal. NEED is the internal lesson. They often conflict." },
  { id: 'obstacle', label: "Who or what stands between your protagonist and what they want?", placeholder: "The antagonist, or the situation — or both. What makes this genuinely hard?" },
  { id: 'stakes', label: "What happens if your protagonist fails? Why does it matter?", placeholder: "The stakes are what give the audience a reason to care. Make it specific and personal." },
  { id: 'theme', label: "What is your story really about underneath the plot?", placeholder: "e.g. 'Forgiveness can only come when you stop blaming yourself.' One sentence is ideal." },
  { id: 'world', label: "Where and when does your story take place? What makes that world interesting?", placeholder: "Setting can be a character. What's unique or unexpected about this world?" },
  { id: 'ending', label: "Do you know how it ends? Describe the final image or moment.", placeholder: "You don't need the whole plot — just the destination. Where do we leave the protagonist?" },
  { id: 'tone', label: "What's the tone? What films or shows feel like what you're aiming for?", placeholder: "e.g. 'Dark comedy like Fargo, but with the heart of Little Miss Sunshine.' Comparables help." }
]

export default function DevelopmentMode({ onClose }) {
  const { currentProject, addNotification } = useStore()
  const [step, setStep] = useState('intro') // 'intro' | 'format' | 'questions' | 'logline' | 'complete'
  const [formatAnalysis, setFormatAnalysis] = useState(null)
  const [loadingFormat, setLoadingFormat] = useState(false)
  const [answers, setAnswers] = useState({})
  const [currentQ, setCurrentQ] = useState(0)
  const [hint, setHint] = useState('')
  const [loadingHint, setLoadingHint] = useState(false)
  const [loglines, setLoglines] = useState([])
  const [loadingLoglines, setLoadingLoglines] = useState(false)
  const [chosenLogline, setChosenLogline] = useState('')
  const [savingBible, setSavingBible] = useState(false)

  async function handleFormatAnalysis() {
    const idea = answers.kernel || ''
    if (!idea.trim()) { addNotification('Write your story idea first', 'warning'); return }
    setLoadingFormat(true)
    const result = await window.api.claudeTvVsFeature({ projectId: currentProject.id, storyIdea: idea })
    setFormatAnalysis(result.analysis)
    setLoadingFormat(false)
  }

  async function getHint() {
    const q = QUESTIONS[currentQ]
    setLoadingHint(true)
    const result = await window.api.claudeDevelopmentQuestion({
      projectId: currentProject.id,
      question: q.label,
      answers,
      step: currentQ,
      isBeginnerMode: true
    })
    setHint(result.content)
    setLoadingHint(false)
  }

  async function generateLoglines() {
    setLoadingLoglines(true)
    const result = await window.api.claudeLoglineAssist({ projectId: currentProject.id, answers })
    setLoglines(result.loglines || [])
    setLoadingLoglines(false)
  }

  async function finalize() {
    setSavingBible(true)
    // Save logline and answers to project
    await window.api.updateProject(currentProject.id, {
      logline: chosenLogline || loglines[0] || '',
      premise: answers.theme || '',
      tone: answers.tone || '',
      development_complete: 1
    })
    // Generate story bible
    await window.api.claudeGenerateStoryBible({ projectId: currentProject.id })
    // Reload
    const updated = await window.api.getProject(currentProject.id)
    useStore.getState().setCurrentProject(updated)
    await useStore.getState().loadProjectData(currentProject.id)
    setSavingBible(false)
    addNotification('Development complete! Story bible generated.', 'success')
    onClose()
  }

  const q = QUESTIONS[currentQ]
  const allAnswered = QUESTIONS.every(q => answers[q.id]?.trim())

  // ─── Intro ─────────────────────────────────────────────────────────────────
  if (step === 'intro') return (
    <Screen title="Development Mode" onClose={onClose}>
      <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 24 }}>🎬</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 16 }}>
          Let's develop your story
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
          Before writing a word of script, professional writers go through a development process — figuring out the story's core, characters, theme, and structure. This takes 20–30 minutes and saves weeks of rewriting.
        </p>
        <div style={{ background: 'var(--bg-raised)', borderRadius: 10, padding: 20, marginBottom: 32, textAlign: 'left' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div>✓ 10 questions to find your story's core</div>
            <div>✓ TV vs. feature recommendation from Claude</div>
            <div>✓ Three logline options to choose from</div>
            <div>✓ Auto-populates your Story Bible with characters & world notes</div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setStep('questions')} style={{ padding: '12px 32px', fontSize: 15 }}>
          Start Development →
        </button>
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Skip — I know what I'm doing</button>
        </div>
      </div>
    </Screen>
  )

  // ─── Questions ─────────────────────────────────────────────────────────────
  if (step === 'questions') return (
    <Screen title="Development Mode" onClose={onClose}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 24px' }}>
        {/* Progress */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            <span>Question {currentQ + 1} of {QUESTIONS.length}</span>
            <span>{Math.round(((currentQ + 1) / QUESTIONS.length) * 100)}%</span>
          </div>
          <div className="token-bar" style={{ height: 4 }}>
            <div className="token-bar-fill" style={{ width: `${((currentQ + 1) / QUESTIONS.length) * 100}%` }} />
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <span className="tag tag-muted">Question {currentQ + 1}</span>
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
          {q.label}
        </h3>

        <textarea
          className="input selectable"
          value={answers[q.id] || ''}
          onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
          placeholder={q.placeholder}
          rows={5}
          style={{ marginBottom: 12, fontSize: 14, lineHeight: 1.7 }}
          autoFocus
        />

        {/* Claude hint */}
        {hint && (
          <div style={{ background: 'var(--amber-subtle)', border: '1px solid var(--amber-dim)', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 6, fontWeight: 600 }}>CLAUDE SAYS</div>
            {hint}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {currentQ > 0 && (
            <button className="btn btn-ghost" onClick={() => { setCurrentQ(q => q - 1); setHint('') }}>← Back</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={getHint} disabled={loadingHint}>
            {loadingHint ? 'Thinking…' : '💡 Help me with this'}
          </button>
          <div style={{ flex: 1 }} />
          {currentQ < QUESTIONS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => { setCurrentQ(q => q + 1); setHint('') }}>
              Next →
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setStep('format')} disabled={!answers[q.id]?.trim()}>
              Continue to Format →
            </button>
          )}
        </div>

        {/* Jump to any question */}
        <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUESTIONS.map((q2, i) => (
            <button key={i} onClick={() => { setCurrentQ(i); setHint('') }} style={{
              width: 28, height: 28, borderRadius: '50%', border: '1px solid',
              borderColor: i === currentQ ? 'var(--amber)' : answers[q2.id] ? 'var(--green)' : 'var(--border)',
              background: i === currentQ ? 'var(--amber-subtle)' : answers[q2.id] ? 'rgba(75,174,138,0.1)' : 'transparent',
              color: answers[q2.id] ? 'var(--green)' : 'var(--text-muted)',
              fontSize: 11, cursor: 'pointer'
            }}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </Screen>
  )

  // ─── Format ────────────────────────────────────────────────────────────────
  if (step === 'format') return (
    <Screen title="Development Mode" onClose={onClose}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 24px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>Feature or TV?</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
          Let Claude analyse your story and recommend the best format. This affects structure, pacing, and your beat sheet.
        </p>

        {!formatAnalysis ? (
          <button className="btn btn-primary" onClick={handleFormatAnalysis} disabled={loadingFormat}>
            {loadingFormat ? 'Analysing…' : 'Analyse My Story →'}
          </button>
        ) : (
          <div>
            <div style={{ background: 'var(--bg-raised)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <FormatCard
                  title="Feature Film"
                  rec={formatAnalysis.recommendation === 'feature'}
                  text={formatAnalysis.featureCase}
                  confidence={formatAnalysis.recommendation === 'feature' ? formatAnalysis.confidence : 10 - formatAnalysis.confidence}
                />
                <FormatCard
                  title="TV Pilot"
                  rec={formatAnalysis.recommendation === 'pilot'}
                  text={formatAnalysis.pilotCase}
                  confidence={formatAnalysis.recommendation === 'pilot' ? formatAnalysis.confidence : 10 - formatAnalysis.confidence}
                />
              </div>
              <div style={{ background: 'var(--amber-subtle)', borderRadius: 8, padding: 14, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--amber)' }}>Recommendation: </strong>
                {formatAnalysis.recommendation_reason}
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              <strong>Your choice overrides this.</strong> What format do you want to write?
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={async () => {
                await window.api.updateProject(currentProject.id, { format: 'feature' })
                setStep('logline')
              }}>
                Feature Film →
              </button>
              <button className="btn btn-ghost" onClick={async () => {
                await window.api.updateProject(currentProject.id, { format: 'pilot' })
                setStep('logline')
              }}>
                TV Pilot →
              </button>
            </div>
          </div>
        )}
      </div>
    </Screen>
  )

  // ─── Logline ───────────────────────────────────────────────────────────────
  if (step === 'logline') return (
    <Screen title="Development Mode" onClose={onClose}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 24px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>Your Logline</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          A logline is a one-sentence summary of your film. It's the north star you return to when you're lost.
          Claude will generate three options based on everything you've answered.
        </p>

        {loglines.length === 0 ? (
          <button className="btn btn-primary" onClick={generateLoglines} disabled={loadingLoglines}>
            {loadingLoglines ? 'Generating…' : 'Generate Loglines →'}
          </button>
        ) : (
          <div>
            <div style={{ marginBottom: 20 }}>
              {loglines.map((l, i) => (
                <div
                  key={i}
                  onClick={() => setChosenLogline(l)}
                  style={{
                    background: chosenLogline === l ? 'var(--amber-subtle)' : 'var(--bg-raised)',
                    border: `1px solid ${chosenLogline === l ? 'var(--amber)' : 'var(--border)'}`,
                    borderRadius: 8, padding: 16, marginBottom: 10, cursor: 'pointer',
                    fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)',
                    fontStyle: 'italic', transition: 'all 0.1s'
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'normal', marginBottom: 6, textTransform: 'uppercase' }}>Option {i + 1}</div>
                  {l}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Edit your chosen logline (optional)</label>
              <textarea className="input selectable" value={chosenLogline} onChange={e => setChosenLogline(e.target.value)} rows={3} style={{ fontSize: 14, fontStyle: 'italic', lineHeight: 1.7 }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={finalize} disabled={!chosenLogline?.trim() || savingBible} style={{ fontSize: 14, padding: '10px 24px' }}>
                {savingBible ? 'Building Story Bible…' : 'Finish & Build Story Bible →'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={generateLoglines} disabled={loadingLoglines}>
                Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    </Screen>
  )

  return null
}

function Screen({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-base)', zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ position: 'absolute', top: 16, right: 20, zIndex: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
      </div>
      {children}
    </div>
  )
}

function FormatCard({ title, rec, text, confidence }) {
  return (
    <div style={{ flex: 1, background: rec ? 'var(--amber-subtle)' : 'var(--bg-panel)', border: `1px solid ${rec ? 'var(--amber)' : 'var(--border)'}`, borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        {rec && <span className="tag tag-amber">Recommended</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
      <div style={{ marginTop: 10 }}>
        <div className="token-bar" style={{ height: 4 }}>
          <div className="token-bar-fill" style={{ width: `${confidence * 10}%`, background: rec ? 'var(--amber)' : 'var(--text-muted)' }} />
        </div>
      </div>
    </div>
  )
}

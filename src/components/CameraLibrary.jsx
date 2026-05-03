import React, { useState, useMemo } from 'react'

const CAMERA_TERMS = [
  // Shot types
  { term: 'CLOSE ON', category: 'Shot Type', desc: 'Tight shot focusing on a specific detail or object.', example: 'CLOSE ON the locked door.' },
  { term: 'CLOSE-UP (CU)', category: 'Shot Type', desc: 'Tight frame on a face or object filling most of the frame.', example: 'CU — her eyes.' },
  { term: 'ECU (EXTREME CLOSE-UP)', category: 'Shot Type', desc: 'Very tight — an eye, a hand, a specific detail.', example: 'ECU — the trigger finger.' },
  { term: 'WIDE SHOT (WS)', category: 'Shot Type', desc: 'Shows the full subject with surrounding environment.', example: 'WS — a lone figure in the desert.' },
  { term: 'MEDIUM SHOT (MS)', category: 'Shot Type', desc: 'Frames the subject from the waist up.', example: 'MS — SARAH considers her options.' },
  { term: 'MASTER SHOT', category: 'Shot Type', desc: 'A wide shot establishing the full scene and all its elements.', example: 'MASTER — the entire battlefield.' },
  { term: 'TWO-SHOT', category: 'Shot Type', desc: 'Both characters visible in the same frame.', example: 'TWO-SHOT — MARK and HELEN, the space between them charged.' },
  { term: 'OVER THE SHOULDER (OTS)', category: 'Shot Type', desc: 'Camera looks over one character\'s shoulder at another.', example: 'OTS — DETECTIVE on SUSPECT.' },
  { term: 'POV', category: 'Shot Type', desc: 'Point of view shot — we see what the character sees.', example: 'POV — the crowd, looking back at us.' },
  { term: 'INSERT', category: 'Shot Type', desc: 'Cuts to a close-up of a specific object or detail.', example: 'INSERT — the note reads: "Leave now."' },
  // Camera movement
  { term: 'PAN', category: 'Movement', desc: 'Camera rotates horizontally on a fixed axis.', example: 'CAMERA PANS across the wreckage.' },
  { term: 'TILT', category: 'Movement', desc: 'Camera rotates vertically on a fixed axis.', example: 'CAMERA TILTS up to the skyscraper\'s peak.' },
  { term: 'DOLLY IN / DOLLY OUT', category: 'Movement', desc: 'Camera physically moves toward or away from the subject.', example: 'DOLLY IN on her face as she reads.' },
  { term: 'TRACKING SHOT', category: 'Movement', desc: 'Camera moves alongside a moving subject.', example: 'TRACKING SHOT — we follow MARCUS through the crowd.' },
  { term: 'CRANE SHOT', category: 'Movement', desc: 'Camera rises up or swoops down via a crane.', example: 'CRANE SHOT UP — pulling back and up to reveal the full scale of the city.' },
  { term: 'HANDHELD', category: 'Movement', desc: 'Slightly shaky, intimate feel. Common in documentary-style.', example: 'HANDHELD — we are right there with her as she runs.' },
  { term: 'STEADICAM', category: 'Movement', desc: 'Smooth, gliding camera movement following action.', example: 'STEADICAM follows him through the warehouse.' },
  // Transitions
  { term: 'CUT TO:', category: 'Transition', desc: 'Immediate jump to the next scene. Most common transition.', example: 'CUT TO:' },
  { term: 'SMASH CUT TO:', category: 'Transition', desc: 'Abrupt, jarring cut for shock or comedy effect.', example: 'SMASH CUT TO:' },
  { term: 'MATCH CUT', category: 'Transition', desc: 'Cut where two shots share a visual or thematic similarity.', example: 'MATCH CUT TO:' },
  { term: 'FADE IN:', category: 'Transition', desc: 'Image gradually appears from black. Used to open a film or act.', example: 'FADE IN:' },
  { term: 'FADE OUT.', category: 'Transition', desc: 'Image gradually goes to black. Used to end a film or act.', example: 'FADE OUT.' },
  { term: 'DISSOLVE TO:', category: 'Transition', desc: 'One image fades out while another fades in. Suggests time passing.', example: 'DISSOLVE TO:' },
  { term: 'INTERCUT WITH:', category: 'Transition', desc: 'Alternate rapidly between two simultaneous scenes.', example: 'INTERCUT WITH: SARAH — on her phone, racing.' },
  // Scene headings
  { term: 'INT.', category: 'Scene Heading', desc: 'Interior — scene takes place inside.', example: 'INT. POLICE STATION - NIGHT' },
  { term: 'EXT.', category: 'Scene Heading', desc: 'Exterior — scene takes place outside.', example: 'EXT. ROOFTOP - DAY' },
  { term: 'INT./EXT.', category: 'Scene Heading', desc: 'Interior/Exterior — e.g. a character talking through a window or in a car.', example: 'INT./EXT. CAR - MOVING - DAY' },
  { term: 'CONTINUOUS', category: 'Scene Heading', desc: 'Scene follows directly from the previous without a time break.', example: 'INT. HALLWAY - CONTINUOUS' },
  { term: 'MOMENTS LATER', category: 'Scene Heading', desc: 'A brief time has passed.', example: 'INT. KITCHEN - MOMENTS LATER' },
  { term: 'SAME TIME', category: 'Scene Heading', desc: 'Scene is happening simultaneously with the previous.', example: 'INT. WAREHOUSE - SAME TIME' },
  // Special
  { term: 'MONTAGE', category: 'Special', desc: 'Series of short shots showing passage of time or parallel events.', example: 'MONTAGE — Training begins. SARAH runs. Lifts weights. Spars.' },
  { term: 'TITLE CARD:', category: 'Special', desc: 'Text appears on screen to provide context.', example: 'TITLE CARD: "Six months earlier."' },
  { term: 'SERIES OF SHOTS', category: 'Special', desc: 'Similar to montage but for a tight sequence of related events.', example: 'SERIES OF SHOTS — The robbery unfolds.' },
  { term: 'V.O. (Voice Over)', category: 'Dialogue', desc: 'Character speaks from outside the scene (narration).', example: 'JAMES (V.O.)\nI never thought I\'d go back.' },
  { term: 'O.S. (Off Screen)', category: 'Dialogue', desc: 'Character is in the scene but not visible on camera.', example: 'HELEN (O.S.)\nAre you ready?' },
  { term: 'CONT\'D', category: 'Dialogue', desc: 'Character continues speaking without interruption across action.', example: "JAMES (CONT'D)" },
  { term: 'BEAT', category: 'Dialogue', desc: 'A brief pause in dialogue or action.', example: 'He stares at her.\n\nBEAT.\n\nShe looks away.' },
]

const CATEGORIES = ['All', ...new Set(CAMERA_TERMS.map(t => t.category))]

export default function CameraLibrary({ onClose }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [copied, setCopied] = useState(null)

  const filtered = useMemo(() => {
    let terms = CAMERA_TERMS
    if (category !== 'All') terms = terms.filter(t => t.category === category)
    if (search.trim()) {
      const q = search.toLowerCase()
      terms = terms.filter(t => t.term.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))
    }
    return terms
  }, [search, category])

  function copy(text) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Camera Direction Library</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Click any term to copy it to clipboard</div>
            </div>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="input selectable"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search terms…"
              style={{ flex: 1 }}
              autoFocus
            />
            <select className="input" value={category} onChange={e => setCategory(e.target.value)} style={{ width: 'auto', flex: 'none' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, alignContent: 'start' }}>
          {filtered.map(t => (
            <div
              key={t.term}
              onClick={() => copy(t.example || t.term)}
              style={{
                background: copied === (t.example || t.term) ? 'var(--amber-subtle)' : 'var(--bg-raised)',
                border: `1px solid ${copied === (t.example || t.term) ? 'var(--amber)' : 'var(--border)'}`,
                borderRadius: 8, padding: 12, cursor: 'pointer', transition: 'all 0.1s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--amber-dim)'}
              onMouseLeave={e => { if (copied !== (t.example || t.term)) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-screenplay)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{t.term}</span>
                <span className="tag tag-muted" style={{ fontSize: 9 }}>{t.category}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 6 }}>{t.desc}</div>
              <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-panel)', padding: '4px 8px', borderRadius: 4 }}>
                {t.example}
              </div>
              {copied === (t.example || t.term) && (
                <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>✓ Copied</div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No matching terms</div>
          )}
        </div>
      </div>
    </div>
  )
}

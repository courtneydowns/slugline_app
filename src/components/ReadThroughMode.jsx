import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

function parseFountain(content) {
  if (!content) return []
  const lines = content.split('\n')
  const elements = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) { elements.push({ type: 'blank' }); continue }
    if (/^(INT\.|EXT\.|INT\/EXT\.)/i.test(t)) elements.push({ type: 'scene-heading', text: t.toUpperCase() })
    else if (/^(FADE IN:|FADE OUT\.|CUT TO:|SMASH CUT TO:|DISSOLVE TO:)/i.test(t)) elements.push({ type: 'transition', text: t.toUpperCase() })
    else if (/^\(.*\)$/.test(t)) elements.push({ type: 'parenthetical', text: t })
    else if (/^\/\*/.test(t)) elements.push({ type: 'note', text: t.replace(/\/\*|\*\//g, '').trim() })
    else if (/^[A-Z][A-Z\s\(\)\.]+$/.test(t) && t.length < 40) elements.push({ type: 'character', text: t })
    else {
      // If previous was character or parenthetical, this is dialogue
      const prev = elements.findLast?.(e => e.type !== 'blank')
      if (prev && (prev.type === 'character' || prev.type === 'parenthetical')) {
        elements.push({ type: 'dialogue', text: t })
      } else {
        elements.push({ type: 'action', text: t })
      }
    }
  }
  return elements
}

export default function ReadThroughMode({ onClose }) {
  const { currentProject, currentDocument } = useStore()
  const [speaking, setSpeaking] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [speed, setSpeed] = useState(1)
  const utteranceRef = useRef(null)
  const elementsRef = useRef([])

  const elements = parseFountain(currentDocument?.content || '')
  elementsRef.current = elements

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel() }
  }, [])

  function readAloud() {
    if (!window.speechSynthesis) { alert('Read Aloud requires a browser with speech synthesis support.'); return }
    window.speechSynthesis.cancel()
    setSpeaking(true)

    const textLines = elements
      .filter(e => e.type !== 'blank' && e.type !== 'note')
      .map(e => {
        if (e.type === 'scene-heading') return `Scene. ${e.text}.`
        if (e.type === 'character') return `\n${e.text}.`
        if (e.type === 'transition') return `${e.text}`
        return e.text
      })
      .join(' ')

    const utter = new SpeechSynthesisUtterance(textLines)
    utter.rate = speed
    utter.onend = () => { setSpeaking(false); setCurrentIdx(-1) }
    utteranceRef.current = utter
    window.speechSynthesis.speak(utter)
  }

  function stopReading() {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setCurrentIdx(-1)
  }

  const styleMap = {
    'scene-heading': { textTransform: 'uppercase', fontWeight: 'bold', marginTop: '2em', marginBottom: '0.5em', fontSize: '12pt' },
    'action': { marginBottom: '0.5em' },
    'character': { marginLeft: '2.2in', marginTop: '1em', textTransform: 'uppercase', fontSize: '12pt' },
    'dialogue': { marginLeft: '1.5in', marginRight: '1in', marginBottom: '0.5em' },
    'parenthetical': { marginLeft: '1.9in', marginRight: '1.3in', color: 'var(--text-secondary)' },
    'transition': { textAlign: 'right', textTransform: 'uppercase', marginTop: '1em', marginBottom: '1em', color: 'var(--text-muted)' },
    'note': { color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11pt' }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Toolbar */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--amber)', flex: 1 }}>Read-Through</div>
        <div style={{ display: 'flex', align: 'center', gap: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Speed</label>
          <input type="range" min={0.6} max={2} step={0.1} value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} style={{ width: 80 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 28 }}>{speed}×</span>
        </div>
        {!speaking ? (
          <button className="btn btn-primary btn-sm" onClick={readAloud}>▶ Read Aloud</button>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={stopReading}>■ Stop</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
      </div>

      {/* Script */}
      <div style={{ flex: 1, overflow: 'auto', padding: '48px 0' }}>
        <div style={{
          maxWidth: '8.5in', margin: '0 auto',
          background: 'var(--bg-surface)',
          padding: '1in 1.5in',
          minHeight: '11in',
          boxShadow: '0 4px 32px rgba(0,0,0,0.3)',
          borderRadius: 8
        }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '2in' }}>
            <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: '14pt', fontWeight: 700, marginBottom: 8 }}>
              {currentProject?.title?.toUpperCase()}
            </div>
            {currentProject?.logline && (
              <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: '11pt', color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 400, margin: '0 auto' }}>
                {currentProject.logline}
              </div>
            )}
          </div>

          {elements.map((el, i) => {
            if (el.type === 'blank') return <div key={i} style={{ height: '0.5em' }} />
            if (el.type === 'note') return null
            return (
              <div key={i} style={{ fontFamily: 'var(--font-screenplay)', fontSize: '12pt', lineHeight: '1.667', ...styleMap[el.type] }}>
                {el.text}
              </div>
            )
          })}

          <div style={{ textAlign: 'center', marginTop: '2in', fontFamily: 'var(--font-screenplay)', color: 'var(--text-muted)', fontSize: '12pt' }}>
            FADE OUT.
          </div>
        </div>
      </div>
    </div>
  )
}

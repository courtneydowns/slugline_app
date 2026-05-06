import React, { useEffect, useRef, useState } from 'react'
import useStore from '../store'

export default function StatusBar() {
  const {
    currentProject, currentDocument, sessionStart, sessionDuration,
    sessionPages, pageGoal, startSession, tickSession,
    setSessionPages, setPageGoal, preferences
  } = useStore()

  const tickRef = useRef(null)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const goalInputRef = useRef(null)

  // Start session timer on mount; load persisted pageGoal from preferences
  useEffect(() => {
    if (!sessionStart) startSession()
    tickRef.current = setInterval(() => tickSession(), 10000)

    const saved = preferences?.pageGoal
    if (saved && Number.isFinite(saved) && saved > 0) {
      setPageGoal(saved)
    }

    return () => clearInterval(tickRef.current)
  }, [])

  // Update page count from document
  useEffect(() => {
    if (currentDocument?.page_count) {
      setSessionPages(currentDocument.page_count)
    }
  }, [currentDocument?.page_count])

  // Focus input when goal editing opens
  useEffect(() => {
    if (editingGoal && goalInputRef.current) {
      goalInputRef.current.focus()
      goalInputRef.current.select()
    }
  }, [editingGoal])

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const openGoalEdit = () => {
    setGoalDraft(String(pageGoal))
    setEditingGoal(true)
  }

  const commitGoal = async () => {
    setEditingGoal(false)
    const n = parseFloat(goalDraft)
    if (!Number.isFinite(n) || n <= 0) return
    setPageGoal(n)
    try {
      await window.api.setPreferences({ ...preferences, pageGoal: n })
    } catch (e) {
      console.warn('StatusBar: failed to persist pageGoal', e)
    }
  }

  const onGoalKeyDown = (e) => {
    if (e.key === 'Enter') commitGoal()
    if (e.key === 'Escape') setEditingGoal(false)
  }

  const goalPct = pageGoal > 0 ? Math.min(100, (sessionPages / pageGoal) * 100) : 0
  const goalMet = sessionPages >= pageGoal && pageGoal > 0

  return (
    <div style={{
      height: 32,
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 16,
      fontSize: 11,
      color: 'var(--text-muted)',
      userSelect: 'none',
      flexShrink: 0
    }}>
      {/* Project name */}
      {currentProject && (
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
          {currentProject.title}
        </span>
      )}

      <span style={{ color: 'var(--border)' }}>|</span>

      {/* Page count */}
      <span>
        {currentDocument?.page_count || 0} pages
      </span>

      {/* Word count */}
      {currentDocument?.word_count > 0 && (
        <span>{currentDocument.word_count.toLocaleString()} words</span>
      )}

      <span style={{ color: 'var(--border)' }}>|</span>

      {/* Session timer */}
      <span>⏱ {formatTime(sessionDuration)}</span>

      {/* Page goal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {pageGoal > 0 && (
          <div className="token-bar" style={{ width: 60, height: 3 }}>
            <div className="token-bar-fill" style={{ width: `${goalPct}%`, background: goalMet ? 'var(--green)' : 'var(--amber)' }} />
          </div>
        )}

        {editingGoal ? (
          <input
            ref={goalInputRef}
            type="number"
            min="0.5"
            step="0.5"
            value={goalDraft}
            onChange={e => setGoalDraft(e.target.value)}
            onBlur={commitGoal}
            onKeyDown={onGoalKeyDown}
            style={{
              width: 36,
              fontSize: 11,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              color: 'var(--text-primary)',
              padding: '0 3px',
              height: 18,
              userSelect: 'text'
            }}
          />
        ) : (
          <span
            onClick={openGoalEdit}
            title="Click to set page goal"
            style={{
              cursor: 'pointer',
              color: goalMet ? 'var(--green)' : 'var(--text-muted)',
              borderBottom: '1px dashed var(--border-subtle)'
            }}
          >
            {pageGoal > 0
              ? (goalMet ? '✓ Goal met' : `${sessionPages.toFixed(1)}/${pageGoal}p goal`)
              : 'Set goal'}
          </span>
        )}
      </div>

      {/* Format */}
      {currentProject && (
        <>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="tag tag-muted" style={{ fontSize: 9, padding: '1px 6px' }}>
            {currentProject.format === 'pilot' ? 'TV Pilot' : currentProject.format === 'series' ? 'TV Series' : currentProject.format === 'episode' ? 'Episode' : 'Feature'}
          </span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Shortcuts hint */}
      <span style={{ opacity: 0.75, color: 'var(--text-muted)' }}>Tab: change type • Enter: new block • ⌘⇧P: panic export</span>
    </div>
  )
}

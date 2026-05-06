import React, { useEffect, useRef } from 'react'
import useStore from '../store'

export default function StatusBar() {
  const {
    currentProject, currentDocument, sessionStart, sessionDuration,
    sessionPages, pageGoal, startSession, tickSession,
    setSessionPages, addNotification
  } = useStore()

  const tickRef = useRef(null)

  useEffect(() => {
    if (!sessionStart) startSession()
    tickRef.current = setInterval(() => tickSession(), 10000)
    return () => clearInterval(tickRef.current)
  }, [])

  // Update page count from document
  useEffect(() => {
    if (currentDocument?.page_count) {
      setSessionPages(currentDocument.page_count)
    }
  }, [currentDocument?.page_count])

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
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
      {pageGoal > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="token-bar" style={{ width: 60, height: 3 }}>
            <div className="token-bar-fill" style={{ width: `${goalPct}%`, background: goalMet ? 'var(--green)' : 'var(--amber)' }} />
          </div>
          <span style={{ color: goalMet ? 'var(--green)' : 'var(--text-muted)' }}>
            {goalMet ? '✓ Goal met' : `${sessionPages.toFixed(1)}/${pageGoal}p goal`}
          </span>
        </div>
      )}

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

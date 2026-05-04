import React, { useMemo } from 'react'
import useStore from '../store'

const WorkspaceCard = ({ icon, label, description, onClick, accent }) => {
  const handleClick = () => {
    const selection = window.getSelection?.()
    if (selection && !selection.isCollapsed) return
    onClick?.()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  return (
    <div
      className="workspace-card no-drag"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{ '--card-accent': accent || 'var(--amber)' }}
    >
      <div className="workspace-card-icon">{icon}</div>
      <div className="workspace-card-label">{label}</div>
      {description && <div className="workspace-card-desc">{description}</div>}
    </div>
  )
}

export default function Dashboard() {
  const {
    currentProject, currentDocument,
    characters, worldBuilding, beats, brainstorm,
    lastWorkspace,
    setActiveWorkspace,
    setShowExport, setShowSettings,
  } = useStore()

  const lastModified = useMemo(() => {
    if (!currentDocument?.updated_at) return null
    const d = new Date(currentDocument.updated_at)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 2) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }, [currentDocument?.updated_at])

  const stats = useMemo(() => ({
    pages: currentDocument?.page_count || 0,
    words: currentDocument?.word_count || 0,
    characters: characters?.length || 0,
    beats: beats?.length || 0,
  }), [currentDocument, characters, beats])

  const resumeLabel = lastWorkspace && lastWorkspace !== 'dashboard'
    ? `Resume ${workspaceLabel(lastWorkspace)}`
    : 'Open Screenplay'

  function workspaceLabel(ws) {
    const labels = {
      editor: 'Screenplay Editor', beatsheet: 'Beat Sheet', storybible: 'Story Bible',
      brainstorm: 'Brainstorm', cameralibrary: 'Camera Library', readthrough: 'Read-Through',
      development: 'Development', dashboard: 'Dashboard',
    }
    return labels[ws] || ws
  }

  return (
    <div className="dashboard-container">
      {/* Project Hero */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-inner">
          <div className="dashboard-project-meta">
            <span className="tag tag-amber" style={{ fontSize: 11 }}>
              {currentProject?.format === 'pilot' ? 'TV Pilot' : 'Feature Film'}
            </span>
            {currentProject?.genre && (
              <span className="tag tag-muted" style={{ fontSize: 11 }}>{currentProject.genre}</span>
            )}
          </div>
          <h1 className="dashboard-title">{currentProject?.title || 'Untitled Project'}</h1>
          {currentProject?.logline && (
            <p className="dashboard-logline">{currentProject.logline}</p>
          )}
          <div className="dashboard-stats">
            <div className="dashboard-stat">
              <span className="dashboard-stat-value">{stats.pages}</span>
              <span className="dashboard-stat-label">Pages</span>
            </div>
            <div className="dashboard-stat-divider" />
            <div className="dashboard-stat">
              <span className="dashboard-stat-value">{stats.words > 0 ? stats.words.toLocaleString() : '—'}</span>
              <span className="dashboard-stat-label">Words</span>
            </div>
            <div className="dashboard-stat-divider" />
            <div className="dashboard-stat">
              <span className="dashboard-stat-value">{stats.characters}</span>
              <span className="dashboard-stat-label">Characters</span>
            </div>
            <div className="dashboard-stat-divider" />
            <div className="dashboard-stat">
              <span className="dashboard-stat-value">{stats.beats}</span>
              <span className="dashboard-stat-label">Beats</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Resume */}
      <div className="dashboard-resume-bar">
        <div className="dashboard-resume-info">
          {currentDocument && (
            <>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                Last worked on:
              </span>
              <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>
                {currentDocument.title || 'Untitled Script'}
              </span>
              {lastModified && (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{lastModified}</span>
              )}
            </>
          )}
        </div>
        <button
          className="btn btn-primary no-drag"
          onClick={() => setActiveWorkspace('editor')}
          style={{ gap: 8 }}
        >
          <span>✏</span>
          <span>{resumeLabel}</span>
        </button>
      </div>

      {/* Workspace Grid */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Workspaces</h2>
        <div className="workspace-grid">
          <WorkspaceCard
            icon="✏"
            label="Screenplay Editor"
            description="Write and edit your script"
            onClick={() => setActiveWorkspace('editor')}
            accent="var(--amber)"
          />
          <WorkspaceCard
            icon="📊"
            label="Beat Sheet"
            description={`${stats.beats} beats planned`}
            onClick={() => setActiveWorkspace('beatsheet')}
            accent="var(--blue)"
          />
          <WorkspaceCard
            icon="📚"
            label="Story Bible"
            description={`${stats.characters} characters`}
            onClick={() => setActiveWorkspace('storybible')}
            accent="#B07AC8"
          />
          <WorkspaceCard
            icon="💡"
            label="Brainstorm"
            description="Ideas and notes canvas"
            onClick={() => setActiveWorkspace('brainstorm')}
            accent="var(--green)"
          />
          <WorkspaceCard
            icon="🎥"
            label="Camera Library"
            description="Shot types and setups"
            onClick={() => setActiveWorkspace('cameralibrary')}
            accent="#4B9EC8"
          />
          <WorkspaceCard
            icon="👁"
            label="Read-Through"
            description="Distraction-free reading"
            onClick={() => setActiveWorkspace('readthrough')}
            accent="var(--amber)"
          />
          <WorkspaceCard
            icon="↗"
            label="Export"
            description="PDF, FDX, and more"
            onClick={() => setShowExport(true)}
            accent="var(--green)"
          />
          <WorkspaceCard
            icon="⚙"
            label="Settings"
            description="Preferences and API"
            onClick={() => setShowSettings(true)}
            accent="var(--text-muted)"
          />
        </div>
      </div>

      {/* Next Actions */}
      {(stats.pages === 0 && stats.beats === 0 && stats.characters === 0) && (
        <div className="dashboard-section">
          <h2 className="dashboard-section-title">Suggested Next Steps</h2>
          <div className="dashboard-suggestions">
            {stats.pages === 0 && (
              <div className="dashboard-suggestion" onClick={() => setActiveWorkspace('editor')}>
                <span className="dashboard-suggestion-icon">✏</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>Start writing your first scene</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Open the screenplay editor to begin</div>
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>→</span>
              </div>
            )}
            {stats.beats === 0 && (
              <div className="dashboard-suggestion" onClick={() => setActiveWorkspace('beatsheet')}>
                <span className="dashboard-suggestion-icon">📊</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>Plan your story beats</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Map out act structure in the beat sheet</div>
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>→</span>
              </div>
            )}
            {stats.characters === 0 && (
              <div className="dashboard-suggestion" onClick={() => setActiveWorkspace('storybible')}>
                <span className="dashboard-suggestion-icon">📚</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>Define your characters</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Build your story bible with character profiles</div>
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>→</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

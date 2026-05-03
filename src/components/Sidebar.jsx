import React from 'react'
import useStore from '../store'

const Icon = ({ name }) => {
  const icons = {
    home: '⌂', write: '✏', brain: '💡', dev: '🎬', beats: '📊',
    bible: '📚', chat: '💬', research: '🔍', camera: '🎥',
    export: '↗', backup: '💾', settings: '⚙', panic: '⚡',
    back: '←', eye: '👁', snapshot: '📸'
  }
  return <span style={{ fontSize: 14 }}>{icons[name] || '•'}</span>
}

export default function Sidebar({ onPanic }) {
  const {
    currentProject, setCurrentProject, setDocuments,
    showChat, showBible, showDevelopment,
    toggleChat, toggleBible,
    setShowBrainstorm, setShowDevelopment, setShowBeatSheet,
    setShowExport, setShowSettings, setShowSnapshots,
    setShowCameraLibrary, setShowAnalysis, setShowDialogueCoach,
    layoutMode, setLayoutMode, toggleReadThrough, showReadThrough
  } = useStore()

  function handleBackToProjects() {
    setCurrentProject(null)
    setDocuments([])
  }

  const NavItem = ({ icon, label, onClick, active, danger }) => (
    <div
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      style={danger ? { color: 'var(--red)' } : {}}
    >
      <Icon name={icon} />
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  )

  return (
    <div className="panel" style={{ gridArea: 'sidebar', background: 'var(--bg-surface)' }}>
      {/* Drag region + Logo */}
      <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Slugline</div>
        {currentProject && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentProject.title}
          </div>
        )}
      </div>

      <div style={{ padding: '8px 8px', flex: 1, overflowY: 'auto' }}>
        {/* Project */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 4px', marginBottom: 4 }}>Project</div>
          <NavItem icon="back" label="All Projects" onClick={handleBackToProjects} />
          <NavItem icon="dev" label="Development" onClick={() => setShowDevelopment(true)} />
          <NavItem icon="brain" label="Brainstorm" onClick={() => setShowBrainstorm(true)} />
          <NavItem icon="beats" label="Beat Sheet" onClick={() => setShowBeatSheet(true)} />
        </div>

        {/* Write */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 4px', marginBottom: 4 }}>Write</div>
          <NavItem icon="write" label="Script Editor" onClick={() => { setLayoutMode('default') }} active={!showReadThrough} />
          <NavItem icon="eye" label="Read-Through" onClick={toggleReadThrough} active={showReadThrough} />
          <NavItem icon="camera" label="Camera Library" onClick={() => setShowCameraLibrary(true)} />
        </div>

        {/* Claude */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 4px', marginBottom: 4 }}>Claude</div>
          <NavItem icon="chat" label="Chat" onClick={toggleChat} active={showChat} />
          <NavItem icon="bible" label="Story Bible" onClick={toggleBible} active={showBible} />
          <NavItem icon="research" label="Scene Analysis" onClick={() => setShowAnalysis(true)} />
          <NavItem icon="write" label="Dialogue Coach" onClick={() => setShowDialogueCoach(true)} />
        </div>

        {/* Data */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 4px', marginBottom: 4 }}>Data</div>
          <NavItem icon="export" label="Export…" onClick={() => setShowExport(true)} />
          <NavItem icon="snapshot" label="Snapshots" onClick={() => setShowSnapshots(true)} />
          <NavItem icon="backup" label="Manual Backup" onClick={async () => {
            const r = await window.api.manualBackup(currentProject?.id)
            useStore.getState().addNotification(r.success ? '✓ Backup saved' : `Backup failed: ${r.error}`, r.success ? 'success' : 'error')
          }} />
          <NavItem icon="settings" label="Settings" onClick={() => setShowSettings(true)} />
        </div>
      </div>

      {/* Panic export */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border-subtle)' }}>
        <div
          onClick={onPanic}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(200,75,75,0.08)',
            border: '1px solid rgba(200,75,75,0.2)',
            cursor: 'pointer', color: 'var(--red)', fontSize: 12, fontWeight: 500
          }}
        >
          <span>⚡</span>
          <span>Panic Export</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>⌘⇧P</span>
        </div>
      </div>
    </div>
  )
}

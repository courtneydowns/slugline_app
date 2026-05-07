import React from 'react'
import useStore from '../store'

const NAV_ITEMS = [
  { id: 'dashboard', icon: '⌂', label: 'Dashboard' },
  { id: 'editor', icon: '✏', label: 'Screenplay' },
  { id: 'documents', icon: '▤', label: 'Documents' },
  { id: 'beatsheet', icon: '📊', label: 'Beat Sheet' },
  { id: 'storybible', icon: '📚', label: 'Story Bible' },
  { id: 'brainstorm', icon: '💡', label: 'Brainstorm' },
  { id: 'cards', icon: '▦', label: 'Scene Cards' },
  { id: 'cameralibrary', icon: '🎥', label: 'Camera Library' },
  { id: 'readthrough', icon: '👁', label: 'Read-Through' },
]

const SECONDARY_ITEMS = [
  { id: 'development', icon: '🎬', label: 'Development' },
]

export default function NavRail() {
  const {
    activeWorkspace, setActiveWorkspace,
    navRailOpen,
    setShowExport, setShowSettings, setShowSnapshots, setShowRevision,
    setCurrentProject, setDocuments,
  } = useStore()

  function goBack() {
    setCurrentProject(null)
    setDocuments([])
  }

  const expanded = navRailOpen

  return (
    <div className={`nav-rail ${expanded ? 'nav-rail--expanded' : 'nav-rail--compact'}`}>
      {/* Primary nav */}
      <div className="nav-rail-section">
        {NAV_ITEMS.map(item => (
          <NavRailItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeWorkspace === item.id}
            expanded={expanded}
            onClick={() => setActiveWorkspace(item.id)}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="nav-rail-divider" />

      {/* Secondary */}
      <div className="nav-rail-section">
        <NavRailItem
          icon="↗"
          label="Export"
          expanded={expanded}
          onClick={() => setShowExport(true)}
        />
        <NavRailItem
          icon="📸"
          label="Snapshots"
          expanded={expanded}
          onClick={() => setShowSnapshots(true)}
        />
        <NavRailItem
          icon="🎨"
          label="Revisions"
          expanded={expanded}
          onClick={() => setShowRevision(true)}
        />
        <NavRailItem
          icon="⚙"
          label="Settings"
          expanded={expanded}
          onClick={() => setShowSettings(true)}
        />
      </div>

      {/* Divider */}
      <div className="nav-rail-divider" />

      {/* Bottom: advanced + back */}
      <div className="nav-rail-section nav-rail-bottom">
        <NavRailItem
          icon="🎬"
          label="Development"
          expanded={expanded}
          onClick={() => setActiveWorkspace('development')}
          muted
        />
        <NavRailItem
          icon="←"
          label="All Projects"
          expanded={expanded}
          onClick={goBack}
          muted
        />
      </div>


    </div>
  )
}

function NavRailItem({ icon, label, active, expanded, onClick, muted }) {
  return (
    <div
      className={`nav-rail-item ${active ? 'nav-rail-item--active' : ''} ${muted ? 'nav-rail-item--muted' : ''}`}
      onClick={onClick}
      title={!expanded ? label : undefined}
    >
      <span className="nav-rail-item-icon">{icon}</span>
      {expanded && <span className="nav-rail-item-label">{label}</span>}
    </div>
  )
}

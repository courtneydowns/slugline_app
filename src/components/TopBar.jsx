import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store'

const WORKSPACE_LABELS = {
  dashboard: 'Dashboard',
  editor: 'Screenplay Editor',
  beatsheet: 'Beat Sheet',
  storybible: 'Story Bible',
  brainstorm: 'Brainstorm',
  cameralibrary: 'Camera Library',
  readthrough: 'Read-Through',
  development: 'Development',
}

const WORKSPACE_ICONS = {
  dashboard: '⌂',
  editor: '✏',
  beatsheet: '📊',
  storybible: '📚',
  brainstorm: '💡',
  cameralibrary: '🎥',
  readthrough: '👁',
  development: '🎬',
}

export default function TopBar({ onPanic }) {
  const {
    currentProject, currentDocument,
    activeWorkspace, setActiveWorkspace,
    navRailOpen, toggleNavRail,
    showChat, toggleChat,
    setShowExport, setShowSettings, setShowSnapshots,
    setCurrentProject, setDocuments,
    theme, setTheme,
  } = useStore()

  const [saveIndicator, setSaveIndicator] = useState('saved')
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const commandRef = useRef(null)
  const inputRef = useRef(null)
  const saveResetTimer = useRef(null)

  // Listen for autosave events from the editor
  useEffect(() => {
    const handler = (e) => {
      if (saveResetTimer.current) clearTimeout(saveResetTimer.current)

      if (e.detail === 'saving') {
        setSaveIndicator('saving')
        saveResetTimer.current = setTimeout(() => {
          setSaveIndicator('saved')
        }, 2600)
      }

      if (e.detail === 'saved') {
        saveResetTimer.current = setTimeout(() => {
          setSaveIndicator('saved')
        }, 700)
      }
    }
    window.addEventListener('slugline:save', handler)
    return () => window.removeEventListener('slugline:save', handler)
  }, [])

  // ⌘K to open command palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandOpen(v => !v)
      }
      if (e.key === 'Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (commandOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandOpen])

  // Close on outside click
  useEffect(() => {
    if (!commandOpen) return
    const handler = (e) => {
      if (commandRef.current && !commandRef.current.contains(e.target)) {
        setCommandOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [commandOpen])

  const allCommands = [
    { id: 'dashboard', label: 'Go to Dashboard', icon: '⌂', action: () => setActiveWorkspace('dashboard') },
    { id: 'editor', label: 'Open Screenplay Editor', icon: '✏', action: () => setActiveWorkspace('editor') },
    { id: 'beatsheet', label: 'Open Beat Sheet', icon: '📊', action: () => setActiveWorkspace('beatsheet') },
    { id: 'storybible', label: 'Open Story Bible', icon: '📚', action: () => setActiveWorkspace('storybible') },
    { id: 'brainstorm', label: 'Open Brainstorm', icon: '💡', action: () => setActiveWorkspace('brainstorm') },
    { id: 'cameralibrary', label: 'Open Camera Library', icon: '🎥', action: () => setActiveWorkspace('cameralibrary') },
    { id: 'readthrough', label: 'Start Read-Through', icon: '👁', action: () => setActiveWorkspace('readthrough') },
    { id: 'export', label: 'Export…', icon: '↗', action: () => setShowExport(true) },
    { id: 'settings', label: 'Settings', icon: '⚙', action: () => setShowSettings(true) },
    { id: 'snapshots', label: 'Snapshots', icon: '📸', action: () => setShowSnapshots(true) },
    { id: 'panic', label: 'Panic Export', icon: '⚡', action: onPanic },
    { id: 'theme', label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode', icon: '◑', action: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'projects', label: 'Back to All Projects', icon: '←', action: () => { setCurrentProject(null); setDocuments([]) } },
  ]

  const filteredCommands = commandQuery
    ? allCommands.filter(c => c.label.toLowerCase().includes(commandQuery.toLowerCase()))
    : allCommands

  function runCommand(cmd) {
    cmd.action()
    setCommandOpen(false)
    setCommandQuery('')
  }

  const isInDashboard = activeWorkspace === 'dashboard'

  return (
    <>
      <div className="topbar drag-region">
        {/* Left: hamburger + logo + back */}
        <div className="topbar-left no-drag">
          <button
            className="topbar-icon-btn"
            onClick={toggleNavRail}
            title="Toggle navigation"
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>☰</span>
          </button>

          <div className="topbar-brand">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--amber)', letterSpacing: '-0.01em' }}>
              Slugline
            </span>
          </div>

          {currentProject && (
            <>
              <span style={{ color: 'var(--border)', fontSize: 14 }}>/</span>
              <span
                className={`topbar-project-name ${isInDashboard ? 'topbar-project-name--active' : 'topbar-project-name--link'}`}
                onClick={!isInDashboard ? () => setActiveWorkspace('dashboard') : undefined}
                title={!isInDashboard ? 'Back to Dashboard' : undefined}
              >
                {currentProject.title}
              </span>

              {!isInDashboard && (
                <>
                  <span style={{ color: 'var(--border)', fontSize: 14 }}>/</span>
                  <span className="topbar-workspace-name">
                    {WORKSPACE_ICONS[activeWorkspace]} {WORKSPACE_LABELS[activeWorkspace] || activeWorkspace}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* Center: breadcrumb home button when not on dashboard */}
        <div className="topbar-center">
          {!isInDashboard && (
            <button
              className="topbar-home-btn no-drag"
              onClick={() => setActiveWorkspace('dashboard')}
              title="Dashboard"
            >
              <span>⌂</span>
              <span>Dashboard</span>
            </button>
          )}
        </div>

        {/* Right: save indicator + command palette + theme */}
        <div className="topbar-right no-drag">
          <div className={`save-indicator save-indicator--${saveIndicator}`}>
            {saveIndicator === 'saving' ? (
              <><span className="save-dot saving" />Saving…</>
            ) : (
              <><span className="save-dot saved" />Saved</>
            )}
          </div>

          <button
              className="topbar-cmd-btn"
              onClick={toggleChat}
              title={showChat ? "Hide Claude Chat" : "Show Claude Chat"}
            >
              <span style={{ opacity: 0.65, fontSize: 12 }}>💬</span>
              <span>{showChat ? "Hide Chat" : "Show Chat"}</span>
          </button>

          <button
            className="topbar-cmd-btn"
            onClick={() => setCommandOpen(true)}
            title="Command Palette (⌘K)"
          >
            <span style={{ opacity: 0.6, fontSize: 11 }}>⌘K</span>
            <span>Commands</span>
          </button>

          <button
            className="topbar-icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            <span style={{ fontSize: 13 }}>◑</span>
          </button>
        </div>
      </div>

      {/* Command Palette */}
      {commandOpen && (
        <div className="command-overlay" onClick={() => setCommandOpen(false)}>
          <div className="command-palette" ref={commandRef} onClick={e => e.stopPropagation()}>
            <div className="command-search">
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>⌘</span>
              <input
                ref={inputRef}
                className="command-input"
                placeholder="Search commands…"
                value={commandQuery}
                onChange={e => setCommandQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filteredCommands.length > 0) runCommand(filteredCommands[0])
                  if (e.key === 'Escape') setCommandOpen(false)
                }}
              />
            </div>
            <div className="command-list">
              {filteredCommands.map(cmd => (
                <div key={cmd.id} className="command-item" onClick={() => runCommand(cmd)}>
                  <span className="command-item-icon">{cmd.icon}</span>
                  <span className="command-item-label">{cmd.label}</span>
                </div>
              ))}
              {filteredCommands.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No commands found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

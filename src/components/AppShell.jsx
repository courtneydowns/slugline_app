import React, { useState, useEffect } from 'react'
import useStore from '../store'
import TopBar from './TopBar'
import NavRail from './NavRail'
import Dashboard from './Dashboard'
import ScreenplayEditor from './ScreenplayEditor'
import ChatPanel from './ChatPanel'
import StoryBible from './StoryBible'
import StatusBar from './StatusBar'
import DevelopmentMode from './DevelopmentMode'
import BrainstormCanvas from './BrainstormCanvas'
import BeatSheet from './BeatSheet'
import SceneAnalysis from './SceneAnalysis'
import DialogueCoach from './DialogueCoach'
import ExportModal from './ExportModal'
import SettingsModal from './SettingsModal'
import SnapshotModal from './SnapshotModal'
import CameraLibrary from './CameraLibrary'
import ReadThroughMode from './ReadThroughMode'
import TokenPreview from './TokenPreview'
import DocumentsWorkspace from './DocumentsWorkspace'

export default function AppShell() {
  const {
    activeWorkspace, setActiveWorkspace,
    showChat, showBible, layoutMode, setLayoutMode,
    showAnalysis, showDialogueCoach, showExport, showSettings,
    showSnapshots, navRailOpen,
    toggleChat, toggleBible,
    setShowAnalysis, setShowDialogueCoach, setShowExport,
    setShowSettings, setShowSnapshots,
    currentProject, addNotification,
  } = useStore()

  const [chatExpanded, setChatExpanded] = useState(false)

  useEffect(() => {
    const cleanups = [
      window.api.onMenu('menu:settings', () => setShowSettings(true)),
      window.api.onMenu('menu:export', () => setShowExport(true)),
      window.api.onMenu('menu:manual-backup', handleManualBackup),
      window.api.onMenu('menu:panic-export', handlePanicExport),
      window.api.onMenu('view:distraction-free', () => {
        setLayoutMode(layoutMode === 'focus' ? 'default' : 'focus')
      }),
      window.api.onMenu('view:toggle-chat', toggleChat),
      window.api.onMenu('view:toggle-bible', toggleBible),
      window.api.onMenu('view:readthrough', () => setActiveWorkspace('readthrough')),
      window.api.onMenu('menu:analyze-scene', () => setShowAnalysis(true)),
      window.api.onMenu('menu:dialogue-coach', () => setShowDialogueCoach(true)),
    ]
    return () => cleanups.forEach(c => c?.())
  }, [layoutMode])

  async function handlePanicExport() {
    if (!currentProject) return
    addNotification('\u26a1 Panic export started\u2026', 'warning')
    const result = await window.api.panicExport(currentProject.id)
    if (result.success) {
      addNotification(`\u2713 Panic export saved to ${result.exports[0]?.path || 'backup folder'}`, 'success')
    } else {
      addNotification(`Panic export failed: ${result.error}`, 'error')
    }
  }

  async function handleManualBackup() {
    if (!currentProject) return
    const result = await window.api.manualBackup(currentProject.id)
    if (result.success) {
      addNotification('\u2713 Backup saved', 'success')
    } else {
      addNotification(`Backup failed: ${result.error}`, 'error')
    }
  }

  async function handleChatPopOut() {
    if (!currentProject) return
    const sessionId = useStore.getState().currentChatSessionId
    if (!sessionId) {
      addNotification('No active chat session to pop out.', 'warning')
      return
    }
    try {
      await window.api.openChatPopout({ projectId: currentProject.id, sessionId })
    } catch (err) {
      addNotification('Could not open pop-out: ' + err.message, 'error')
    }
  }

  function renderWorkspace() {
    switch (activeWorkspace) {
      case 'dashboard':
        return <Dashboard />
      case 'editor':
        return (
          <div className="workspace-editor-layout">
            <div className="workspace-editor-main">
              <ScreenplayEditor onOpenDocuments={() => setActiveWorkspace('documents')} />
            </div>
            {showBible && layoutMode !== 'focus' && (
              <div className="workspace-side-panel">
                <StoryBible />
              </div>
            )}
          </div>
        )
      case 'documents':
        return (
          <div className="workspace-fullpage">
            <DocumentsWorkspace onClose={() => setActiveWorkspace('dashboard')} />
          </div>
        )
      case 'beatsheet':
        return (
          <div className="workspace-fullpage">
            <BeatSheet embedded onClose={() => setActiveWorkspace('dashboard')} />
          </div>
        )
      case 'storybible':
        return (
          <div className="workspace-fullpage">
            <StoryBible embedded onClose={() => setActiveWorkspace('dashboard')} />
          </div>
        )
      case 'brainstorm':
        return (
          <div className="workspace-fullpage">
            <BrainstormCanvas embedded onClose={() => setActiveWorkspace('dashboard')} />
          </div>
        )
      case 'cameralibrary':
        return (
          <div className="workspace-fullpage">
            <CameraLibrary embedded onClose={() => setActiveWorkspace('dashboard')} />
          </div>
        )
      case 'readthrough':
        return (
          <div className="workspace-fullpage">
            <ReadThroughMode onClose={() => setActiveWorkspace('editor')} />
          </div>
        )
      case 'development':
        return (
          <div className="workspace-fullpage">
            <DevelopmentMode embedded onClose={() => setActiveWorkspace('dashboard')} />
          </div>
        )
      default:
        return <Dashboard />
    }
  }

  const isFocus = layoutMode === 'focus'
  const chatPanelStyle = chatExpanded
    ? { width: '50%', minWidth: 320, maxWidth: '50%', flexShrink: 0 }
    : undefined

  return (
    <div className="app-shell-v2">
      {!isFocus && (
        <div className="topbar-slot">
          <TopBar onPanic={handlePanicExport} />
        </div>
      )}
      <div className="app-body">
        {!isFocus && (
          <div className={`nav-rail-slot ${navRailOpen ? 'nav-rail-slot--expanded' : 'nav-rail-slot--compact'}`}>
            <NavRail onPanic={handlePanicExport} />
          </div>
        )}
        <div className="app-content">
          {renderWorkspace()}
        </div>
        {!isFocus && showChat && (
          <div className="global-chat-panel" style={chatPanelStyle}>
            <ChatPanel
              expanded={chatExpanded}
              onToggleExpand={() => setChatExpanded(v => !v)}
              onPopOut={handleChatPopOut}
            />
          </div>
        )}
      </div>
      <div className="statusbar-slot">
        <StatusBar onPanic={handlePanicExport} />
      </div>
      {showAnalysis && <SceneAnalysis onClose={() => setShowAnalysis(false)} />}
      {showDialogueCoach && <DialogueCoach onClose={() => setShowDialogueCoach(false)} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showSnapshots && <SnapshotModal onClose={() => setShowSnapshots(false)} />}
      <TokenPreview />
    </div>
  )
}

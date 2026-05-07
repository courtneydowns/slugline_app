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
import RevisionModal from './RevisionModal'
import CameraLibrary from './CameraLibrary'
import ReadThroughMode from './ReadThroughMode'
import TokenPreview from './TokenPreview'
import DocumentsWorkspace from './DocumentsWorkspace'
import SceneCards from './SceneCards'
import AnnotationPanel from './AnnotationPanel'

export default function AppShell() {
  const {
    activeWorkspace, setActiveWorkspace,
    showChat, showBible, layoutMode, setLayoutMode,
    showAnalysis, showDialogueCoach, showExport, showSettings,
    showSnapshots, showRevision, setShowRevision, navRailOpen,
    typewriterMode, setTypewriterMode,
    toggleChat, toggleBible,
    setShowAnalysis, setShowDialogueCoach, setShowExport,
    setShowSettings, setShowSnapshots,
    currentProject, currentDocument, addNotification,
    annotations, annotationPanelOpen, toggleAnnotationPanel,
    loadAnnotations, setAnnotationJumpAnchor,
  } = useStore()

  const [chatExpanded, setChatExpanded] = useState(false)
  const [focusBarVisible, setFocusBarVisible] = useState(false)

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

  useEffect(() => {
    if (layoutMode !== 'focus') return
    const handler = (e) => { if (e.key === 'Escape') setTypewriterMode(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [layoutMode])

  React.useEffect(() => {
    if (currentDocument?.id) loadAnnotations(currentDocument.id)
  }, [currentDocument?.id])

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
      case 'editor': {
        const openCount = (annotations || []).filter(a => !a.resolved).length
        return (
          <div className="workspace-editor-layout" style={{ position: 'relative' }}>
            <div className="workspace-editor-main">
              <ScreenplayEditor onOpenDocuments={() => setActiveWorkspace('documents')} />
            </div>
            {showBible && layoutMode !== 'focus' && (
              <div className="workspace-side-panel">
                <StoryBible />
              </div>
            )}
            {annotationPanelOpen && layoutMode !== 'focus' && (
              <AnnotationPanel onJumpToBlock={(text) => setAnnotationJumpAnchor(text)} />
            )}
            {layoutMode !== 'focus' && (
              <button
                onClick={toggleAnnotationPanel}
                title="Toggle Comments Panel"
                style={{
                  position: 'absolute', bottom: 12,
                  right: annotationPanelOpen ? 292 : 12,
                  zIndex: 10,
                  background: annotationPanelOpen ? 'var(--amber)' : 'var(--bg-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  color: annotationPanelOpen ? '#000' : 'var(--text-muted)',
                  fontSize: 11, padding: '5px 12px',
                  cursor: 'pointer', fontFamily: 'var(--font-ui)',
                  transition: 'right 0.2s',
                }}
              >
                {'◉'}{openCount > 0 ? ' ' + openCount : ''} Comments
              </button>
            )}
          </div>
        )
      }
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
      case 'cards':
        return (
          <div className="workspace-fullpage">
            <SceneCards embedded onClose={() => setActiveWorkspace('dashboard')} />
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
      {isFocus && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 40, zIndex: 9999, pointerEvents: 'auto' }}
          onMouseEnter={() => setFocusBarVisible(true)}
          onMouseLeave={() => setFocusBarVisible(false)}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 40,
            background: 'var(--bg-base)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px',
            opacity: focusBarVisible ? 1 : 0,
            pointerEvents: focusBarVisible ? 'auto' : 'none',
            transition: 'opacity 0.15s ease',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--amber)', letterSpacing: '-0.01em' }}>Slugline</span>
            <button
              onClick={() => setTypewriterMode(false)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', fontSize: 12, padding: '3px 14px', cursor: 'pointer' }}
            >
              Exit Distraction-Free &nbsp;<kbd style={{ opacity: 0.55, fontFamily: 'inherit', fontSize: 11 }}>Esc</kbd>
            </button>
          </div>
        </div>
      )}
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
      {!isFocus && (
        <div className="statusbar-slot">
          <StatusBar onPanic={handlePanicExport} />
        </div>
      )}
      {showAnalysis && <SceneAnalysis onClose={() => setShowAnalysis(false)} />}
      {showDialogueCoach && <DialogueCoach onClose={() => setShowDialogueCoach(false)} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showSnapshots && <SnapshotModal onClose={() => setShowSnapshots(false)} />}
      {showRevision && <RevisionModal onClose={() => setShowRevision(false)} />}
      <TokenPreview />
    </div>
  )
}

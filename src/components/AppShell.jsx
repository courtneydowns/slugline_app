import React, { useEffect } from 'react'
import useStore from '../store'
import Sidebar from './Sidebar'
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

export default function AppShell() {
  const {
    showChat, showBible, layoutMode, setLayoutMode,
    showBrainstorm, showDevelopment, showBeatSheet,
    showAnalysis, showDialogueCoach, showExport, showSettings,
    showSnapshots, showCameraLibrary, showReadThrough,
    toggleChat, toggleBible, toggleReadThrough,
    setShowBrainstorm, setShowDevelopment, setShowBeatSheet,
    setShowAnalysis, setShowDialogueCoach, setShowExport,
    setShowSettings, setShowSnapshots, setShowCameraLibrary,
    currentProject, addNotification
  } = useStore()

  // Register menu events
  useEffect(() => {
    const cleanups = [
      window.api.onMenu('menu:settings', () => setShowSettings(true)),
      window.api.onMenu('menu:export', () => setShowExport(true)),
      window.api.onMenu('menu:manual-backup', handleManualBackup),
      window.api.onMenu('menu:panic-export', handlePanicExport),
      window.api.onMenu('view:distraction-free', () => setLayoutMode(layoutMode === 'focus' ? 'default' : 'focus')),
      window.api.onMenu('view:toggle-chat', toggleChat),
      window.api.onMenu('view:toggle-bible', toggleBible),
      window.api.onMenu('view:readthrough', toggleReadThrough),
      window.api.onMenu('menu:analyze-scene', () => setShowAnalysis(true)),
      window.api.onMenu('menu:dialogue-coach', () => setShowDialogueCoach(true)),
    ]
    return () => cleanups.forEach(c => c?.())
  }, [layoutMode])

  async function handlePanicExport() {
    if (!currentProject) return
    addNotification('⚡ Panic export started…', 'warning')
    const result = await window.api.panicExport(currentProject.id)
    if (result.success) {
      addNotification(`✓ Panic export saved to ${result.exports[0]?.path || 'backup folder'}`, 'success')
    } else {
      addNotification(`Panic export failed: ${result.error}`, 'error')
    }
  }

  async function handleManualBackup() {
    if (!currentProject) return
    const result = await window.api.manualBackup(currentProject.id)
    if (result.success) {
      addNotification('✓ Backup saved', 'success')
    } else {
      addNotification(`Backup failed: ${result.error}`, 'error')
    }
  }

  // Compute layout class
  const getLayoutClass = () => {
    if (layoutMode === 'focus') return 'layout-focus'
    if (showChat) return 'layout-chat'
    if (showBible) return 'layout-bible'
    return 'layout-default'
  }

  // Fullscreen modal views
  if (showBrainstorm) return (
    <>
      <BrainstormCanvas onClose={() => setShowBrainstorm(false)} />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )

  if (showDevelopment) return (
    <>
      <DevelopmentMode onClose={() => setShowDevelopment(false)} />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )

  return (
    <div className={`app-shell ${getLayoutClass()}`}>
      {layoutMode !== 'focus' && <Sidebar onPanic={handlePanicExport} />}

      {/* Main editor area */}
      <div style={{ gridArea: 'main', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
        {showReadThrough ? (
          <ReadThroughMode onClose={toggleReadThrough} />
        ) : (
          <ScreenplayEditor />
        )}
      </div>

      {/* Right panel */}
      {showChat && !showBible && layoutMode !== 'focus' && (
        <div style={{ gridArea: 'chat', borderLeft: '1px solid var(--border-subtle)' }}>
          <ChatPanel />
        </div>
      )}
      {showBible && layoutMode !== 'focus' && (
        <div style={{ gridArea: 'bible', borderLeft: '1px solid var(--border-subtle)' }}>
          <StoryBible />
        </div>
      )}

      <StatusBar style={{ gridArea: 'statusbar' }} onPanic={handlePanicExport} />

      {/* Modals */}
      {showBeatSheet && <BeatSheet onClose={() => setShowBeatSheet(false)} />}
      {showAnalysis && <SceneAnalysis onClose={() => setShowAnalysis(false)} />}
      {showDialogueCoach && <DialogueCoach onClose={() => setShowDialogueCoach(false)} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showSnapshots && <SnapshotModal onClose={() => setShowSnapshots(false)} />}
      {showCameraLibrary && <CameraLibrary onClose={() => setShowCameraLibrary(false)} />}
      <TokenPreview />
    </div>
  )
}

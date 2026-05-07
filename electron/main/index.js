const { app, BrowserWindow, ipcMain, globalShortcut, Menu, dialog, shell, screen } = require('electron')
const path = require('path')
const { is } = require('@electron-toolkit/utils')
const { registerChatSessionHandlers } = require('./ipc-chat-sessions')

let mainWindow = null
let popoutWindow = null
let currentProjectId = null

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()

  mainWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    minWidth: 900,
    minHeight: 600,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f8f6f1',
    backgroundColor: '#0D0D0F',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.setBounds({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height
    })
    mainWindow.show()
    const prefs = config.getPreferences()
    if (prefs.launchFullscreen) {
      mainWindow.maximize()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu() {
  const template = [
    {
      label: 'Slugline',
      submenu: [
        { label: 'About Slugline', role: 'about' },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'Cmd+,', click: () => mainWindow.webContents.send('menu:settings') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'Cmd+N', click: () => mainWindow.webContents.send('menu:new-project') },
        { type: 'separator' },
        { label: 'Export…', accelerator: 'Cmd+E', click: () => mainWindow.webContents.send('menu:export') },
        { label: 'Manual Backup', accelerator: 'Cmd+Shift+S', click: () => mainWindow.webContents.send('menu:manual-backup') },
        { label: '⚠ Panic Export', accelerator: 'Cmd+Shift+P', click: () => mainWindow.webContents.send('menu:panic-export') }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'Cmd+F', click: () => mainWindow.webContents.send('menu:find') }
      ]
    },
    {
      label: 'Write',
      submenu: [
        { label: 'Scene Heading', accelerator: 'Cmd+1', click: () => mainWindow.webContents.send('editor:set-element', 'scene-heading') },
        { label: 'Action', accelerator: 'Cmd+2', click: () => mainWindow.webContents.send('editor:set-element', 'action') },
        { label: 'Character', accelerator: 'Cmd+3', click: () => mainWindow.webContents.send('editor:set-element', 'character') },
        { label: 'Dialogue', accelerator: 'Cmd+4', click: () => mainWindow.webContents.send('editor:set-element', 'dialogue') },
        { label: 'Parenthetical', accelerator: 'Cmd+5', click: () => mainWindow.webContents.send('editor:set-element', 'parenthetical') },
        { label: 'Transition', accelerator: 'Cmd+6', click: () => mainWindow.webContents.send('editor:set-element', 'transition') },
        { type: 'separator' },
        { label: 'Read Aloud Selection', click: () => mainWindow.webContents.send('editor:read-aloud') },
        { label: 'Analyze Scene', accelerator: 'Cmd+Shift+A', click: () => mainWindow.webContents.send('menu:analyze-scene') },
        { label: 'Dialogue Coach', accelerator: 'Cmd+Shift+D', click: () => mainWindow.webContents.send('menu:dialogue-coach') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Distraction-Free', accelerator: 'Cmd+Shift+F', click: () => mainWindow.webContents.send('view:distraction-free') },
        { label: 'Toggle Chat Panel', accelerator: 'Cmd+Shift+C', click: () => mainWindow.webContents.send('view:toggle-chat') },
        { label: 'Toggle Story Bible', accelerator: 'Cmd+Shift+B', click: () => mainWindow.webContents.send('view:toggle-bible') },
        { label: 'Read-Through Preview', accelerator: 'Cmd+Shift+R', click: () => mainWindow.webContents.send('view:readthrough') },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  createWindow()
  buildMenu()

  // Register panic export global shortcut as backup
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    mainWindow?.webContents.send('menu:panic-export')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// ─── Register all IPC handlers ────────────────────────────────────────────────

const db = require('./db')
const config = require('./config')
const claude = require('./ipc-claude')
const backup = require('./ipc-backup')
const exportHandler = require('./ipc-export')

// Config
ipcMain.handle('config:has-api-key', () => config.hasApiKey())
ipcMain.handle('config:get-preferences', () => config.getPreferences())
ipcMain.handle('config:set-preferences', (e, prefs) => config.setPreferences(prefs))

// Projects
ipcMain.handle('projects:get-all', () => db.getAllProjects())
ipcMain.handle('projects:get', (e, id) => db.getProject(id))
ipcMain.handle('projects:create', (e, data) => db.createProject(data))
ipcMain.handle('projects:update', (e, { id, data }) => db.updateProject(id, data))
ipcMain.handle('projects:delete', (e, id) => db.deleteProject(id))

// Documents
ipcMain.handle('documents:get-all', (e, projectId) => db.getDocuments(projectId))
ipcMain.handle('documents:get', (e, id) => db.getDocument(id))
ipcMain.handle('documents:create', (e, data) => db.createDocument(data))
ipcMain.handle('documents:update', (e, { id, data }) => db.updateDocument(id, data))
ipcMain.handle('documents:delete', (e, id) => db.deleteDocument(id))

// Characters
ipcMain.handle('characters:get-all', (e, projectId) => db.getCharacters(projectId))
ipcMain.handle('characters:upsert', (e, data) => db.upsertCharacter(data))
ipcMain.handle('characters:delete', (e, id) => db.deleteCharacter(id))

// World building
ipcMain.handle('world:get-all', (e, projectId) => db.getWorldBuilding(projectId))
ipcMain.handle('world:upsert', (e, data) => db.upsertWorldBuilding(data))
ipcMain.handle('world:delete', (e, id) => db.deleteWorldBuilding(id))

// Beat sheet
ipcMain.handle('beats:get', (e, projectId) => db.getBeatSheet(projectId))
ipcMain.handle('beats:upsert', (e, data) => db.upsertBeat(data))
ipcMain.handle('beats:init', (e, { projectId, format }) => db.initializeBeatSheet(projectId, format))

// Chat
ipcMain.handle('chat:get-history', (e, { projectId, context, sessionId }) => db.getChatHistory(projectId, context, sessionId))
ipcMain.handle('chat:clear', (e, { projectId, context, sessionId }) => db.clearChatHistory(projectId, context, sessionId))
registerChatSessionHandlers(ipcMain)

// Brainstorm
ipcMain.handle('scenes:get-for-document', (e, documentId) => db.getScenesForDocument(documentId))
ipcMain.handle('scenes:sync', (e, { documentId, projectId, scenes }) => db.syncScenes(documentId, projectId, scenes))

// Annotations
ipcMain.handle('annotations:get-all', (e, documentId) => db.getAnnotations(documentId))
ipcMain.handle('annotations:upsert', (e, data) => db.upsertAnnotation(data))
ipcMain.handle('annotations:delete', (e, id) => db.deleteAnnotation(id))
ipcMain.handle('annotations:resolve', (e, id) => db.resolveAnnotation(id))

ipcMain.handle('brainstorm:get-all', (e, projectId) => db.getBrainstormEntries(projectId))
ipcMain.handle('brainstorm:add', (e, data) => db.addBrainstormEntry(data))
ipcMain.handle('brainstorm:update', (e, { id, data }) => db.updateBrainstormEntry(id, data))
ipcMain.handle('brainstorm:delete', (e, id) => db.deleteBrainstormEntry(id))

// Research
ipcMain.handle('research:get-all', (e, projectId) => db.getResearch(projectId))
ipcMain.handle('research:delete', (e, id) => db.deleteResearch(id))

// Sessions
ipcMain.handle('sessions:get-today', (e, projectId) => db.getTodaySession(projectId))
ipcMain.handle('sessions:upsert', (e, { projectId, data }) => db.upsertSession(projectId, data))
ipcMain.handle('sessions:get-history', (e, projectId) => db.getSessionHistory(projectId))

// Tokens
ipcMain.handle('tokens:get-usage', (e, projectId) => db.getTokenUsage(projectId))

// Claude
ipcMain.handle('claude:validate-key', claude.handleValidateApiKey)
ipcMain.handle('claude:chat', claude.handleChat)
ipcMain.handle('claude:cancel-chat', claude.handleCancelChat)
ipcMain.handle('claude:summarize-session', claude.handleSummarizeSession)
ipcMain.handle('claude:inline-suggest', claude.handleInlineSuggestion)
ipcMain.handle('claude:full-rewrite', claude.handleFullRewrite)
ipcMain.handle('claude:tone-adjust', claude.handleToneAdjust)
ipcMain.handle('claude:scene-analysis', claude.handleSceneAnalysis)
ipcMain.handle('claude:dialogue-coach', claude.handleDialogueCoach)
ipcMain.handle('claude:development-question', claude.handleDevelopmentQuestion)
ipcMain.handle('claude:generate-story-bible', claude.handleGenerateStoryBible)
ipcMain.handle('claude:logline-assist', claude.handleLoglineAssist)
ipcMain.handle('claude:research-ingest', claude.handleResearchIngest)
ipcMain.handle('claude:auto-tag', claude.handleAutoTag)
ipcMain.handle('claude:writing-prompt', claude.handleWritingPrompt)
ipcMain.handle('claude:tv-vs-feature', claude.handleTvVsFeature)
ipcMain.handle('claude:beat-sheet-analysis', claude.handleBeatSheetAnalysis)
ipcMain.handle('claude:estimate-tokens', claude.handleEstimateTokens)

// Revisions
ipcMain.handle('revisions:get-all', (e, documentId) => db.getRevisions(documentId))
ipcMain.handle('revisions:create', (e, { documentId, draftColor }) => db.createRevision(documentId, draftColor))
ipcMain.handle('revisions:lock', async (e, { revisionId, sceneNumberMap, lockedContent, projectId }) => {
  try {
    const revision = db.lockRevision(revisionId, sceneNumberMap, lockedContent)
    db.createSnapshot(projectId, `Locked ${revision.draft_color} draft #${revision.draft_number}`, 'manual')
    return { success: true, revision }
  } catch (err) {
    console.error('[revisions:lock] ERROR:', err)
    return { success: false, error: err.message }
  }
})

// Backup
ipcMain.handle('backup:panic', backup.handlePanicExport)
ipcMain.handle('backup:manual', backup.handleManualBackup)
ipcMain.handle('backup:create-snapshot', backup.handleCreateSnapshot)
ipcMain.handle('backup:get-snapshots', backup.handleGetSnapshots)
ipcMain.handle('backup:restore', backup.handleRestoreSnapshot)

// Export / Import
ipcMain.handle('export:export', exportHandler.handleExport)
ipcMain.handle('export:import', exportHandler.handleImport)

// File dialog
ipcMain.handle('dialog:open-file', async (e, options) => {
  const result = await dialog.showOpenDialog(options || {})
  return result
})

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('shell:open-path', (e, p) => shell.openPath(p))

// Chat pop-out (display-only transcript window)
ipcMain.handle('chat:open-popout', (e, { projectId, sessionId }) => {
  if (popoutWindow && !popoutWindow.isDestroyed()) {
    popoutWindow.focus()
    return
  }
  popoutWindow = new BrowserWindow({
    width: 560,
    height: 780,
    minWidth: 400,
    minHeight: 500,
    title: 'Chat — Slugline',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0D0D0F',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    popoutWindow.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}?popout=1&projectId=${projectId}&sessionId=${sessionId}`
    )
  } else {
    popoutWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { popout: '1', projectId: String(projectId), sessionId: String(sessionId) }
    })
  }
  popoutWindow.once('ready-to-show', () => popoutWindow.show())
  popoutWindow.on('closed', () => { popoutWindow = null })
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Config
  hasApiKey: () => ipcRenderer.invoke('config:has-api-key'),
  getPreferences: () => ipcRenderer.invoke('config:get-preferences'),
  setPreferences: (prefs) => ipcRenderer.invoke('config:set-preferences', prefs),

  // Projects
  getAllProjects: () => ipcRenderer.invoke('projects:get-all'),
  getProject: (id) => ipcRenderer.invoke('projects:get', id),
  createProject: (data) => ipcRenderer.invoke('projects:create', data),
  updateProject: (id, data) => ipcRenderer.invoke('projects:update', { id, data }),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),

  // Documents
  getAllDocuments: (projectId) => ipcRenderer.invoke('documents:get-all', projectId),
  getDocument: (id) => ipcRenderer.invoke('documents:get', id),
  createDocument: (data) => ipcRenderer.invoke('documents:create', data),
  updateDocument: (id, data) => ipcRenderer.invoke('documents:update', { id, data }),
  deleteDocument: (id) => ipcRenderer.invoke('documents:delete', id),

  // Characters
  getCharacters: (projectId) => ipcRenderer.invoke('characters:get-all', projectId),
  upsertCharacter: (data) => ipcRenderer.invoke('characters:upsert', data),
  deleteCharacter: (id) => ipcRenderer.invoke('characters:delete', id),

  // World building
  getWorldBuilding: (projectId) => ipcRenderer.invoke('world:get-all', projectId),
  upsertWorldBuilding: (data) => ipcRenderer.invoke('world:upsert', data),
  deleteWorldBuilding: (id) => ipcRenderer.invoke('world:delete', id),

  // Beat sheet
  getBeats: (projectId) => ipcRenderer.invoke('beats:get', projectId),
  upsertBeat: (data) => ipcRenderer.invoke('beats:upsert', data),
  initBeats: (projectId, format) => ipcRenderer.invoke('beats:init', { projectId, format }),

  // Chat sessions
  getChatSessions: (projectId) => ipcRenderer.invoke('chat:get-sessions', { projectId }),
  createChatSession: (projectId, name) => ipcRenderer.invoke('chat:create-session', { projectId, name }),
  renameChatSession: (id, name) => ipcRenderer.invoke('chat:rename-session', { id, name }),
  deleteChatSession: (id) => ipcRenderer.invoke('chat:delete-session', { id }),

  // Chat
  getChatHistory: (projectId, context, sessionId) => ipcRenderer.invoke('chat:get-history', { projectId, context, sessionId }),
  clearChatHistory: (projectId, context, sessionId) => ipcRenderer.invoke('chat:clear', { projectId, context, sessionId }),

  // Brainstorm
  getBrainstormEntries: (projectId) => ipcRenderer.invoke('brainstorm:get-all', projectId),
  addBrainstormEntry: (data) => ipcRenderer.invoke('brainstorm:add', data),
  updateBrainstormEntry: (id, data) => ipcRenderer.invoke('brainstorm:update', { id, data }),
  deleteBrainstormEntry: (id) => ipcRenderer.invoke('brainstorm:delete', id),

  // Research
  getResearch: (projectId) => ipcRenderer.invoke('research:get-all', projectId),
  deleteResearch: (id) => ipcRenderer.invoke('research:delete', id),

  // Sessions
  getTodaySession: (projectId) => ipcRenderer.invoke('sessions:get-today', projectId),
  upsertSession: (projectId, data) => ipcRenderer.invoke('sessions:upsert', { projectId, data }),
  getSessionHistory: (projectId) => ipcRenderer.invoke('sessions:get-history', projectId),

  // Token usage
  getTokenUsage: (projectId) => ipcRenderer.invoke('tokens:get-usage', projectId),

  // Claude
  validateApiKey: (apiKey) => ipcRenderer.invoke('claude:validate-key', { apiKey }),
  claudeChat: (data) => ipcRenderer.invoke('claude:chat', data),
  claudeCancelChat: (data) => ipcRenderer.invoke('claude:cancel-chat', data),
  summarizeChatSession: (data) => ipcRenderer.invoke('claude:summarize-session', data),
  claudeInlineSuggest: (data) => ipcRenderer.invoke('claude:inline-suggest', data),
  claudeFullRewrite: (data) => ipcRenderer.invoke('claude:full-rewrite', data),
  claudeToneAdjust: (data) => ipcRenderer.invoke('claude:tone-adjust', data),
  claudeSceneAnalysis: (data) => ipcRenderer.invoke('claude:scene-analysis', data),
  claudeDialogueCoach: (data) => ipcRenderer.invoke('claude:dialogue-coach', data),
  claudeDevelopmentQuestion: (data) => ipcRenderer.invoke('claude:development-question', data),
  claudeGenerateStoryBible: (data) => ipcRenderer.invoke('claude:generate-story-bible', data),
  claudeLoglineAssist: (data) => ipcRenderer.invoke('claude:logline-assist', data),
  claudeResearchIngest: (data) => ipcRenderer.invoke('claude:research-ingest', data),
  claudeAutoTag: (data) => ipcRenderer.invoke('claude:auto-tag', data),
  claudeWritingPrompt: (data) => ipcRenderer.invoke('claude:writing-prompt', data),
  claudeTvVsFeature: (data) => ipcRenderer.invoke('claude:tv-vs-feature', data),
  claudeBeatSheetAnalysis: (data) => ipcRenderer.invoke('claude:beat-sheet-analysis', data),
  claudeEstimateTokens: (text) => ipcRenderer.invoke('claude:estimate-tokens', { text }),

  // Backup
  panicExport: (projectId) => ipcRenderer.invoke('backup:panic', { projectId }),
  manualBackup: (projectId) => ipcRenderer.invoke('backup:manual', { projectId }),
  createSnapshot: (projectId, label) => ipcRenderer.invoke('backup:create-snapshot', { projectId, label }),
  getSnapshots: (projectId) => ipcRenderer.invoke('backup:get-snapshots', { projectId }),
  restoreSnapshot: (snapshotId) => ipcRenderer.invoke('backup:restore', { snapshotId }),

  // Export / Import
  exportFile: (data) => ipcRenderer.invoke('export:export', data),
  importFile: (filePath) => ipcRenderer.invoke('export:import', { filePath }),

  // Dialogs
  openFileDialog: (options) => ipcRenderer.invoke('dialog:open-file', options),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  openPath: (p) => ipcRenderer.invoke('shell:open-path', p),

  // Menu events from main process
  onMenu: (channel, callback) => {
    const validChannels = [
      'menu:settings', 'menu:new-project', 'menu:export', 'menu:manual-backup',
      'menu:panic-export', 'menu:find', 'menu:analyze-scene', 'menu:dialogue-coach',
      'view:distraction-free', 'view:toggle-chat', 'view:toggle-bible', 'view:readthrough',
      'editor:set-element', 'editor:read-aloud', 'claude:stream-chunk'
    ]
    if (validChannels.includes(channel)) {
      const listener = (event, ...args) => callback(...args)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  }
})

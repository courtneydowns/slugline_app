import { create } from 'zustand'

const useStore = create((set, get) => ({
  // ─── App state ─────────────────────────────────────────────────────────────
  ready: false,
  hasApiKey: false,
  preferences: {},
  theme: 'dark',

  setReady: (ready) => set({ ready }),
  setHasApiKey: (v) => set({ hasApiKey: v }),
  setPreferences: (prefs) => set({ preferences: prefs, theme: prefs.theme || 'dark' }),
  setTheme: async (theme) => {
    set({ theme })
    const prefs = await window.api.setPreferences({ theme })
    set({ preferences: prefs })
  },

  // ─── Projects ──────────────────────────────────────────────────────────────
  projects: [],
  currentProject: null,
  currentDocument: null,
  documents: [],
  focusedScreenplayBlockId: null,
  focusedScreenplayBlockIndex: null,

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setCurrentDocument: (doc) => set({ currentDocument: doc }),
  setDocuments: (docs) => set({ documents: docs }),
  setFocusedScreenplayBlockId: (blockId) => set({ focusedScreenplayBlockId: blockId }),
  setFocusedScreenplayBlockIndex: (blockIndex) => set({ focusedScreenplayBlockIndex: blockIndex }),

  loadProjects: async () => {
    const projects = await window.api.getAllProjects()
    set({ projects })
    return projects
  },

  openProject: async (projectId) => {
    const project = await window.api.getProject(projectId)
    const docs    = await window.api.getAllDocuments(projectId)
    set({ currentProject: project, documents: docs, currentDocument: docs[0] || null })
    await get().loadProjectData(projectId)
    return project
  },

  // FIX: use Promise.allSettled so one failing call doesn't kill the rest
  loadProjectData: async (projectId) => {
    const [
      charactersResult,
      worldBuildingResult,
      beatsResult,
      researchResult,
      brainstormResult
    ] = await Promise.allSettled([
      window.api.getCharacters(projectId),
      window.api.getWorldBuilding(projectId),
      window.api.getBeats(projectId),
      window.api.getResearch(projectId),
      window.api.getBrainstormEntries(projectId)
    ])

    set({
      characters:    charactersResult.status    === 'fulfilled' ? charactersResult.value    : [],
      worldBuilding: worldBuildingResult.status === 'fulfilled' ? worldBuildingResult.value : [],
      beats:         beatsResult.status         === 'fulfilled' ? beatsResult.value         : [],
      research:      researchResult.status      === 'fulfilled' ? researchResult.value      : [],
      brainstorm:    brainstormResult.status    === 'fulfilled' ? brainstormResult.value    : []
    })

    // Load chat sessions then history for the first/active session
    try {
      const sessions = await window.api.getChatSessions(projectId)
      let sessionId = null
      let chatHistory = []
      if (sessions.length > 0) {
        sessionId = sessions[0].id
        chatHistory = await window.api.getChatHistory(projectId, 'chat', sessionId)
      }
      set({ chatSessions: sessions, currentChatSessionId: sessionId, chatHistory })
    } catch (e) {
      console.warn('loadProjectData: chat sessions failed:', e)
      set({ chatSessions: [], currentChatSessionId: null, chatHistory: [] })
    }

    // Log any failures for debugging
    const names = ['characters', 'worldBuilding', 'beats', 'research', 'brainstorm']
    ;[charactersResult, worldBuildingResult, beatsResult, researchResult, brainstormResult]
      .forEach((r, i) => { if (r.status === 'rejected') console.warn(`loadProjectData: ${names[i]} failed:`, r.reason) })
  },

  saveDocument: async (content) => {
    const { currentDocument } = get()
    if (!currentDocument) return
    const updated = await window.api.updateDocument(currentDocument.id, { content })
    set({ currentDocument: updated })
  },

  // ─── Story Bible ──────────────────────────────────────────────────────────
  characters: [],
  worldBuilding: [],
  beats: [],
  research: [],
  brainstorm: [],

  setCharacters:    (characters)    => set({ characters }),
  setWorldBuilding: (worldBuilding) => set({ worldBuilding }),
  setBeats:         (beats)         => set({ beats }),
  setResearch:      (research)      => set({ research }),
  setBrainstorm:    (brainstorm)    => set({ brainstorm }),

  // ─── Chat ─────────────────────────────────────────────────────────────────
  chatSessions: [],
  currentChatSessionId: null,
  chatHistory: [],
  chatLoading: false,
  streamingContent: '',

  setChatSessions:       (sessions) => set({ chatSessions: sessions }),
  setCurrentChatSessionId: (id)     => set({ currentChatSessionId: id }),
  setChatHistory:        (chatHistory) => set({ chatHistory }),
  setChatLoading:        (v)           => set({ chatLoading: v }),
  appendStreamChunk:     (chunk)       => set(s => ({ streamingContent: s.streamingContent + chunk })),
  clearStreamingContent: ()            => set({ streamingContent: '' }),

  // ─── UI Layout ─────────────────────────────────────────────────────────────
  layoutMode: 'default',
  showChat: false,
  showBible: false,
  showSceneNav: true,
  showReadThrough: false,
  showBrainstorm: false,
  showDevelopment: false,
  showBeatSheet: false,
  showAnalysis: false,
  showDialogueCoach: false,
  showExport: false,
  showSettings: false,
  showSnapshots: false,
  showCameraLibrary: false,
  activeModal: null,

  // ─── Workspace Navigation ──────────────────────────────────────────────────
  activeWorkspace: 'dashboard',
  lastWorkspace: null,
  navRailOpen: true,

  setActiveWorkspace: (ws) => set(s => ({ activeWorkspace: ws, lastWorkspace: s.activeWorkspace !== ws ? s.activeWorkspace : s.lastWorkspace })),
  setNavRailOpen: (v) => set({ navRailOpen: v }),
  toggleNavRail: () => set(s => ({ navRailOpen: !s.navRailOpen })),

  setLayoutMode:         (mode) => set({ layoutMode: mode }),
  toggleChat:            ()     => set(s => ({ showChat: !s.showChat })),
  toggleBible:           ()     => set(s => ({ showBible: !s.showBible })),
  toggleReadThrough:     ()     => set(s => ({ showReadThrough: !s.showReadThrough })),
  setShowBrainstorm:     (v)    => set({ showBrainstorm: v }),
  setShowDevelopment:    (v)    => set({ showDevelopment: v }),
  setShowBeatSheet:      (v)    => set({ showBeatSheet: v }),
  setShowAnalysis:       (v)    => set({ showAnalysis: v }),
  setShowDialogueCoach:  (v)    => set({ showDialogueCoach: v }),
  setShowExport:         (v)    => set({ showExport: v }),
  setShowSettings:       (v)    => set({ showSettings: v }),
  setShowSnapshots:      (v)    => set({ showSnapshots: v }),
  setShowCameraLibrary:  (v)    => set({ showCameraLibrary: v }),
  setActiveModal:        (modal)=> set({ activeModal: modal }),

  // ─── Writing session ───────────────────────────────────────────────────────
  sessionStart: null,
  sessionDuration: 0,
  sessionPages: 0,
  pageGoal: 5,

  startSession:   ()      => set({ sessionStart: Date.now(), sessionDuration: 0 }),
  tickSession:    ()      => set(s => ({ sessionDuration: s.sessionStart ? Math.floor((Date.now() - s.sessionStart) / 1000) : 0 })),
  setSessionPages:(pages) => set({ sessionPages: pages }),
  setPageGoal:    (goal)  => set({ pageGoal: goal }),

  // ─── Notifications ─────────────────────────────────────────────────────────
  notifications: [],
  addNotification: (msg, type = 'info') => {
    const id = Date.now()
    set(s => ({ notifications: [...s.notifications, { id, msg, type }] }))
    setTimeout(() => set(s => ({ notifications: s.notifications.filter(n => n.id !== id) })), 4000)
  },
  removeNotification: (id) => set(s => ({ notifications: s.notifications.filter(n => n.id !== id) })),

  // ─── Token meter ───────────────────────────────────────────────────────────
  pendingTokens: 0,
  setPendingTokens:  (n) => set({ pendingTokens: n }),
  totalTokensUsed: 0,
  setTotalTokensUsed:(n) => set({ totalTokensUsed: n }),

  // ─── Suggestions panel ────────────────────────────────────────────────────
  suggestions: [],
  setSuggestions:  (s)    => set({ suggestions: s }),
  clearSuggestions:()     => set({ suggestions: [] }),
  activeDiff: null,
  setActiveDiff:   (diff) => set({ activeDiff: diff }),
}))

export default useStore

const db = require('./db')

// Registers all chat-session IPC handlers.
// Call registerChatSessionHandlers(ipcMain) from electron/main/index.js
// during app setup, alongside the other handler registrations.

function registerChatSessionHandlers(ipcMain) {
  ipcMain.handle('chat:get-sessions', (event, { projectId }) => {
    return db.getChatSessions(projectId)
  })

  ipcMain.handle('chat:create-session', (event, { projectId, name }) => {
    return db.createChatSession(projectId, name)
  })

  ipcMain.handle('chat:rename-session', (event, { id, name }) => {
    return db.renameChatSession(id, name)
  })

  ipcMain.handle('chat:delete-session', (event, { id }) => {
    return db.deleteChatSession(id)
  })
}

module.exports = { registerChatSessionHandlers }

import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

export default function ChatPanel() {
  const {
    currentProject,
    currentDocument,
    chatHistory,
    setChatHistory,
    chatSessions,
    setChatSessions,
    currentChatSessionId,
    setCurrentChatSessionId,
    addNotification,
    setDocuments
  } = useStore()

  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [streaming, setStreaming] = useState('')
  const [renamingId, setRenamingId]   = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const bottomRef  = useRef()
  const inputRef   = useRef()
  const renameRef  = useRef()
  const activeStreamRef = useRef(null)
  const currentRequestIdRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, streaming])

  // Listen for stream chunks, but only append chunks for the request/session
  // that this ChatPanel launched. This prevents another chat tab/session from
  // visually overwriting the currently selected chat while a response streams.
  useEffect(() => {
    const cleanup = window.api.onMenu('claude:stream-chunk', ({ projectId, chatSessionId, requestId, chunk }) => {
      const active = activeStreamRef.current
      if (!active) return
      if (projectId !== active.projectId) return
      if (chatSessionId !== active.chatSessionId) return
      if (requestId && active.requestId && requestId !== active.requestId) return

      const state = useStore.getState()
      if (state.currentProject?.id !== active.projectId) return
      if (state.currentChatSessionId !== active.chatSessionId) return

      setStreaming(s => s + chunk)
    })
    return cleanup
  }, [])

  // When project changes, sessions are loaded by store.loadProjectData.
  // When currentChatSessionId changes due to a tab switch, reload history.
  const prevSessionRef = useRef(currentChatSessionId)
  useEffect(() => {
    if (!currentProject || currentChatSessionId === prevSessionRef.current) return
    prevSessionRef.current = currentChatSessionId
    if (currentChatSessionId) {
      window.api.getChatHistory(currentProject.id, 'chat', currentChatSessionId)
        .then(msgs => setChatHistory(msgs))
        .catch(() => setChatHistory([]))
    } else {
      setChatHistory([])
    }
  }, [currentChatSessionId, currentProject])

  // ── Session actions ───────────────────────────────────────────────────────

  async function handleNewChat() {
    if (!currentProject) return
    const session = await window.api.createChatSession(currentProject.id)
    const updated = await window.api.getChatSessions(currentProject.id)
    setChatSessions(updated)
    setCurrentChatSessionId(session.id)
    // history will be empty for new session — set it immediately
    setChatHistory([])
  }

  function handleSelectSession(id) {
    if (id === currentChatSessionId) return
    setStreaming('')
    setCurrentChatSessionId(id)
    // history reload handled by effect above
  }

  function startRename(session) {
    setRenamingId(session.id)
    setRenameValue(session.name)
    setTimeout(() => renameRef.current?.focus(), 50)
  }

  async function commitRename(id) {
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenamingId(null); return }
    await window.api.renameChatSession(id, trimmed)
    const updated = await window.api.getChatSessions(currentProject.id)
    setChatSessions(updated)
    setRenamingId(null)
  }

  async function handleDeleteSession(session, e) {
    e.stopPropagation()
    if (!currentProject || chatSessions.length <= 1) return
    if (!confirm(`Delete "${session.name}"? Its chat history will be permanently removed.`)) return

    await window.api.deleteChatSession(session.id)

    const updated = await window.api.getChatSessions(currentProject.id)
    setChatSessions(updated)

    if (session.id === currentChatSessionId) {
      const nextSession = updated[0] || null
      setCurrentChatSessionId(nextSession?.id || null)
      if (nextSession) {
        const msgs = await window.api.getChatHistory(currentProject.id, 'chat', nextSession.id)
        setChatHistory(msgs)
      } else {
        setChatHistory([])
      }
    }
  }

  async function handleClear() {
    if (!currentProject || !currentChatSessionId) return
    if (!confirm("Clear this chat\'s history?")) return
    await window.api.clearChatHistory(currentProject.id, 'chat', currentChatSessionId)
    setChatHistory([])
  }

  async function handleSaveChat() {
    if (!currentProject || !currentChatSessionId) return

    const messagesToSave = [
      ...chatHistory,
      ...(streaming ? [{ role: 'assistant', content: streaming }] : [])
    ]

    if (messagesToSave.length === 0) {
      addNotification('No chat messages to save.', 'warning')
      return
    }

    const session = chatSessions.find(s => s.id === currentChatSessionId)
    const sessionName = session?.name || `Chat ${currentChatSessionId}`
    const now = new Date()
    const centralParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(now).reduce((acc, part) => {
      acc[part.type] = part.value
      return acc
    }, {})
    const exportStamp = `${centralParts.year}-${centralParts.month}-${centralParts.day} ${centralParts.hour}-${centralParts.minute}`
    const timeStamp = new Intl.DateTimeFormat(undefined, {
      timeZone: 'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(now)
    const exportTitle = `Chat Export — ${sessionName} — ${exportStamp}`

    const transcript = [
      `# ${exportTitle}`,
      '',
      `Project: ${currentProject.title || currentProject.name || 'Untitled Project'}`,
      `Chat: ${sessionName}`,
      `Exported: ${timeStamp}`,
      '',
      '---',
      '',
      ...messagesToSave.map(msg => {
        const label = msg.role === 'user' ? 'User' : 'Assistant'
        return `## ${label}\n\n${msg.content || ''}`.trim()
      })
    ].join('\n\n')

    try {
      await window.api.createDocument({
        project_id: currentProject.id,
        title: exportTitle,
        content: transcript
      })

      const docs = await window.api.getAllDocuments(currentProject.id)
      setDocuments(docs)

      addNotification('Saved chat to Documents.', 'success')
    } catch (err) {
      addNotification('Could not save chat: ' + err.message, 'error')
    }
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || loading || !currentProject || !currentChatSessionId) return
    const message = input.trim()
    const sendProjectId = currentProject.id
    const sendSessionId = currentChatSessionId
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    setInput('')
    setLoading(true)
    setStreaming('')
    currentRequestIdRef.current = requestId
    activeStreamRef.current = {
      projectId: sendProjectId,
      chatSessionId: sendSessionId,
      requestId
    }

    const context = currentDocument?.content?.slice(-500) || ''

    try {
      await window.api.claudeChat({
        projectId:       sendProjectId,
        message,
        chatHistory:     chatHistory.slice(-10),
        documentContext: context,
        chatSessionId:   sendSessionId,
        requestId
      })

      // Only replace the visible history if the user is still looking at the
      // same chat session that launched this request.
      if (useStore.getState().currentChatSessionId === sendSessionId) {
        const updated = await window.api.getChatHistory(sendProjectId, 'chat', sendSessionId)
        setChatHistory(updated)
      }
    } catch (err) {
      addNotification('Chat error: ' + err.message, 'error')
    }
    activeStreamRef.current = null
    currentRequestIdRef.current = null
    setStreaming('')
    setLoading(false)
  }

  async function handleStopGeneration() {
    const active = activeStreamRef.current
    if (!active || !loading) return

    const state = useStore.getState()
    if (state.currentProject?.id !== active.projectId) return
    if (state.currentChatSessionId !== active.chatSessionId) return

    try {
      await window.api.claudeCancelChat(active)
    } catch (err) {
      addNotification('Could not stop chat: ' + err.message, 'error')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const allMessages = [
    ...chatHistory,
    ...(streaming ? [{ id: 'streaming', role: 'assistant', content: streaming }] : [])
  ]

  const noSession = !currentChatSessionId
  const hasMessagesToSave = !noSession && (chatHistory.length > 0 || !!streaming)
  const activeStream = activeStreamRef.current
  const canStopVisibleStream = loading &&
    activeStream &&
    activeStream.projectId === currentProject?.id &&
    activeStream.chatSessionId === currentChatSessionId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)' }}>

      {/* ── Session tab bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '48px 8px 0',
        borderBottom: '1px solid var(--border-subtle)',
        overflowX: 'auto',
        flexShrink: 0,
        scrollbarWidth: 'none'
      }}>
        {chatSessions.map(session => (
          <div
            key={session.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              flexShrink: 0,
              background: session.id === currentChatSessionId ? 'var(--bg-raised)' : 'transparent',
              borderBottom: session.id === currentChatSessionId ? '2px solid var(--amber)' : '2px solid transparent',
              color: session.id === currentChatSessionId ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'color 0.15s'
            }}
            onClick={() => handleSelectSession(session.id)}
          >
            {renamingId === session.id ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(session.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(session.id)
                  if (e.key === 'Escape') setRenamingId(null)
                  e.stopPropagation()
                }}
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-ui)',
                  background: 'var(--bg-input, var(--bg-base))',
                  border: '1px solid var(--amber)',
                  borderRadius: 3,
                  color: 'var(--text-primary)',
                  padding: '1px 4px',
                  width: 90,
                  outline: 'none'
                }}
              />
            ) : (
              <span
                style={{ fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onDoubleClick={e => { e.stopPropagation(); startRename(session) }}
                title={`${session.name} — double-click to rename`}
              >
                {session.name}
              </span>
            )}

            {chatSessions.length > 1 && (
              <button
                type="button"
                title={`Delete ${session.name}`}
                aria-label={`Delete ${session.name}`}
                onClick={e => handleDeleteSession(session, e)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 13,
                  lineHeight: 1,
                  padding: '0 2px'
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}

        {/* New chat button */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleNewChat}
          title="New chat"
          style={{
            fontSize: 16,
            lineHeight: 1,
            padding: '4px 8px',
            color: 'var(--text-muted)',
            flexShrink: 0,
            marginLeft: 2
          }}
        >
          +
        </button>
      </div>

      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px 10px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--amber)' }}>Claude Chat</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
            After stopping: “Continue exactly where you left off before I stopped generation. Do not restart, summarize, or repeat prior text.”
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sonnet</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleSaveChat}
            disabled={!hasMessagesToSave}
            style={{ fontSize: 11, opacity: hasMessagesToSave ? 1 : 0.4 }}
            title="Save this chat as a project document"
          >
            Save Chat
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleClear}
            disabled={noSession}
            style={{ fontSize: 11, opacity: noSession ? 0.4 : 1 }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {noSession ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13 }}>Press <strong>+</strong> to start a new chat.</div>
          </div>
        ) : allMessages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13 }}>Ask Claude anything about your screenplay.</div>
            <div style={{ fontSize: 12, marginTop: 6, fontStyle: 'italic', lineHeight: 1.5 }}>
              "What motivates my protagonist?" or "Help me fix the midpoint."
            </div>
          </div>
        ) : (
          allMessages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', gap: 8 }}>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: msg.role === 'user' ? 'var(--amber)' : 'var(--text-muted)',
                minWidth: 16, paddingTop: 2
              }}>
                {msg.role === 'user' ? 'You' : 'AI'}
              </div>
              <div style={{
                flex: 1,
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                background: msg.role === 'assistant' ? 'var(--bg-raised)' : 'transparent',
                padding: msg.role === 'assistant' ? '10px 12px' : '2px 0',
                borderRadius: 8,
                whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
                {msg.id === 'streaming' && <span style={{ animation: 'pulse 1s infinite', opacity: 0.5 }}>▌</span>}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
          <textarea
            ref={inputRef}
            className="input selectable"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={noSession ? 'Start a new chat first…' : 'Ask about your screenplay…'}
            rows={2}
            disabled={noSession}
            style={{ flex: 1, resize: 'none', fontSize: 13, opacity: noSession ? 0.5 : 1 }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) handleSend(e)
            }}
          />
          {canStopVisibleStream ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={handleStopGeneration}
              style={{ alignSelf: 'flex-end', fontSize: 12, color: 'var(--text-primary)' }}
              title="Stop this chat generation"
            >
              Stop
            </button>
          ) : (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || !input.trim() || noSession}
              style={{ alignSelf: 'flex-end', opacity: loading || !input.trim() || noSession ? 0.5 : 1 }}
              title={loading ? 'Another chat is currently generating' : 'Send'}
            >
              {loading ? '…' : '→'}
            </button>
          )}
        </form>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          Shift+Enter for new line • Double-click tab to rename
        </div>
      </div>
    </div>
  )
}

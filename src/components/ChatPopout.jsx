import React, { useState, useEffect, useRef } from 'react'

export default function ChatPopout({ projectId, sessionId }) {
  const [messages, setMessages] = useState([])
  const [sessionName, setSessionName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const bottomRef = useRef()

  useEffect(() => {
    if (projectId && sessionId) load()
  }, [projectId, sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [msgs, sessions] = await Promise.all([
        window.api.getChatHistory(projectId, 'chat', sessionId),
        window.api.getChatSessions(projectId)
      ])
      setMessages(msgs || [])
      const session = (sessions || []).find(s => String(s.id) === String(sessionId))
      setSessionName(session?.name || `Chat ${sessionId}`)
    } catch (err) {
      setError(err.message || 'Failed to load chat history.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'var(--bg-panel, #0D0D0F)',
      color: 'var(--text-primary, #e8e4d9)',
      fontFamily: 'var(--font-ui, system-ui, sans-serif)'
    }}>
      <div style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid var(--border-subtle, #2a2a2e)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, WebkitAppRegion: 'drag'
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display, serif)', fontSize: 15, color: 'var(--amber, #d4a84b)' }}>
            {sessionName || 'Chat Transcript'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #666)', marginTop: 2 }}>
            Read-only snapshot
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            WebkitAppRegion: 'no-drag', fontSize: 11, padding: '4px 10px',
            background: 'transparent', border: '1px solid var(--border-subtle, #2a2a2e)',
            borderRadius: 4, color: 'var(--text-muted, #666)',
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1
          }}
        >
          {loading ? 'Loading\u2026' : 'Refresh'}
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted, #666)', fontSize: 13 }}>{error}</div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted, #666)', fontSize: 13 }}>Loading\u2026</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted, #666)', fontSize: 13 }}>No messages in this session.</div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.id ?? i} style={{ display: 'flex', gap: 10 }}>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: msg.role === 'user' ? 'var(--amber, #d4a84b)' : 'var(--text-muted, #666)',
                minWidth: 18, paddingTop: 3, flexShrink: 0
              }}>
                {msg.role === 'user' ? 'You' : 'AI'}
              </div>
              <div style={{
                flex: 1, fontSize: 13, lineHeight: 1.65,
                color: 'var(--text-primary, #e8e4d9)',
                background: msg.role === 'assistant' ? 'var(--bg-raised, #18181c)' : 'transparent',
                padding: msg.role === 'assistant' ? '10px 14px' : '2px 0',
                borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
              }}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

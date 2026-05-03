import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

export default function ChatPanel() {
  const { currentProject, currentDocument, chatHistory, setChatHistory, addNotification } = useStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState('')
  const bottomRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, streaming])

  // Listen for stream chunks
  useEffect(() => {
    const cleanup = window.api.onMenu('claude:stream-chunk', ({ chunk }) => {
      setStreaming(s => s + chunk)
    })
    return cleanup
  }, [])

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || loading || !currentProject) return
    const message = input.trim()
    setInput('')
    setLoading(true)
    setStreaming('')

    const context = currentDocument?.content?.slice(-500) || ''

    try {
      await window.api.claudeChat({
        projectId: currentProject.id,
        message,
        chatHistory: chatHistory.slice(-10),
        documentContext: context
      })
      // Reload chat history
      const updated = await window.api.getChatHistory(currentProject.id, 'chat')
      setChatHistory(updated)
    } catch (err) {
      addNotification('Chat error: ' + err.message, 'error')
    }
    setStreaming('')
    setLoading(false)
  }

  async function handleClear() {
    if (!confirm('Clear this chat history?')) return
    await window.api.clearChatHistory(currentProject.id, 'chat')
    setChatHistory([])
  }

  const allMessages = [
    ...chatHistory,
    ...(streaming ? [{ id: 'streaming', role: 'assistant', content: streaming }] : [])
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 48 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--amber)' }}>Claude Chat</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sonnet</span>
          <button className="btn btn-ghost btn-sm" onClick={handleClear} style={{ fontSize: 11 }}>Clear</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {allMessages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13 }}>Ask Claude anything about your screenplay.</div>
            <div style={{ fontSize: 12, marginTop: 6, fontStyle: 'italic', lineHeight: 1.5 }}>
              "What motivates my protagonist?" or "Help me fix the midpoint."
            </div>
          </div>
        )}
        {allMessages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: 8 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: msg.role === 'user' ? 'var(--amber)' : 'var(--text-muted)',
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
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
          <textarea
            ref={inputRef}
            className="input selectable"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your screenplay…"
            rows={2}
            style={{ flex: 1, resize: 'none', fontSize: 13 }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) handleSend(e)
            }}
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !input.trim()}
            style={{ alignSelf: 'flex-end', opacity: loading || !input.trim() ? 0.5 : 1 }}
          >
            {loading ? '…' : '→'}
          </button>
        </form>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          Shift+Enter for new line • Chat history saved per project
        </div>
      </div>
    </div>
  )
}

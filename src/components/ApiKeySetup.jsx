import React, { useState } from 'react'
import useStore from '../store'

export default function ApiKeySetup() {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setHasApiKey } = useStore()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!key.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await window.api.validateApiKey(key.trim())
      if (result.valid) {
        setHasApiKey(true)
      } else {
        setError('Invalid API key. Check your key at console.anthropic.com and try again.')
      }
    } catch (err) {
      setError('Connection error. Make sure you have internet access.')
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-base)' }}>
      <div style={{ width: 480, padding: 48 }}>
        {/* Logo */}
        <div style={{ marginBottom: 48, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--amber)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Slugline
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            AI-powered screenplay writing
          </div>
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 8, color: 'var(--text-primary)' }}>
            Connect your Claude API key
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Slugline runs entirely on your computer. Your API key is encrypted and stored locally — never uploaded anywhere.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Anthropic API Key
              </label>
              <input
                className="input"
                type="password"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="sk-ant-..."
                autoFocus
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(200,75,75,0.1)', border: '1px solid var(--red)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || !key.trim()}
              style={{ width: '100%', justifyContent: 'center', opacity: loading || !key.trim() ? 0.5 : 1 }}
            >
              {loading ? 'Verifying…' : 'Connect'}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: 14, background: 'var(--bg-raised)', borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Where to get a key:</strong>
              {' '}Visit <span style={{ color: 'var(--amber)' }}>console.anthropic.com</span> → API Keys → Create Key.
              You'll be billed per token used. Slugline is designed to minimize token usage.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

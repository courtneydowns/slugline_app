import React from 'react'
import useStore from '../store'

// This is a lightweight component that shows in the bottom right
// when a Claude call is pending, showing estimated tokens
export default function TokenPreview() {
  const { pendingTokens } = useStore()
  if (!pendingTokens) return null

  const cost = ((pendingTokens / 1_000_000) * 3).toFixed(4) // Sonnet input rate

  return (
    <div style={{
      position: 'fixed',
      bottom: 48,
      right: 16,
      background: 'var(--bg-raised)',
      border: '1px solid var(--amber-dim)',
      borderRadius: 8,
      padding: '8px 14px',
      fontSize: 12,
      color: 'var(--text-secondary)',
      zIndex: 50
    }}>
      ~{pendingTokens.toLocaleString()} tokens ≈ ${cost}
    </div>
  )
}

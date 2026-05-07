import React, { useRef, useEffect, useState } from 'react'
import useStore from '../store'

export default function FindBar({ matches, currentMatchIndex, onNext, onPrev, onReplace, onReplaceAll }) {
  const { find, setFind, closeFind } = useStore()
  const queryRef = useRef(null)
  const [showReplace, setShowReplace] = useState(false)

  useEffect(() => {
    if (find.open) setTimeout(() => { queryRef.current?.focus(); queryRef.current?.select() }, 30)
  }, [find.open])

  if (!find.open) return null

  const count = matches.length
  const current = count > 0 ? currentMatchIndex + 1 : 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 16,
        zIndex: 100,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 300,
      }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeFind() } }}
    >
      {/* Find row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          ref={queryRef}
          value={find.query}
          onChange={e => setFind({ query: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? onPrev() : onNext() } }}
          placeholder="Find in screenplay…"
          style={{
            flex: 1,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 13,
            padding: '4px 8px',
            outline: 'none',
            fontFamily: 'var(--font-ui)',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 52, textAlign: 'center', flexShrink: 0 }}>
          {find.query.trim() ? (count === 0 ? 'No results' : `${current} / ${count}`) : ''}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onPrev} disabled={count === 0}
          title="Previous match (Shift+Enter)" style={{ padding: '0 7px', height: 26 }}>↑</button>
        <button className="btn btn-ghost btn-sm" onClick={onNext} disabled={count === 0}
          title="Next match (Enter)" style={{ padding: '0 7px', height: 26 }}>↓</button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowReplace(v => !v)}
          title="Toggle replace"
          style={{ padding: '0 7px', height: 26, color: showReplace ? 'var(--amber)' : undefined }}
        >⇄</button>
        <button className="btn btn-ghost btn-sm" onClick={closeFind}
          title="Close (Esc)" style={{ padding: '0 7px', height: 26 }}>×</button>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={find.matchCase} onChange={e => setFind({ matchCase: e.target.checked })} style={{ margin: 0 }} />
          Match case
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={find.wholeWord} onChange={e => setFind({ wholeWord: e.target.checked })} style={{ margin: 0 }} />
          Whole word
        </label>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            value={find.replaceQuery}
            onChange={e => setFind({ replaceQuery: e.target.value })}
            placeholder="Replace with…"
            style={{
              flex: 1,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: '4px 8px',
              outline: 'none',
              fontFamily: 'var(--font-ui)',
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={onReplace} disabled={count === 0}
            style={{ height: 26, whiteSpace: 'nowrap' }}>Replace</button>
          <button className="btn btn-ghost btn-sm" onClick={onReplaceAll} disabled={count === 0}
            style={{ height: 26, whiteSpace: 'nowrap' }}>All</button>
        </div>
      )}
    </div>
  )
}

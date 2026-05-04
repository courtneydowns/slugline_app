import React, { useRef, useState, useEffect, useCallback } from 'react'
import useStore from '../store'

const ELEMENT_TYPES = ['scene-heading', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'note']
const ELEMENT_LABELS = {
  'scene-heading': 'Scene Heading',
  'action': 'Action',
  'character': 'Character',
  'dialogue': 'Dialogue',
  'parenthetical': 'Parenthetical',
  'transition': 'Transition',
  'note': 'Note'
}

// Smart next element type after pressing Enter
function nextElementType(current, text) {
  if (current === 'scene-heading') return 'action'
  if (current === 'character') return 'dialogue'
  if (current === 'dialogue') return 'action'
  if (current === 'parenthetical') return 'dialogue'
  if (current === 'action') return 'action'
  if (current === 'transition') return 'scene-heading'
  return 'action'
}

// Detect element type from text
function detectType(text) {
  const t = text.trim()
  if (/^(INT\.|EXT\.|INT\/EXT\.)/i.test(t)) return 'scene-heading'
  if (/^(FADE IN:|FADE OUT\.|CUT TO:|SMASH CUT TO:|DISSOLVE TO:)/i.test(t)) return 'transition'
  if (/^\(/i.test(t)) return 'parenthetical'
  return null
}

// Convert blocks to plain text fountain
function blocksToFountain(blocks) {
  return blocks.map(b => {
    const t = b.text.trim()
    if (!t) return ''
    if (b.type === 'scene-heading') return '\n' + t.toUpperCase()
    if (b.type === 'character') return '\n' + t.toUpperCase()
    if (b.type === 'transition') return t.toUpperCase()
    if (b.type === 'note') return `/* ${t} */`
    return t
  }).join('\n')
}

// Parse fountain text into blocks
function fountainToBlocks(text) {
  if (!text) return [{ id: Date.now(), type: 'action', text: '' }]
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { i++; continue }

    let type = 'action'
    if (/^(INT\.|EXT\.|INT\/EXT\.)/i.test(trimmed)) type = 'scene-heading'
    else if (/^(FADE IN:|FADE OUT\.|CUT TO:|SMASH CUT TO:|DISSOLVE TO:)/i.test(trimmed)) type = 'transition'
    else if (/^\(.*\)$/.test(trimmed)) type = 'parenthetical'
    else if (/^\/\*/.test(trimmed)) type = 'note'
    else if (/^[A-Z][A-Z\s\(\)\.]+$/.test(trimmed) && trimmed.length < 40 && i + 1 < lines.length && lines[i+1]?.trim()) type = 'character'

    blocks.push({ id: Date.now() + i + Math.random(), type, text: trimmed })
    i++
  }
  return blocks.length > 0 ? blocks : [{ id: Date.now(), type: 'action', text: '' }]
}

export default function ScreenplayEditor() {
  const { currentDocument, currentProject, saveDocument, addNotification, layoutMode, suggestions, setSuggestions } = useStore()
  const [blocks, setBlocks] = useState([{ id: Date.now(), type: 'action', text: '' }])
  const [focusedId, setFocusedId] = useState(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState([])
  const [savedAt, setSavedAt] = useState(null)
  const [writingPrompt, setWritingPrompt] = useState('')
  const [promptTimeout, setPromptTimeout] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const saveTimer = useRef(null)
  const promptTimer = useRef(null)
  const refs = useRef({})
  const containerRef = useRef()

  // Load document content into blocks
  useEffect(() => {
    if (currentDocument?.content) {
      setBlocks(fountainToBlocks(currentDocument.content))
    } else {
      setBlocks([{ id: Date.now(), type: 'action', text: '' }])
    }
  }, [currentDocument?.id])

  // Auto-save on change (debounced 1.5s)
  useEffect(() => {
    if (!currentDocument) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))
    saveTimer.current = setTimeout(async () => {
      const content = blocksToFountain(blocks)
      try {
        await saveDocument(content)
        setSavedAt(new Date())
        window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saved' }))
        // Update page count estimate
        const lines = content.split('\n').filter(l => l.trim()).length
        setPageCount(Math.max(1, Math.round(lines / 55 * 10) / 10))
      } catch (error) {
        window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saved' }))
        throw error
      }
    }, 1500)
    return () => clearTimeout(saveTimer.current)
  }, [blocks])

  // Listen for menu element type commands
  useEffect(() => {
    const cleanup = window.api.onMenu('editor:set-element', (type) => {
      if (focusedId) {
        setBlocks(bs => bs.map(b => b.id === focusedId ? { ...b, type } : b))
      }
    })
    return cleanup
  }, [focusedId])

  // Idle writing prompt (30s idle)
  const triggerWritingPrompt = useCallback(async () => {
    if (!currentProject || !focusedId) return
    const focused = blocks.find(b => b.id === focusedId)
    if (!focused) return
    const context = blocks.slice(-5).map(b => b.text).join('\n')
    try {
      const result = await window.api.claudeWritingPrompt({
        projectId: currentProject.id,
        currentContent: '',
        cursorContext: context
      })
      setWritingPrompt(result.content)
      setTimeout(() => setWritingPrompt(''), 15000)
    } catch {}
  }, [currentProject, focusedId, blocks])

  function resetPromptTimer() {
    if (promptTimer.current) clearTimeout(promptTimer.current)
    setWritingPrompt('')
    promptTimer.current = setTimeout(triggerWritingPrompt, 45000)
  }

  function updateBlock(id, text) {
    resetPromptTimer()
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))
    const detected = detectType(text)
    setBlocks(bs => bs.map(b => {
      if (b.id !== id) return b
      return { ...b, text, type: detected || b.type }
    }))
  }

  function selectBlockRange(fromId, toId) {
    const fromIndex = blocks.findIndex(b => b.id === fromId)
    const toIndex = blocks.findIndex(b => b.id === toId)
    if (fromIndex === -1 || toIndex === -1) return
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    setSelectedBlockIds(blocks.slice(start, end + 1).map(b => b.id))
  }

  function handleBlockSelect(e, block) {
    if (e.shiftKey && focusedId) {
      e.preventDefault()
      selectBlockRange(focusedId, block.id)
      setFocusedId(block.id)
      refs.current[block.id]?.focus()
      return
    }

    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      setSelectedBlockIds(ids => (
        ids.includes(block.id)
          ? ids.filter(id => id !== block.id)
          : [...ids, block.id]
      ))
      setFocusedId(block.id)
      refs.current[block.id]?.focus()
      return
    }

    setSelectedBlockIds([])
  }

  function deleteSelectedBlocks(fallbackBlock, fallbackIndex) {
    const selectedIds = selectedBlockIds.filter(id => blocks.some(b => b.id === id))
    if (selectedIds.length === 0) return false

    const selectedSet = new Set(selectedIds)
    const firstSelectedIndex = blocks.findIndex(b => selectedSet.has(b.id))
    const remaining = blocks.filter(b => !selectedSet.has(b.id))
    const nextBlocks = remaining.length > 0
      ? remaining
      : [{ id: Date.now() + Math.random(), type: fallbackBlock?.type || 'action', text: '' }]

    const nextFocusIndex = Math.min(Math.max(firstSelectedIndex, 0), nextBlocks.length - 1)
    const nextFocus = nextBlocks[nextFocusIndex]

    resetPromptTimer()
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))
    setBlocks(nextBlocks)
    setSelectedBlockIds([])

    setTimeout(() => {
      const el = refs.current[nextFocus.id]
      if (el) {
        el.focus()
        el.setSelectionRange(0, 0)
        setFocusedId(nextFocus.id)
      }
    }, 0)

    return true
  }

  function handleKeyDown(e, block, index) {
    const el = refs.current[block.id]

    // Delete/Backspace — remove selected screenplay blocks
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockIds.length > 0) {
      e.preventDefault()
      deleteSelectedBlocks(block, index)
      return
    }

    // Tab — cycle element type
    if (e.key === 'Tab') {
      e.preventDefault()
      const idx = ELEMENT_TYPES.indexOf(block.type)
      const next = ELEMENT_TYPES[(idx + 1) % ELEMENT_TYPES.length]
      setBlocks(bs => bs.map(b => b.id === block.id ? { ...b, type: next } : b))
      return
    }

    // Enter — create new block
    if (e.key === 'Enter') {
      e.preventDefault()
      const newType = nextElementType(block.type, block.text)
      const newBlock = { id: Date.now() + Math.random(), type: newType, text: '' }
      setBlocks(bs => {
        const copy = [...bs]
        copy.splice(index + 1, 0, newBlock)
        return copy
      })
      setTimeout(() => {
        refs.current[newBlock.id]?.focus()
        setFocusedId(newBlock.id)
      }, 0)
      return
    }

    // Backspace on empty block — delete and go to previous
    if (e.key === 'Backspace' && !block.text && blocks.length > 1) {
      e.preventDefault()
      const prevBlock = blocks[index - 1]
      setBlocks(bs => bs.filter(b => b.id !== block.id))
      if (prevBlock) {
        setTimeout(() => {
          const el = refs.current[prevBlock.id]
          if (el) {
            el.focus()
            el.setSelectionRange(el.value.length, el.value.length)
            setFocusedId(prevBlock.id)
          }
        }, 0)
      }
      return
    }

    // Arrow up/down to navigate blocks
    if (e.key === 'ArrowUp' && index > 0) {
      const prev = blocks[index - 1]
      setTimeout(() => { refs.current[prev.id]?.focus(); setFocusedId(prev.id) }, 0)
    }
    if (e.key === 'ArrowDown' && index < blocks.length - 1) {
      const next = blocks[index + 1]
      setTimeout(() => { refs.current[next.id]?.focus(); setFocusedId(next.id) }, 0)
    }
  }

  // Right-click / selection context — inline suggest
  async function handleInlineSuggest(instruction) {
    const block = blocks.find(b => b.id === focusedId)
    if (!block || !currentProject) return
    const context = blocks.slice(-3).map(b => b.text).join('\n')
    addNotification('Asking Claude…', 'info')
    const result = await window.api.claudeInlineSuggest({
      projectId: currentProject.id,
      selectedText: block.text,
      instruction,
      context
    })
    if (result.content) {
      const parts = result.content.split('WHY:')
      const why = parts[1]?.split('\n')[0]?.trim() || ''
      const newText = parts[0]?.trim() || result.content

      // Show in suggestions panel
      setSuggestions([{
        id: Date.now(),
        original: block.text,
        suggestion: newText,
        why,
        blockId: focusedId,
        type: 'inline'
      }])
    }
  }

  async function handleFullRewrite() {
    if (!currentProject) return
    const content = blocksToFountain(blocks)
    addNotification('Requesting full rewrite from Claude…', 'info')
    const result = await window.api.claudeFullRewrite({
      projectId: currentProject.id,
      content,
      instruction: 'Rewrite and improve this scene'
    })
    if (result.content) {
      const parts = result.content.split('---CHANGES---')
      const rewrite = parts[0].trim()
      const changes = parts[1]?.trim() || ''
      useStore.getState().setActiveDiff({ original: content, rewrite, changes })
    }
  }

  const focusedBlock = blocks.find(b => b.id === focusedId)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Scene Navigator */}
      <div style={{ width: 180, borderRight: '1px solid var(--border-subtle)', overflow: 'auto', padding: '16px 8px', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>Scenes</div>
        {blocks.filter(b => b.type === 'scene-heading' && b.text.trim()).map((b, i) => (
          <div
            key={b.id}
            onClick={() => { refs.current[b.id]?.focus(); refs.current[b.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setFocusedId(b.id) }}
            style={{ padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: focusedId === b.id ? 'var(--amber)' : 'var(--text-secondary)', marginBottom: 2, background: focusedId === b.id ? 'var(--amber-subtle)' : 'transparent' }}
          >
            {b.text.slice(0, 30)}{b.text.length > 30 ? '…' : ''}
          </div>
        ))}
        {blocks.filter(b => b.type === 'scene-heading').length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '0 4px' }}>No scenes yet</div>
        )}
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: 'auto', padding: '48px 0', background: layoutMode === 'focus' ? 'var(--bg-base)' : 'var(--bg-base)' }} ref={containerRef}>
        <div style={{ maxWidth: '8.5in', margin: '0 auto', paddingBottom: 120 }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 6 }}>
              {currentProject?.title}
            </div>
            {currentProject?.logline && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 500, margin: '0 auto' }}>
                {currentProject.logline}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              {pageCount > 0 && `~${pageCount} pages`}
              {savedAt && <span style={{ marginLeft: 12 }}>Saved {savedAt.toLocaleTimeString()}</span>}
            </div>
          </div>

          {/* Blocks */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '1in 1.5in 1in 1.5in', boxShadow: '0 4px 32px rgba(0,0,0,0.3)', minHeight: '11in' }}>
            {blocks.map((block, index) => (
              <BlockLine
                key={block.id}
                block={block}
                focused={focusedId === block.id}
                selected={selectedBlockIds.includes(block.id)}
                inputRef={el => refs.current[block.id] = el}
                onFocus={() => setFocusedId(block.id)}
                onMouseDown={e => handleBlockSelect(e, block)}
                onChange={text => updateBlock(block.id, text)}
                onKeyDown={e => handleKeyDown(e, block, index)}
              />
            ))}
          </div>

          {/* Writing prompt */}
          {writingPrompt && (
            <div className="writing-prompt" style={{ maxWidth: '8.5in', margin: '24px auto 0', opacity: 0.8 }}>
              💡 {writingPrompt}
              <button onClick={() => setWritingPrompt('')} style={{ float: 'right', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 12, right: suggestions.length > 0 ? 360 : 12, display: 'flex', gap: 6, zIndex: 10 }}>
        {focusedBlock && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => handleInlineSuggest('Improve this line')}>✨ Suggest</button>
            <button className="btn btn-ghost btn-sm" onClick={handleFullRewrite}>↻ Rewrite Scene</button>
          </>
        )}
      </div>

      {/* Suggestions panel */}
      {suggestions.length > 0 && (
        <SuggestionsPanel
          blocks={blocks}
          setBlocks={setBlocks}
        />
      )}

      {/* Diff view */}
      <DiffView />
    </div>
  )
}

function BlockLine({ block, focused, selected, inputRef, onFocus, onMouseDown, onChange, onKeyDown }) {
  const styleMap = {
    'scene-heading': { textTransform: 'uppercase', fontWeight: 'bold', marginTop: '2em', color: 'var(--text-primary)' },
    'action': { marginBottom: '0.5em' },
    'character': { marginLeft: '2.2in', marginTop: '1em', textTransform: 'uppercase' },
    'dialogue': { marginLeft: '1.5in', marginRight: '1in' },
    'parenthetical': { marginLeft: '1.9in', marginRight: '1.3in' },
    'transition': { textAlign: 'right', textTransform: 'uppercase', marginTop: '1em' },
    'note': { color: 'var(--text-muted)', fontStyle: 'italic' }
  }

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'relative',
        borderRadius: 4,
        outline: selected ? '1px solid var(--amber)' : '1px solid transparent',
        background: selected ? 'var(--amber-subtle)' : 'transparent',
        ...styleMap[block.type]
      }}
    >
      <span
        className="element-badge"
        style={{ opacity: focused || selected ? 1 : 0, transition: 'opacity 0.15s' }}
      >
        {ELEMENT_LABELS[block.type]}
      </span>
      <textarea
        ref={inputRef}
        className="selectable"
        value={block.text}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        rows={1}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'var(--font-screenplay)',
          fontSize: '12pt',
          lineHeight: '1.667',
          color: 'inherit',
          resize: 'none',
          padding: 0,
          margin: 0,
          overflow: 'hidden',
          caretColor: 'var(--amber)',
          ...styleMap[block.type]
        }}
        onInput={e => {
          e.target.style.height = 'auto'
          e.target.style.height = e.target.scrollHeight + 'px'
        }}
      />
    </div>
  )
}

function SuggestionsPanel({ blocks, setBlocks }) {
  const { suggestions, setSuggestions } = useStore()

  function accept(suggestion) {
    setBlocks(bs => bs.map(b => b.id === suggestion.blockId ? { ...b, text: suggestion.suggestion } : b))
    setSuggestions(suggestions.filter(s => s.id !== suggestion.id))
  }

  function reject(id) {
    setSuggestions(suggestions.filter(s => s.id !== id))
  }

  return (
    <div style={{ width: 320, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', overflow: 'auto', padding: 16 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--amber)', marginBottom: 16 }}>Suggestions</div>
      {suggestions.map(s => (
        <div key={s.id} style={{ marginBottom: 16, background: 'var(--bg-raised)', borderRadius: 8, padding: 14 }}>
          {s.why && (
            <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 8, fontStyle: 'italic' }}>
              WHY: {s.why}
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: 11, marginBottom: 8 }}>
            <div style={{ color: 'var(--red)', textDecoration: 'line-through', marginBottom: 4, opacity: 0.7 }}>{s.original}</div>
            <div style={{ color: 'var(--green)' }}>{s.suggestion}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => accept(s)} style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>Accept</button>
            <button className="btn btn-ghost btn-sm" onClick={() => reject(s.id)}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function DiffView() {
  const { activeDiff, setActiveDiff, currentDocument, addNotification } = useStore()
  if (!activeDiff) return null

  async function applyRewrite() {
    if (!currentDocument) return
    await window.api.updateDocument(currentDocument.id, { content: activeDiff.rewrite })
    addNotification('Rewrite applied', 'success')
    setActiveDiff(null)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: '90vw', maxWidth: 1200, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Rewrite Comparison</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setActiveDiff(null)}>Keep Mine</button>
            <button className="btn btn-primary" onClick={applyRewrite}>Use Rewrite</button>
          </div>
        </div>
        {activeDiff.changes && (
          <div style={{ padding: '12px 24px', background: 'var(--amber-subtle)', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--amber)' }}>Changes: </strong>{activeDiff.changes}
          </div>
        )}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
          <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Your version</div>
            <pre style={{ fontFamily: 'var(--font-screenplay)', fontSize: 11, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{activeDiff.original}</pre>
          </div>
          <div style={{ overflow: 'auto', padding: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--green)', textTransform: 'uppercase', marginBottom: 12 }}>Claude's rewrite</div>
            <pre style={{ fontFamily: 'var(--font-screenplay)', fontSize: 11, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{activeDiff.rewrite}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

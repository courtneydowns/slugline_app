import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
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

export default function ScreenplayEditor({ onOpenDocuments }) {
  const {
    currentDocument,
    currentProject,
    documents,
    setDocuments,
    setCurrentDocument,
    saveDocument,
    addNotification,
    setFocusedScreenplayBlockId,
    setFocusedScreenplayBlockIndex,
    layoutMode,
    suggestions,
    setSuggestions
  } = useStore()
  const [blocks, setBlocks] = useState([{ id: Date.now(), type: 'action', text: '' }])
  const [focusedId, setFocusedId] = useState(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState([])

  function setFocusedBlock(blockId) {
    setFocusedId(blockId)
    setFocusedScreenplayBlockId?.(blockId)
  }

  useEffect(() => {
    if (!focusedId) {
      setFocusedScreenplayBlockIndex?.(null)
      return
    }

    const index = blocks.findIndex(block => block.id === focusedId)
    setFocusedScreenplayBlockIndex?.(index >= 0 ? index : null)
  }, [focusedId, blocks, setFocusedScreenplayBlockIndex])
  const [sceneNavigatorCollapsed, setSceneNavigatorCollapsed] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [writingPrompt, setWritingPrompt] = useState('')
  const [promptTimeout, setPromptTimeout] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [creatingScreenplay, setCreatingScreenplay] = useState(false)
  const [newScreenplayTitle, setNewScreenplayTitle] = useState('')
  const saveTimer = useRef(null)
  const promptTimer = useRef(null)
  const refs = useRef({})
  const containerRef = useRef()
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const historyHydratingRef = useRef(false)
  const [historyVersion, setHistoryVersion] = useState(0)

  function isSavedChatExport(doc) {
    const title = doc?.title || ''
    const content = doc?.content || ''

    if (title.startsWith('Chat Export')) return true
    if (/\nChat: .+\nExported: /m.test(content)) return true
    if (content.includes('\n## User\n\n') || content.includes('\n## Assistant\n\n')) return true

    return false
  }

  function isScreenplayDocument(doc) {
    return !!doc && (doc.document_type || 'screenplay') === 'screenplay' && !isSavedChatExport(doc)
  }

  const screenplayDocuments = useMemo(() => {
    return [...(documents || [])]
      .filter(isScreenplayDocument)
      .sort((a, b) => {
        const aTime = new Date(a.created_at || a.updated_at || 0).getTime()
        const bTime = new Date(b.created_at || b.updated_at || 0).getTime()
        return aTime - bTime
      })
  }, [documents])

  async function saveCurrentScreenplayNow() {
    if (!isScreenplayDocument(currentDocument)) return

    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }

    const content = blocksToFountain(blocks)
    const updated = await window.api.updateDocument(currentDocument.id, { content })
    setCurrentDocument(updated)
    setSavedAt(new Date())
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saved' }))
  }

  async function refreshProjectDocuments(selectedId = null) {
    if (!currentProject) return []

    const docs = await window.api.getAllDocuments(currentProject.id)
    setDocuments(docs)

    if (selectedId) {
      const selected = docs.find(doc => doc.id === selectedId)
      if (selected) setCurrentDocument(selected)
    }

    return docs
  }

  async function handleScreenplayDocumentChange(e) {
    const value = e.target.value
    if (!value || value === String(currentDocument?.id || '')) return

    try {
      await saveCurrentScreenplayNow()

      if (value === '__new__') {
        const existingCount = screenplayDocuments.length
        const suggestedTitle = existingCount === 0 ? 'Pilot / Episode 1' : `Episode ${existingCount + 1}`
        setNewScreenplayTitle(suggestedTitle)
        setCreatingScreenplay(true)
        return
      }

      const nextId = Number(value)
      const docs = await refreshProjectDocuments()
      const nextDoc = docs.find(doc => doc.id === nextId)
      if (nextDoc) {
        setCurrentDocument(nextDoc)
        addNotification?.(`Opened ${nextDoc.title || 'screenplay document'}.`, 'success')
      }
    } catch (err) {
      addNotification?.('Could not switch screenplay: ' + err.message, 'error')
    }
  }

  useEffect(() => {
    if (!currentDocument || isScreenplayDocument(currentDocument)) return

    const fallback = screenplayDocuments[0] || null
    if (fallback && fallback.id !== currentDocument.id) {
      setCurrentDocument(fallback)
      addNotification?.(`Returned to screenplay document: ${fallback.title || 'Untitled'}.`, 'info')
    }
  }, [currentDocument?.id, currentDocument?.document_type, screenplayDocuments])

  // Load document content into blocks
  useEffect(() => {
    if (currentDocument && !isScreenplayDocument(currentDocument)) return

    historyHydratingRef.current = true
    undoStackRef.current = []
    redoStackRef.current = []
    setSelectedBlockIds([])
    setFocusedBlock(null)

    if (currentDocument?.content) {
      setBlocks(fountainToBlocks(currentDocument.content))
    } else {
      setBlocks([{ id: Date.now(), type: 'action', text: '' }])
    }

    setTimeout(() => {
      historyHydratingRef.current = false
    }, 0)
  }, [currentDocument?.id])

  // Auto-save on change (debounced 1.5s)
  useEffect(() => {
    if (!isScreenplayDocument(currentDocument)) return
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

  function cloneBlocks(list = blocks) {
    return list.map(b => ({ ...b }))
  }

  function commitBlocks(nextBlocks, options = {}) {
    const {
      selectedIds = [],
      focusId = null,
      focusPosition = null,
      recordHistory = true
    } = options

    resetPromptTimer()
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))

    setBlocks(currentBlocks => {
      if (recordHistory && !historyHydratingRef.current) {
        undoStackRef.current = [...undoStackRef.current.slice(-49), cloneBlocks(currentBlocks)]
        redoStackRef.current = []
        setHistoryVersion(v => v + 1)
      }
      return nextBlocks
    })

    setSelectedBlockIds(selectedIds)

    if (focusId) {
      setTimeout(() => {
        const el = refs.current[focusId]
        if (el) {
          el.focus()
          const pos = focusPosition === 'end' ? el.value.length : Number.isInteger(focusPosition) ? focusPosition : 0
          el.setSelectionRange(pos, pos)
          setFocusedBlock(focusId)
        }
      }, 0)
    }
  }

  function handleUndo() {
    const previous = undoStackRef.current.pop()
    if (!previous) return

    redoStackRef.current = [...redoStackRef.current.slice(-49), cloneBlocks(blocks)]
    setHistoryVersion(v => v + 1)
    const nextBlocks = cloneBlocks(previous)
    const nextFocus = nextBlocks.find(b => b.id === focusedId) || nextBlocks[0]

    resetPromptTimer()
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))
    setBlocks(nextBlocks)
    setSelectedBlockIds([])

    if (nextFocus) {
      setTimeout(() => {
        const el = refs.current[nextFocus.id]
        if (el) {
          el.focus()
          el.setSelectionRange(0, 0)
          setFocusedBlock(nextFocus.id)
        }
      }, 0)
    }
  }

  function handleRedo() {
    const next = redoStackRef.current.pop()
    if (!next) return

    undoStackRef.current = [...undoStackRef.current.slice(-49), cloneBlocks(blocks)]
    setHistoryVersion(v => v + 1)
    const nextBlocks = cloneBlocks(next)
    const nextFocus = nextBlocks.find(b => b.id === focusedId) || nextBlocks[0]

    resetPromptTimer()
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))
    setBlocks(nextBlocks)
    setSelectedBlockIds([])

    if (nextFocus) {
      setTimeout(() => {
        const el = refs.current[nextFocus.id]
        if (el) {
          el.focus()
          el.setSelectionRange(0, 0)
          setFocusedBlock(nextFocus.id)
        }
      }, 0)
    }
  }

  function selectedBlocksInOrder() {
    const selectedSet = new Set(selectedBlockIds)
    return blocks.filter(b => selectedSet.has(b.id))
  }

  function selectedBlocksToText() {
    return blocksToFountain(selectedBlocksInOrder()).trim()
  }

  async function writeScreenplayClipboard(text) {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  function insertTextAsBlocks(text, targetBlock, targetIndex) {
    const pastedBlocks = fountainToBlocks(text).filter(b => b.text.trim())
    if (pastedBlocks.length === 0) return

    const newBlocks = pastedBlocks.map((b, i) => ({
      ...b,
      id: Date.now() + Math.random() + i
    }))

    const insertIndex = targetIndex + 1
    const nextBlocks = [...blocks]
    nextBlocks.splice(insertIndex, 0, ...newBlocks)

    commitBlocks(nextBlocks, {
      selectedIds: newBlocks.map(b => b.id),
      focusId: newBlocks[0].id,
      focusPosition: 0
    })
  }

  async function handleCopy(e) {
    if (selectedBlockIds.length === 0) return

    const text = selectedBlocksToText()
    if (!text) return

    e.preventDefault()
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', text)
    }
    await writeScreenplayClipboard(text)
    addNotification?.('Copied screenplay blocks.', 'success')
  }

  async function handleCut(e, block, index) {
    if (selectedBlockIds.length === 0) return

    const text = selectedBlocksToText()
    if (!text) return

    e.preventDefault()
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', text)
    }
    await writeScreenplayClipboard(text)
    deleteSelectedBlocks(block, index)
    addNotification?.('Cut screenplay blocks.', 'success')
  }

  function handlePaste(e, block, index) {
    const text = e.clipboardData?.getData('text/plain') || ''
    if (!text.trim()) return

    if (selectedBlockIds.length > 0 || text.includes('\n')) {
      e.preventDefault()
      insertTextAsBlocks(text, block, index)
    }
  }

  function updateBlock(id, text) {
    const detected = detectType(text)
    const nextBlocks = blocks.map(b => {
      if (b.id !== id) return b
      return { ...b, text, type: detected || b.type }
    })
    commitBlocks(nextBlocks, { recordHistory: true })
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
      setFocusedBlock(block.id)
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
      setFocusedBlock(block.id)
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

    commitBlocks(nextBlocks, {
      selectedIds: [],
      focusId: nextFocus.id,
      focusPosition: 0
    })

    return true
  }

  function handleKeyDown(e, block, index) {
    const el = refs.current[block.id]

    // App-level undo/redo for screenplay block operations
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) handleRedo()
      else handleUndo()
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      handleRedo()
      return
    }

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
      commitBlocks(blocks.map(b => b.id === block.id ? { ...b, type: next } : b), {
        focusId: block.id,
        focusPosition: 'end'
      })
      return
    }

    // Enter — create new block
    if (e.key === 'Enter') {
      e.preventDefault()
      const newType = nextElementType(block.type, block.text)
      const newBlock = { id: Date.now() + Math.random(), type: newType, text: '' }
      const nextBlocks = [...blocks]
      nextBlocks.splice(index + 1, 0, newBlock)
      commitBlocks(nextBlocks, {
        focusId: newBlock.id,
        focusPosition: 0
      })
      return
    }

    // Backspace on empty block — delete and go to previous
    if (e.key === 'Backspace' && !block.text && blocks.length > 1) {
      e.preventDefault()
      const prevBlock = blocks[index - 1]
      const nextBlocks = blocks.filter(b => b.id !== block.id)
      if (prevBlock) {
        commitBlocks(nextBlocks, {
          focusId: prevBlock.id,
          focusPosition: 'end'
        })
      }
      return
    }

    // Arrow up/down to navigate blocks
    if (e.key === 'ArrowUp' && index > 0) {
      const prev = blocks[index - 1]
      setTimeout(() => { refs.current[prev.id]?.focus(); setFocusedBlock(prev.id) }, 0)
    }
    if (e.key === 'ArrowDown' && index < blocks.length - 1) {
      const next = blocks[index + 1]
      setTimeout(() => { refs.current[next.id]?.focus(); setFocusedBlock(next.id) }, 0)
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

  function getCurrentSceneRange() {
    const focusedIndex = blocks.findIndex(b => b.id === focusedId)

    if (focusedIndex === -1) {
      return { start: 0, end: blocks.length - 1 }
    }

    let start = focusedIndex
    while (start > 0 && blocks[start].type !== 'scene-heading') {
      start -= 1
    }

    if (blocks[start].type !== 'scene-heading') {
      start = focusedIndex
    }

    let end = start + 1
    while (end < blocks.length && blocks[end].type !== 'scene-heading') {
      end += 1
    }

    return { start, end: end - 1 }
  }

  async function handleRewriteScene() {
    if (!currentProject) return

    const { start, end } = getCurrentSceneRange()
    const sceneBlocks = blocks.slice(start, end + 1)
    const content = blocksToFountain(sceneBlocks)

    if (!content.trim()) {
      addNotification('Nothing to rewrite in the current scene.', 'info')
      return
    }

    addNotification('Requesting scene rewrite from Claude…', 'info')
    const result = await window.api.claudeFullRewrite({
      projectId: currentProject.id,
      content,
      instruction: 'Rewrite and improve only this scene. Preserve screenplay format.'
    })

    if (result.content) {
      const parts = result.content.split('---CHANGES---')
      const rewrite = parts[0].trim()
      const changes = parts[1]?.trim() || ''
      useStore.getState().setActiveDiff({
        mode: 'scene',
        sceneStart: start,
        sceneEnd: end,
        original: content,
        rewrite,
        changes
      })
    }
  }

  async function handleRewriteDocument() {
    if (!currentProject) return

    const confirmed = window.confirm('Rewrite the full screenplay document? This can affect the entire current draft.')
    if (!confirmed) return

    const content = blocksToFountain(blocks)
    addNotification('Requesting full document rewrite from Claude…', 'info')
    const result = await window.api.claudeFullRewrite({
      projectId: currentProject.id,
      content,
      instruction: 'Rewrite and improve the full screenplay document. Preserve screenplay format.'
    })

    if (result.content) {
      const parts = result.content.split('---CHANGES---')
      const rewrite = parts[0].trim()
      const changes = parts[1]?.trim() || ''
      useStore.getState().setActiveDiff({
        mode: 'document',
        original: content,
        rewrite,
        changes
      })
    }
  }

  async function createNamedScreenplayDocument() {
    if (!currentProject) return

    const title = newScreenplayTitle.trim()
    if (!title) {
      addNotification?.('Please name the screenplay first.', 'warning')
      return
    }

    try {
      await saveCurrentScreenplayNow()
      const created = await window.api.createDocument({
        project_id: currentProject.id,
        title,
        content: '',
        document_type: 'screenplay'
      })
      await refreshProjectDocuments(created.id)
      setCreatingScreenplay(false)
      setNewScreenplayTitle('')
      addNotification?.(`Created ${title}.`, 'success')
    } catch (err) {
      addNotification?.('Could not create screenplay: ' + err.message, 'error')
    }
  }

  function startBlankScreenplay(type = 'scene-heading') {
    const firstBlock = {
      id: Date.now() + Math.random(),
      type,
      text: type === 'scene-heading' ? 'INT. LOCATION - DAY' : ''
    }

    commitBlocks([firstBlock], {
      focusId: firstBlock.id,
      focusPosition: type === 'scene-heading' ? 'end' : 0
    })
  }

  const isBlankScreenplay =
    blocks.length === 1 &&
    !blocks[0]?.text?.trim()

  const focusedBlock = blocks.find(b => b.id === focusedId)
  const canUndo = undoStackRef.current.length > 0
  const canRedo = redoStackRef.current.length > 0
  void historyVersion

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Scene Navigator */}
      <div
        style={{
          width: sceneNavigatorCollapsed ? 44 : 180,
          borderRight: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          padding: sceneNavigatorCollapsed ? '12px 6px' : '16px 8px',
          background: 'var(--bg-surface)',
          flexShrink: 0,
          transition: 'width 0.18s ease, padding 0.18s ease'
        }}
      >
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => setSceneNavigatorCollapsed(v => !v)}
          title={sceneNavigatorCollapsed ? 'Show scene navigator' : 'Hide scene navigator'}
          style={{
            width: sceneNavigatorCollapsed ? 30 : '100%',
            justifyContent: sceneNavigatorCollapsed ? 'center' : 'flex-start',
            marginBottom: sceneNavigatorCollapsed ? 0 : 10,
            padding: sceneNavigatorCollapsed ? '6px 0' : '6px 8px'
          }}
        >
          {sceneNavigatorCollapsed ? '☰' : '☰ Scenes'}
        </button>

        {!sceneNavigatorCollapsed && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>Scenes</div>
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 180px)', paddingRight: 2 }}>
              {blocks.filter(b => b.type === 'scene-heading' && b.text.trim()).map((b, i) => (
                <div
                  key={b.id}
                  onClick={() => { refs.current[b.id]?.focus(); refs.current[b.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setFocusedBlock(b.id) }}
                  style={{ padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: focusedId === b.id ? 'var(--amber)' : 'var(--text-secondary)', marginBottom: 2, background: focusedId === b.id ? 'var(--amber-subtle)' : 'transparent' }}
                >
                  {b.text.slice(0, 30)}{b.text.length > 30 ? '…' : ''}
                </div>
              ))}
              {blocks.filter(b => b.type === 'scene-heading').length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '0 4px' }}>No scenes yet</div>
              )}
            </div>
          </>
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
            {isBlankScreenplay && (
              <div
                style={{
                  border: '1px dashed var(--border)',
                  borderRadius: 10,
                  padding: 24,
                  marginBottom: 24,
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-base)'
                }}
              >
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Start this screenplay document
                </div>
                <div style={{ fontSize: 13, marginBottom: 16 }}>
                  Add a scene heading or start with action text.
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => startBlankScreenplay('scene-heading')}
                  >
                    Add first scene
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => startBlankScreenplay('action')}
                  >
                    Start with action
                  </button>
                </div>
              </div>
            )}

            {blocks.map((block, index) => (
              <BlockLine
                key={block.id}
                block={block}
                focused={focusedId === block.id}
                selected={selectedBlockIds.includes(block.id)}
                inputRef={el => refs.current[block.id] = el}
                onFocus={() => setFocusedBlock(block.id)}
                onMouseDown={e => handleBlockSelect(e, block)}
                onChange={text => updateBlock(block.id, text)}
                onKeyDown={e => handleKeyDown(e, block, index)}
                onCopy={handleCopy}
                onCut={e => handleCut(e, block, index)}
                onPaste={e => handlePaste(e, block, index)}
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

      {/* Screenplay toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: sceneNavigatorCollapsed ? 56 : 192,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 20,
          opacity: 0.82,
          transition: 'left 0.18s ease, opacity 0.15s ease'
        }}
      >
        <select
          className="btn btn-ghost btn-sm no-drag"
          value={currentDocument?.id || ''}
          onChange={handleScreenplayDocumentChange}
          title="Switch screenplay document"
          style={{
            maxWidth: 220,
            height: 30,
            padding: '0 28px 0 10px',
            color: 'var(--text-primary)',
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)'
          }}
        >
          {screenplayDocuments.length === 0 && (
            <option value="">No screenplay documents</option>
          )}
          {screenplayDocuments.map((doc, index) => (
            <option key={doc.id} value={doc.id}>
              {doc.title || (index === 0 ? 'Pilot / Episode 1' : `Episode ${index + 1}`)}
            </option>
          ))}
          <option value="__new__">🎬 New Script Draft</option>
        </select>
        {onOpenDocuments && (
          <button
            className="btn btn-ghost btn-sm no-drag"
            type="button"
            onClick={onOpenDocuments}
            title="Open notes, chat exports, and project documents"
            style={{
              height: 30,
              padding: '0 9px',
              whiteSpace: 'nowrap'
            }}
          >
            ▤ Documents
          </button>
        )}
        {creatingScreenplay && (
          <>
            <input
              className="input selectable"
              value={newScreenplayTitle}
              onChange={e => setNewScreenplayTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createNamedScreenplayDocument()
                if (e.key === 'Escape') {
                  setCreatingScreenplay(false)
                  setNewScreenplayTitle('')
                }
              }}
              autoFocus
              style={{
                width: 220,
                height: 30,
                fontSize: 12,
                padding: '0 10px'
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={createNamedScreenplayDocument}
              disabled={!newScreenplayTitle.trim()}
              style={{ opacity: newScreenplayTitle.trim() ? 1 : 0.5 }}
            >
              Create
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setCreatingScreenplay(false)
                setNewScreenplayTitle('')
              }}
            >
              Cancel
            </button>
          </>
        )}
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={handleUndo}
          disabled={!canUndo}
          title="Undo screenplay edit"
        >
          ↶
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={handleRedo}
          disabled={!canRedo}
          title="Redo screenplay edit"
        >
          ↷
        </button>
        {focusedBlock && (
          <>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleInlineSuggest('Improve this line')}>✨ Suggest</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleRewriteScene}>↻ Rewrite Scene</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleRewriteDocument}>Rewrite Document</button>
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
      <DiffView
        blocks={blocks}
        setBlocks={setBlocks}
      />
    </div>
  )
}

function BlockLine({ block, focused, selected, inputRef, onFocus, onMouseDown, onChange, onKeyDown, onCopy, onCut, onPaste }) {
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
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
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

function DiffView({ blocks, setBlocks }) {
  const { activeDiff, setActiveDiff, currentDocument, addNotification } = useStore()
  if (!activeDiff) return null

  async function applyRewrite() {
    if (!currentDocument) return

    if (activeDiff.mode === 'scene') {
      const replacementBlocks = fountainToBlocks(activeDiff.rewrite).map((b, i) => ({
        ...b,
        id: Date.now() + Math.random() + i
      }))

      const nextBlocks = [...blocks]
      nextBlocks.splice(activeDiff.sceneStart, activeDiff.sceneEnd - activeDiff.sceneStart + 1, ...replacementBlocks)

      setBlocks(nextBlocks)
      await window.api.updateDocument(currentDocument.id, { content: blocksToFountain(nextBlocks) })
      addNotification('Scene rewrite applied', 'success')
      setActiveDiff(null)
      return
    }

    const nextBlocks = fountainToBlocks(activeDiff.rewrite)
    setBlocks(nextBlocks)
    await window.api.updateDocument(currentDocument.id, { content: activeDiff.rewrite })
    addNotification('Document rewrite applied', 'success')
    setActiveDiff(null)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: '90vw', maxWidth: 1200, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>
            {activeDiff.mode === 'scene' ? 'Scene Rewrite Comparison' : 'Document Rewrite Comparison'}
          </div>
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

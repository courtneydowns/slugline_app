import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import useStore, { _setLastActiveScreenplayDocId } from '../store'
import FindBar from './FindBar'

const ELEMENT_TYPES = ['scene-heading', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot', 'note']
const ELEMENT_LABELS = {
  'scene-heading': 'Scene Heading',
  'action': 'Action',
  'character': 'Character',
  'dialogue': 'Dialogue',
  'parenthetical': 'Parenthetical',
  'transition': 'Transition',
  'shot': 'Shot / Camera Angle',
  'note': 'Note'
}

const REVISION_COLORS = {
  white: '#c0c0c0', blue: '#7bb3f5', pink: '#f57bb3', yellow: '#e8d060',
  green: '#60d880', goldenrod: '#d4a030', buff: '#c8a870', salmon: '#e88060',
  cherry: '#e06060', tan: '#b09060', 'double-blue': '#4a8fd4', 'double-pink': '#c44a8f',
}

// Smart next element type after pressing Enter
// scene-heading → action (start describing the scene)
// action        → action (keep writing action)
// character     → dialogue (character name followed by their line)
// dialogue      → dialogue (continuing speech; user can Tab to change)
// parenthetical → dialogue (wraps back into the speech)
// transition    → scene-heading (transitions precede new scenes)
// shot          → action (camera angle followed by what we see)
// note          → note (keep writing notes together)
function nextElementType(current) {
  const map = {
    'scene-heading': 'action',
    'action':        'action',
    'character':     'dialogue',
    'dialogue':      'dialogue',
    'parenthetical': 'dialogue',
    'transition':    'scene-heading',
    'shot':          'action',
    'note':          'note',
  }
  return map[current] ?? 'action'
}

// Detect element type from text
function detectType(text) {
  const t = text.trim()
  if (/^(INT\.|EXT\.|INT\/EXT\.)/i.test(t)) return 'scene-heading'
  if (/^(FADE IN:|FADE OUT\.|CUT TO:|SMASH CUT TO:|DISSOLVE TO:)/i.test(t)) return 'transition'
  if (/^(ANGLE ON|CLOSE ON|CLOSE UP|INSERT|POV|WIDE SHOT|TWO-SHOT|TRACKING|PAN TO|PUSH IN|PULL BACK)/i.test(t)) return 'shot'
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
    if (b.type === 'shot') return t.toUpperCase()
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
    else if (/^(ANGLE ON|CLOSE ON|CLOSE UP|INSERT|POV|WIDE SHOT|TWO-SHOT|TRACKING|PAN TO|PUSH IN|PULL BACK)/i.test(trimmed)) type = 'shot'
    else if (/^\(.*\)$/.test(trimmed)) type = 'parenthetical'
    else if (/^\/\*/.test(trimmed)) type = 'note'
    else if (/^[A-Z][A-Z\s\(\)\.]+$/.test(trimmed) && trimmed.length < 40 && i + 1 < lines.length && lines[i+1]?.trim()) type = 'character'

    blocks.push({ id: Date.now() + i + Math.random(), type, text: trimmed })
    i++
  }
  return blocks.length > 0 ? blocks : [{ id: Date.now(), type: 'action', text: '' }]
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
    typewriterMode,
    suggestions,
    setSuggestions,
    find, setFind, openFind, closeFind,
    annotations, setAnnotations, annotationJumpAnchor, setAnnotationJumpAnchor, toggleAnnotationPanel,
    activeRevision,
    openChat,
    characters,
    worldBuilding,
    beats,
  } = useStore()
  const [blocks, setBlocks] = useState([{ id: Date.now(), type: 'action', text: '' }])
  const [focusedId, setFocusedId] = useState(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState([])
  const [openInsertMenuId, setOpenInsertMenuId] = useState(null)
  const [openTypeMenuId, setOpenTypeMenuId] = useState(null)
  const [insertPlacement, setInsertPlacement] = useState('below')
  const [blockContextMenu, setBlockContextMenu] = useState(null)
  const [addCommentForm, setAddCommentForm] = useState(null)

  const sceneNumberMap = React.useMemo(() => {
    if (!activeRevision || !activeRevision.locked_at) return {}
    try { return JSON.parse(activeRevision.scene_number_map || '{}') } catch { return {} }
  }, [activeRevision])

  const changedSceneSet = React.useMemo(() => {
    if (!activeRevision || !activeRevision.locked_at || !activeRevision.locked_content) return new Set()
    const parseScenes = (text) => {
      const map = {}
      const lines = (text || '').split('\n')
      let current = null, buf = []
      for (const line of lines) {
        const t = line.trim()
        if (/^(INT\.|EXT\.|INT\/EXT\.)/i.test(t)) {
          if (current !== null) map[current] = buf.join('\n')
          current = t.toUpperCase(); buf = []
        } else if (current !== null) { buf.push(line) }
      }
      if (current !== null) map[current] = buf.join('\n')
      return map
    }
    const locked = parseScenes(activeRevision.locked_content)
    const current = parseScenes(blocksToFountain(blocks))
    const changed = new Set()
    for (const [h, c] of Object.entries(current)) {
      if (locked[h] !== c) changed.add(h)
    }
    return changed
  }, [activeRevision, blocks])

  function setFocusedBlock(blockId) {
    setFocusedId(blockId)
    setFocusedScreenplayBlockId?.(blockId)

    if (blockId !== openInsertMenuId) {
      setOpenInsertMenuId(null)
    }

    if (blockId !== openTypeMenuId) {
      setOpenTypeMenuId(null)
    }
  }

  useEffect(() => {
    if (!focusedId) {
      setFocusedScreenplayBlockIndex?.(null)
      return
    }

    const index = blocks.findIndex(block => block.id === focusedId)
    setFocusedScreenplayBlockIndex?.(index >= 0 ? index : null)
  }, [focusedId, blocks, setFocusedScreenplayBlockIndex])
  useEffect(() => {
    if (!typewriterMode || !focusedId) return
    const el = refs.current[focusedId]
    const container = containerRef.current
    if (!el || !container) return
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const relativeTop = elRect.top - containerRect.top + container.scrollTop
    container.scrollTo({ top: relativeTop - container.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' })
  }, [focusedId, typewriterMode])

  React.useEffect(() => {
    if (!blockContextMenu) return
    function handleClick() { setBlockContextMenu(null) }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [blockContextMenu])

  React.useEffect(() => {
    if (!annotationJumpAnchor) return
    const match = blocks.find(b => b.text.trim() === annotationJumpAnchor.trim())
    if (match) {
      const el = refs.current[match.id]
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setFocusedBlock(match.id) }
    }
    setAnnotationJumpAnchor(null)
  }, [annotationJumpAnchor])

  const [sceneNavigatorCollapsed, setSceneNavigatorCollapsed] = useState(true)
  const [savedAt, setSavedAt] = useState(null)
  const [writingPrompt, setWritingPrompt] = useState('')
  const [promptTimeout, setPromptTimeout] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [creatingScreenplay, setCreatingScreenplay] = useState(false)
  const [newScreenplayTitle, setNewScreenplayTitle] = useState('')
  const saveTimer = useRef(null)
  const promptTimer = useRef(null)
  // Always-current refs used by the unmount-flush effect (cannot use state there)
  const latestBlocksRef = useRef(blocks)
  const latestDocIdRef = useRef(null)
  // Keep refs current so the unmount-flush effect always has fresh values
  latestBlocksRef.current = blocks
  if (currentDocument && isScreenplayDocument(currentDocument)) {
    latestDocIdRef.current = currentDocument.id
  }
  const refs = useRef({})
  const containerRef = useRef()
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const historyHydratingRef = useRef(false)
  const typingHistoryTimerRef = useRef(null)  // debounce handle for typing history
  const preTypingSnapshotRef  = useRef(null)  // blocks snapshot before current typing burst
  const [historyVersion, setHistoryVersion] = useState(0)
  const [findMatchIdx, setFindMatchIdx] = useState(0)

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

  const findMatches = useMemo(() => {
    if (!find.open || !find.query.trim()) return []
    try {
      const flags = find.matchCase ? '' : 'i'
      const escaped = escapeRegex(find.query)
      const pattern = find.wholeWord ? `\\b${escaped}\\b` : escaped
      const re = new RegExp(pattern, flags)
      return blocks
        .map((b, idx) => ({ blockId: b.id, blockIndex: idx, text: b.text }))
        .filter(m => re.test(m.text))
    } catch { return [] }
  }, [find.open, find.query, find.matchCase, find.wholeWord, blocks])

  // Reset active match index and scroll to first hit when query/options change
  useEffect(() => {
    setFindMatchIdx(0)
    if (findMatches.length > 0) {
      refs.current[findMatches[0].blockId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [find.query, find.matchCase, find.wholeWord]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCurrentScreenplayNow() {
    const doc = currentDocument   // capture at call time
    if (!isScreenplayDocument(doc)) return

    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }

    const content = blocksToFountain(blocks)
    const updated = await window.api.updateDocument(doc.id, { content })
    // Sync documents list so DocumentsWorkspace never opens a stale version
    const state = useStore.getState()
    const freshDocs = (state.documents || []).map(d => d.id === updated.id ? updated : d)
    setDocuments(freshDocs)
    // Only push currentDocument back if this doc is still active
    if (state.currentDocument?.id === doc.id) {
      setCurrentDocument(updated)
      setSavedAt(new Date())
    }
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

    // currentDocument is not a screenplay (e.g. a note or chat export opened
    // from DocumentsWorkspace). Redirect to the most-recently-updated screenplay
    // doc rather than blindly taking index [0].
    const fallback = screenplayDocuments.length > 0
      ? screenplayDocuments.reduce((best, d) =>
          new Date(d.updated_at || 0) > new Date(best.updated_at || 0) ? d : best
        )
      : null
    if (fallback && fallback.id !== currentDocument.id) {
      setCurrentDocument(fallback)
      addNotification?.(`Returned to screenplay document: ${fallback.title || 'Untitled'}.`, 'info')
    }
  }, [currentDocument?.id, currentDocument?.document_type, screenplayDocuments])

  // ── Phase 1: persist last active screenplay doc per project ───────────────
  // Fires whenever the active document or project changes. Guards ensure we
  // only write when the active document is genuinely a screenplay so notes /
  // chat exports never stomp the saved screenplay pointer.
  useEffect(() => {
    if (!currentDocument || !currentProject) return
    if (!isScreenplayDocument(currentDocument)) return
    _setLastActiveScreenplayDocId(currentProject.id, currentDocument.id)
  }, [currentDocument?.id, currentProject?.id])
  // ─────────────────────────────────────────────────────────────────────────

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
  // CRITICAL FIX: capture documentId at effect-run time so a navigation that
  // happens inside the 1.5 s debounce window never writes this content to
  // whichever document currentDocument happens to point to when the timer fires.
  useEffect(() => {
    if (!isScreenplayDocument(currentDocument)) return
    const documentId = currentDocument.id   // lock target at effect time
    if (saveTimer.current) clearTimeout(saveTimer.current)
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))
    saveTimer.current = setTimeout(async () => {
      const content = blocksToFountain(blocks)
      try {
        const updated = await window.api.updateDocument(documentId, { content })
        // Sync documents list so DocumentsWorkspace never opens a stale version
        const st = useStore.getState()
        const freshDocs = (st.documents || []).map(d => d.id === updated.id ? updated : d)
        setDocuments(freshDocs)
        // Only update currentDocument / savedAt if this doc is still displayed
        if (st.currentDocument?.id === documentId) {
          setCurrentDocument(updated)
          setSavedAt(new Date())
        }
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

  // Flush any unsaved content to DB when the component unmounts (e.g. user
  // navigates away before the 1.5s debounce fires). Uses refs so the closure
  // always sees the latest blocks / docId regardless of when React runs the
  // cleanup.  Fire-and-forget: also syncs the documents list so that
  // DocumentsWorkspace.openDocument() never hands back a stale copy.
  useEffect(() => {
    return () => {
      const docId = latestDocIdRef.current
      const dirtyBlocks = latestBlocksRef.current
      if (!docId || !dirtyBlocks) return
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      const flushContent = blocksToFountain(dirtyBlocks)
      window.api.updateDocument(docId, { content: flushContent })
        .then(updated => {
          const st = useStore.getState()
          const freshDocs = (st.documents || []).map(d => d.id === updated.id ? updated : d)
          st.setDocuments(freshDocs)
          if (st.currentDocument?.id === docId) {
            st.setCurrentDocument(updated)
          }
        })
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for menu element type commands
  useEffect(() => {
    const cleanup = window.api.onMenu('editor:set-element', (type) => {
      if (focusedId) {
        setBlocks(bs => bs.map(b => b.id === focusedId ? { ...b, type } : b))
      }
    })
    return cleanup
  }, [focusedId])

  // Cmd+F to open find bar (scoped to ScreenplayEditor lifecycle)
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        useStore.getState().openFind()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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

    // Snapshot focusId NOW, before any state changes, so the undo entry records
    // which block the user was in at the moment of this operation.
    const snapshotFocusId = focusedId

    // Flush any pending typing-burst checkpoint before recording a structural change.
    // This ensures "type hello → immediately press Enter" produces two distinct undo
    // steps: one for "hello" and one for the Enter, rather than losing the "hello" step.
    if (recordHistory && typingHistoryTimerRef.current) {
      clearTimeout(typingHistoryTimerRef.current)
      typingHistoryTimerRef.current = null
      if (preTypingSnapshotRef.current) {
        undoStackRef.current = [...undoStackRef.current.slice(-49), preTypingSnapshotRef.current]
        preTypingSnapshotRef.current = null
      }
    }

    resetPromptTimer()
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))

    setBlocks(currentBlocks => {
      if (recordHistory && !historyHydratingRef.current) {
        // Store {blocks, focusId} so undo can restore the exact block the user was in.
        undoStackRef.current = [...undoStackRef.current.slice(-49), { blocks: cloneBlocks(currentBlocks), focusId: snapshotFocusId }]
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
    const entry = undoStackRef.current.pop()
    if (!entry) return

    redoStackRef.current = [...redoStackRef.current.slice(-49), { blocks: cloneBlocks(blocks), focusId: focusedId }]
    setHistoryVersion(v => v + 1)
    const nextBlocks = cloneBlocks(entry.blocks)
    // Restore the block that had focus when this undo entry was recorded.
    // Fall back to the last block (not first) if that block no longer exists.
    const nextFocus = nextBlocks.find(b => b.id === entry.focusId) || nextBlocks[nextBlocks.length - 1]

    resetPromptTimer()
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))
    setBlocks(nextBlocks)
    setSelectedBlockIds([])

    if (nextFocus) {
      setTimeout(() => {
        const el = refs.current[nextFocus.id]
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
          setFocusedBlock(nextFocus.id)
        }
      }, 0)
    }
  }

  function handleRedo() {
    const entry = redoStackRef.current.pop()
    if (!entry) return

    undoStackRef.current = [...undoStackRef.current.slice(-49), { blocks: cloneBlocks(blocks), focusId: focusedId }]
    setHistoryVersion(v => v + 1)
    const nextBlocks = cloneBlocks(entry.blocks)
    const nextFocus = nextBlocks.find(b => b.id === entry.focusId) || nextBlocks[nextBlocks.length - 1]

    resetPromptTimer()
    window.dispatchEvent(new CustomEvent('slugline:save', { detail: 'saving' }))
    setBlocks(nextBlocks)
    setSelectedBlockIds([])

    if (nextFocus) {
      setTimeout(() => {
        const el = refs.current[nextFocus.id]
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
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

    // FIX: if the target block is empty, replace it in-place rather than
    // inserting after it. This prevents pasting into L1 (or any empty block)
    // from placing content at L2 instead.
    const targetIsEmpty = !targetBlock.text.trim()
    const nextBlocks = [...blocks]
    if (targetIsEmpty) {
      nextBlocks.splice(targetIndex, 1, ...newBlocks)   // replace the empty block
    } else {
      nextBlocks.splice(targetIndex + 1, 0, ...newBlocks) // insert after non-empty block
    }

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
    // Single-block in-text cut: explicit clipboard write + cursor-safe state update
    if (selectedBlockIds.length === 0) {
      const textarea = refs.current[block.id]
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      if (start === end) return  // no text selected; nothing to cut

      e.preventDefault()
      const selectedText = textarea.value.substring(start, end)

      // Write to clipboard — synchronous clipboardData path first (reliable in
      // Electron on macOS), async navigator.clipboard as backup.
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', selectedText)
      }
      try { await navigator.clipboard.writeText(selectedText) } catch (_) {}

      // Remove the selected text and restore cursor at the cut point
      const newText = textarea.value.substring(0, start) + textarea.value.substring(end)
      const detected = detectType(newText)
      const nextBlocks = blocks.map(b =>
        b.id === block.id ? { ...b, text: newText, type: detected || b.type } : b
      )
      commitBlocks(nextBlocks, { focusId: block.id, focusPosition: start })
      return
    }

    // Multi-block selection cut (unchanged)
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

    // Single-line paste with no multi-block selection:
    // Insert at the exact cursor position within the focused block.
    if (!text.includes('\n') && selectedBlockIds.length === 0) {
      e.preventDefault()
      const textarea = refs.current[block.id]
      const start = textarea ? textarea.selectionStart : block.text.length
      const end   = textarea ? textarea.selectionEnd   : block.text.length
      const newText = block.text.substring(0, start) + text + block.text.substring(end)
      const detected = detectType(newText)
      const nextBlocks = blocks.map(b =>
        b.id === block.id ? { ...b, text: newText, type: detected || b.type } : b
      )
      commitBlocks(nextBlocks, { focusId: block.id, focusPosition: start + text.length })
      return
    }

    // Multiline paste or multi-block selection replacement
    e.preventDefault()
    insertTextAsBlocks(text, block, index)
  }

  function updateBlock(id, text) {
    const detected = detectType(text)
    const nextBlocks = blocks.map(b => {
      if (b.id !== id) return b
      return { ...b, text, type: detected || b.type }
    })

    // Debounced history: capture a snapshot before the first character in this
    // typing burst, then commit it to the undo stack after 600 ms of inactivity.
    // Structural operations (Enter, Backspace-delete, etc.) call commitBlocks with
    // recordHistory:true, which flushes this timer first so the typing snapshot
    // lands as its own undo step before the structural one.
    if (!typingHistoryTimerRef.current) {
      preTypingSnapshotRef.current = { blocks: cloneBlocks(blocks), focusId: focusedId }
    }
    clearTimeout(typingHistoryTimerRef.current)
    typingHistoryTimerRef.current = setTimeout(() => {
      typingHistoryTimerRef.current = null
      if (preTypingSnapshotRef.current) {
        undoStackRef.current = [...undoStackRef.current.slice(-49), preTypingSnapshotRef.current]
        redoStackRef.current = []
        preTypingSnapshotRef.current = null
        setHistoryVersion(v => v + 1)
      }
    }, 600)

    commitBlocks(nextBlocks, { recordHistory: false })
  }

  function changeBlockType(blockId, type) {
    if (!ELEMENT_TYPES.includes(type)) return

    setOpenTypeMenuId(null)
    setOpenInsertMenuId(null)

    commitBlocks(blocks.map(b => (
      b.id === blockId ? { ...b, type } : b
    )), {
      focusId: blockId,
      focusPosition: 'end'
    })
  }

  function removeBlock(blockId) {
    const target = blocks.find(b => b.id === blockId)
    if (!target) return

    // Never leave zero blocks
    if (blocks.length <= 1) {
      const empty = { id: Date.now() + Math.random(), type: 'action', text: '' }
      commitBlocks([empty], { focusId: empty.id, focusPosition: 0 })
      return
    }

    const idx = blocks.findIndex(b => b.id === blockId)
    const nextBlocks = blocks.filter(b => b.id !== blockId)
    // Prefer next block; fall back to previous
    const focusTarget = nextBlocks[idx] ?? nextBlocks[idx - 1]

    setOpenTypeMenuId(null)
    setOpenInsertMenuId(null)

    commitBlocks(nextBlocks, {
      focusId: focusTarget?.id,
      focusPosition: 0
    })
  }


  function insertBlockNear(index, placement = 'below', type = 'action') {
    const safeType = ELEMENT_TYPES.includes(type) ? type : 'action'
    const newBlock = {
      id: Date.now() + Math.random(),
      type: safeType,
      text: ''
    }

    const nextBlocks = [...blocks]
    const insertIndex = placement === 'above' ? index : index + 1
    nextBlocks.splice(insertIndex, 0, newBlock)

    setOpenInsertMenuId(null)

    commitBlocks(nextBlocks, {
      selectedIds: [],
      focusId: newBlock.id,
      focusPosition: 0
    })
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
      : [{ id: Date.now() + Math.random(), type: 'action', text: '' }]

    // Focus the block immediately before the deleted range if it exists;
    // otherwise focus the block now at the first deleted index (clamped).
    const blockBeforeFirst = firstSelectedIndex > 0 ? blocks[firstSelectedIndex - 1] : null
    const nextFocus =
      (blockBeforeFirst && nextBlocks.find(b => b.id === blockBeforeFirst.id)) ||
      nextBlocks[Math.min(firstSelectedIndex, nextBlocks.length - 1)] ||
      nextBlocks[0]

    commitBlocks(nextBlocks, {
      selectedIds: [],
      focusId: nextFocus.id,
      focusPosition: 'end'
    })

    return true
  }

  function buildFindPattern(global = false) {
    const flags = (find.matchCase ? '' : 'i') + (global ? 'g' : '')
    const escaped = escapeRegex(find.query)
    const pattern = find.wholeWord ? `\\b${escaped}\\b` : escaped
    return new RegExp(pattern, flags)
  }

  function handleFindNext() {
    if (findMatches.length === 0) return
    const next = (findMatchIdx + 1) % findMatches.length
    setFindMatchIdx(next)
    const target = findMatches[next]
    if (target) refs.current[target.blockId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function handleFindPrev() {
    if (findMatches.length === 0) return
    const prev = (findMatchIdx - 1 + findMatches.length) % findMatches.length
    setFindMatchIdx(prev)
    const target = findMatches[prev]
    if (target) refs.current[target.blockId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function handleFindReplace() {
    if (findMatches.length === 0 || !find.query) return
    const match = findMatches[findMatchIdx]
    if (!match) return
    const re = buildFindPattern(false)
    const newText = match.text.replace(re, find.replaceQuery)
    if (newText === match.text) return
    const nextBlocks = blocks.map(b => b.id === match.blockId ? { ...b, text: newText } : b)
    commitBlocks(nextBlocks, { focusId: match.blockId, focusPosition: 'end' })
  }

  function handleFindReplaceAll() {
    if (findMatches.length === 0 || !find.query) return
    const re = buildFindPattern(true)
    const matchSet = new Set(findMatches.map(m => m.blockId))
    const count = findMatches.length
    const nextBlocks = blocks.map(b => {
      if (!matchSet.has(b.id)) return b
      return { ...b, text: b.text.replace(re, find.replaceQuery) }
    })
    commitBlocks(nextBlocks, {})
    addNotification?.(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}.`, 'success')
    setFindMatchIdx(0)
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

    // Delete on empty focused block — remove it and focus the next block
    // (forward direction, consistent with Delete = delete-forward semantics).
    if (e.key === 'Delete' && !block.text && blocks.length > 1) {
      e.preventDefault()
      const nextBlock = blocks[index + 1] ?? blocks[index - 1]
      const nextBlocks = blocks.filter(b => b.id !== block.id)
      commitBlocks(nextBlocks, { focusId: nextBlock?.id, focusPosition: 0 })
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
      const newType = nextElementType(block.type)
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

    // FIX: Backspace at the start of a non-empty block — merge this block's
    // text onto the end of the previous block and remove this block.
    if (e.key === 'Backspace' && block.text && index > 0) {
      const textarea = refs.current[block.id]
      if (textarea && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
        e.preventDefault()
        const prevBlock = blocks[index - 1]
        const joinPos = prevBlock.text.length
        const mergedText = prevBlock.text + block.text
        const nextBlocks = blocks
          .map(b => b.id === prevBlock.id ? { ...b, text: mergedText } : b)
          .filter(b => b.id !== block.id)
        commitBlocks(nextBlocks, {
          focusId: prevBlock.id,
          focusPosition: joinPos
        })
        return
      }
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

  useEffect(() => {
    function handleGlobalMouseDown(e) {
      if (!openInsertMenuId && !openTypeMenuId) return
      if (e.target.closest?.('[data-screenplay-floating-panel]')) return
      setOpenInsertMenuId(null)
      setOpenTypeMenuId(null)
    }

    function handleGlobalKeyDown(e) {
      if (e.key === 'Escape') {
        setOpenInsertMenuId(null)
        setOpenTypeMenuId(null)
        useStore.getState().closeFind()
      }
    }

    document.addEventListener('mousedown', handleGlobalMouseDown, true)
    document.addEventListener('keydown', handleGlobalKeyDown, true)

    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown, true)
      document.removeEventListener('keydown', handleGlobalKeyDown, true)
    }
  }, [openInsertMenuId, openTypeMenuId])

  const annotatedTextSet = React.useMemo(
    () => new Set((annotations || []).filter(a => !a.resolved).map(a => a.anchor_text && a.anchor_text.trim()).filter(Boolean)),
    [annotations]
  )

  function handleBlockContextMenu(e, block) {
    e.preventDefault()
    setBlockContextMenu({ x: e.clientX, y: e.clientY, block })
  }

  async function handleSaveComment(block, text) {
    if (!text.trim() || !currentDocument) return
    const saved = await window.api.upsertAnnotation({
      document_id: currentDocument.id,
      anchor_text: block.text.trim(),
      block_type: block.type,
      comment: text.trim()
    })
    setAnnotations([...(annotations || []), saved])
    setAddCommentForm(null)
    addNotification('Comment added', 'success')
  }

  const focusedBlock = blocks.find(b => b.id === focusedId)
  const canUndo = undoStackRef.current.length > 0
  const canRedo = redoStackRef.current.length > 0
  void historyVersion
  const findMatchSet = new Set(findMatches.map(m => m.blockId))
  const findActiveBlockId = findMatches[findMatchIdx]?.blockId ?? null

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
        <div
          style={{
            display: 'block',
            width: '100%',
            minWidth: '8.5in',
            padding: 0,
            boxSizing: 'border-box'
          }}
        >
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
                blockIndex={index}
                lineNumber={index + 1}
                focused={focusedId === block.id}
                selected={selectedBlockIds.includes(block.id)}
                findMatch={!selectedBlockIds.includes(block.id) && findMatchSet.has(block.id)}
                findMatchActive={!selectedBlockIds.includes(block.id) && block.id === findActiveBlockId}
                inputRef={el => refs.current[block.id] = el}
                onFocus={() => setFocusedBlock(block.id)}
                onMouseDown={e => handleBlockSelect(e, block)}
                onChange={text => updateBlock(block.id, text)}
                onTypeChange={() => {
                  setFocusedBlock(block.id)
                  setOpenInsertMenuId(null)
                  setOpenTypeMenuId(current => current === block.id ? null : block.id)
                }}
                onChangeBlockType={type => changeBlockType(block.id, type)}
                typeMenuOpen={openTypeMenuId === block.id}
                insertMenuOpen={openInsertMenuId === block.id}
                onToggleInsertMenu={() => {
                  setFocusedBlock(block.id)
                  setOpenTypeMenuId(null)
                  setOpenInsertMenuId(current => current === block.id ? null : block.id)
                }}
                onInsertBlock={(placement, type) => insertBlockNear(index, placement, type)}
                onRemoveBlock={() => removeBlock(block.id)}
                insertPlacement={insertPlacement}
                onSetInsertPlacement={setInsertPlacement}
                onKeyDown={e => handleKeyDown(e, block, index)}
                onCopy={handleCopy}
                onCut={e => handleCut(e, block, index)}
                onPaste={e => handlePaste(e, block, index)}
                hasAnnotation={annotatedTextSet.has(block.text.trim())}
                onContextMenu={e => handleBlockContextMenu(e, block)}
                sceneNumber={block.type === 'scene-heading' && activeRevision?.locked_at ? sceneNumberMap[block.text.trim().toUpperCase()] : undefined}
                hasRevisionChange={block.type === 'scene-heading' && activeRevision?.locked_at ? changedSceneSet.has(block.text.trim().toUpperCase()) : false}
                revisionColor={activeRevision ? (REVISION_COLORS[activeRevision.draft_color] || REVISION_COLORS.blue) : undefined}
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
      </div>

      {/* Screenplay toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: sceneNavigatorCollapsed ? 56 : 192,
          display: layoutMode === 'focus' ? 'none' : 'flex',
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
        <button
          className="btn btn-ghost btn-sm no-drag"
          type="button"
          onClick={() => {
            const charNames = characters.map(c => c.name).filter(Boolean).join(', ')
            const worldEntries = worldBuilding.map(w => w.title || w.category).filter(Boolean).join(', ')
            const beatSummary = beats.map(b => b.title || b.description).filter(Boolean).join('; ')
            const scriptText = blocks.map(b => b.text).join('\n')
            const parts = ["I'm stuck on my screenplay and need help getting unstuck."]
            if (charNames) parts.push('Characters: ' + charNames)
            if (worldEntries) parts.push('World/Setting: ' + worldEntries)
            if (beatSummary) parts.push('Beat sheet: ' + beatSummary)
            if (scriptText) parts.push('Current script excerpt:\n' + scriptText.slice(-1500))
            openChat(parts.join('\n\n'))
          }}
          title="Get unstuck with Claude"
          style={{ height: 30, padding: '0 9px', whiteSpace: 'nowrap' }}
        >
          ✦ I'm Stuck
        </button>
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
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={saveCurrentScreenplayNow}
          title="Save screenplay now"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          💾 Save
        </button>
        {focusedBlock && (
          <>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleInlineSuggest('Improve this line')}>✨ Suggest</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleRewriteScene}>↻ Rewrite Scene</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleRewriteDocument}>Rewrite Document</button>
          </>
        )}
      </div>

      {/* Find Bar */}
      <FindBar
        matches={findMatches}
        currentMatchIndex={findMatchIdx}
        onNext={handleFindNext}
        onPrev={handleFindPrev}
        onReplace={handleFindReplace}
        onReplaceAll={handleFindReplaceAll}
      />

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

      {blockContextMenu && (
        <div
          style={{
            position: 'fixed', top: blockContextMenu.y, left: blockContextMenu.x,
            zIndex: 9000, background: 'var(--bg-raised)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '4px 0', minWidth: 168,
            boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
            fontFamily: 'var(--font-ui)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', padding: '7px 14px', borderRadius: 0, border: 'none', fontSize: 12 }}
            onClick={() => { setBlockContextMenu(null); setAddCommentForm({ block: blockContextMenu.block, text: '' }) }}>
            ◉ Add Comment
          </button>
          <button className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', padding: '7px 14px', borderRadius: 0, border: 'none', fontSize: 12 }}
            onClick={() => { setBlockContextMenu(null); toggleAnnotationPanel() }}>
            ≡ View All Comments
          </button>
          <button className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', padding: '7px 14px', borderRadius: 0, border: 'none', fontSize: 12 }}
            onClick={() => {
              const anchor = blockContextMenu.block?.text || ''
              setBlockContextMenu(null)
              openChat('Ask Claude about this passage:\n\n"' + anchor.slice(0, 400) + '"')
            }}>
            ✦ Ask Claude
          </button>
        </div>
      )}

      {addCommentForm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.48)' }}
          onClick={() => setAddCommentForm(null)}
        >
          <div
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--amber)', marginBottom: 10 }}>Add Comment</div>
            <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, padding: '6px 8px', background: 'var(--bg-panel)', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{addCommentForm.block.text}"
            </div>
            <textarea
              autoFocus
              value={addCommentForm.text}
              onChange={e => setAddCommentForm(fm => ({ ...fm, text: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveComment(addCommentForm.block, addCommentForm.text) }
                if (e.key === 'Escape') setAddCommentForm(null)
              }}
              placeholder="Write a comment… (Enter to save)"
              rows={3}
              style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '8px 10px', resize: 'vertical', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setAddCommentForm(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleSaveComment(addCommentForm.block, addCommentForm.text)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BlockLine({ block, blockIndex, lineNumber, focused, selected, findMatch, findMatchActive, inputRef, onFocus, onMouseDown, onChange, onTypeChange, onChangeBlockType, typeMenuOpen, insertMenuOpen, onToggleInsertMenu, onInsertBlock, onRemoveBlock, insertPlacement, onSetInsertPlacement, onKeyDown, onCopy, onCut, onPaste, hasAnnotation, onContextMenu, sceneNumber, hasRevisionChange, revisionColor }) {
  const controlsVisible = focused || selected || typeMenuOpen || insertMenuOpen
  const localRef = useRef(null)
  const lineRef = useRef(null)
  const [trayFlipUp, setTrayFlipUp] = useState(false)

  // Measure viewport room when a tray opens, flip above line if < 300px below
  useEffect(() => {
    if (!typeMenuOpen && !insertMenuOpen) return
    if (!lineRef.current) return
    const rect = lineRef.current.getBoundingClientRect()
    setTrayFlipUp(window.innerHeight - rect.bottom < 300)
  }, [typeMenuOpen, insertMenuOpen])

  useEffect(() => {
    const ta = localRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [block.text, block.type])

  const trayPositionStyle = trayFlipUp
    ? { bottom: '100%', marginBottom: 6 }
    : { top: '100%', marginTop: 6 }

  const styleMap = {
    'scene-heading': { textTransform: 'uppercase', fontWeight: 'bold', marginTop: '2em', color: 'var(--text-primary)' },
    'action': { marginBottom: '0.5em' },
    'character': { marginLeft: '2.0in', marginTop: '1em', textTransform: 'uppercase' },
    'dialogue': { marginLeft: '1.0in', marginRight: '0.5in' },
'parenthetical': { marginLeft: '1.5in', marginRight: '1.5in' },    'transition': { textAlign: 'right', textTransform: 'uppercase', marginTop: '1em' },
    'shot': { textTransform: 'uppercase', marginTop: '1em', fontWeight: 600 },
    'note': { color: 'var(--text-muted)', fontStyle: 'italic' }
  }

  // FIX: text-style-only map for the <textarea> — no margins or spacing.
  // styleMap is spread on the outer div (layout/indentation).
  // textStyleMap is spread on the textarea (typography only).
  // Previously spreading styleMap on BOTH doubled all margins, pushing
  // Character/Dialogue/Parenthetical far off-screen to the right.
  const textStyleMap = {
    'scene-heading': { textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--text-primary)' },
    'action': {},
    'character': { textTransform: 'uppercase' },
    'dialogue': {},
    'parenthetical': {},
    'transition': { textAlign: 'right', textTransform: 'uppercase' },
    'shot': { textTransform: 'uppercase', fontWeight: 600 },
    'note': { color: 'var(--text-muted)', fontStyle: 'italic' }
  }

  const chipLabels = {
    'scene-heading': 'SCENE',
    'action': 'ACTION',
    'character': 'CHAR',
    'dialogue': 'DIAL',
    'parenthetical': 'PAREN',
    'transition': 'TRANS',
    'shot': 'SHOT',
    'note': 'NOTE'
  }

  return (
    <div
      ref={lineRef}
      className="screenplay-line"
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      style={{
        position: 'relative',
        borderRadius: 4,
        outline: selected ? '1px solid var(--amber)' : findMatchActive ? '2px solid var(--amber)' : findMatch ? '1px solid rgba(200,150,62,0.45)' : '1px solid transparent',
        background: selected ? 'var(--amber-subtle)' : findMatchActive ? 'rgba(200,150,62,0.22)' : findMatch ? 'rgba(200,150,62,0.09)' : 'transparent',
        ...styleMap[block.type]
      }}
    >
      <div
        aria-label={`Screenplay line ${lineNumber}`}
        title={`Screenplay line ${lineNumber}`}
        style={{
          position: 'absolute',
          left: -144,
          top: 2,
          minWidth: 24,
          textAlign: 'right',
          fontSize: 9,
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-muted)',
          opacity: controlsVisible ? 0.85 : 0.28,
          transition: 'opacity 0.15s',
          userSelect: 'none'
        }}
      >
        L{lineNumber}
      </div>

      {hasAnnotation && (
        <span
          style={{ position: 'absolute', right: -24, top: 3, fontSize: 11, color: 'var(--amber)', cursor: 'pointer', userSelect: 'none', opacity: 0.8, lineHeight: 1 }}
          title="Has comment"
          onClick={onContextMenu}
        >
          ◉
        </span>
      )}
      {sceneNumber !== undefined && (
        <span
          style={{ position: 'absolute', left: -52, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontFamily: 'var(--font-screenplay)', color: 'var(--text-muted)', userSelect: 'none', fontWeight: 700, opacity: 0.75, letterSpacing: '0.03em' }}
          title={'Scene ' + sceneNumber}
        >
          {'A' + sceneNumber}
        </span>
      )}
      {hasRevisionChange && (
        <span
          style={{ position: 'absolute', right: -40, top: 0, fontSize: 15, color: revisionColor || 'var(--amber)', userSelect: 'none', opacity: 1, lineHeight: 1, fontWeight: 900 }}
          title="Changed since locked draft"
        >
          *
        </span>
      )}

      <button
        type="button"
        data-screenplay-floating-panel
        className="element-badge selectable"
        onMouseDown={e => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={e => {
          e.preventDefault()
          e.stopPropagation()
          onTypeChange()
        }}
        title={`Change L${lineNumber} type: ${ELEMENT_LABELS[block.type]}`}
        style={{
          cursor: 'pointer',
          border: '1px solid var(--border-subtle)',
          borderRadius: 999,
          background: typeMenuOpen ? 'var(--amber-subtle)' : 'var(--bg-raised)',
          color: typeMenuOpen ? 'var(--amber)' : 'var(--text-muted)',
          padding: '2px 7px',
          width: 54,
          height: 22,
          fontSize: 9,
          fontFamily: 'var(--font-ui)',
          letterSpacing: '0.04em',
          textAlign: 'center',
          pointerEvents: 'auto',
          zIndex: 2
        }}
      >
        {chipLabels[block.type] || 'TYPE'}
      </button>

      <div
        data-screenplay-floating-panel
        style={{
          position: 'absolute',
          left: -126,
          top: 22,
          opacity: controlsVisible ? 1 : 0,
          transition: 'opacity 0.15s',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm selectable"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            onToggleInsertMenu()
          }}
          title={insertMenuOpen ? 'Close insert panel' : 'Open insert panel'}
          style={{
            width: 22,
            height: 22,
            padding: 0,
            borderRadius: 999,
            justifyContent: 'center',
            background: insertMenuOpen ? 'var(--amber-subtle)' : 'var(--bg-raised)',
            borderColor: insertMenuOpen ? 'var(--amber)' : 'var(--border-subtle)'
          }}
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm selectable"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            onRemoveBlock()
          }}
          title="Remove block"
          aria-label="Remove block"
          style={{
            width: 22,
            height: 22,
            padding: 0,
            borderRadius: 999,
            justifyContent: 'center',
            background: 'var(--bg-raised)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Type-change tray — absolute, local to this line */}
      {typeMenuOpen && (
        <div
          data-screenplay-floating-panel
          className="selectable screenplay-tray"
          style={trayPositionStyle}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                Change type
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Line L{lineNumber}
              </div>
            </div>
            <button
              type="button"
              data-screenplay-floating-panel
              className="btn btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onTypeChange() }}
              title="Close type menu"
              style={{ height: 24, padding: '0 8px', borderRadius: 999 }}
            >
              Close ×
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {ELEMENT_TYPES.map(t => (
              <button
                key={t}
                type="button"
                data-screenplay-floating-panel
                className={`btn ${block.type === t ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                onClick={e => { e.stopPropagation(); onChangeBlockType(t) }}
                title={`Change L${lineNumber} to ${ELEMENT_LABELS[t]}`}
                style={{ minHeight: 30, height: 'auto', padding: '6px 8px', justifyContent: 'flex-start', whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'left' }}
              >
                {ELEMENT_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Insert-block tray — absolute, local to this line */}
      {insertMenuOpen && (
        <div
          data-screenplay-floating-panel
          className="selectable screenplay-tray"
          style={trayPositionStyle}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                Insert block
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Around L{lineNumber}
              </div>
            </div>
            <button
              type="button"
              data-screenplay-floating-panel
              className="btn btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onToggleInsertMenu() }}
              title="Close insert menu"
              style={{ height: 24, padding: '0 8px', borderRadius: 999 }}
            >
              Close ×
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              data-screenplay-floating-panel
              className={`btn ${insertPlacement === 'above' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={e => { e.stopPropagation(); onSetInsertPlacement('above') }}
              style={{ height: 28, padding: '0 8px' }}
            >
              Above
            </button>
            <button
              type="button"
              data-screenplay-floating-panel
              className={`btn ${insertPlacement === 'below' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={e => { e.stopPropagation(); onSetInsertPlacement('below') }}
              style={{ height: 28, padding: '0 8px' }}
            >
              Below
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {ELEMENT_TYPES.map(t => (
              <button
                key={t}
                type="button"
                data-screenplay-floating-panel
                className="btn btn-ghost btn-sm"
                onClick={e => { e.stopPropagation(); onInsertBlock(insertPlacement, t) }}
                title={`${insertPlacement === 'above' ? 'Insert above' : 'Insert below'} L${lineNumber}: ${ELEMENT_LABELS[t]}`}
                style={{ minHeight: 30, height: 'auto', padding: '6px 8px', justifyContent: 'flex-start', whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'left' }}
              >
                {ELEMENT_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        ref={el => {
          localRef.current = el
          if (typeof inputRef === 'function') inputRef(el)
        }}
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
          ...textStyleMap[block.type]
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

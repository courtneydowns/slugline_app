const Anthropic = require('@anthropic-ai/sdk')
const { getApiKey } = require('./config')
const db = require('./db')
const { CLAUDE_MODELS, selectClaudeModel, selectMaxTokens } = require('./claude-config')

// ─── Truncation / continuation settings ──────────────────────────────────────
// Used by both complete() and handleChat() when the API returns stop_reason='max_tokens'.
const CONTINUATION_PROMPT   = 'Continue exactly where you left off. Do not repeat prior text.'
const MAX_CONTINUATION_PASSES = 2

// Active chat streams keyed by project/session/request so the renderer can stop
// one running chat without affecting another chat tab.
const activeChatRequests = new Map()

function chatRequestKey(projectId, chatSessionId, requestId) {
  return `${projectId || 'no-project'}:${chatSessionId || 'no-session'}:${requestId || 'no-request'}`
}

function handleCancelChat(event, { projectId, chatSessionId, requestId }) {
  const key = chatRequestKey(projectId, chatSessionId || null, requestId)
  const active = activeChatRequests.get(key)

  if (!active) return { cancelled: false }

  active.cancelled = true

  try {
    if (active.stream && typeof active.stream.abort === 'function') {
      active.stream.abort()
    } else if (active.stream?.controller && typeof active.stream.controller.abort === 'function') {
      active.stream.controller.abort()
    }
  } catch (err) {
    // The stream may already be closing; cancellation should remain best-effort.
  }

  return { cancelled: true }
}

function getClient() {
  const key = getApiKey()
  if (!key) throw new Error('No API key configured. Go to Settings to add your Anthropic API key.')
  return new Anthropic({ apiKey: key })
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4)
}

async function complete({ feature, messages, system, projectId }) {
  const model     = selectClaudeModel(feature)
  const maxTokens = selectMaxTokens(feature)
  const client    = getClient()
  const inputEstimate = estimateTokens((system || '') + messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n'))

  let fullContent    = ''
  let totalInput     = 0
  let totalOutput    = 0
  let wasTruncated   = false
  let currentMessages = [...messages]

  for (let pass = 0; pass <= MAX_CONTINUATION_PASSES; pass++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: system || undefined,
      messages: currentMessages
    })

    const chunk      = response.content[0]?.text || ''
    const stopReason = response.stop_reason
    const usage      = response.usage || {}

    fullContent  += chunk
    totalInput   += usage.input_tokens  || (pass === 0 ? inputEstimate : 0)
    totalOutput  += usage.output_tokens || 0

    if (stopReason !== 'max_tokens') break   // clean stop — done

    // Truncated: prepare continuation unless we've exhausted passes
    wasTruncated = true
    if (pass >= MAX_CONTINUATION_PASSES) break

    // Build continuation: append what the model wrote, then ask it to continue
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: chunk },
      { role: 'user',      content: CONTINUATION_PROMPT }
    ]
  }

  if (projectId) db.logTokenUsage({
    project_id: projectId, model, feature,
    input_tokens: totalInput, output_tokens: totalOutput
  })

  return {
    content:     fullContent,
    model,
    wasTruncated,
    usage: { input: totalInput, output: totalOutput }
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

async function handleValidateApiKey(event, { apiKey }) {
  try {
    const client = new Anthropic({ apiKey })
    await client.messages.create({ model: CLAUDE_MODELS.haiku, max_tokens: selectMaxTokens('validate'), messages: [{ role: 'user', content: 'Hi' }] })
    const { setApiKey } = require('./config')
    setApiKey(apiKey)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}

async function handleChat(event, { projectId, message, chatHistory, documentContext, chatSessionId, requestId }) {
  const model  = selectClaudeModel('chat')
  const client = getClient()
  const requestKey = chatRequestKey(projectId, chatSessionId || null, requestId)
  const activeRequest = { cancelled: false, stream: null }
  activeChatRequests.set(requestKey, activeRequest)

  const project = db.getProject(projectId)

  const characters   = db.getCharacters(projectId)
  const worldNotes   = db.getWorldBuilding(projectId)
  const research     = db.getResearch(projectId)

  const bibleContext = [
    characters.length  ? `CHARACTERS:\n${characters.map(c => `${c.name} — ${c.role || ''}\n${c.arc || ''}`).join('\n\n')}` : '',
    worldNotes.length  ? `WORLD NOTES:\n${worldNotes.slice(0, 8).map(w => `[${w.category}] ${w.title}: ${(w.content || '').slice(0, 200)}`).join('\n')}` : '',
    research.length    ? `RESEARCH:\n${research.slice(0, 4).map(r => `${r.title}: ${r.summary || ''}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n')

  // ── Cross-session memory: inject summaries of recent saved sessions ─────
  const recentSummaries = db.getSessionSummaries(projectId, 3)
  const summaryContext = recentSummaries.length
    ? `PRIOR SESSION CONTEXT (most recent first):\n${recentSummaries.map((s, i) => `[Session ${i + 1}]\n${s.summary}`).join('\n\n')}`
    : ''

  const systemPrompt = [
    `You are a screenplay development collaborator working on "${project.title}".`,
    project.logline  ? `Logline: ${project.logline}` : '',
    project.format   ? `Format: ${project.format === 'pilot' ? 'TV Pilot / Limited Series' : project.format === 'series' ? 'TV Series' : project.format === 'episode' ? 'Episode' : 'Feature Film'}` : '',
    project.tone     ? `Tone: ${project.tone}` : '',
    summaryContext   ? `\n${summaryContext}` : '',
    bibleContext     ? `\nSTORY BIBLE:\n${bibleContext}` : '',
    documentContext  ? `\nCURRENT SCENE CONTEXT:\n${documentContext.slice(0, 800)}` : '',
    '\nWhen writing screenplay content, use proper screenplay format. Be a creative collaborator, not just an assistant.'
  ].filter(Boolean).join('\n')

  const recentHistory = (chatHistory || []).slice(-10).map(m => ({ role: m.role, content: m.content }))
  const messages      = [...recentHistory, { role: 'user', content: message }]

  db.addChatMessage({ project_id: projectId, role: 'user', content: message, context: 'chat', chat_session_id: chatSessionId || null })

  let fullContent  = ''
  let totalInput   = 0
  let totalOutput  = 0

  // ── Streaming pass — with automatic continuation on max_tokens ────────────
  async function streamPass(passMessages, passNumber) {
    if (activeRequest.cancelled) return

    const stream = client.messages.stream({
      model,
      max_tokens: selectMaxTokens('chat'),
      system: systemPrompt,
      messages: passMessages
    })

    activeRequest.stream = stream

    stream.on('text', (text) => {
      if (activeRequest.cancelled) return
      fullContent += text
      event.sender.send('claude:stream-chunk', {
        projectId,
        chatSessionId: chatSessionId || null,
        requestId: requestId || null,
        chunk: text
      })
    })

    const finalMsg   = await stream.finalMessage()
    const usage      = finalMsg.usage || {}
    const stopReason = finalMsg.stop_reason

    totalInput  += usage.input_tokens  || 0
    totalOutput += usage.output_tokens || 0

    if (activeRequest.cancelled) return

    if (stopReason === 'max_tokens' && passNumber < MAX_CONTINUATION_PASSES) {
      // Notify the renderer a continuation is starting
      event.sender.send('claude:stream-chunk', {
        projectId,
        chatSessionId: chatSessionId || null,
        requestId: requestId || null,
        chunk: '\n\n[Response reached output limit — continuing…]\n\n'
      })

      // Build continuation turn
      const continuationMessages = [
        ...passMessages,
        { role: 'assistant', content: finalMsg.content[0]?.text || '' },
        { role: 'user',      content: CONTINUATION_PROMPT }
      ]
      await streamPass(continuationMessages, passNumber + 1)
    } else if (passNumber >= MAX_CONTINUATION_PASSES) {
      // Final automatic continuation pass completed.
      // Even if the API reports a clean stop, show the user how to keep going.
      event.sender.send('claude:stream-chunk', {
        projectId,
        chatSessionId: chatSessionId || null,
        requestId: requestId || null,
        chunk: '\n\n[Automatic continuation limit reached. Send “continue” and I’ll pick up exactly where I left off.]\n\n'
      })
    }
    // else: clean stop — done
  }

  try {
    await streamPass(messages, 0)

    if (activeRequest.cancelled) {
      const cancelledContent = fullContent
        ? `${fullContent}\n\n[Generation stopped by user.]`
        : '[Generation stopped by user.]'

      db.addChatMessage({ project_id: projectId, role: 'assistant', content: cancelledContent, model, tokens_used: totalOutput, context: 'chat', chat_session_id: chatSessionId || null })
      db.logTokenUsage({ project_id: projectId, model, feature: 'chat', input_tokens: totalInput, output_tokens: totalOutput })

      event.sender.send('claude:stream-chunk', {
        projectId,
        chatSessionId: chatSessionId || null,
        requestId: requestId || null,
        chunk: fullContent ? '\n\n[Generation stopped by user.]' : '[Generation stopped by user.]'
      })

      return { content: cancelledContent, model, cancelled: true, usage: { input_tokens: totalInput, output_tokens: totalOutput } }
    }

    db.addChatMessage({ project_id: projectId, role: 'assistant', content: fullContent, model, tokens_used: totalOutput, context: 'chat', chat_session_id: chatSessionId || null })
    db.logTokenUsage({ project_id: projectId, model, feature: 'chat', input_tokens: totalInput, output_tokens: totalOutput })

    return { content: fullContent, model, usage: { input_tokens: totalInput, output_tokens: totalOutput } }
  } catch (err) {
    if (activeRequest.cancelled) {
      const cancelledContent = fullContent
        ? `${fullContent}\n\n[Generation stopped by user.]`
        : '[Generation stopped by user.]'

      db.addChatMessage({ project_id: projectId, role: 'assistant', content: cancelledContent, model, tokens_used: totalOutput, context: 'chat', chat_session_id: chatSessionId || null })
      db.logTokenUsage({ project_id: projectId, model, feature: 'chat', input_tokens: totalInput, output_tokens: totalOutput })

      event.sender.send('claude:stream-chunk', {
        projectId,
        chatSessionId: chatSessionId || null,
        requestId: requestId || null,
        chunk: fullContent ? '\n\n[Generation stopped by user.]' : '[Generation stopped by user.]'
      })

      return { content: cancelledContent, model, cancelled: true, usage: { input_tokens: totalInput, output_tokens: totalOutput } }
    }

    if (fullContent) {
      db.addChatMessage({ project_id: projectId, role: 'assistant', content: fullContent, model, context: 'chat', chat_session_id: chatSessionId || null })
    }
    throw err
  } finally {
    activeChatRequests.delete(requestKey)
  }
}

async function handleInlineSuggestion(event, { projectId, selectedText, instruction, context }) {
  return complete({
    feature: 'inline-suggest', projectId,
    system: 'You are a screenplay editor. Provide a single improved version of the given text. Return ONLY the rewritten text with a brief one-sentence explanation prefixed with "WHY: ". Format: WHY: [reason]\n\n[rewritten text]',
    messages: [{ role: 'user', content: `Context: ${context || ''}\n\nText to improve: "${selectedText}"\n\nInstruction: ${instruction || 'Improve this for a screenplay'}` }]
  })
}

async function handleFullRewrite(event, { projectId, content, instruction }) {
  return complete({
    feature: 'full-rewrite', projectId,
    system: 'You are an expert screenplay writer. Rewrite the provided scene or section. Maintain proper screenplay format. After the rewrite, add a section starting with "---CHANGES---" listing the key changes you made and why.',
    messages: [{ role: 'user', content: `${instruction || 'Rewrite and improve this scene:'}\n\n${content}` }]
  })
}

async function handleToneAdjust(event, { projectId, content, targetTone }) {
  return complete({
    feature: 'tone-adjust', projectId,
    system: 'You are a screenplay editor specializing in tone and voice. Adjust the writing tone while preserving the story content and screenplay format. Add WHY: [explanation] at the end.',
    messages: [{ role: 'user', content: `Adjust this to be more ${targetTone}:\n\n${content}` }]
  })
}

async function handleSceneAnalysis(event, { projectId, sceneContent }) {
  const result = await complete({
    feature: 'scene-analyze', projectId,
    system: `You are a screenplay analyst. Analyze the scene and return a JSON object with these exact keys:\n{"pacing":"fast|medium|slow","tension":1-10,"dialogueRatio":0-100,"hasConflict":true|false,"movesStoryForward":true|false,"conflict":"description or null","issues":["array"],"strengths":["array"],"suggestions":["array"]}\nReturn ONLY valid JSON, no other text.`,
    messages: [{ role: 'user', content: sceneContent }]
  })
  try { return { ...result, analysis: JSON.parse(result.content) } }
  catch { return result }
}

async function handleDialogueCoach(event, { projectId, content }) {
  const result = await complete({
    feature: 'dialogue-coach', projectId,
    system: `You are a dialogue expert for screenwriting. Analyze the dialogue and return JSON:\n{"characterVoiceIssues":[{"character":"name","issue":"description","example":"line"}],"onTheNoseLines":[{"line":"text","suggestion":"improvement"}],"tooLongMonologues":[{"character":"name","lineCount":0}],"redundantLines":[{"line":"text","reason":"why"}],"overallScore":1-10,"summary":"assessment"}\nReturn ONLY valid JSON.`,
    messages: [{ role: 'user', content }]
  })
  try { return { ...result, analysis: JSON.parse(result.content) } }
  catch { return result }
}

async function handleDevelopmentQuestion(event, { projectId, question, answers, step, isBeginnerMode }) {
  const project = db.getProject(projectId)
  return complete({
    feature: 'development', projectId,
    system: isBeginnerMode
      ? 'You are a warm, encouraging screenplay development mentor working with a complete beginner. Ask one question at a time. Explain every term in plain language with examples. Be specific and encouraging. Help them discover their story.'
      : 'You are a screenplay development consultant. Guide the writer through structured development questions efficiently.',
    messages: [{ role: 'user', content: `Project so far: ${JSON.stringify({ ...project, answers })}\n\nCurrent step: ${step}\nQuestion to answer: ${question}` }]
  })
}

async function handleGenerateStoryBible(event, { projectId }) {
  const data   = db.getFullProjectData(projectId)
  const result = await complete({
    feature: 'story-bible-generate', projectId,
    system: 'You are a screenplay development expert. Generate a comprehensive story bible from the provided development answers. Return JSON with keys: characters (array of {name,role,arc,traits,relationships,notes}), worldNotes (array of {category,title,content}), themes (array of strings), tone_description (string). Return ONLY valid JSON.',
    messages: [{ role: 'user', content: JSON.stringify(data.project) }]
  })
  try {
    const bible = JSON.parse(result.content)
    if (bible.characters) bible.characters.forEach(c => db.upsertCharacter({ project_id: projectId, ...c }))
    if (bible.worldNotes) bible.worldNotes.forEach(w => db.upsertWorldBuilding({ project_id: projectId, ...w }))
    return { success: true, bible }
  } catch {
    return { success: false, content: result.content }
  }
}

async function handleLoglineAssist(event, { projectId, answers }) {
  const result = await complete({
    feature: 'logline', projectId,
    system: 'You are a logline specialist. Generate 3 logline options based on the story details. Format: return JSON array of 3 strings, each a complete logline.',
    messages: [{ role: 'user', content: JSON.stringify(answers) }]
  })
  try { return { loglines: JSON.parse(result.content), usage: result.usage } }
  catch { return { loglines: [result.content], usage: result.usage } }
}

async function handleResearchIngest(event, { projectId, title, content, sourceType, sourceUrl }) {
  const result = await complete({
    feature: 'research-ingest', projectId,
    system: 'You are a research assistant for screenwriters. Summarize the provided content into a concise, useful reference. Focus on facts, details, and elements relevant to storytelling. Keep it under 200 words.',
    messages: [{ role: 'user', content: `Title: ${title}\n\nContent:\n${content.slice(0, 8000)}` }]
  })
  const saved = db.addResearch({ project_id: projectId, title, source_type: sourceType || 'note', source_url: sourceUrl || null, original_content: content.slice(0, 5000), summary: result.content, tokens_used: result.usage.input + result.usage.output })
  return { research: saved, usage: result.usage }
}

async function handleAutoTag(event, { projectId, documentId }) {
  const doc    = db.getDocument(documentId)
  const result = await complete({
    feature: 'auto-tag', projectId,
    system: 'Extract scene headings from this screenplay text. Return a JSON array of objects: [{heading: "INT. LOCATION - DAY", characters: ["NAME1"], location: "text", time: "DAY|NIGHT|CONTINUOUS"}]. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: doc.content.slice(0, 6000) }]
  })
  try { return { scenes: JSON.parse(result.content) } }
  catch { return { scenes: [] } }
}

async function handleWritingPrompt(event, { projectId, currentContent, cursorContext }) {
  const project = db.getProject(projectId)
  return complete({
    feature: 'writing-prompt', projectId,
    system: 'You are a screenplay writing coach. Given the current scene context, provide ONE specific, targeted writing question or prompt to help the writer continue. Be specific to what they are writing. Keep it to 1-2 sentences. Be encouraging.',
    messages: [{ role: 'user', content: `Script: "${project.title}"\nLogline: "${project.logline || 'Not yet defined'}"\n\nCurrent writing:\n${cursorContext}` }]
  })
}

async function handleTvVsFeature(event, { projectId, storyIdea }) {
  const result = await complete({
    feature: 'tv-vs-feature', projectId,
    system: 'You are a development executive. Analyze the story idea. Return JSON: {"recommendation":"feature|pilot","confidence":1-10,"featureCase":"argument","pilotCase":"argument","recommendation_reason":"why","format_details":"suggestions"}. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: storyIdea }]
  })
  try { return { analysis: JSON.parse(result.content), usage: result.usage } }
  catch { return { analysis: null, content: result.content, usage: result.usage } }
}

async function handleBeatSheetAnalysis(event, { projectId, beats, documentContent }) {
  const result = await complete({
    feature: 'beat-sheet-analyze', projectId,
    system: 'You are a story structure expert. Analyze the beat sheet and screenplay content. Return JSON: {"missing_beats":["names"],"weak_beats":[{"beat":"name","issue":"desc","suggestion":"fix"}],"strengths":["list"],"overall_structure_score":1-10,"pacing_assessment":"description"}. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: `Beat sheet: ${JSON.stringify(beats)}\n\nScript excerpt: ${documentContent?.slice(0, 3000) || 'No script yet'}` }]
  })
  try { return { analysis: JSON.parse(result.content), usage: result.usage } }
  catch { return { analysis: null, content: result.content } }
}

async function handleEstimateTokens(event, { text }) {
  return { estimate: estimateTokens(text) }
}

async function handleSummarizeSession(event, { projectId, chatSessionId }) {
  // Best-effort: called fire-and-forget from renderer. All failures are silent.
  try {
    const messages = db.getChatHistory(projectId, 'chat', chatSessionId)
    if (!messages || messages.length < 2) return { ok: true }

    const transcript = messages
      .map(m => `${m.role === 'user' ? 'Writer' : 'Claude'}: ${(m.content || '').slice(0, 600)}`)
      .join('\n\n')

    const client = getClient()
    const response = await client.messages.create({
      model: CLAUDE_MODELS.haiku,
      max_tokens: 600,
      system: 'Summarize this screenplay development chat session in 150-350 words. Cover: key creative decisions made, characters discussed, plot points raised, and any open questions left unresolved. Write in past tense, third person. Return only the summary text — no headers, no preamble.',
      messages: [{ role: 'user', content: transcript.slice(0, 8000) }]
    })

    const summary = response.content[0]?.text || ''
    if (summary) {
      db.addSessionSummary({ project_id: projectId, chat_session_id: chatSessionId, summary })
      db.logTokenUsage({
        project_id: projectId,
        model: CLAUDE_MODELS.haiku,
        feature: 'chat-summarize',
        input_tokens:  response.usage?.input_tokens  || 0,
        output_tokens: response.usage?.output_tokens || 0
      })
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

async function handleFormatScriptNotes(event, { messages }) {
  const client = getClient()
  const response = await client.messages.create({
    model: CLAUDE_MODELS.sonnet,
    max_tokens: 2000,
    system: `You are a professional script editor. Given a conversation about a screenplay, reformat the discussion into concise, actionable script notes with exactly five sections using these exact headers:\n\n## What's Working\n## What's Missing\n## Where To Go Next\n## Series Implications\n## Open Questions\n\nBe specific and brief in each section. Draw only from the conversation provided.`,
    messages,
  });
  return response.content[0].text;
}


module.exports = {
  handleFormatScriptNotes,
  handleValidateApiKey, handleChat, handleCancelChat, handleSummarizeSession, handleInlineSuggestion, handleFullRewrite,
  handleToneAdjust, handleSceneAnalysis, handleDialogueCoach, handleDevelopmentQuestion,
  handleGenerateStoryBible, handleLoglineAssist, handleResearchIngest, handleAutoTag,
  handleWritingPrompt, handleTvVsFeature, handleBeatSheetAnalysis, handleEstimateTokens
}
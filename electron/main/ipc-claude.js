const Anthropic = require('@anthropic-ai/sdk')
const { getApiKey } = require('./config')
const db = require('./db')
const { CLAUDE_MODELS, selectClaudeModel, selectMaxTokens } = require('./claude-config')

// ─── Truncation / continuation settings ──────────────────────────────────────
// Used by both complete() and handleChat() when the API returns stop_reason='max_tokens'.
const CONTINUATION_PROMPT   = 'Continue exactly where you left off. Do not repeat prior text.'
const MAX_CONTINUATION_PASSES = 2

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

async function handleChat(event, { projectId, message, chatHistory, documentContext, chatSessionId }) {
  const model  = selectClaudeModel('chat')
  const client = getClient()

  const project = db.getProject(projectId)

  const characters   = db.getCharacters(projectId)
  const worldNotes   = db.getWorldBuilding(projectId)
  const research     = db.getResearch(projectId)

  const bibleContext = [
    characters.length  ? `CHARACTERS:\n${characters.map(c => `${c.name} — ${c.role || ''}\n${c.arc || ''}`).join('\n\n')}` : '',
    worldNotes.length  ? `WORLD NOTES:\n${worldNotes.slice(0, 8).map(w => `[${w.category}] ${w.title}: ${(w.content || '').slice(0, 200)}`).join('\n')}` : '',
    research.length    ? `RESEARCH:\n${research.slice(0, 4).map(r => `${r.title}: ${r.summary || ''}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n')

  const systemPrompt = [
    `You are a screenplay development collaborator working on "${project.title}".`,
    project.logline  ? `Logline: ${project.logline}` : '',
    project.format   ? `Format: ${project.format === 'pilot' ? 'TV Pilot / Limited Series' : 'Feature Film'}` : '',
    project.tone     ? `Tone: ${project.tone}` : '',
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
    const stream = client.messages.stream({
      model,
      max_tokens: selectMaxTokens('chat'),
      system: systemPrompt,
      messages: passMessages
    })

    stream.on('text', (text) => {
      fullContent += text
      event.sender.send('claude:stream-chunk', {
        projectId,
        chatSessionId: chatSessionId || null,
        chunk: text
      })
    })

    const finalMsg   = await stream.finalMessage()
    const usage      = finalMsg.usage || {}
    const stopReason = finalMsg.stop_reason

    totalInput  += usage.input_tokens  || 0
    totalOutput += usage.output_tokens || 0

    if (stopReason === 'max_tokens' && passNumber < MAX_CONTINUATION_PASSES) {
      // Notify the renderer a continuation is starting
      event.sender.send('claude:stream-chunk', {
        projectId,
        chatSessionId: chatSessionId || null,
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
        chunk: '\n\n[Automatic continuation limit reached. Send “continue” and I’ll pick up exactly where I left off.]\n\n'
      })
    }
    // else: clean stop — done
  }

  try {
    await streamPass(messages, 0)

    db.addChatMessage({ project_id: projectId, role: 'assistant', content: fullContent, model, tokens_used: totalOutput, context: 'chat', chat_session_id: chatSessionId || null })
    db.logTokenUsage({ project_id: projectId, model, feature: 'chat', input_tokens: totalInput, output_tokens: totalOutput })

    return { content: fullContent, model, usage: { input_tokens: totalInput, output_tokens: totalOutput } }
  } catch (err) {
    if (fullContent) {
      db.addChatMessage({ project_id: projectId, role: 'assistant', content: fullContent, model, context: 'chat', chat_session_id: chatSessionId || null })
    }
    throw err
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

module.exports = {
  handleValidateApiKey, handleChat, handleInlineSuggestion, handleFullRewrite,
  handleToneAdjust, handleSceneAnalysis, handleDialogueCoach, handleDevelopmentQuestion,
  handleGenerateStoryBible, handleLoglineAssist, handleResearchIngest, handleAutoTag,
  handleWritingPrompt, handleTvVsFeature, handleBeatSheetAnalysis, handleEstimateTokens
}

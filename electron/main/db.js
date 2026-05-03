const path = require('path')
const { app } = require('electron')
const Database = require('better-sqlite3')
const { SCHEMA } = require('./schema')

let db = null

function getDb() {
  if (db) return db
  const dbPath = path.join(app.getPath('userData'), 'slugline.db')
  db = new Database(dbPath)
  db.exec(SCHEMA)
  return db
}

// ─── Projects ────────────────────────────────────────────────────────────────

function getAllProjects() {
  return getDb().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
}

function getProject(id) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

function createProject(data = {}) {
  const stmt = getDb().prepare(`
    INSERT INTO projects (title, format, genre, tone, logline, premise, target_audience, comparable_titles)
    VALUES (@title, @format, @genre, @tone, @logline, @premise, @target_audience, @comparable_titles)
  `)
  const result = stmt.run({
    title: data.title || 'Untitled Project',
    format: data.format || 'feature',
    genre: data.genre || null,
    tone: data.tone || null,
    logline: data.logline || null,
    premise: data.premise || null,
    target_audience: data.target_audience || null,
    comparable_titles: data.comparable_titles || null
  })
  // Create default document
  createDocument({ project_id: result.lastInsertRowid, title: data.title || 'Main Script' })
  return getProject(result.lastInsertRowid)
}

function updateProject(id, data) {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
  getDb().prepare(`UPDATE projects SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`)
    .run({ ...data, id })
  return getProject(id)
}

function deleteProject(id) {
  return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// ─── Documents ───────────────────────────────────────────────────────────────

function getDocuments(projectId) {
  return getDb().prepare('SELECT * FROM documents WHERE project_id = ? ORDER BY created_at').all(projectId)
}

function getDocument(id) {
  return getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id)
}

function createDocument(data) {
  const result = getDb().prepare(`
    INSERT INTO documents (project_id, title, content)
    VALUES (@project_id, @title, @content)
  `).run({ project_id: data.project_id, title: data.title || 'Untitled', content: data.content || '' })
  return getDocument(result.lastInsertRowid)
}

function updateDocument(id, data) {
  const db = getDb()
  if (data.content !== undefined) {
    const words = data.content.split(/\s+/).filter(Boolean).length
    const pages = Math.round((data.content.split('\n').length / 55) * 10) / 10
    data.word_count = words
    data.page_count = pages
  }
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
  db.prepare(`UPDATE documents SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...data, id })
  db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT project_id FROM documents WHERE id = ?)').run(id)
  return getDocument(id)
}

// ─── Characters ──────────────────────────────────────────────────────────────

function getCharacters(projectId) {
  return getDb().prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY name').all(projectId)
}

function upsertCharacter(data) {
  const db = getDb()
  if (data.id) {
    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'project_id').map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE characters SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run(data)
    return db.prepare('SELECT * FROM characters WHERE id = ?').get(data.id)
  }
  const result = db.prepare(`
    INSERT INTO characters (project_id, name, role, arc, traits, relationships, backstory, notes)
    VALUES (@project_id, @name, @role, @arc, @traits, @relationships, @backstory, @notes)
  `).run({ project_id: data.project_id, name: data.name, role: data.role || null, arc: data.arc || null, traits: data.traits || null, relationships: data.relationships || null, backstory: data.backstory || null, notes: data.notes || null })
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid)
}

function deleteCharacter(id) {
  return getDb().prepare('DELETE FROM characters WHERE id = ?').run(id)
}

// ─── World Building ──────────────────────────────────────────────────────────

function getWorldBuilding(projectId) {
  return getDb().prepare('SELECT * FROM world_building WHERE project_id = ? ORDER BY category, title').all(projectId)
}

function upsertWorldBuilding(data) {
  const db = getDb()
  if (data.id) {
    db.prepare('UPDATE world_building SET title=@title, category=@category, content=@content, updated_at=CURRENT_TIMESTAMP WHERE id=@id').run(data)
    return db.prepare('SELECT * FROM world_building WHERE id = ?').get(data.id)
  }
  const result = db.prepare('INSERT INTO world_building (project_id, category, title, content) VALUES (@project_id, @category, @title, @content)').run(data)
  return db.prepare('SELECT * FROM world_building WHERE id = ?').get(result.lastInsertRowid)
}

function deleteWorldBuilding(id) {
  return getDb().prepare('DELETE FROM world_building WHERE id = ?').run(id)
}

// ─── Beat Sheet ──────────────────────────────────────────────────────────────

function getBeatSheet(projectId) {
  return getDb().prepare('SELECT * FROM beat_sheets WHERE project_id = ? ORDER BY position').all(projectId)
}

function upsertBeat(data) {
  const db = getDb()
  if (data.id) {
    db.prepare('UPDATE beat_sheets SET beat_name=@beat_name, description=@description, target_page=@target_page, actual_page=@actual_page WHERE id=@id').run(data)
    return db.prepare('SELECT * FROM beat_sheets WHERE id = ?').get(data.id)
  }
  const result = db.prepare('INSERT INTO beat_sheets (project_id, beat_name, beat_type, description, target_page, position) VALUES (@project_id, @beat_name, @beat_type, @description, @target_page, @position)').run(data)
  return db.prepare('SELECT * FROM beat_sheets WHERE id = ?').get(result.lastInsertRowid)
}

function initializeBeatSheet(projectId, format) {
  const db = getDb()
  const existing = db.prepare('SELECT count(*) as c FROM beat_sheets WHERE project_id = ?').get(projectId)
  if (existing.c > 0) return getBeatSheet(projectId)

  const featureBeats = [
    { beat_name: 'Opening Image', beat_type: 'act1', target_page: 1, position: 1 },
    { beat_name: 'Theme Stated', beat_type: 'act1', target_page: 5, position: 2 },
    { beat_name: 'Set-Up', beat_type: 'act1', target_page: 10, position: 3 },
    { beat_name: 'Catalyst / Inciting Incident', beat_type: 'act1', target_page: 12, position: 4 },
    { beat_name: 'Debate', beat_type: 'act1', target_page: 20, position: 5 },
    { beat_name: 'Break Into Two', beat_type: 'act1', target_page: 25, position: 6 },
    { beat_name: 'B Story', beat_type: 'act2a', target_page: 30, position: 7 },
    { beat_name: 'Fun and Games', beat_type: 'act2a', target_page: 45, position: 8 },
    { beat_name: 'Midpoint', beat_type: 'act2a', target_page: 55, position: 9 },
    { beat_name: 'Bad Guys Close In', beat_type: 'act2b', target_page: 65, position: 10 },
    { beat_name: 'All Is Lost', beat_type: 'act2b', target_page: 75, position: 11 },
    { beat_name: 'Dark Night of the Soul', beat_type: 'act2b', target_page: 80, position: 12 },
    { beat_name: 'Break Into Three', beat_type: 'act3', target_page: 85, position: 13 },
    { beat_name: 'Finale', beat_type: 'act3', target_page: 95, position: 14 },
    { beat_name: 'Final Image', beat_type: 'act3', target_page: 110, position: 15 }
  ]

  const pilotBeats = [
    { beat_name: 'Cold Open / Teaser', beat_type: 'teaser', target_page: 1, position: 1 },
    { beat_name: 'World Established', beat_type: 'act1', target_page: 8, position: 2 },
    { beat_name: 'Protagonist Introduced', beat_type: 'act1', target_page: 5, position: 3 },
    { beat_name: 'Inciting Incident', beat_type: 'act1', target_page: 12, position: 4 },
    { beat_name: 'End of Act One', beat_type: 'act1', target_page: 18, position: 5 },
    { beat_name: 'Escalation', beat_type: 'act2', target_page: 25, position: 6 },
    { beat_name: 'Midpoint Complication', beat_type: 'act2', target_page: 32, position: 7 },
    { beat_name: 'End of Act Two', beat_type: 'act2', target_page: 40, position: 8 },
    { beat_name: 'Climax', beat_type: 'act3', target_page: 48, position: 9 },
    { beat_name: 'Resolution / New Normal', beat_type: 'act3', target_page: 55, position: 10 },
    { beat_name: 'Series Hook / Tag', beat_type: 'tag', target_page: 58, position: 11 }
  ]

  const beats = format === 'pilot' ? pilotBeats : featureBeats
  const insert = db.prepare('INSERT INTO beat_sheets (project_id, beat_name, beat_type, target_page, position) VALUES (?, ?, ?, ?, ?)')
  beats.forEach(b => insert.run(projectId, b.beat_name, b.beat_type, b.target_page, b.position))
  return getBeatSheet(projectId)
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function getChatHistory(projectId, context = 'chat') {
  return getDb().prepare('SELECT * FROM chat_history WHERE project_id = ? AND context = ? ORDER BY created_at').all(projectId, context)
}

function addChatMessage(data) {
  const result = getDb().prepare(`
    INSERT INTO chat_history (project_id, role, content, model, tokens_used, context)
    VALUES (@project_id, @role, @content, @model, @tokens_used, @context)
  `).run({ project_id: data.project_id, role: data.role, content: data.content, model: data.model || null, tokens_used: data.tokens_used || 0, context: data.context || 'chat' })
  return getDb().prepare('SELECT * FROM chat_history WHERE id = ?').get(result.lastInsertRowid)
}

function clearChatHistory(projectId, context = 'chat') {
  return getDb().prepare('DELETE FROM chat_history WHERE project_id = ? AND context = ?').run(projectId, context)
}

// ─── Brainstorm ───────────────────────────────────────────────────────────────

function getBrainstormEntries(projectId) {
  return getDb().prepare('SELECT * FROM brainstorm_entries WHERE project_id = ? ORDER BY created_at').all(projectId)
}

function addBrainstormEntry(data) {
  const result = getDb().prepare('INSERT INTO brainstorm_entries (project_id, content, category, position_x, position_y) VALUES (?, ?, ?, ?, ?)').run(data.project_id, data.content, data.category || 'idea', data.position_x || 0, data.position_y || 0)
  return getDb().prepare('SELECT * FROM brainstorm_entries WHERE id = ?').get(result.lastInsertRowid)
}

function updateBrainstormEntry(id, data) {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
  getDb().prepare(`UPDATE brainstorm_entries SET ${fields} WHERE id = @id`).run({ ...data, id })
}

function deleteBrainstormEntry(id) {
  return getDb().prepare('DELETE FROM brainstorm_entries WHERE id = ?').run(id)
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

function createSnapshot(projectId, label, type = 'manual') {
  const db = getDb()
  const project = getProject(projectId)
  const documents = getDocuments(projectId)
  const characters = getCharacters(projectId)
  const worldBuilding = getWorldBuilding(projectId)
  const beatSheet = getBeatSheet(projectId)
  const research = getResearch(projectId)

  const data = JSON.stringify({ project, documents, characters, worldBuilding, beatSheet, research, timestamp: new Date().toISOString() })
  const result = db.prepare('INSERT INTO snapshots (project_id, label, snapshot_type, data) VALUES (?, ?, ?, ?)').run(projectId, label, type, data)

  // Thin old daily snapshots (keep 30, then weekly)
  thinSnapshots(projectId)
  return db.prepare('SELECT id, project_id, label, snapshot_type, created_at FROM snapshots WHERE id = ?').get(result.lastInsertRowid)
}

function thinSnapshots(projectId) {
  const db = getDb()
  const dailySnapshots = db.prepare("SELECT id FROM snapshots WHERE project_id = ? AND snapshot_type = 'daily' ORDER BY created_at DESC").all(projectId)
  if (dailySnapshots.length > 30) {
    const toDelete = dailySnapshots.slice(30)
    toDelete.forEach(s => db.prepare('DELETE FROM snapshots WHERE id = ?').run(s.id))
  }
}

function getSnapshots(projectId) {
  return getDb().prepare('SELECT id, project_id, label, snapshot_type, created_at FROM snapshots WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
}

function getSnapshot(id) {
  return getDb().prepare('SELECT * FROM snapshots WHERE id = ?').get(id)
}

function restoreSnapshot(snapshotId) {
  const db = getDb()
  const snapshot = getSnapshot(snapshotId)
  if (!snapshot) throw new Error('Snapshot not found')
  const data = JSON.parse(snapshot.data)

  db.prepare('UPDATE projects SET title=@title, format=@format, genre=@genre, tone=@tone, logline=@logline, premise=@premise, target_audience=@target_audience, comparable_titles=@comparable_titles, updated_at=CURRENT_TIMESTAMP WHERE id=@id').run(data.project)

  // Restore documents
  if (data.documents) {
    data.documents.forEach(doc => {
      db.prepare('UPDATE documents SET content=@content, title=@title, updated_at=CURRENT_TIMESTAMP WHERE id=@id').run(doc)
    })
  }

  return { success: true }
}

// ─── Research ─────────────────────────────────────────────────────────────────

function getResearch(projectId) {
  return getDb().prepare('SELECT * FROM research WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
}

function addResearch(data) {
  const result = getDb().prepare(`
    INSERT INTO research (project_id, title, source_type, source_url, original_content, summary, tags, tokens_used)
    VALUES (@project_id, @title, @source_type, @source_url, @original_content, @summary, @tags, @tokens_used)
  `).run({ project_id: data.project_id, title: data.title, source_type: data.source_type || 'note', source_url: data.source_url || null, original_content: data.original_content || null, summary: data.summary, tags: data.tags || null, tokens_used: data.tokens_used || 0 })
  return getDb().prepare('SELECT * FROM research WHERE id = ?').get(result.lastInsertRowid)
}

function deleteResearch(id) {
  return getDb().prepare('DELETE FROM research WHERE id = ?').run(id)
}

// ─── Writing Sessions ────────────────────────────────────────────────────────

function getTodaySession(projectId) {
  const today = new Date().toISOString().split('T')[0]
  return getDb().prepare('SELECT * FROM writing_sessions WHERE project_id = ? AND date = ?').get(projectId, today)
}

function upsertSession(projectId, data) {
  const db = getDb()
  const today = new Date().toISOString().split('T')[0]
  const existing = getTodaySession(projectId)
  if (existing) {
    db.prepare('UPDATE writing_sessions SET duration_seconds=@duration_seconds, pages_written=@pages_written, words_written=@words_written, page_goal=@page_goal WHERE id=@id').run({ ...data, id: existing.id })
    return db.prepare('SELECT * FROM writing_sessions WHERE id = ?').get(existing.id)
  }
  const result = db.prepare('INSERT INTO writing_sessions (project_id, date, duration_seconds, pages_written, words_written, page_goal) VALUES (?,?,?,?,?,?)').run(projectId, today, data.duration_seconds || 0, data.pages_written || 0, data.words_written || 0, data.page_goal || 5)
  return db.prepare('SELECT * FROM writing_sessions WHERE id = ?').get(result.lastInsertRowid)
}

function getSessionHistory(projectId, days = 30) {
  return getDb().prepare("SELECT * FROM writing_sessions WHERE project_id = ? AND date >= date('now', '-' || ? || ' days') ORDER BY date DESC").all(projectId, days)
}

// ─── Token Usage ─────────────────────────────────────────────────────────────

function logTokenUsage(data) {
  getDb().prepare('INSERT INTO token_usage (project_id, model, feature, input_tokens, output_tokens) VALUES (?,?,?,?,?)').run(data.project_id || null, data.model, data.feature, data.input_tokens || 0, data.output_tokens || 0)
}

function getTokenUsage(projectId) {
  if (projectId) {
    return getDb().prepare('SELECT model, feature, SUM(input_tokens) as input, SUM(output_tokens) as output FROM token_usage WHERE project_id = ? GROUP BY model, feature').all(projectId)
  }
  return getDb().prepare('SELECT model, feature, SUM(input_tokens) as input, SUM(output_tokens) as output FROM token_usage GROUP BY model, feature').all()
}

// ─── Full Project Export Data ─────────────────────────────────────────────────

function getFullProjectData(projectId) {
  return {
    project: getProject(projectId),
    documents: getDocuments(projectId),
    characters: getCharacters(projectId),
    worldBuilding: getWorldBuilding(projectId),
    beatSheet: getBeatSheet(projectId),
    brainstorm: getBrainstormEntries(projectId),
    research: getResearch(projectId),
    chatHistory: getChatHistory(projectId),
    snapshots: getSnapshots(projectId),
    sessions: getSessionHistory(projectId)
  }
}

module.exports = {
  getDb,
  getAllProjects, getProject, createProject, updateProject, deleteProject,
  getDocuments, getDocument, createDocument, updateDocument,
  getCharacters, upsertCharacter, deleteCharacter,
  getWorldBuilding, upsertWorldBuilding, deleteWorldBuilding,
  getBeatSheet, upsertBeat, initializeBeatSheet,
  getChatHistory, addChatMessage, clearChatHistory,
  getBrainstormEntries, addBrainstormEntry, updateBrainstormEntry, deleteBrainstormEntry,
  createSnapshot, getSnapshots, getSnapshot, restoreSnapshot,
  getResearch, addResearch, deleteResearch,
  getTodaySession, upsertSession, getSessionHistory,
  logTokenUsage, getTokenUsage,
  getFullProjectData
}

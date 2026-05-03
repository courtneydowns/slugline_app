const path = require('path')
const fs = require('fs')
const archiver = require('archiver')
const { app, shell } = require('electron')
const db = require('./db')
const { getPreferences } = require('./config')

function ensureDir(dirPath) {
  if (dirPath && !fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function getBackupPaths() {
  const prefs = getPreferences()
  const defaultPath = path.join(app.getPath('documents'), 'Slugline Backups')
  return {
    primary: prefs.primaryBackupPath || defaultPath,
    secondary: prefs.secondaryBackupPath || null
  }
}

async function createZipBackup(projectId, destDir, label) {
  ensureDir(destDir)
  const data = db.getFullProjectData(projectId)
  const project = data.project
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${project.title.replace(/[^a-z0-9]/gi, '_')}_${label}_${timestamp}.zip`
  const zipPath = path.join(destDir, filename)

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => resolve(zipPath))
    archive.on('error', reject)
    archive.pipe(output)

    // Main script as fountain
    const doc = data.documents[0]
    if (doc) {
      archive.append(doc.content || '', { name: `${project.title}.fountain` })
    }

    // Story bible as JSON
    archive.append(JSON.stringify({ project: data.project, characters: data.characters, worldBuilding: data.worldBuilding, beatSheet: data.beatSheet }, null, 2), { name: 'story_bible.json' })

    // Full data backup
    archive.append(JSON.stringify(data, null, 2), { name: 'full_backup.json' })

    // Research
    if (data.research?.length > 0) {
      archive.append(JSON.stringify(data.research, null, 2), { name: 'research.json' })
    }

    // Chat history
    if (data.chatHistory?.length > 0) {
      archive.append(JSON.stringify(data.chatHistory, null, 2), { name: 'chat_history.json' })
    }

    archive.finalize()
  })
}

async function handlePanicExport(event, { projectId }) {
  try {
    const paths = getBackupPaths()
    const results = []

    const primary = await createZipBackup(projectId, paths.primary, 'PANIC')
    results.push({ path: primary, location: 'primary' })

    if (paths.secondary) {
      try {
        const secondary = await createZipBackup(projectId, paths.secondary, 'PANIC')
        results.push({ path: secondary, location: 'secondary' })
      } catch (e) {
        results.push({ location: 'secondary', error: e.message })
      }
    }

    // Open the folder so user can see it
    shell.openPath(paths.primary)

    return { success: true, exports: results }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleManualBackup(event, { projectId }) {
  try {
    const paths = getBackupPaths()
    const results = []

    const primary = await createZipBackup(projectId, paths.primary, 'backup')
    results.push({ path: primary, location: 'primary' })

    if (paths.secondary) {
      try {
        const secondary = await createZipBackup(projectId, paths.secondary, 'backup')
        results.push({ path: secondary, location: 'secondary' })
      } catch (e) {
        results.push({ location: 'secondary', error: e.message })
      }
    }

    return { success: true, exports: results }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleCreateSnapshot(event, { projectId, label }) {
  try {
    const snapshot = db.createSnapshot(projectId, label || `Manual snapshot ${new Date().toLocaleString()}`, 'manual')
    return { success: true, snapshot }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleGetSnapshots(event, { projectId }) {
  return db.getSnapshots(projectId)
}

async function handleRestoreSnapshot(event, { snapshotId }) {
  try {
    const result = db.restoreSnapshot(snapshotId)
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function startDailySnapshotScheduler(projectId) {
  // Run once per day when app is open
  const ONE_DAY = 24 * 60 * 60 * 1000
  setInterval(() => {
    if (projectId) {
      db.createSnapshot(projectId, `Daily auto-snapshot ${new Date().toLocaleDateString()}`, 'daily')
    }
  }, ONE_DAY)
}

module.exports = {
  handlePanicExport,
  handleManualBackup,
  handleCreateSnapshot,
  handleGetSnapshots,
  handleRestoreSnapshot,
  startDailySnapshotScheduler
}

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { app } = require('electron')

const CONFIG_FILE = path.join(app.getPath('userData'), 'slugline.config.enc')
const ALGORITHM = 'aes-256-gcm'
// Derive key from machine-specific data (no password needed for local-only use)
const MACHINE_KEY = crypto.createHash('sha256').update(app.getPath('userData') + 'slugline-v1').digest()

function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, MACHINE_KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

function decrypt(text) {
  const [ivHex, authTagHex, encrypted] = text.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, MACHINE_KEY, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {}
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    return JSON.parse(decrypt(raw))
  } catch {
    return {}
  }
}

function saveConfig(data) {
  const encrypted = encrypt(JSON.stringify(data))
  fs.writeFileSync(CONFIG_FILE, encrypted, 'utf8')
}

function getApiKey() {
  return loadConfig().apiKey || null
}

function setApiKey(key) {
  const config = loadConfig()
  config.apiKey = key
  saveConfig(config)
}

function getPreferences() {
  return loadConfig().preferences || {
    theme: 'dark',
    primaryBackupPath: null,
    secondaryBackupPath: null,
    pageGoal: 5,
    autoSnapshotEnabled: true,
    autoSnapshotHour: 2,
    soundEnabled: true
  }
}

function setPreferences(prefs) {
  const config = loadConfig()
  config.preferences = { ...(config.preferences || {}), ...prefs }
  saveConfig(config)
  return config.preferences
}

function hasApiKey() {
  return !!getApiKey()
}

module.exports = { getApiKey, setApiKey, getPreferences, setPreferences, hasApiKey }

import React, { useEffect, useState } from 'react'
import useStore from '../store'

export default function SettingsModal({ onClose }) {
  const { preferences, setPreferences, setTheme, addNotification } = useStore()
  const [form, setForm] = useState({
    theme: preferences.theme || 'dark',
    pageGoal: preferences.pageGoal || 5,
    primaryBackupPath: preferences.primaryBackupPath || '',
    secondaryBackupPath: preferences.secondaryBackupPath || '',
    autoSnapshotEnabled: preferences.autoSnapshotEnabled !== false,
    soundEnabled: preferences.soundEnabled !== false
  })
  const [changingKey, setChangingKey] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [keyLoading, setKeyLoading] = useState(false)
  const [tab, setTab] = useState('general')

  async function save() {
    const updated = await window.api.setPreferences(form)
    setPreferences(updated)
    addNotification('Settings saved', 'success')
    onClose()
  }

  async function changeKey() {
    if (!newKey.trim()) return
    setKeyLoading(true)
    const result = await window.api.validateApiKey(newKey.trim())
    setKeyLoading(false)
    if (result.valid) {
      addNotification('API key updated', 'success')
      setChangingKey(false)
      setNewKey('')
    } else {
      addNotification('Invalid key: ' + result.error, 'error')
    }
  }

  async function pickFolder(field) {
    const folder = await window.api.openFolderDialog()
    if (folder) setForm(f => ({ ...f, [field]: folder }))
  }

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'backup', label: 'Backup' },
    { id: 'api', label: 'API Key' },
  ]

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width: 520, maxHeight: '88vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)', flex: 1 }}>Settings</div>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
              background: tab === t.id ? 'var(--amber-subtle)' : 'transparent',
              color: tab === t.id ? 'var(--amber)' : 'var(--text-muted)',
              borderRadius: 6
            }}>
              {t.label}
            </button>
          ))}
          <button
            className="btn btn-ghost"
            onClick={onClose}
            title="Close Settings"
            aria-label="Close Settings"
            style={{ minWidth: 36, height: 32, padding: '0 10px', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {tab === 'general' && (
            <div>
              <Field label="Theme">
                <div style={{ display: 'flex', gap: 8 }}>
                  {['dark', 'light'].map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setForm(f => ({ ...f, theme: t }))
                        setTheme(t)
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{ opacity: form.theme === t ? 1 : 0.5, borderColor: form.theme === t ? 'var(--amber)' : 'var(--border)', color: form.theme === t ? 'var(--amber)' : 'var(--text-secondary)' }}>
                      {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Daily Page Goal">
                <input className="input selectable" type="number" min={1} max={20} value={form.pageGoal}
                  onChange={e => setForm(f => ({ ...f, pageGoal: parseInt(e.target.value) || 5 }))}
                  style={{ width: 80 }}
                />
                <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>pages per day</span>
              </Field>

              <Field label="Auto-Snapshot">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.autoSnapshotEnabled} onChange={e => setForm(f => ({ ...f, autoSnapshotEnabled: e.target.checked }))} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Save daily snapshots automatically</span>
                </label>
              </Field>
            </div>
          )}

          {tab === 'backup' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                Slugline keeps backups in two locations. Set them here so Panic Export (⌘⇧P) always knows where to go.
              </p>

              <Field label="Primary Backup Folder">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input selectable" value={form.primaryBackupPath} onChange={e => setForm(f => ({ ...f, primaryBackupPath: e.target.value }))} placeholder="/Users/you/Documents/Slugline Backups" style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => pickFolder('primaryBackupPath')}>Browse…</button>
                </div>
              </Field>

              <Field label="Secondary Backup Folder (optional)">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input selectable" value={form.secondaryBackupPath} onChange={e => setForm(f => ({ ...f, secondaryBackupPath: e.target.value }))} placeholder="e.g. Dropbox or external drive" style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => pickFolder('secondaryBackupPath')}>Browse…</button>
                </div>
              </Field>

              <div style={{ background: 'var(--amber-subtle)', borderRadius: 8, padding: 14, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--amber)' }}>Panic Export (⌘⇧P)</strong> saves a ZIP to both folders instantly with no dialogs. Use it anytime you want a guaranteed backup.
              </div>
            </div>
          )}

          {tab === 'api' && (
            <div>
              <div style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Your API key is encrypted and stored locally. It is never uploaded anywhere.
              </div>

              {!changingKey ? (
                <div>
                  <div style={{ display: 'flex', align: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--font-screenplay)', fontSize: 14, color: 'var(--text-muted)' }}>sk-ant-••••••••••••••••••••</div>
                    <span className="tag tag-green">Active</span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setChangingKey(true)}>Change Key</button>
                </div>
              ) : (
                <div>
                  <input className="input selectable" type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="sk-ant-..." style={{ marginBottom: 10 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={changeKey} disabled={keyLoading || !newKey.trim()}>
                      {keyLoading ? 'Verifying…' : 'Update Key'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setChangingKey(false); setNewKey('') }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

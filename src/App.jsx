import React, { useEffect } from 'react'
import useStore from './store'
import ApiKeySetup from './components/ApiKeySetup'
import ProjectList from './components/ProjectList'
import AppShell from './components/AppShell'
import Toast from './components/Toast'

export default function App() {
  const { ready, hasApiKey, currentProject, theme, setReady, setHasApiKey, setPreferences } = useStore()

  useEffect(() => {
    async function init() {
      try {
        const [apiKey, prefs] = await Promise.all([
          window.api.hasApiKey(),
          window.api.getPreferences()
        ])
        setHasApiKey(apiKey)
        setPreferences(prefs)
        setReady(true)
      } catch (e) {
        console.error('Init error:', e)
        setReady(true)
      }
    }
    init()
  }, [])

  useEffect(() => {
    document.documentElement.className = theme === 'light' ? 'theme-light' : ''
  }, [theme])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--amber)', marginBottom: 12 }}>
            Slugline
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        </div>
      </div>
    )
  }

  if (!hasApiKey) return <ApiKeySetup />
  if (!currentProject) return <ProjectList />
  return (
    <>
      <AppShell />
      <Toast />
    </>
  )
}

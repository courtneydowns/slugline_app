import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import ChatPopout from './components/ChatPopout'


const __params = new URLSearchParams(window.location.search)
const __isPopout = __params.get('popout') === '1'
const __popoutProjectId = __isPopout ? Number(__params.get('projectId')) : null
const __popoutSessionId = __isPopout ? Number(__params.get('sessionId')) : null

if (__isPopout) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ChatPopout projectId={__popoutProjectId} sessionId={__popoutSessionId} />
  )
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

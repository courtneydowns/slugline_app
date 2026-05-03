import React from 'react'
import useStore from '../store'

export default function Toast() {
  const { notifications, removeNotification } = useStore()
  if (!notifications.length) return null

  return (
    <div className="toast">
      {notifications.map(n => (
        <div
          key={n.id}
          className={`toast-item toast-${n.type || 'info'}`}
          onClick={() => removeNotification(n.id)}
          style={{ cursor: 'pointer' }}
        >
          {n.msg}
        </div>
      ))}
    </div>
  )
}

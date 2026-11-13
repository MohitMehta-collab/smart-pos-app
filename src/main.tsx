import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n' // Initialize i18next
import { registerSW } from 'virtual:pwa-register' // Import PWA service worker register

// Register the service worker for offline caching and PWA app support
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('A new version of Smart POS is available. Reload to update?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('Smart POS is ready to work offline.')
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
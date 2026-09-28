import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/dark-tints.css'
import { initTheme } from './lib/theme'
import { initPWA } from './lib/pwa'
import { watchKeyboard } from './lib/keyboard'

initTheme()
initPWA()
watchKeyboard()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

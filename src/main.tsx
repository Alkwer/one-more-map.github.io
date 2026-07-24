import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './styles-harvest.css'

// Harvest Edition: Google Sheets garden-planner theme, for old times' sake
try {
  if (localStorage.getItem('theme') === 'harvest' || window.location.pathname.includes('harvest')) {
    document.body.classList.add('theme-harvest')
  }
} catch {
  /* ignore */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

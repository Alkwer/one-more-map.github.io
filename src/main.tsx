import './styles.css'
import './styles-harvest.css'
import { StrictMode } from 'react'

const root = document.getElementById('root')!

function blockFramedApplication() {
  document.title = 'Embedding blocked - Allflame Voyage Solver'
  root.className = 'frame-blocked'
  root.setAttribute('role', 'alert')
  root.setAttribute('aria-live', 'assertive')
  root.textContent = 'For your security, Allflame Voyage Solver cannot run inside another page.'
}

// This executes before the App component, React DOM, or browser storage are touched.
// GitHub Pages cannot emit frame-ancestors/X-Frame-Options, so fail closed at runtime
// as defense in depth until the site can move behind an HTTP-header-capable host.
if (window.top !== window.self) blockFramedApplication()
else void mountApplication()

async function mountApplication() {
  const [{ createRoot }, { default: App }] = await Promise.all([
    import('react-dom/client'),
    import('./App'),
  ])

  // Harvest Edition: Google Sheets garden-planner theme, for old times' sake
  try {
    if (
      localStorage.getItem('theme') === 'harvest' ||
      window.location.pathname.includes('harvest')
    ) {
      document.body.classList.add('theme-harvest')
    }
  } catch {
    /* ignore */
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadCatalog } from './catalog'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

root.render(
  <main className="startup-state" aria-busy="true">
    <p>Opening the library…</p>
  </main>,
)

loadCatalog()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch(() => {
    root.render(
      <main className="startup-state" role="alert">
        <p className="eyebrow">Library unavailable</p>
        <h1>The encrypted catalog could not be opened.</h1>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>,
    )
  })

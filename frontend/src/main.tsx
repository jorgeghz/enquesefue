import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Capturar beforeinstallprompt ANTES de que React monte para no perder el evento.
// InstallBanner.tsx lo lee desde window.__pwaPrompt.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  ;(window as any).__pwaPrompt = e
  // Notificar a cualquier listener que ya esté montado
  window.dispatchEvent(new CustomEvent('pwa-prompt-ready'))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registrar service worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No bloquear si el registro falla (ej. en dev sin HTTPS)
    })
  })
}

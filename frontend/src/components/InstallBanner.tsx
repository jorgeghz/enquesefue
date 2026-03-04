import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('pwa-dismissed')) {
      setDismissed(true)
      return
    }
    // El evento puede haber disparado antes de que React montara este componente.
    // main.tsx lo captura temprano y lo guarda en window.__pwaPrompt.
    if ((window as any).__pwaPrompt) {
      setPrompt((window as any).__pwaPrompt)
      return
    }
    const handleNative = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const handleReady = () => {
      if ((window as any).__pwaPrompt) setPrompt((window as any).__pwaPrompt)
    }
    window.addEventListener('beforeinstallprompt', handleNative)
    window.addEventListener('pwa-prompt-ready', handleReady)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleNative)
      window.removeEventListener('pwa-prompt-ready', handleReady)
    }
  }, [])

  if (!prompt || dismissed) return null

  const handleInstall = async () => {
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setPrompt(null)
      if (outcome === 'dismissed') {
        localStorage.setItem('pwa-dismissed', '1')
        setDismissed(true)
      }
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa-dismissed', '1')
    setDismissed(true)
    setPrompt(null)
  }

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-indigo-600 text-white rounded-xl shadow-lg p-4 flex items-center gap-3 z-50">
      <span className="text-2xl shrink-0">📲</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Instalar enquesefue</p>
        <p className="text-xs text-indigo-200">Accede más rápido desde tu pantalla de inicio</p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={handleInstall}
          className="bg-white text-indigo-600 text-xs font-semibold px-3 py-1 rounded-lg hover:bg-indigo-50 transition"
        >
          Instalar
        </button>
        <button
          onClick={handleDismiss}
          className="text-indigo-200 text-xs hover:text-white transition text-center"
        >
          No, gracias
        </button>
      </div>
    </div>
  )
}

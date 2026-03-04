import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Página de retorno del flujo OAuth.
 * Google → backend → /auth/callback?token=JWT
 * Lee el token, lo guarda y redirige al dashboard.
 */
export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      localStorage.setItem('token', token)
      // Recargar para que useAuth() detecte el token nuevo
      window.location.replace('/')
    } else {
      navigate('/login?error=google_failed', { replace: true })
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Iniciando sesión…</p>
      </div>
    </div>
  )
}

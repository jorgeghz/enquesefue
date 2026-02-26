import { useEffect, useState } from 'react'
import api from '../api/client'
import Layout from '../components/Layout'
import { useAuth } from '../hooks/useAuth'

interface LinkPinResponse {
  pin: string
  expires_in_minutes: number
}

export default function Settings() {
  const { user } = useAuth()
  const [pin, setPin] = useState<string | null>(null)
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [copied, setCopied] = useState(false)

  // Cuenta regresiva del PIN
  useEffect(() => {
    if (secondsLeft <= 0) return
    const interval = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          setPin(null)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [secondsLeft])

  const generatePin = async () => {
    setPinLoading(true)
    setPinError('')
    try {
      const res = await api.post<LinkPinResponse>('/whatsapp/link-pin', {})
      setPin(res.data.pin)
      setSecondsLeft(res.data.expires_in_minutes * 60)
    } catch {
      setPinError('No se pudo generar el PIN. Intenta de nuevo.')
    } finally {
      setPinLoading(false)
    }
  }

  const copyPin = () => {
    if (!pin) return
    navigator.clipboard.writeText(pin)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Configuración</h2>

        {/* ── Tarjeta: Tu cuenta ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tu cuenta</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Nombre</span>
              <span className="text-sm font-medium text-gray-900">{user?.name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Email</span>
              <span className="text-sm font-medium text-gray-900">{user?.email}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-500">Moneda</span>
              <span className="text-sm font-medium text-gray-900">{user?.currency}</span>
            </div>
          </div>
        </div>

        {/* ── Tarjeta: WhatsApp ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">💬</span>
            <h3 className="text-lg font-semibold text-gray-900">WhatsApp</h3>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Vincula tu número para registrar gastos directamente desde WhatsApp.
          </p>

          {/* Estado: ya vinculado */}
          {user?.whatsapp_phone ? (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <span className="text-green-600 text-xl">✅</span>
              <div>
                <p className="text-sm font-semibold text-green-800">Número vinculado</p>
                <p className="text-sm text-green-700 font-mono">{user.whatsapp_phone}</p>
              </div>
            </div>
          ) : (
            /* Estado: no vinculado */
            <div className="space-y-5">
              {/* Opción A: PIN */}
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">Opción A — Vincular con PIN</p>
                <p className="text-xs text-gray-500 mb-4">
                  Genera un PIN, envíalo por WhatsApp al número del bot y tu cuenta quedará vinculada.
                </p>

                {!pin ? (
                  <button
                    onClick={generatePin}
                    disabled={pinLoading}
                    className="w-full py-2.5 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {pinLoading ? 'Generando...' : 'Generar PIN'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    {/* PIN display */}
                    <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
                      <div>
                        <p className="text-xs text-indigo-500 mb-0.5">Tu PIN</p>
                        <p className="text-3xl font-bold font-mono text-indigo-700 tracking-widest">{pin}</p>
                      </div>
                      <div className="text-right">
                        <button
                          onClick={copyPin}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mb-1 block"
                        >
                          {copied ? '¡Copiado!' : 'Copiar'}
                        </button>
                        <p className="text-xs text-indigo-400">Expira en {formatSeconds(secondsLeft)}</p>
                      </div>
                    </div>

                    {/* Instrucciones */}
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-gray-700">¿Cómo usarlo?</p>
                      <p className="text-xs text-gray-500">
                        1. Abre WhatsApp y escribe al número del bot
                      </p>
                      <p className="text-xs text-gray-500">
                        2. Envía el PIN: <span className="font-mono font-semibold text-gray-700">{pin}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        3. El bot confirmará que tu número quedó vinculado
                      </p>
                    </div>

                    <button
                      onClick={generatePin}
                      disabled={pinLoading}
                      className="w-full py-2 px-4 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition"
                    >
                      Generar nuevo PIN
                    </button>
                  </div>
                )}

                {pinError && (
                  <p className="text-xs text-red-500 mt-2">{pinError}</p>
                )}
              </div>

              {/* Opción B: Registro directo */}
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">Opción B — Registro directo por WhatsApp</p>
                <p className="text-xs text-gray-500 mb-3">
                  Si aún no tienes cuenta, puedes crear una directamente desde WhatsApp enviando:
                </p>
                <div className="bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 break-all">
                  registro tu@email.com TuContraseña TuNombre
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  ⚠️ Evita enviar contraseñas importantes por mensajes de texto.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

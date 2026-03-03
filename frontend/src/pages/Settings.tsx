import { useEffect, useState } from 'react'
import api from '../api/client'
import Layout from '../components/Layout'
import { useAuth } from '../hooks/useAuth'
import type { Category, User } from '../types'

const TIMEZONES = [
  { label: 'México — Ciudad de México (UTC-6/UTC-5)', value: 'America/Mexico_City' },
  { label: 'México — Cancún (UTC-5, sin horario de verano)', value: 'America/Cancun' },
  { label: 'México — Tijuana / Baja California (UTC-8/UTC-7)', value: 'America/Tijuana' },
  { label: 'México — Chihuahua / Mazatlán (UTC-7/UTC-6)', value: 'America/Chihuahua' },
  { label: 'Colombia (UTC-5)', value: 'America/Bogota' },
  { label: 'Perú (UTC-5)', value: 'America/Lima' },
  { label: 'Chile (UTC-3/UTC-4)', value: 'America/Santiago' },
  { label: 'Argentina (UTC-3)', value: 'America/Argentina/Buenos_Aires' },
  { label: 'EUA — Nueva York (UTC-5/UTC-4)', value: 'America/New_York' },
  { label: 'EUA — Chicago (UTC-6/UTC-5)', value: 'America/Chicago' },
  { label: 'EUA — Denver (UTC-7/UTC-6)', value: 'America/Denver' },
  { label: 'EUA — Los Ángeles (UTC-8/UTC-7)', value: 'America/Los_Angeles' },
  { label: 'España (UTC+1/UTC+2)', value: 'Europe/Madrid' },
  { label: 'UTC', value: 'UTC' },
]

interface LinkPinResponse {
  pin: string
  expires_in_minutes: number
}

export default function Settings() {
  const { user, setUser } = useAuth()
  const [pin, setPin] = useState<string | null>(null)
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [copied, setCopied] = useState(false)

  // Zona horaria
  const [selectedTz, setSelectedTz] = useState(user?.timezone ?? 'America/Mexico_City')
  const [tzSaving, setTzSaving] = useState(false)
  const [tzSaved, setTzSaved] = useState(false)

  const handleSaveTz = async () => {
    setTzSaving(true)
    setTzSaved(false)
    try {
      const res = await api.patch<User>('/auth/me', { timezone: selectedTz })
      setUser(res.data)
      setTzSaved(true)
      setTimeout(() => setTzSaved(false), 2500)
    } finally {
      setTzSaving(false)
    }
  }

  // Categorías personalizadas
  const [categories, setCategories] = useState<Category[]>([])
  const [editingCat, setEditingCat] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('💰')
  const [catError, setCatError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)

  useEffect(() => {
    api.get<Category[]>('/categories').then((r) => setCategories(r.data))
  }, [])

  const userCategories = categories.filter((c) => c.user_id != null)

  const handleCreateCategory = async () => {
    if (!newName.trim()) return
    setCatError('')
    try {
      const res = await api.post<Category>('/categories', { name: newName.trim(), emoji: newEmoji })
      setCategories((prev) => [...prev, res.data])
      setNewName('')
      setNewEmoji('💰')
      setShowNewForm(false)
    } catch (err: any) {
      setCatError(err.response?.data?.detail || 'Error al crear la categoría')
    }
  }

  const handleUpdateCategory = async (id: number) => {
    try {
      const res = await api.patch<Category>(`/categories/${id}`, { name: editName.trim(), emoji: editEmoji })
      setCategories((prev) => prev.map((c) => (c.id === id ? res.data : c)))
      setEditingCat(null)
    } catch (err: any) {
      setCatError(err.response?.data?.detail || 'Error al actualizar')
    }
  }

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('¿Eliminar esta categoría? Los gastos asociados quedarán sin categoría.')) return
    try {
      await api.delete(`/categories/${id}`)
      setCategories((prev) => prev.filter((c) => c.id !== id))
    } catch {
      setCatError('Error al eliminar la categoría')
    }
  }

  const startEdit = (c: Category) => {
    setEditingCat(c.id)
    setEditName(c.name)
    setEditEmoji(c.emoji)
    setCatError('')
  }

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

        {/* ── Tarjeta: Zona horaria ──────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Zona horaria</h3>
          <p className="text-sm text-gray-500 mb-4">
            Se usa para registrar la fecha correcta en tus gastos.
          </p>
          <div className="flex gap-3 items-center">
            <select
              value={selectedTz}
              onChange={(e) => setSelectedTz(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <button
              onClick={handleSaveTz}
              disabled={tzSaving || selectedTz === user?.timezone}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {tzSaving ? 'Guardando…' : tzSaved ? '✓ Guardado' : 'Guardar'}
            </button>
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
        {/* ── Tarjeta: Categorías personalizadas ─────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Categorías personalizadas</h3>
            <button
              onClick={() => { setShowNewForm((v) => !v); setCatError('') }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition"
            >
              {showNewForm ? 'Cancelar' : '+ Nueva'}
            </button>
          </div>

          {catError && <p className="text-xs text-red-500 mb-3">{catError}</p>}

          {showNewForm && (
            <div className="flex gap-2 mb-4 items-center">
              <input
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                className="w-12 border border-gray-300 rounded-lg px-2 py-1.5 text-center text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="💰"
                maxLength={2}
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de la categoría"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
              />
              <button
                onClick={handleCreateCategory}
                disabled={!newName.trim()}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                Crear
              </button>
            </div>
          )}

          {userCategories.length === 0 ? (
            <p className="text-sm text-gray-400">Aún no tienes categorías personalizadas.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {userCategories.map((c) => (
                <div key={c.id} className="py-2.5">
                  {editingCat === c.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        value={editEmoji}
                        onChange={(e) => setEditEmoji(e.target.value)}
                        className="w-12 border border-gray-300 rounded-lg px-2 py-1 text-center text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        maxLength={2}
                      />
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory(c.id)}
                      />
                      <button
                        onClick={() => handleUpdateCategory(c.id)}
                        className="text-xs text-indigo-600 font-medium hover:text-indigo-800"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingCat(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-800">{c.emoji} {c.name}</span>
                      <div className="flex gap-3">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-xs text-gray-400 hover:text-indigo-600 transition"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(c.id)}
                          className="text-xs text-gray-400 hover:text-red-500 transition"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

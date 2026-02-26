import { useEffect, useState } from 'react'
import api from '../api/client'
import FileUpload from '../components/FileUpload'
import Layout from '../components/Layout'
import VoiceRecorder from '../components/VoiceRecorder'
import type { Category, Expense, ExpenseListResponse } from '../types'

type Tab = 'text' | 'voice' | 'file'

function formatMoney(amount: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)
}

function sourceIcon(source: string) {
  return { text: '✍️', audio: '🎤', image: '📷', pdf: '📄' }[source] ?? '📝'
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [categories, setCategories] = useState<Category[]>([])
  const [filterCategory, setFilterCategory] = useState<number | ''>('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('text')

  // Formulario texto
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [textError, setTextError] = useState('')

  const fetchExpenses = async (p = page) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: p, limit: 15 }
      if (filterCategory) params.category_id = filterCategory
      const res = await api.get<ExpenseListResponse>('/expenses', { params })
      setExpenses(res.data.items)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.get<Category[]>('/categories').then((r) => setCategories(r.data))
  }, [])

  useEffect(() => {
    fetchExpenses(page)
  }, [page, filterCategory])

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setTextError('')
    try {
      const res = await api.post<Expense>('/expenses', { text })
      setExpenses((prev) => [res.data, ...prev])
      setTotal((t) => t + 1)
      setText('')
    } catch (err: any) {
      setTextError(err.response?.data?.detail || 'No pude identificar el gasto')
    } finally {
      setSubmitting(false)
    }
  }

  const handleExpenseCreated = (expense: Expense) => {
    setExpenses((prev) => [expense, ...prev])
    setTotal((t) => t + 1)
  }

  const handleDelete = async (id: number) => {
    await api.delete(`/expenses/${id}`)
    setExpenses((prev) => prev.filter((e) => e.id !== id))
    setTotal((t) => t - 1)
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'text', label: 'Texto', icon: '✍️' },
    { key: 'voice', label: 'Voz', icon: '🎤' },
    { key: 'file', label: 'Archivo', icon: '📎' },
  ]

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Gastos</h2>

        {/* Formulario de nuevo gasto */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h3 className="font-semibold text-gray-700 mb-4">Registrar nuevo gasto</h3>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tab === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === 'text' && (
            <form onSubmit={handleTextSubmit} className="flex gap-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='Ej: "Gasté 150 en el súper" o "Café 45 pesos"'
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {submitting ? '...' : 'Registrar'}
              </button>
            </form>
          )}
          {tab === 'text' && textError && <p className="text-red-500 text-sm mt-2">{textError}</p>}
          {tab === 'voice' && <VoiceRecorder onExpenseCreated={handleExpenseCreated} />}
          {tab === 'file' && <FileUpload onExpenseCreated={handleExpenseCreated} />}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-500">{total} gastos</span>
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
            ))}
          </select>
        </div>

        {/* Lista */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400">Cargando...</div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <span className="text-4xl mb-2">💸</span>
              <p>No hay gastos. ¡Registra el primero arriba!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{e.category_emoji ?? '💰'}</span>
                    <div>
                      <p className="font-medium text-gray-800">{e.description}</p>
                      <p className="text-xs text-gray-400">
                        {e.category_name} · {sourceIcon(e.source)} · {new Date(e.date).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-gray-900">{formatMoney(e.amount, e.currency)}</span>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-gray-300 hover:text-red-500 transition text-lg"
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-4">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              ← Anterior
            </button>
            <span className="text-sm text-gray-500">Página {page} de {pages}</span>
            <button
              disabled={page === pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}

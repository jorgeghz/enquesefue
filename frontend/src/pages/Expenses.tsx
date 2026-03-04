import { useEffect, useState } from 'react'
import api from '../api/client'
import DateRangePicker from '../components/DateRangePicker'
import DuplicateWarning from '../components/DuplicateWarning'
import EditExpenseModal from '../components/EditExpenseModal'
import FileUpload from '../components/FileUpload'
import Layout from '../components/Layout'
import VoiceRecorder from '../components/VoiceRecorder'
import type { Category, DuplicateInfo, Expense, ExpenseListResponse, ExpenseWithDuplicate } from '../types'

type Tab = 'text' | 'voice' | 'file'

function formatMoney(amount: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)
}

function sourceIcon(source: string) {
  return { text: '✍️', audio: '🎤', image: '📷', pdf: '📄' }[source] ?? '📝'
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<ExpenseWithDuplicate[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [categories, setCategories] = useState<Category[]>([])
  const [filterCategory, setFilterCategory] = useState<number | ''>('')
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('text')
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  // Formulario texto
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [textError, setTextError] = useState('')

  // Advertencia de duplicado pendiente
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    newId: number
    duplicate: DuplicateInfo
  } | null>(null)

  const fetchExpenses = async (p = page) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: p, limit: 15 }
      if (filterCategory) params.category_id = filterCategory
      if (dateFrom) params.date_from = dateFrom + 'T00:00:00'
      if (dateTo) params.date_to = dateTo + 'T23:59:59'
      const res = await api.get<ExpenseListResponse>('/expenses', { params })
      setExpenses(res.data.items.map((e) => ({ ...e, possible_duplicate: null })))
      setTotal(res.data.total)
      setPages(res.data.pages)
    } finally {
      setLoading(false)
    }
  }

  const handleDateRangeChange = (p: string, f: string, t: string) => {
    setDatePreset(p)
    setDateFrom(p === 'all' ? '' : f)
    setDateTo(p === 'all' ? '' : t)
    setPage(1)
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom + 'T00:00:00')
    if (dateTo) params.set('date_to', dateTo + 'T23:59:59')
    if (filterCategory) params.set('category_id', String(filterCategory))
    const token = localStorage.getItem('token')
    const url = `/api/expenses/export?${params}`
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'gastos.csv'
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  useEffect(() => {
    api.get<Category[]>('/categories').then((r) => setCategories(r.data))
  }, [])

  useEffect(() => {
    fetchExpenses(page)
  }, [page, filterCategory, dateFrom, dateTo])

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setTextError('')
    setPendingDuplicate(null)
    try {
      const res = await api.post<ExpenseWithDuplicate>('/expenses', { text })
      setExpenses((prev) => [res.data, ...prev])
      setTotal((t) => t + 1)
      setText('')
      if (res.data.possible_duplicate) {
        setPendingDuplicate({ newId: res.data.id, duplicate: res.data.possible_duplicate })
      }
    } catch (err: any) {
      setTextError(err.response?.data?.detail || 'No pude identificar el gasto')
    } finally {
      setSubmitting(false)
    }
  }

  const handleExpenseCreated = (expense: ExpenseWithDuplicate) => {
    setExpenses((prev) => [expense, ...prev])
    setTotal((t) => t + 1)
    if (expense.possible_duplicate) {
      setPendingDuplicate({ newId: expense.id, duplicate: expense.possible_duplicate })
    }
  }

  const handleDelete = async (id: number) => {
    await api.delete(`/expenses/${id}`)
    setExpenses((prev) => prev.filter((e) => e.id !== id))
    setTotal((t) => t - 1)
  }

  const handleDuplicateDelete = () => {
    if (!pendingDuplicate) return
    setExpenses((prev) => prev.filter((e) => e.id !== pendingDuplicate.newId))
    setTotal((t) => t - 1)
    setPendingDuplicate(null)
  }

  const handleEditSaved = (updated: Expense) => {
    setExpenses((prev) => prev.map((e) => e.id === updated.id ? { ...updated, possible_duplicate: null } : e))
    setEditingExpense(null)
  }

  const handleViewFile = (id: number) => {
    const token = localStorage.getItem('token')
    fetch(`/api/expenses/${id}/file`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar el archivo')
        return r.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
      })
      .catch(console.error)
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
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPendingDuplicate(null) }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${
                  tab === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === 'text' && (
            <form onSubmit={handleTextSubmit} className="flex flex-col sm:flex-row gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='Ej: "Gasté 150 en el súper" o "Café 45 pesos"'
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition sm:shrink-0"
              >
                {submitting ? '...' : 'Registrar'}
              </button>
            </form>
          )}
          {tab === 'text' && textError && <p className="text-red-500 text-sm mt-2">{textError}</p>}
          {tab === 'voice' && <VoiceRecorder onExpenseCreated={handleExpenseCreated} />}
          {tab === 'file' && <FileUpload onExpenseCreated={handleExpenseCreated} />}

          {/* Advertencia de duplicado */}
          {pendingDuplicate && (
            <DuplicateWarning
              newExpenseId={pendingDuplicate.newId}
              duplicate={pendingDuplicate.duplicate}
              onDelete={handleDuplicateDelete}
              onKeepBoth={() => setPendingDuplicate(null)}
            />
          )}
        </div>

        {/* Filtros */}
        <div className="space-y-3 mb-4">
          <DateRangePicker
            preset={datePreset}
            from={dateFrom}
            to={dateTo}
            onChange={handleDateRangeChange}
            includeAll
          />
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500 shrink-0">{total} gastos</span>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0 flex-1 sm:flex-none"
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
            <button
              onClick={handleExport}
              className="shrink-0 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-1"
              title="Exportar como CSV"
            >
              ⬇️ CSV
            </button>
          </div>
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
                <div key={e.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{e.category_emoji ?? '💰'}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 text-sm truncate">
                        {e.merchant || e.description}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {e.merchant ? `${e.description} · ` : ''}{e.category_name} · {sourceIcon(e.source)} · {new Date(e.date).toLocaleDateString('es-MX')}
                      </p>
                      {e.address && (
                        <p className="text-xs text-gray-400 truncate">{e.address}</p>
                      )}
                      {e.notes && (
                        <p className="text-xs text-amber-600 truncate">📝 {e.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-gray-900 text-sm">{formatMoney(e.amount, e.currency)}</span>
                    {e.has_file && (
                      <button
                        onClick={() => handleViewFile(e.id)}
                        className="text-gray-300 hover:text-indigo-500 transition text-base"
                        title="Ver archivo adjunto"
                      >
                        📎
                      </button>
                    )}
                    <button
                      onClick={() => setEditingExpense(e)}
                      className="text-gray-300 hover:text-indigo-500 transition text-base"
                      title="Editar"
                    >
                      ✏️
                    </button>
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

      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          categories={categories}
          onSave={handleEditSaved}
          onClose={() => setEditingExpense(null)}
        />
      )}
    </Layout>
  )
}

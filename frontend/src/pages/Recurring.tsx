import { useEffect, useState } from 'react'
import api from '../api/client'
import Layout from '../components/Layout'
import type { Category, RecurringExpense } from '../types'

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

function ordinal(n: number) {
  return `día ${n}`
}

interface FormState {
  description: string
  amount: string
  currency: string
  category_id: string
  merchant: string
  day_of_month: number
}

const EMPTY_FORM: FormState = {
  description: '',
  amount: '',
  currency: 'MXN',
  category_id: '',
  merchant: '',
  day_of_month: 1,
}

export default function Recurring() {
  const [items, setItems] = useState<RecurringExpense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [recRes, catRes] = await Promise.all([
        api.get<RecurringExpense[]>('/recurring'),
        api.get<Category[]>('/categories'),
      ])
      setItems(recRes.data)
      setCategories(catRes.data)
    } catch {
      setError('No se pudieron cargar los gastos recurrentes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setError('')
  }

  const openEdit = (rec: RecurringExpense) => {
    setEditId(rec.id)
    setForm({
      description: rec.description,
      amount: String(rec.amount),
      currency: rec.currency,
      category_id: rec.category_id ? String(rec.category_id) : '',
      merchant: rec.merchant ?? '',
      day_of_month: rec.day_of_month,
    })
    setShowForm(true)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description || !form.amount) {
      setError('Descripción y monto son obligatorios.')
      return
    }
    const payload = {
      description: form.description.trim(),
      amount: parseFloat(form.amount),
      currency: form.currency,
      category_id: form.category_id ? parseInt(form.category_id) : null,
      merchant: form.merchant.trim() || null,
      day_of_month: form.day_of_month,
    }
    setSaving(true)
    setError('')
    try {
      if (editId) {
        await api.patch(`/recurring/${editId}`, payload)
      } else {
        await api.post('/recurring', payload)
      }
      setShowForm(false)
      await load()
    } catch {
      setError('Error al guardar el gasto recurrente.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (rec: RecurringExpense) => {
    try {
      await api.patch(`/recurring/${rec.id}`, { active: !rec.active })
      setItems(prev => prev.map(r => r.id === rec.id ? { ...r, active: !r.active } : r))
    } catch {
      setError('No se pudo actualizar.')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este gasto recurrente?')) return
    try {
      await api.delete(`/recurring/${id}`)
      setItems(prev => prev.filter(r => r.id !== id))
    } catch {
      setError('No se pudo eliminar.')
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🔁 Gastos recurrentes</h1>
            <p className="text-sm text-gray-500 mt-1">
              Se registran automáticamente cada mes en el día que elijas.
            </p>
          </div>
          <button
            onClick={openNew}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            + Agregar
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Modal de formulario */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {editId ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Netflix, Renta, Gimnasio…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                    <select
                      value={form.currency}
                      onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option>MXN</option>
                      <option>USD</option>
                      <option>EUR</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select
                    value={form.category_id}
                    onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comercio (opcional)</label>
                  <input
                    type="text"
                    value={form.merchant}
                    onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))}
                    placeholder="Netflix, IMSS…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Día del mes</label>
                  <select
                    value={form.day_of_month}
                    onChange={e => setForm(f => ({ ...f, day_of_month: parseInt(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {DAYS.map(d => (
                      <option key={d} value={d}>{ordinal(d)}</option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-red-600 text-xs">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    {saving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🔁</p>
            <p className="font-medium text-gray-600">Sin gastos recurrentes</p>
            <p className="text-sm mt-1">
              Agrega tus suscripciones, renta o cualquier gasto fijo mensual.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(rec => (
              <div
                key={rec.id}
                className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition ${
                  rec.active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                }`}
              >
                {/* Emoji categoría */}
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-xl shrink-0">
                  {rec.category_emoji ?? '🔁'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{rec.description}</p>
                  <p className="text-sm text-gray-500">
                    ${rec.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {rec.currency}
                    {rec.category_name && <> · {rec.category_name}</>}
                    {' · '}{ordinal(rec.day_of_month)}
                  </p>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle activo */}
                  <button
                    onClick={() => handleToggle(rec)}
                    title={rec.active ? 'Desactivar' : 'Activar'}
                    className={`w-10 h-6 rounded-full transition relative ${
                      rec.active ? 'bg-indigo-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                        rec.active ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => openEdit(rec)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(rec.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
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
    </Layout>
  )
}

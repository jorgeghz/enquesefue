import { useState } from 'react'
import api from '../api/client'
import type { DuplicateInfo } from '../types'

interface Props {
  newExpenseId: number
  duplicate: DuplicateInfo
  onKeepBoth: () => void
  onDelete: () => void
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)
}

function sourceLabel(source: string) {
  return { text: 'texto', audio: 'voz', image: 'imagen', pdf: 'PDF' }[source] ?? source
}

export default function DuplicateWarning({ newExpenseId, duplicate, onKeepBoth, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/expenses/${newExpenseId}`)
      onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm">
      <p className="font-medium text-amber-800 mb-1">
        Este gasto parece ya registrado:
      </p>
      <p className="text-amber-700 mb-3">
        <span className="font-semibold">{duplicate.description}</span>
        {' — '}
        <span className="font-semibold">{formatMoney(duplicate.amount, duplicate.currency)}</span>
        {' — '}
        {new Date(duplicate.date).toLocaleDateString('es-MX')}
        {' · '}
        <span className="text-amber-500">vía {sourceLabel(duplicate.source)}</span>
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition"
        >
          {deleting ? 'Eliminando...' : 'Eliminar este'}
        </button>
        <button
          onClick={onKeepBoth}
          className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
        >
          Mantener ambos
        </button>
      </div>
    </div>
  )
}

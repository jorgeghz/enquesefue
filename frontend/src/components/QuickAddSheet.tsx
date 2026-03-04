import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import api from '../api/client'
import type { ExpenseWithDuplicate } from '../types'
import FileUpload from './FileUpload'
import VoiceRecorder from './VoiceRecorder'

type Tab = 'text' | 'voice' | 'file'

interface Props {
  open: boolean
  onClose: () => void
}

export default function QuickAddSheet({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('text')
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset state when sheet opens
  useEffect(() => {
    if (open) {
      setTab('text')
      setText('')
    }
  }, [open])

  if (!open) return null

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    try {
      await api.post<ExpenseWithDuplicate>('/expenses', { text })
      setText('')
      toast.success('Gasto registrado')
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'No pude identificar el gasto')
    } finally {
      setSubmitting(false)
    }
  }

  // VoiceRecorder / FileUpload already show their own toast; we just close
  const handleExpenseCreated = (_: ExpenseWithDuplicate) => {
    onClose()
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'text', label: 'Texto', icon: '✍️' },
    { key: 'voice', label: 'Voz', icon: '🎤' },
    { key: 'file', label: 'Archivo', icon: '📎' },
  ]

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Fondo oscuro */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 pb-10 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 text-base">Nuevo gasto</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                tab === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'text' && (
          <form onSubmit={handleTextSubmit} className="flex flex-col gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='Ej: "Gasté 150 en el súper"'
              autoFocus
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition hover:bg-indigo-700"
            >
              {submitting ? 'Registrando…' : 'Registrar'}
            </button>
          </form>
        )}

        {tab === 'voice' && (
          <VoiceRecorder onExpenseCreated={handleExpenseCreated} />
        )}

        {tab === 'file' && (
          <FileUpload onExpenseCreated={handleExpenseCreated} />
        )}
      </div>
    </div>
  )
}

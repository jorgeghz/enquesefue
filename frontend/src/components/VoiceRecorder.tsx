import { useRef, useState } from 'react'
import { toast } from 'sonner'
import api from '../api/client'
import type { ExpenseWithDuplicate, PDFExpense, PDFImportResult } from '../types'

interface Props {
  onExpenseCreated: (expense: ExpenseWithDuplicate) => void
  onExpensesCreated?: (expenses: PDFExpense[]) => void
}

export default function VoiceRecorder({ onExpenseCreated, onExpensesCreated }: Props) {
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await uploadAudio(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      toast.error('No se pudo acceder al micrófono. Verifica los permisos.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const uploadAudio = async (blob: Blob) => {
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', blob, 'audio.webm')
      const res = await api.post<PDFImportResult>('/upload/audio', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const { created, duplicates_count, expenses } = res.data
      let msg = `${created} gasto${created !== 1 ? 's' : ''} registrado${created !== 1 ? 's' : ''}`
      if (duplicates_count > 0) msg += ` (${duplicates_count} posible${duplicates_count !== 1 ? 's' : ''} duplicado${duplicates_count !== 1 ? 's' : ''})`
      toast.success(msg)
      if (onExpensesCreated) {
        onExpensesCreated(expenses)
      } else {
        expenses.forEach((e) => onExpenseCreated({ ...e, possible_duplicate: null }))
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error procesando el audio. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Graba una nota de voz — puedes mencionar varios gastos de distintas fechas</p>
      <div className="flex items-center gap-3">
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={loading}
            className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 transition"
          >
            🎤 Iniciar grabación
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition animate-pulse"
          >
            ⏹️ Detener y enviar
          </button>
        )}
        {loading && <span className="text-sm text-gray-500">Procesando audio...</span>}
      </div>
    </div>
  )
}

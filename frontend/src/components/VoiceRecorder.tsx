import { useRef, useState } from 'react'
import api from '../api/client'
import type { ExpenseWithDuplicate } from '../types'

interface Props {
  onExpenseCreated: (expense: ExpenseWithDuplicate) => void
}

export default function VoiceRecorder({ onExpenseCreated }: Props) {
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    setError('')
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
      setError('No se pudo acceder al micrófono. Verifica los permisos.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const uploadAudio = async (blob: Blob) => {
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', blob, 'audio.webm')
      const res = await api.post<ExpenseWithDuplicate>('/upload/audio', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onExpenseCreated(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error procesando el audio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Graba una nota de voz describiendo tu gasto</p>
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
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  )
}

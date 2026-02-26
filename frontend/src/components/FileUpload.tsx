import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import api from '../api/client'
import type { Expense } from '../types'

interface Props {
  onExpenseCreated: (expense: Expense) => void
  onExpensesCreated?: (expenses: Expense[]) => void
}

export default function FileUpload({ onExpenseCreated, onExpensesCreated }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const upload = useCallback(async (file: File) => {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)

      if (file.type === 'application/pdf') {
        const res = await api.post<{ created: number; expenses: Expense[] }>('/upload/pdf', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setSuccess(`✅ ${res.data.created} gastos importados del estado de cuenta`)
        res.data.expenses.forEach((e) => onExpensesCreated?.(res.data.expenses) || onExpenseCreated(e))
      } else {
        const res = await api.post<Expense>('/upload/image', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setSuccess('✅ Ticket analizado y gasto registrado')
        onExpenseCreated(res.data)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error procesando el archivo')
    } finally {
      setLoading(false)
    }
  }, [onExpenseCreated, onExpensesCreated])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && upload(files[0]),
    accept: { 'image/*': [], 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: loading,
  })

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Sube una foto de ticket o un PDF de estado de cuenta</p>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
          isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
        } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-2">{loading ? '⏳' : isDragActive ? '📂' : '📎'}</div>
        {loading ? (
          <p className="text-gray-500">Analizando archivo...</p>
        ) : isDragActive ? (
          <p className="text-indigo-600 font-medium">Suelta el archivo aquí</p>
        ) : (
          <>
            <p className="text-gray-600 font-medium">Arrastra un archivo o haz clic</p>
            <p className="text-gray-400 text-sm mt-1">Imágenes (JPG, PNG) o PDF de estado de cuenta</p>
          </>
        )}
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm font-medium">{success}</p>}
    </div>
  )
}

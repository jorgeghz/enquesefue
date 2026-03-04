import { useEffect, useState } from 'react'
import { clearDebugEntries, subscribeDebug, type DebugEntry } from '../stores/debugStore'

const DEBUG = import.meta.env.VITE_DEBUG === 'true'

function statusColor(status: number) {
  if (status >= 500) return 'text-red-500'
  if (status >= 400) return 'text-amber-500'
  return 'text-green-600'
}

function fmt(d: Date) {
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function DebugPanel() {
  const [entries, setEntries] = useState<DebugEntry[]>([])
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    if (!DEBUG) return
    return subscribeDebug(setEntries)
  }, [])

  if (!DEBUG) return null

  const count = entries.length

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-20 left-4 md:bottom-6 z-30 flex items-center gap-1.5 bg-gray-900 text-white text-xs font-mono px-3 py-1.5 rounded-full shadow-lg hover:bg-gray-700 transition"
        title="Panel de debug"
      >
        🐛
        {count > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {count}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-start pointer-events-none">
          <div
            className="pointer-events-auto w-full md:w-[560px] bg-gray-950 text-gray-100 rounded-t-2xl md:rounded-2xl md:mb-4 md:ml-4 shadow-2xl flex flex-col"
            style={{ maxHeight: '70vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
              <span className="text-sm font-semibold font-mono">🐛 Debug log ({count})</span>
              <div className="flex items-center gap-2">
                {count > 0 && (
                  <button
                    onClick={clearDebugEntries}
                    className="text-xs text-gray-400 hover:text-red-400 transition"
                  >
                    Limpiar
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-gray-400 hover:text-white transition text-lg leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Lista */}
            <div className="overflow-y-auto flex-1 divide-y divide-gray-800 text-xs font-mono">
              {count === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-500">
                  Sin errores registrados
                </div>
              ) : (
                entries.map((e) => (
                  <div key={e.id} className="px-4 py-3">
                    <div
                      className="flex items-start justify-between gap-2 cursor-pointer"
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-bold shrink-0 ${statusColor(e.status)}`}>
                          {e.status || '—'}
                        </span>
                        <span className="text-gray-400 shrink-0">{e.method}</span>
                        <span className="text-gray-200 truncate">{e.url}</span>
                      </div>
                      <span className="text-gray-500 shrink-0">{fmt(e.timestamp)}</span>
                    </div>
                    <p className="text-amber-300 mt-1 break-words">{e.detail}</p>
                    {expanded === e.id && (
                      <div className="mt-2 space-y-2">
                        {e.traceback && (
                          <pre className="bg-gray-900 rounded p-2 text-[10px] text-red-300 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {e.traceback}
                          </pre>
                        )}
                        <pre className="bg-gray-900 rounded p-2 text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                          {JSON.stringify(e.raw, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

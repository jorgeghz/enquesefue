export interface DebugEntry {
  id: number
  timestamp: Date
  method: string
  url: string
  status: number
  detail: string
  traceback?: string | null
  raw: unknown
}

let _id = 0
let _entries: DebugEntry[] = []
const _subscribers = new Set<(entries: DebugEntry[]) => void>()

function notify() {
  _subscribers.forEach((fn) => fn([..._entries]))
}

export function addDebugEntry(entry: Omit<DebugEntry, 'id' | 'timestamp'>) {
  _entries = [{ ...entry, id: ++_id, timestamp: new Date() }, ..._entries].slice(0, 30)
  notify()
}

export function clearDebugEntries() {
  _entries = []
  notify()
}

export function subscribeDebug(fn: (entries: DebugEntry[]) => void): () => void {
  _subscribers.add(fn)
  fn([..._entries]) // estado inicial
  return () => _subscribers.delete(fn)
}

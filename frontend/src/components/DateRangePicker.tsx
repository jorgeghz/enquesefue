const PRESETS = [
  { key: 'this_week', label: 'Esta semana' },
  { key: 'last_week', label: 'Sem. pasada' },
  { key: 'last_15', label: 'Últimos 15d' },
  { key: 'this_month', label: 'Mes actual' },
  { key: 'last_month', label: 'Mes anterior' },
]

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function getRangeForPreset(preset: string): { from: string; to: string } {
  const now = new Date()
  const today = fmtDate(now)
  switch (preset) {
    case 'this_week': {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      const mon = new Date(now)
      mon.setDate(now.getDate() - diff)
      return { from: fmtDate(mon), to: today }
    }
    case 'last_week': {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      const lastMon = new Date(now)
      lastMon.setDate(now.getDate() - diff - 7)
      const lastSun = new Date(lastMon)
      lastSun.setDate(lastMon.getDate() + 6)
      return { from: fmtDate(lastMon), to: fmtDate(lastSun) }
    }
    case 'last_15': {
      const d = new Date(now)
      d.setDate(now.getDate() - 14)
      return { from: fmtDate(d), to: today }
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: fmtDate(first), to: today }
    }
    case 'last_month': {
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
      const firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1)
      return { from: fmtDate(firstDay), to: fmtDate(lastDay) }
    }
    default:
      return { from: today, to: today }
  }
}

interface Props {
  preset: string
  from: string
  to: string
  onChange: (preset: string, from: string, to: string) => void
  includeAll?: boolean
}

export default function DateRangePicker({ preset, from, to, onChange, includeAll }: Props) {
  const allPresets = [
    ...(includeAll ? [{ key: 'all', label: 'Todas' }] : []),
    ...PRESETS,
    { key: 'custom', label: 'Personalizado' },
  ]

  const handlePreset = (key: string) => {
    if (key === 'all' || key === 'custom') {
      onChange(key, from, to)
    } else {
      const range = getRangeForPreset(key)
      onChange(key, range.from, range.to)
    }
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {allPresets.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
              preset === p.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex gap-2 mt-2 items-center">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => onChange('custom', e.target.value, to)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-xs text-gray-400">—</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => onChange('custom', from, e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}
    </div>
  )
}

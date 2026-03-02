import { useEffect, useState } from 'react'
import {
  Bar, BarChart, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import api from '../api/client'
import DateRangePicker, { getRangeForPreset } from '../components/DateRangePicker'
import Layout from '../components/Layout'
import type { DailyStat, Expense, SummaryResponse } from '../types'

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899']

function formatMoney(amount: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)
}

function sourceIcon(source: string) {
  return { text: '✍️', audio: '🎤', image: '📷', pdf: '📄' }[source] ?? '📝'
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Computes the previous period of equal length immediately before the current one. */
function getPreviousPeriod(from: string, to: string) {
  const f = new Date(from)
  const t = new Date(to)
  const days = Math.round((t.getTime() - f.getTime()) / 86400000)
  const prevTo = new Date(f)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - days)
  return { from: fmtDate(prevFrom), to: fmtDate(prevTo) }
}

const defaultRange = getRangeForPreset('this_month')

const PRESET_LABELS: Record<string, string> = {
  this_week: 'Esta semana',
  last_week: 'Semana pasada',
  last_15: 'Últimos 15 días',
  this_month: 'Mes actual',
  last_month: 'Mes anterior',
  custom: 'Período personalizado',
}

export default function Dashboard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [prevTotal, setPrevTotal] = useState<number | null>(null)
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('this_month')
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)

  const handleRangeChange = (p: string, f: string, t: string) => {
    setPreset(p)
    setFrom(f)
    setTo(t)
  }

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)

    const prev = getPreviousPeriod(from, to)

    Promise.all([
      api.get<SummaryResponse>('/stats/range', { params: { date_from: from, date_to: to } }),
      api.get<SummaryResponse>('/stats/range', { params: { date_from: prev.from, date_to: prev.to } }),
      api.get<DailyStat[]>('/stats/daily', { params: { date_from: from, date_to: to } }),
    ]).then(([curr, prev, dailyRes]) => {
      setSummary(curr.data)
      setPrevTotal(prev.data.total)
      setDaily(dailyRes.data)
    }).finally(() => setLoading(false))
  }, [from, to])

  const pieData = summary?.by_category.map((c) => ({ name: `${c.emoji} ${c.name}`, value: c.total })) ?? []
  const topCategory = summary?.by_category[0]
  const periodLabel = PRESET_LABELS[preset] ?? 'Período'

  const delta = prevTotal != null && prevTotal > 0
    ? ((summary?.total ?? 0) - prevTotal) / prevTotal * 100
    : null

  // Format daily chart labels: "1 mar", "15 mar"
  const barData = daily.map((d) => {
    const dt = new Date(d.date + 'T12:00:00')
    const label = dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    return { label, total: d.total }
  })

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <div className="sm:max-w-md w-full">
            <DateRangePicker preset={preset} from={from} to={to} onChange={handleRangeChange} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">{periodLabel}</p>
                <p className="text-3xl font-bold text-indigo-600 mt-1">
                  {formatMoney(summary?.total ?? 0)}
                </p>
                {delta !== null && (
                  <p className={`text-xs mt-1 font-medium ${delta > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs período anterior
                  </p>
                )}
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Gastos registrados</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{summary?.count ?? 0}</p>
                {prevTotal !== null && (
                  <p className="text-xs text-gray-400 mt-1">
                    Período anterior: {formatMoney(prevTotal)}
                  </p>
                )}
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Categoría top</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {topCategory ? `${topCategory.emoji} ${topCategory.name}` : '—'}
                </p>
                {topCategory && (
                  <p className="text-xs text-gray-400 mt-1">{formatMoney(topCategory.total)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Gráfica de dona */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-700 mb-4">Por categoría</h3>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={false}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number | string | undefined) => formatMoney(Number(v ?? 0))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-400">Sin datos en este período</div>
                )}
              </div>

              {/* Desglose categorías */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-700 mb-4">Desglose</h3>
                {summary?.by_category.length ? (
                  <div className="space-y-3">
                    {summary.by_category.map((cat, i) => {
                      const pct = summary.total ? (cat.total / summary.total) * 100 : 0
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{cat.emoji} {cat.name}</span>
                            <span className="font-medium">{formatMoney(cat.total)}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">Sin gastos en este período</p>
                )}
              </div>
            </div>

            {/* Tendencia diaria */}
            {barData.length > 0 && barData.some((d) => d.total > 0) && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
                <h3 className="font-semibold text-gray-700 mb-4">Tendencia diaria</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                      interval={barData.length > 15 ? Math.floor(barData.length / 10) : 0}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(v >= 1000 ? 0 : 1)}k`.replace('.0k', 'k')}
                      width={48}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [formatMoney(Number(v ?? 0)), 'Gasto']}
                      labelStyle={{ fontSize: 12, color: '#374151' }}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Últimos gastos */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-4">Últimos gastos del período</h3>
              {summary?.recent.length ? (
                <div className="divide-y divide-gray-50">
                  {summary.recent.map((e: Expense) => (
                    <div key={e.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{e.category_emoji ?? '💰'}</span>
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{e.description}</p>
                          <p className="text-xs text-gray-400">
                            {e.category_name} · {sourceIcon(e.source)} · {new Date(e.date).toLocaleDateString('es-MX')}
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold text-gray-900">{formatMoney(e.amount, e.currency)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No hay gastos en este período.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

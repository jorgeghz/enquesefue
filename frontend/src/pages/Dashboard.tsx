import { useEffect, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../api/client'
import Layout from '../components/Layout'
import type { Expense, SummaryResponse } from '../types'

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899']

function formatMoney(amount: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)
}

function sourceIcon(source: string) {
  return { text: '✍️', audio: '🎤', image: '📷', pdf: '📄' }[source] ?? '📝'
}

export default function Dashboard() {
  const [monthly, setMonthly] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<SummaryResponse>('/stats/monthly')
      .then((r) => setMonthly(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Layout><div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div></Layout>
  }

  const pieData = monthly?.by_category.map((c) => ({ name: `${c.emoji} ${c.name}`, value: c.total })) ?? []
  const topCategory = monthly?.by_category[0]

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Total del mes</p>
            <p className="text-3xl font-bold text-indigo-600 mt-1">
              {formatMoney(monthly?.total ?? 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Gastos registrados</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {monthly?.recent.length ?? 0}
              <span className="text-sm text-gray-400 font-normal ml-1">(últimos 5)</span>
            </p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Categoría top</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {topCategory ? `${topCategory.emoji} ${topCategory.name}` : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
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
              <div className="flex items-center justify-center h-64 text-gray-400">Sin datos este mes</div>
            )}
          </div>

          {/* Desglose categorías */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-700 mb-4">Desglose</h3>
            {monthly?.by_category.length ? (
              <div className="space-y-3">
                {monthly.by_category.map((cat, i) => {
                  const pct = monthly.total ? (cat.total / monthly.total) * 100 : 0
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
              <p className="text-gray-400 text-sm">Sin gastos este mes</p>
            )}
          </div>
        </div>

        {/* Últimos gastos */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-700 mb-4">Últimos gastos</h3>
          {monthly?.recent.length ? (
            <div className="divide-y divide-gray-50">
              {monthly.recent.map((e: Expense) => (
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
            <p className="text-gray-400 text-sm">Aún no hay gastos este mes. ¡Registra el primero!</p>
          )}
        </div>
      </div>
    </Layout>
  )
}

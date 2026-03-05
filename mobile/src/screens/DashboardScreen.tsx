import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { CartesianChart, Bar, PolarChart, Pie } from 'victory-native'
import api from '../api/client'
import { formatMoney, getRangeForPreset, sourceIcon } from '@shared/utils/formatters'
import type { DailyStat, SummaryResponse } from '@shared/types'

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899']

const PRESETS = [
  { key: 'this_week', label: 'Esta semana' },
  { key: 'last_week', label: 'Sem. pasada' },
  { key: 'last_15', label: '15 días' },
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes pasado' },
]

function getPreviousPeriod(from: string, to: string) {
  const f = new Date(from)
  const t = new Date(to)
  const days = Math.round((t.getTime() - f.getTime()) / 86400000)
  const prevTo = new Date(f)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - days)
  return {
    from: prevFrom.toISOString().split('T')[0],
    to: prevTo.toISOString().split('T')[0],
  }
}

export default function DashboardScreen() {
  const [preset, setPreset] = useState('this_month')
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [prevTotal, setPrevTotal] = useState<number | null>(null)
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = async (p: string) => {
    const { from, to } = getRangeForPreset(p)
    const prev = getPreviousPeriod(from, to)
    try {
      const [curr, prevRes, dailyRes] = await Promise.all([
        api.get<SummaryResponse>('/stats/range', { params: { date_from: from, date_to: to } }),
        api.get<SummaryResponse>('/stats/range', { params: { date_from: prev.from, date_to: prev.to } }),
        api.get<DailyStat[]>('/stats/daily', { params: { date_from: from, date_to: to } }),
      ])
      setSummary(curr.data)
      setPrevTotal(prevRes.data.total)
      setDaily(dailyRes.data)
    } catch (_) {
      // silently ignore
    }
  }

  useEffect(() => {
    setLoading(true)
    loadData(preset).finally(() => setLoading(false))
  }, [preset])

  const onRefresh = async () => {
    setRefreshing(true)
    await loadData(preset)
    setRefreshing(false)
  }

  const diff = summary && prevTotal != null ? summary.total - prevTotal : null
  const diffPct = prevTotal && prevTotal > 0 && diff != null ? (diff / prevTotal) * 100 : null

  const pieData = (summary?.by_category ?? []).map((c, i) => ({
    label: `${c.emoji} ${c.name}`,
    value: c.total,
    color: COLORS[i % COLORS.length],
  }))

  const barData = daily.map((d) => ({
    day: new Date(d.date).getDate().toString(),
    total: d.total,
  }))

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="pb-6"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
    >
      {/* Header */}
      <View className="bg-indigo-600 pt-14 pb-6 px-4">
        <Text className="text-white text-2xl font-bold">💸 enquesefue</Text>
        <Text className="text-indigo-200 text-sm mt-0.5">Tu resumen de gastos</Text>
      </View>

      {/* Preset chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-3 gap-2"
        className="bg-white border-b border-gray-100"
      >
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => setPreset(p.key)}
            className={`px-4 py-1.5 rounded-full border ${
              preset === p.key
                ? 'bg-indigo-600 border-indigo-600'
                : 'bg-white border-gray-300'
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                preset === p.key ? 'text-white' : 'text-gray-600'
              }`}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <View className="px-4 pt-4 gap-4">
          {/* KPI Cards */}
          <View className="flex-row gap-3">
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm">
              <Text className="text-xs text-gray-500 font-medium mb-1">Total gastado</Text>
              <Text className="text-xl font-bold text-gray-900">
                {formatMoney(summary?.total ?? 0, summary?.by_category[0] ? 'MXN' : 'MXN')}
              </Text>
              {diffPct != null && (
                <Text className={`text-xs mt-1 font-medium ${diffPct > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {diffPct > 0 ? '▲' : '▼'} {Math.abs(diffPct).toFixed(1)}% vs período anterior
                </Text>
              )}
            </View>
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm">
              <Text className="text-xs text-gray-500 font-medium mb-1">Num. gastos</Text>
              <Text className="text-xl font-bold text-gray-900">{summary?.count ?? 0}</Text>
              {summary && summary.count > 0 && (
                <Text className="text-xs text-gray-400 mt-1">
                  Prom. {formatMoney(summary.total / summary.count)}
                </Text>
              )}
            </View>
          </View>

          {/* Category Donut */}
          {pieData.length > 0 && (
            <View className="bg-white rounded-2xl p-4 shadow-sm">
              <Text className="text-base font-semibold text-gray-900 mb-3">Por categoría</Text>
              <View style={{ height: 200 }}>
                <PolarChart
                  data={pieData}
                  labelKey="label"
                  valueKey="value"
                  colorKey="color"
                >
                  <Pie.Chart innerRadius="50%" />
                </PolarChart>
              </View>
              {/* Legend */}
              <View className="mt-3 gap-1.5">
                {pieData.slice(0, 5).map((item) => (
                  <View key={item.label} className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View
                        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }}
                      />
                      <Text className="text-xs text-gray-600" numberOfLines={1}>
                        {item.label}
                      </Text>
                    </View>
                    <Text className="text-xs font-semibold text-gray-800">
                      {formatMoney(item.value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Daily Bar Chart */}
          {barData.length > 1 && (
            <View className="bg-white rounded-2xl p-4 shadow-sm">
              <Text className="text-base font-semibold text-gray-900 mb-3">Gasto diario</Text>
              <View style={{ height: 180 }}>
                <CartesianChart data={barData} xKey="day" yKeys={['total']}>
                  {({ points, chartBounds }) => (
                    <Bar
                      points={points.total}
                      chartBounds={chartBounds}
                      color="#6366f1"
                      roundedCorners={{ topLeft: 4, topRight: 4 }}
                    />
                  )}
                </CartesianChart>
              </View>
            </View>
          )}

          {/* Recent expenses */}
          {summary && summary.recent.length > 0 && (
            <View className="bg-white rounded-2xl p-4 shadow-sm">
              <Text className="text-base font-semibold text-gray-900 mb-3">Últimos gastos</Text>
              <View className="gap-3">
                {summary.recent.slice(0, 5).map((e) => (
                  <View key={e.id} className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
                        {e.merchant || e.description}
                      </Text>
                      <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
                        {e.merchant ? `${e.description} · ` : ''}
                        {e.category_name} · {sourceIcon(e.source)}
                        {e.recurring_expense_id ? ' · 🔁' : ''}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-gray-900">
                      {formatMoney(e.amount, e.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}

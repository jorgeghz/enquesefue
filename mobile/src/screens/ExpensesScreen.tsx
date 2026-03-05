import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  SectionList,
  Text,
  View,
} from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import api from '../api/client'
import { categoryColor, formatMoney, groupExpenses, getRangeForPreset, sourceIcon } from '@shared/utils/formatters'
import type { Category, ExpenseListResponse, ExpenseWithDuplicate } from '@shared/types'
import AddExpenseSheet from '../components/AddExpenseSheet'

const PRESETS = [
  { key: 'this_week', label: 'Esta semana' },
  { key: 'last_15', label: '15 días' },
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes pasado' },
]

function ExpenseRow({
  expense,
  onDelete,
}: {
  expense: ExpenseWithDuplicate
  onDelete: (id: number) => void
}) {
  const swipeRef = useRef<Swipeable>(null)

  const confirmDelete = () => {
    swipeRef.current?.close()
    Alert.alert(
      'Eliminar gasto',
      `¿Eliminar "${expense.merchant || expense.description}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => onDelete(expense.id),
        },
      ],
    )
  }

  const renderRightActions = (_: any, dragX: Animated.AnimatedInterpolation<number>) => {
    const opacity = dragX.interpolate({
      inputRange: [-80, -40],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    })
    return (
      <Animated.View style={{ opacity }}>
        <Pressable
          onPress={confirmDelete}
          style={{
            backgroundColor: '#ef4444',
            justifyContent: 'center',
            alignItems: 'center',
            width: 80,
            flex: 1,
            borderRadius: 12,
            marginVertical: 2,
            marginRight: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 20 }}>🗑️</Text>
        </Pressable>
      </Animated.View>
    )
  }

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} friction={2}>
      <View className="bg-white flex-row items-center px-4 py-3">
        {/* Category dot */}
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: categoryColor(expense.category_id),
            marginRight: 12,
          }}
        />
        <View className="flex-1">
          <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
            {expense.merchant || expense.description}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
            {expense.merchant ? `${expense.description} · ` : ''}
            {expense.category_emoji} {expense.category_name} · {sourceIcon(expense.source)}
            {expense.recurring_expense_id ? ' · 🔁' : ''}
          </Text>
          {expense.possible_duplicate && (
            <Text className="text-xs text-amber-500 mt-0.5">⚠️ Posible duplicado</Text>
          )}
        </View>
        <Text className="text-sm font-semibold text-gray-900 ml-2">
          {formatMoney(expense.amount, expense.currency)}
        </Text>
      </View>
    </Swipeable>
  )
}

export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState<ExpenseWithDuplicate[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [preset, setPreset] = useState('this_month')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const loadExpenses = useCallback(
    async (p: number, replace: boolean) => {
      const { from, to } = getRangeForPreset(preset)
      const res = await api.get<ExpenseListResponse>('/expenses', {
        params: { page: p, limit: 30, date_from: from, date_to: to },
      })
      setTotal(res.data.total)
      setPages(res.data.pages)
      setPage(res.data.page)
      setExpenses((prev) => (replace ? res.data.items : [...prev, ...res.data.items]))
    },
    [preset],
  )

  useEffect(() => {
    setLoading(true)
    loadExpenses(1, true).finally(() => setLoading(false))
  }, [loadExpenses])

  const loadMore = () => {
    if (loadingMore || page >= pages) return
    setLoadingMore(true)
    loadExpenses(page + 1, false).finally(() => setLoadingMore(false))
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/expenses/${id}`)
      setExpenses((prev) => prev.filter((e) => e.id !== id))
      setTotal((t) => t - 1)
    } catch {
      Alert.alert('Error', 'No se pudo eliminar el gasto')
    }
  }

  const handleExpenseCreated = (expense: ExpenseWithDuplicate) => {
    setExpenses((prev) => [expense, ...prev])
    setTotal((t) => t + 1)
  }

  const sections = groupExpenses(expenses).map(([title, data]) => ({ title, data }))

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 pt-14 pb-3 px-4">
        <Text className="text-xl font-bold text-gray-900">💳 Gastos</Text>
        <Text className="text-xs text-gray-400 mt-0.5">{total} gastos registrados</Text>

        {/* Presets */}
        <View className="flex-row gap-2 mt-3">
          {PRESETS.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setPreset(p.key)}
              className={`px-3 py-1 rounded-full border ${
                preset === p.key ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  preset === p.key ? 'text-white' : 'text-gray-600'
                }`}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <ExpenseRow expense={item} onDelete={handleDelete} />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View className="bg-gray-50 px-4 py-2">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {title}
              </Text>
            </View>
          )}
          ItemSeparatorComponent={() => (
            <View className="h-px bg-gray-100 ml-10" />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color="#6366f1" className="py-4" />
            ) : null
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-4xl mb-3">🔍</Text>
              <Text className="text-gray-500">No hay gastos en este período</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={() => setSheetOpen(true)}
        className="absolute bottom-6 right-4 w-14 h-14 bg-indigo-600 rounded-full shadow-lg items-center justify-center active:opacity-80"
        style={{ elevation: 6 }}
      >
        <Text className="text-white text-3xl leading-none">+</Text>
      </Pressable>

      <AddExpenseSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onExpenseCreated={handleExpenseCreated}
      />
    </View>
  )
}

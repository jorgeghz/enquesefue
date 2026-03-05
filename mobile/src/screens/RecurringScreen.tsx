import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Picker } from '@react-native-picker/picker'
import api from '../api/client'
import { formatMoney, categoryColor } from '@shared/utils/formatters'
import type { Category, RecurringExpense } from '@shared/types'

const CURRENCIES = ['MXN', 'USD', 'EUR']
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

interface FormState {
  description: string
  amount: string
  currency: string
  category_id: string
  merchant: string
  day_of_month: number
}

const EMPTY_FORM: FormState = {
  description: '',
  amount: '',
  currency: 'MXN',
  category_id: '',
  merchant: '',
  day_of_month: 1,
}

function RecurringCard({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: RecurringExpense
  onEdit: (r: RecurringExpense) => void
  onDelete: (r: RecurringExpense) => void
  onToggle: (r: RecurringExpense, active: boolean) => void
}) {
  return (
    <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
            {item.merchant || item.description}
          </Text>
          {item.merchant ? (
            <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-2 mt-1">
            {item.category_emoji ? (
              <Text className="text-xs text-gray-500">
                {item.category_emoji} {item.category_name}
              </Text>
            ) : null}
            <Text className="text-xs text-gray-400">· día {item.day_of_month}</Text>
          </View>
        </View>
        <View className="items-end gap-2">
          <Text className="text-base font-bold text-gray-900">
            {formatMoney(item.amount, item.currency)}
          </Text>
          <Switch
            value={item.active}
            onValueChange={(v) => onToggle(item, v)}
            trackColor={{ false: '#d1d5db', true: '#a5b4fc' }}
            thumbColor={item.active ? '#6366f1' : '#9ca3af'}
          />
        </View>
      </View>
      <View className="flex-row gap-2 mt-3 pt-3 border-t border-gray-100">
        <Pressable
          onPress={() => onEdit(item)}
          className="flex-1 py-2 rounded-lg border border-gray-200 items-center active:opacity-70"
        >
          <Text className="text-sm text-gray-600 font-medium">✏️ Editar</Text>
        </Pressable>
        <Pressable
          onPress={() => onDelete(item)}
          className="flex-1 py-2 rounded-lg border border-red-200 items-center active:opacity-70"
        >
          <Text className="text-sm text-red-500 font-medium">🗑️ Eliminar</Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function RecurringScreen() {
  const [items, setItems] = useState<RecurringExpense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [recRes, catRes] = await Promise.all([
        api.get<RecurringExpense[]>('/recurring'),
        api.get<Category[]>('/categories'),
      ])
      setItems(recRes.data)
      setCategories(catRes.data)
    } catch {
      setError('No se pudieron cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  const openEdit = (rec: RecurringExpense) => {
    setEditId(rec.id)
    setForm({
      description: rec.description,
      amount: String(rec.amount),
      currency: rec.currency,
      category_id: rec.category_id ? String(rec.category_id) : '',
      merchant: rec.merchant ?? '',
      day_of_month: rec.day_of_month,
    })
    setError('')
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.description.trim() || !form.amount.trim()) {
      setError('Descripción y monto son obligatorios')
      return
    }
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) {
      setError('El monto debe ser un número positivo')
      return
    }
    try {
      setSaving(true)
      setError('')
      const body = {
        description: form.description.trim(),
        amount,
        currency: form.currency,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        merchant: form.merchant.trim() || null,
        day_of_month: form.day_of_month,
      }
      if (editId) {
        const res = await api.put<RecurringExpense>(`/recurring/${editId}`, body)
        setItems((prev) => prev.map((i) => (i.id === editId ? res.data : i)))
      } else {
        const res = await api.post<RecurringExpense>('/recurring', body)
        setItems((prev) => [res.data, ...prev])
      }
      setShowModal(false)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (rec: RecurringExpense, active: boolean) => {
    try {
      const res = await api.put<RecurringExpense>(`/recurring/${rec.id}`, { ...rec, active })
      setItems((prev) => prev.map((i) => (i.id === rec.id ? res.data : i)))
    } catch {
      Alert.alert('Error', 'No se pudo actualizar')
    }
  }

  const handleDelete = (rec: RecurringExpense) => {
    Alert.alert(
      'Eliminar gasto recurrente',
      `¿Eliminar "${rec.merchant || rec.description}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/recurring/${rec.id}`)
              setItems((prev) => prev.filter((i) => i.id !== rec.id))
            } catch {
              Alert.alert('Error', 'No se pudo eliminar')
            }
          },
        },
      ],
    )
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 pt-14 pb-4 px-4 flex-row items-end justify-between">
        <View>
          <Text className="text-xl font-bold text-gray-900">🔁 Recurrentes</Text>
          <Text className="text-xs text-gray-400 mt-0.5">{items.length} gastos programados</Text>
        </View>
        <Pressable
          onPress={openNew}
          className="bg-indigo-600 px-4 py-2 rounded-full active:opacity-80"
        >
          <Text className="text-white text-sm font-semibold">+ Nuevo</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="p-4 pb-8">
          {items.length === 0 ? (
            <View className="items-center py-16">
              <Text className="text-4xl mb-3">🔁</Text>
              <Text className="text-gray-500 text-center">
                No tienes gastos recurrentes.{'\n'}Agrega suscripciones, renta, etc.
              </Text>
            </View>
          ) : (
            items.map((item) => (
              <RecurringCard
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Create/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-gray-50">
          <View className="bg-white border-b border-gray-200 pt-14 pb-4 px-4 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-gray-900">
              {editId ? 'Editar recurrente' : 'Nuevo recurrente'}
            </Text>
            <Pressable onPress={() => setShowModal(false)} className="p-2">
              <Text className="text-gray-400 text-xl">✕</Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
            {error ? (
              <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            ) : null}

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Descripción *</Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 bg-white text-gray-900"
                placeholder="Netflix, Renta, Gym..."
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Comercio (opcional)</Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 bg-white text-gray-900"
                placeholder="Netflix Inc."
                value={form.merchant}
                onChangeText={(v) => setForm((f) => ({ ...f, merchant: v }))}
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 mb-1">Monto *</Text>
                <TextInput
                  className="border border-gray-300 rounded-xl px-4 py-3 bg-white text-gray-900"
                  placeholder="0.00"
                  value={form.amount}
                  onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View className="w-28">
                <Text className="text-sm font-medium text-gray-700 mb-1">Moneda</Text>
                <View className="border border-gray-300 rounded-xl bg-white overflow-hidden">
                  <Picker
                    selectedValue={form.currency}
                    onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                    style={{ height: 50 }}
                  >
                    {CURRENCIES.map((c) => (
                      <Picker.Item key={c} label={c} value={c} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Categoría</Text>
              <View className="border border-gray-300 rounded-xl bg-white overflow-hidden">
                <Picker
                  selectedValue={form.category_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                  style={{ height: 50 }}
                >
                  <Picker.Item label="Sin categoría" value="" />
                  {categories.map((c) => (
                    <Picker.Item key={c.id} label={`${c.emoji} ${c.name}`} value={String(c.id)} />
                  ))}
                </Picker>
              </View>
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Día del mes</Text>
              <View className="border border-gray-300 rounded-xl bg-white overflow-hidden">
                <Picker
                  selectedValue={form.day_of_month}
                  onValueChange={(v) => setForm((f) => ({ ...f, day_of_month: v }))}
                  style={{ height: 50 }}
                >
                  {DAYS.map((d) => (
                    <Picker.Item key={d} label={`Día ${d}`} value={d} />
                  ))}
                </Picker>
              </View>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              className={`rounded-xl py-3.5 items-center mt-2 ${saving ? 'bg-indigo-300' : 'bg-indigo-600 active:opacity-80'}`}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {editId ? 'Guardar cambios' : 'Crear recurrente'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

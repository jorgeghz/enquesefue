import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import api from '../api/client'
import type { ExpenseWithDuplicate } from '@shared/types'
import CameraCapture from './CameraCapture'
import VoiceRecorder from './VoiceRecorder'

interface Props {
  open: boolean
  onClose: () => void
  onExpenseCreated: (expense: ExpenseWithDuplicate) => void
}

type Tab = 'text' | 'voice' | 'camera'

export default function AddExpenseSheet({ open, onClose, onExpenseCreated }: Props) {
  const sheetRef = useRef<BottomSheet>(null)
  const snapPoints = useMemo(() => ['60%', '90%'], [])
  const [tab, setTab] = useState<Tab>('text')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = useCallback(() => {
    sheetRef.current?.close()
    onClose()
    setText('')
    setError('')
    setTab('text')
  }, [onClose])

  const handleExpenseCreated = useCallback(
    (expense: ExpenseWithDuplicate) => {
      onExpenseCreated(expense)
      handleClose()
    },
    [onExpenseCreated, handleClose],
  )

  const handleError = useCallback((msg: string) => {
    setError(msg)
  }, [])

  const submitText = async () => {
    if (!text.trim()) return
    try {
      setLoading(true)
      setError('')
      const res = await api.post<ExpenseWithDuplicate>('/expenses', { text: text.trim() })
      handleExpenseCreated(res.data)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Error al registrar el gasto')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onClose={onClose}
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: '#d1d5db', width: 40 }}
      backgroundStyle={{ backgroundColor: '#fff' }}
    >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Title + close */}
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text className="text-lg font-bold text-gray-900">Nuevo gasto</Text>
          <Pressable onPress={handleClose} className="p-2">
            <Text className="text-gray-400 text-xl">✕</Text>
          </Pressable>
        </View>

        {/* Tab bar */}
        <View className="flex-row mx-4 mb-4 bg-gray-100 rounded-xl p-1">
          {(['text', 'voice', 'camera'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => { setTab(t); setError('') }}
              className={`flex-1 py-2 rounded-lg items-center ${tab === t ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className="text-lg">
                {t === 'text' ? '✍️' : t === 'voice' ? '🎤' : '📷'}
              </Text>
              <Text className={`text-xs mt-0.5 ${tab === t ? 'text-indigo-600 font-semibold' : 'text-gray-500'}`}>
                {t === 'text' ? 'Texto' : t === 'voice' ? 'Voz' : 'Imagen'}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <View className="mx-4 mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        {/* Tab content */}
        {tab === 'text' && (
          <View className="px-4 gap-3">
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-gray-900 min-h-[100px]"
              placeholder="Ej: Comida $250 en el OXXO, gasolina 500 pesos..."
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              placeholderTextColor="#9ca3af"
              autoFocus
            />
            <Pressable
              onPress={submitText}
              disabled={loading || !text.trim()}
              className={`rounded-xl py-3.5 items-center ${
                loading || !text.trim() ? 'bg-indigo-300' : 'bg-indigo-600 active:opacity-80'
              }`}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Registrar gasto</Text>
              )}
            </Pressable>
          </View>
        )}

        {tab === 'voice' && (
          <VoiceRecorder onExpenseCreated={handleExpenseCreated} onError={handleError} />
        )}

        {tab === 'camera' && (
          <CameraCapture onExpenseCreated={handleExpenseCreated} onError={handleError} />
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  )
}

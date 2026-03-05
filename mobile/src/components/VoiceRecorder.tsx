import { Audio } from 'expo-av'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import api from '../api/client'
import type { ExpenseWithDuplicate } from '@shared/types'

interface Props {
  onExpenseCreated: (expense: ExpenseWithDuplicate) => void
  onError: (msg: string) => void
}

export default function VoiceRecorder({ onExpenseCreated, onError }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [uploading, setUploading] = useState(false)
  const [duration, setDuration] = useState(0)

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync()
      if (status !== 'granted') {
        onError('Se necesita permiso para acceder al micrófono')
        return
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      )
      rec.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording) {
          setDuration(Math.floor((status.durationMillis ?? 0) / 1000))
        }
      })
      setRecording(rec)
      setDuration(0)
    } catch {
      onError('Error al iniciar la grabación')
    }
  }

  const stopAndUpload = async () => {
    if (!recording) return
    try {
      setUploading(true)
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
      const uri = recording.getURI()
      setRecording(null)

      if (!uri) throw new Error('No se pudo obtener el audio')

      const formData = new FormData()
      formData.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' } as any)
      const res = await api.post<ExpenseWithDuplicate>('/upload/audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onExpenseCreated(res.data)
    } catch (e: any) {
      onError(e.response?.data?.detail ?? 'Error al procesar el audio')
    } finally {
      setUploading(false)
    }
  }

  const cancelRecording = async () => {
    if (!recording) return
    await recording.stopAndUnloadAsync().catch(() => {})
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
    setRecording(null)
    setDuration(0)
  }

  if (uploading) {
    return (
      <View className="items-center py-8 gap-3">
        <ActivityIndicator size="large" color="#6366f1" />
        <Text className="text-gray-500 text-sm">Procesando audio con IA...</Text>
      </View>
    )
  }

  if (recording) {
    return (
      <View className="items-center py-6 gap-4">
        <View className="w-20 h-20 rounded-full bg-red-100 items-center justify-center">
          <View className="w-4 h-4 rounded-full bg-red-500" />
        </View>
        <Text className="text-2xl font-mono text-gray-700">
          {String(Math.floor(duration / 60)).padStart(2, '0')}:
          {String(duration % 60).padStart(2, '0')}
        </Text>
        <Text className="text-sm text-gray-500">Grabando... habla claro</Text>
        <View className="flex-row gap-3">
          <Pressable
            onPress={cancelRecording}
            className="px-6 py-2.5 rounded-full border border-gray-300 active:opacity-70"
          >
            <Text className="text-gray-600 font-medium">Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={stopAndUpload}
            className="px-6 py-2.5 rounded-full bg-indigo-600 active:opacity-70"
          >
            <Text className="text-white font-medium">Listo</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View className="items-center py-8 gap-4">
      <Pressable
        onPress={startRecording}
        className="w-20 h-20 rounded-full bg-indigo-600 items-center justify-center shadow-lg active:scale-95"
      >
        <Text className="text-4xl">🎤</Text>
      </Pressable>
      <Text className="text-sm text-gray-500 text-center px-6">
        Toca para grabar una nota de voz.{'\n'}Describe tu gasto con monto y descripción.
      </Text>
    </View>
  )
}

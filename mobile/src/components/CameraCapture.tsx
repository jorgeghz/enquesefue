import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import api from '../api/client'
import type { ExpenseWithDuplicate } from '@shared/types'

interface Props {
  onExpenseCreated: (expense: ExpenseWithDuplicate) => void
  onError: (msg: string) => void
}

async function compressAndUpload(uri: string): Promise<ExpenseWithDuplicate> {
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  )
  const formData = new FormData()
  formData.append('file', {
    uri: compressed.uri,
    name: 'receipt.jpg',
    type: 'image/jpeg',
  } as any)
  const res = await api.post<ExpenseWithDuplicate>('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export default function CameraCapture({ onExpenseCreated, onError }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [mode, setMode] = useState<'select' | 'viewfinder'>('select')
  const [uploading, setUploading] = useState(false)
  const cameraRef = useRef<CameraView>(null)

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.9,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets[0]) return
    try {
      setUploading(true)
      const expense = await compressAndUpload(result.assets[0].uri)
      onExpenseCreated(expense)
    } catch (e: any) {
      onError(e.response?.data?.detail ?? 'Error al procesar la imagen')
    } finally {
      setUploading(false)
    }
  }

  const takePicture = async () => {
    if (!cameraRef.current) return
    try {
      setUploading(true)
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 })
      if (!photo) throw new Error('No se pudo capturar la imagen')
      const expense = await compressAndUpload(photo.uri)
      onExpenseCreated(expense)
    } catch (e: any) {
      onError(e.response?.data?.detail ?? 'Error al procesar la imagen')
    } finally {
      setUploading(false)
      setMode('select')
    }
  }

  if (uploading) {
    return (
      <View className="items-center py-8 gap-3">
        <ActivityIndicator size="large" color="#6366f1" />
        <Text className="text-gray-500 text-sm">Analizando imagen con IA...</Text>
      </View>
    )
  }

  if (mode === 'viewfinder') {
    if (!permission?.granted) {
      return (
        <View className="items-center py-8 gap-4">
          <Text className="text-gray-600 text-center px-6">
            Se necesita permiso de cámara para tomar fotos
          </Text>
          <Pressable onPress={requestPermission} className="bg-indigo-600 px-6 py-3 rounded-full">
            <Text className="text-white font-medium">Dar permiso</Text>
          </Pressable>
          <Pressable onPress={() => setMode('select')}>
            <Text className="text-gray-500 text-sm">Volver</Text>
          </Pressable>
        </View>
      )
    }

    return (
      <View style={{ height: 340 }} className="relative">
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
          {/* Frame overlay */}
          <View className="flex-1 items-center justify-center">
            <View
              style={{
                width: 260,
                height: 180,
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.7)',
                borderRadius: 8,
              }}
            />
            <Text className="text-white text-xs mt-2 opacity-70">Encuadra el ticket</Text>
          </View>
        </CameraView>
        <View className="absolute bottom-0 left-0 right-0 flex-row items-center justify-around py-4 bg-black/30">
          <Pressable onPress={() => setMode('select')} className="px-4 py-2">
            <Text className="text-white font-medium">Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={takePicture}
            className="w-16 h-16 rounded-full bg-white items-center justify-center"
          >
            <View className="w-12 h-12 rounded-full border-2 border-gray-300" />
          </Pressable>
          <View className="w-16" />
        </View>
      </View>
    )
  }

  return (
    <View className="py-6 gap-4">
      <Text className="text-center text-sm text-gray-500 px-6">
        Sube una foto de tu ticket o recibo para registrar el gasto automáticamente
      </Text>
      <View className="flex-row gap-3 px-4">
        <Pressable
          onPress={pickFromGallery}
          className="flex-1 items-center bg-gray-100 rounded-2xl py-6 gap-2 active:opacity-70"
        >
          <Text className="text-4xl">🖼️</Text>
          <Text className="text-sm font-medium text-gray-700">Galería</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!permission?.granted) requestPermission()
            setMode('viewfinder')
          }}
          className="flex-1 items-center bg-indigo-50 rounded-2xl py-6 gap-2 active:opacity-70"
        >
          <Text className="text-4xl">📷</Text>
          <Text className="text-sm font-medium text-indigo-700">Cámara</Text>
        </Pressable>
      </View>
    </View>
  )
}

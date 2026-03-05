import '../src/global.css'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Slot, useRouter, useSegments } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { AuthProvider } from '../src/contexts/AuthContext'
import { usePushNotifications } from '../src/hooks/usePushNotifications'

function AuthGuard() {
  usePushNotifications()
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    AsyncStorage.getItem('token').then((token) => {
      setAuthed(!!token)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    const inAuth = segments[0] === '(auth)'
    if (!authed && !inAuth) {
      router.replace('/(auth)/login')
    } else if (authed && inAuth) {
      router.replace('/(tabs)')
    }
  }, [ready, authed, segments])

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    )
  }

  return <Slot />
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <AuthProvider>
        <AuthGuard />
      </AuthProvider>
    </GestureHandlerRootView>
  )
}

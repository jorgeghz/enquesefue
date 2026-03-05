import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import api from '../api/client'

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

const PUSH_TOKEN_KEY = 'expo_push_token'

export function usePushNotifications() {
  const router = useRouter()

  useEffect(() => {
    registerForPushNotifications()

    // Deep link: tap notification → go to recurring tab
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data
      if (data?.type === 'recurring') {
        router.push('/(tabs)/recurring')
      }
    })

    return () => sub.remove()
  }, [])
}

async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) {
    // Push notifications don't work on simulators
    return
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    return
  }

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId

    if (!projectId) {
      // No projectId configured — skip push registration
      return
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data

    // Only register with backend if token changed
    const stored = await AsyncStorage.getItem(PUSH_TOKEN_KEY)
    if (token !== stored) {
      await api.post('/push/register', { token })
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token)
    }
  } catch {
    // Silently fail — push is non-critical
  }
}

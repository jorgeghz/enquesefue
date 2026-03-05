import AsyncStorage from '@react-native-async-storage/async-storage'
import { Picker } from '@react-native-picker/picker'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native'
import api from '../api/client'
import { useAuth } from '../hooks/useAuth'
import type { User } from '@shared/types'

const TIMEZONES = [
  { label: 'Ciudad de México (UTC-6)', value: 'America/Mexico_City' },
  { label: 'Cancún (UTC-5, sin horario de verano)', value: 'America/Cancun' },
  { label: 'Tijuana / Baja California (UTC-8)', value: 'America/Tijuana' },
  { label: 'Chihuahua / Mazatlán (UTC-7)', value: 'America/Chihuahua' },
  { label: 'Colombia (UTC-5)', value: 'America/Bogota' },
  { label: 'Argentina (UTC-3)', value: 'America/Argentina/Buenos_Aires' },
  { label: 'Nueva York (UTC-5)', value: 'America/New_York' },
  { label: 'Los Ángeles (UTC-8)', value: 'America/Los_Angeles' },
  { label: 'España (UTC+1)', value: 'Europe/Madrid' },
  { label: 'UTC', value: 'UTC' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 mb-2">
        {title}
      </Text>
      <View className="bg-white rounded-2xl overflow-hidden shadow-sm">{children}</View>
    </View>
  )
}

function Row({
  label,
  icon,
  right,
  onPress,
  destructive,
}: {
  label: string
  icon: string
  right?: React.ReactNode
  onPress?: () => void
  destructive?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center px-4 py-3.5 border-b border-gray-100 last:border-0 active:bg-gray-50"
    >
      <Text className="text-xl mr-3">{icon}</Text>
      <Text className={`flex-1 text-base ${destructive ? 'text-red-600' : 'text-gray-900'}`}>
        {label}
      </Text>
      {right}
    </Pressable>
  )
}

export default function SettingsScreen() {
  const { user, setUser, logout } = useAuth()
  const router = useRouter()

  const [selectedTz, setSelectedTz] = useState(user?.timezone ?? 'America/Mexico_City')
  const [tzSaving, setTzSaving] = useState(false)
  const [tzSaved, setTzSaved] = useState(false)

  const [emailSummary, setEmailSummary] = useState(user?.email_summary ?? true)
  const [emailSummarySaving, setEmailSummarySaving] = useState(false)

  useEffect(() => {
    if (user) {
      setSelectedTz(user.timezone)
      setEmailSummary(user.email_summary)
    }
  }, [user])

  const handleSaveTz = async () => {
    setTzSaving(true)
    setTzSaved(false)
    try {
      const res = await api.patch<User>('/auth/me', { timezone: selectedTz })
      setUser(res.data)
      setTzSaved(true)
      setTimeout(() => setTzSaved(false), 2500)
    } finally {
      setTzSaving(false)
    }
  }

  const handleToggleEmailSummary = async (enabled: boolean) => {
    setEmailSummary(enabled)
    setEmailSummarySaving(true)
    try {
      const res = await api.patch<User>('/auth/me', { email_summary: enabled })
      setUser(res.data)
    } catch {
      setEmailSummary(!enabled)
    } finally {
      setEmailSummarySaving(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await logout()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="pb-8">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 pt-14 pb-4 px-4 mb-6">
        <Text className="text-xl font-bold text-gray-900">⚙️ Configuración</Text>
        {user && (
          <Text className="text-sm text-gray-400 mt-0.5">{user.name} · {user.email}</Text>
        )}
      </View>

      {/* Timezone */}
      <Section title="Zona horaria">
        <View className="px-4 py-3">
          <Text className="text-sm text-gray-500 mb-2">
            Afecta cuándo se programan los gastos recurrentes
          </Text>
          <View className="border border-gray-200 rounded-xl overflow-hidden mb-3">
            <Picker
              selectedValue={selectedTz}
              onValueChange={setSelectedTz}
              style={{ height: 50 }}
            >
              {TIMEZONES.map((tz) => (
                <Picker.Item key={tz.value} label={tz.label} value={tz.value} />
              ))}
            </Picker>
          </View>
          <Pressable
            onPress={handleSaveTz}
            disabled={tzSaving || selectedTz === user?.timezone}
            className={`rounded-xl py-2.5 items-center ${
              tzSaving || selectedTz === user?.timezone
                ? 'bg-gray-200'
                : 'bg-indigo-600 active:opacity-80'
            }`}
          >
            {tzSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text
                className={`font-medium ${
                  selectedTz === user?.timezone ? 'text-gray-400' : 'text-white'
                }`}
              >
                {tzSaved ? '✓ Guardado' : 'Guardar zona horaria'}
              </Text>
            )}
          </Pressable>
        </View>
      </Section>

      {/* Notifications */}
      <Section title="Notificaciones">
        <Row
          icon="📧"
          label="Resumen mensual por email"
          right={
            <Switch
              value={emailSummary}
              onValueChange={handleToggleEmailSummary}
              disabled={emailSummarySaving}
              trackColor={{ false: '#d1d5db', true: '#a5b4fc' }}
              thumbColor={emailSummary ? '#6366f1' : '#9ca3af'}
            />
          }
        />
      </Section>

      {/* Account */}
      <Section title="Cuenta">
        <Row
          icon="🚪"
          label="Cerrar sesión"
          onPress={handleLogout}
          destructive
        />
      </Section>

      {/* App info */}
      <View className="items-center mt-4">
        <Text className="text-xs text-gray-400">💸 enquesefue · v1.0.0</Text>
      </View>
    </ScrollView>
  )
}

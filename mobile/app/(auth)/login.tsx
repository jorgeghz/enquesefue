import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useAuth } from '../../src/hooks/useAuth'

export default function LoginScreen() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Por favor completa todos los campos')
      return
    }
    try {
      setLoading(true)
      setError('')
      await login(email.trim().toLowerCase(), password)
      router.replace('/(tabs)')
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-6">
        {/* Header */}
        <View className="items-center mb-10">
          <Text className="text-5xl mb-3">💸</Text>
          <Text className="text-3xl font-bold text-gray-900">enquesefue</Text>
          <Text className="text-gray-500 mt-1">Tus gastos, siempre bajo control</Text>
        </View>

        {/* Form */}
        <View className="bg-white rounded-2xl p-6 shadow-sm">
          <Text className="text-xl font-bold text-gray-900 mb-6">Iniciar sesión</Text>

          {error ? (
            <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              <Text className="text-red-600 text-sm">{error}</Text>
            </View>
          ) : null}

          <Text className="text-sm font-medium text-gray-700 mb-1">Correo electrónico</Text>
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900 mb-4"
            placeholder="tu@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#9ca3af"
          />

          <Text className="text-sm font-medium text-gray-700 mb-1">Contraseña</Text>
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900 mb-6"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#9ca3af"
          />

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            className="bg-indigo-600 rounded-lg py-3 items-center active:opacity-80"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">Entrar</Text>
            )}
          </Pressable>
        </View>

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-500">¿No tienes cuenta? </Text>
          <Link href="/(auth)/register">
            <Text className="text-indigo-600 font-semibold">Regístrate</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

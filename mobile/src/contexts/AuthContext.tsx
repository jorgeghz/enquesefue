import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import api from '../api/client'
import type { User } from '@shared/types'

interface AuthContextValue {
  user: User | null
  setUser: (u: User | null) => void
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem('token').then((token) => {
      if (!token) { setLoading(false); return }
      api.get<User>('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => AsyncStorage.removeItem('token'))
        .finally(() => setLoading(false))
    })
  }, [])

  const login = async (email: string, password: string) => {
    const res = await api.post<{ access_token: string }>('/auth/login', { email, password })
    await AsyncStorage.setItem('token', res.data.access_token)
    const me = await api.get<User>('/auth/me')
    setUser(me.data)
  }

  const register = async (email: string, password: string, name: string) => {
    await api.post('/auth/register', { email, password, name })
    await login(email, password)
  }

  const logout = async () => {
    await AsyncStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}

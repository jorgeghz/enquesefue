import axios from 'axios'
import { addDebugEntry } from '../stores/debugStore'

const DEBUG = import.meta.env.VITE_DEBUG === 'true'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Adjuntar JWT en cada petición
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirigir a login si el token expira; registrar errores en modo debug
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    if (DEBUG) {
      addDebugEntry({
        method: (error.config?.method ?? 'GET').toUpperCase(),
        url: error.config?.url ?? '?',
        status: error.response?.status ?? 0,
        detail: error.response?.data?.detail ?? error.message,
        traceback: error.response?.data?.traceback ?? null,
        raw: error.response?.data,
      })
    }
    return Promise.reject(error)
  }
)

export default api

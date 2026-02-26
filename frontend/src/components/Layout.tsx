import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navLink = (to: string, label: string, icon: string) => {
    const active = location.pathname === to
    return (
      <Link
        to={to}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
          active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <span className="text-lg">{icon}</span>
        {label}
      </Link>
    )
  }

  const bottomNavLink = (to: string, label: string, icon: string) => {
    const active = location.pathname === to
    return (
      <Link
        to={to}
        className={`flex flex-col items-center gap-0.5 px-4 py-2 text-xs font-medium transition ${
          active ? 'text-indigo-600' : 'text-gray-400'
        }`}
      >
        <span className="text-xl">{icon}</span>
        {label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar — solo visible en md+ */}
      <aside className="hidden md:flex w-60 bg-white border-r border-gray-200 flex-col p-4 fixed h-full z-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-900">💸 enquesefue</h1>
          <p className="text-xs text-gray-400 mt-1">{user?.name}</p>
        </div>
        <nav className="space-y-1 flex-1">
          {navLink('/', 'Dashboard', '📊')}
          {navLink('/gastos', 'Gastos', '💳')}
        </nav>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition mt-4"
        >
          <span>🚪</span> Cerrar sesión
        </button>
      </aside>

      {/* Contenido */}
      <main className="flex-1 md:ml-60 p-4 md:p-6 pb-20 md:pb-6">
        {/* Header móvil */}
        <div className="flex items-center justify-between mb-4 md:hidden">
          <h1 className="text-lg font-bold text-gray-900">💸 enquesefue</h1>
          <span className="text-xs text-gray-400">{user?.name}</span>
        </div>
        {children}
      </main>

      {/* Barra de navegación inferior — solo en móvil */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex md:hidden z-10">
        {bottomNavLink('/', 'Dashboard', '📊')}
        {bottomNavLink('/gastos', 'Gastos', '💳')}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-4 py-2 text-xs font-medium text-gray-400 transition flex-1"
        >
          <span className="text-xl">🚪</span>
          Salir
        </button>
      </nav>
    </div>
  )
}

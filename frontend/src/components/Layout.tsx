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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col p-4 fixed h-full">
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
      <main className="ml-60 flex-1 p-6">
        {children}
      </main>
    </div>
  )
}

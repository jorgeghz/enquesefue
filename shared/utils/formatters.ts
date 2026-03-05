import type { Expense } from '../types'

export const CATEGORY_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#14b8a6', '#f97316', '#ec4899',
]

export function categoryColor(id?: number | null): string {
  if (!id) return '#e5e7eb'
  return CATEGORY_COLORS[(id - 1) % CATEGORY_COLORS.length]
}

export function formatMoney(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)
}

export function sourceIcon(source: string): string {
  return ({ text: '✍️', audio: '🎤', image: '📷', pdf: '📄', recurring: '🔁' } as Record<string, string>)[source] ?? '📝'
}

export function getDateGroup(dateStr: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) {
    return d.toLocaleDateString('es-MX', { weekday: 'long' })
      .replace(/^\w/, (c) => c.toUpperCase())
  }
  return d.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: diffDays > 365 ? 'numeric' : undefined,
  })
}

export function groupExpenses<T extends { date: string }>(expenses: T[]): [string, T[]][] {
  const groups: Record<string, T[]> = {}
  const order: string[] = []
  for (const e of expenses) {
    const key = getDateGroup(e.date)
    if (!groups[key]) { groups[key] = []; order.push(key) }
    groups[key].push(e)
  }
  return order.map((k) => [k, groups[k]])
}

export function getRangeForPreset(preset: string): { from: string; to: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  switch (preset) {
    case 'this_week': {
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))
      return { from: fmt(start), to: fmt(now) }
    }
    case 'last_week': {
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay() - 6)
      const end = new Date(now)
      end.setDate(now.getDate() - now.getDay())
      return { from: fmt(start), to: fmt(end) }
    }
    case 'last_15': {
      const start = new Date(now)
      start.setDate(now.getDate() - 14)
      return { from: fmt(start), to: fmt(now) }
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: fmt(start), to: fmt(end) }
    }
    case 'this_month':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: fmt(start), to: fmt(now) }
    }
  }
}

export interface User {
  id: number
  email: string
  name: string
  currency: string
  created_at: string
}

export interface Category {
  id: number
  name: string
  emoji: string
}

export interface Expense {
  id: number
  amount: number
  currency: string
  description: string
  category_id: number | null
  category_name: string | null
  category_emoji: string | null
  date: string
  source: 'text' | 'audio' | 'image' | 'pdf'
  created_at: string
}

export interface ExpenseListResponse {
  items: Expense[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface CategoryStat {
  name: string
  emoji: string
  total: number
}

export interface SummaryResponse {
  total: number
  by_category: CategoryStat[]
  recent: Expense[]
  start: string
  end: string
}

export interface Token {
  access_token: string
  token_type: string
}

export interface DuplicateInfo {
  id: number
  amount: number
  currency: string
  description: string
  date: string
  source: string
}

export interface ExpenseWithDuplicate extends Expense {
  possible_duplicate: DuplicateInfo | null
}

export interface PDFExpense extends Expense {
  is_possible_duplicate: boolean
}

export interface PDFImportResult {
  created: number
  duplicates_count: number
  expenses: PDFExpense[]
}

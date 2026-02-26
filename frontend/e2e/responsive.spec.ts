import { expect, test } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mockea todas las llamadas al API para que la app funcione sin backend. */
async function mockApi(page: import('@playwright/test').Page) {
  const now = new Date().toISOString()

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, email: 'demo@test.com', name: 'Demo', currency: 'MXN', created_at: now }),
    })
  )
  await page.route('**/api/stats/monthly', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 1250.0, by_category: [
        { name: 'Alimentación', emoji: '🍔', total: 750 },
        { name: 'Transporte', emoji: '🚗', total: 500 },
      ], recent: [], start: now, end: now }),
    })
  )
  await page.route('**/api/expenses**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [
        { id: 1, amount: 150, currency: 'MXN', description: 'Supermercado', category_id: 1,
          category_name: 'Alimentación', category_emoji: '🍔', date: now, source: 'text', created_at: now },
        { id: 2, amount: 80, currency: 'MXN', description: 'Uber al trabajo', category_id: 2,
          category_name: 'Transporte', category_emoji: '🚗', date: now, source: 'audio', created_at: now },
      ], total: 2, page: 1, limit: 15, pages: 1 }),
    })
  )
  await page.route('**/api/categories', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Alimentación', emoji: '🍔' },
        { id: 2, name: 'Transporte', emoji: '🚗' },
      ]),
    })
  )

  // Token en localStorage para que PrivateRoute no redirija
  await page.addInitScript(() => {
    localStorage.setItem(
      'token',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vQHRlc3QuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.fake'
    )
  })
}

function isMobile(page: import('@playwright/test').Page) {
  return (page.viewportSize()?.width ?? 1280) < 768
}

// ── Login page (sin auth) ─────────────────────────────────────────────────────

test('login — formulario visible', async ({ page }, testInfo) => {
  await page.goto('/login')
  await page.waitForSelector('form')
  await testInfo.attach('login', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  await expect(page.locator('form')).toBeVisible()
})

// ── Dashboard ─────────────────────────────────────────────────────────────────

test('dashboard — layout nav correcto segun viewport', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.goto('/')
  await page.waitForTimeout(800)
  await testInfo.attach('dashboard', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  if (isMobile(page)) {
    await expect(page.locator('aside')).toBeHidden()
    await expect(page.locator('nav.fixed')).toBeVisible()
  } else {
    await expect(page.locator('aside')).toBeVisible()
    await expect(page.locator('nav.fixed')).toBeHidden()
  }
})

test('dashboard — KPI cards visibles', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.goto('/')
  await page.waitForTimeout(800)
  await expect(page.getByText('Total del mes')).toBeVisible()
  await expect(page.getByText('Gastos registrados')).toBeVisible()
  await expect(page.getByText('Categoría top')).toBeVisible()
})

// ── Expenses ──────────────────────────────────────────────────────────────────

test('expenses — tabs y lista de gastos', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.goto('/gastos')
  await page.waitForTimeout(800)
  await testInfo.attach('expenses', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  await expect(page.getByRole('button', { name: /Texto/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Voz/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Archivo/ })).toBeVisible()
  await expect(page.getByText('Supermercado')).toBeVisible()
  await expect(page.getByText('Uber al trabajo')).toBeVisible()
})

test('expenses — input texto ocupa ancho razonable en movil', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.goto('/gastos')
  await page.waitForTimeout(800)

  const input = page.locator('input[placeholder*="Gast"]')
  await expect(input).toBeVisible()

  const box = await input.boundingBox()
  const viewport = page.viewportSize()!

  if (isMobile(page)) {
    expect(box!.width).toBeGreaterThan(viewport.width * 0.6)
  }

  await testInfo.attach('expenses-text-input', {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  })
})

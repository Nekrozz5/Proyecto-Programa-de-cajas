const { test, expect } = require('@playwright/test');

test.describe('Punto de Venta POS y Control de Acceso', () => {
  test('Página de inicio (/) debe responder y cargar el portal', async ({ page }) => {
    const response = await page.goto('/');
    expect(response.status()).toBe(200);
    expect(new URL(page.url()).hostname).toBe('cafeteria.localhost');
    await expect(page.locator('text=Ha ocurrido un error inesperado')).not.toBeVisible();
    await expect(page.getByText('Cafetería de prueba', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a Caja (Ventas)' })).toBeVisible();
  });

  test('Página de Caja (/caja) monta la terminal sin errores críticos', async ({ page }) => {
    await page.goto('/caja');

    // Verificar que no haya colapso en blanco ni error boundary
    await expect(page.locator('text=Ha ocurrido un error inesperado')).not.toBeVisible();

    // La interfaz debe mostrar el catálogo, el formulario de apertura o el login de caja
    const selectorCaja = page.locator('text=Catálogo de Productos')
      .or(page.locator('text=Apertura de Turno'))
      .or(page.locator('text=Selecciona tu nombre o estación'))
      .or(page.locator('text=PIN'));
      
    await expect(selectorCaja.first()).toBeVisible({ timeout: 15000 });
  });

  test('Panel Administrativo (/admin) exige credenciales ante usuarios anónimos', async ({ page }) => {
    await page.goto('/admin');

    // Debe mostrar la pantalla de bloqueo o solicitar PIN / Nombre de usuario
    const loginAdmin = page.locator('text=Entrar al Panel Admin')
      .or(page.locator('input[type="password"]'))
      .or(page.locator('input[placeholder*="PIN"]'))
      .or(page.locator('input[placeholder*="usuario"]'));

    await expect(loginAdmin.first()).toBeVisible({ timeout: 15000 });
  });

  test('Cabeceras de Seguridad HTTP presentes en la respuesta del navegador', async ({ page }) => {
    const response = await page.goto('/caja');
    const headers = response.headers();

    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
});

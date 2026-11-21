const { test, expect } = require('@playwright/test');

// Estos contratos se ejecutan contra un entorno multi-tenant real cuando se
// habilitan explícitamente. No dependen del tenant local de desarrollo.
const habilitado = process.env.TENANT_E2E_READY === 'true';
const tenantHost = process.env.TENANT_E2E_HOST || '';
const usuario = process.env.TENANT_E2E_USER || '';
const pin = process.env.TENANT_E2E_PIN || '';
const deviceId = process.env.TENANT_E2E_DEVICE_ID || '';
const challenge = process.env.TENANT_E2E_CHALLENGE || '';
const signature = process.env.TENANT_E2E_SIGNATURE || '';

test.describe('Aislamiento de tenants y dispositivos POS', () => {
  test.skip(!habilitado, 'Requiere TENANT_E2E_READY=true y un entorno multi-tenant preparado.');

  test('1. un cajero autorizado puede iniciar sesión', async ({ request }) => {
    const response = await request.post('/api/auth', {
      headers: { host: tenantHost },
      data: { accion: 'login', nombreUsuario: usuario, pin, deviceId, challenge, signature },
    });
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).usuario.rol).toBe('user');
  });

  test('2. credenciales sin prueba de dispositivo no permiten acceso de cajero', async ({ request }) => {
    const response = await request.post('/api/auth', {
      headers: { host: tenantHost },
      data: { accion: 'login', nombreUsuario: usuario, pin },
    });
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(403);
  });

  test('3. el tenant enviado por el cliente no puede sustituir al tenant del host', async ({ request }) => {
    const response = await request.post('/api/auth', {
      headers: { host: tenantHost },
      data: {
        accion: 'login', nombreUsuario: usuario, pin, deviceId, challenge, signature,
        tenantId: process.env.TENANT_E2E_OTHER_TENANT_ID || '22222222-2222-4222-8222-222222222222',
      },
    });
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).usuario.tenantId).not.toBe(process.env.TENANT_E2E_OTHER_TENANT_ID);
  });
});

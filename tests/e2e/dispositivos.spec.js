const { generateKeyPairSync, randomUUID, sign } = require('node:crypto');
const { test: base, expect } = require('@playwright/test');

function opcionesApi(baseURL) {
  // Node no resuelve subdominios .localhost en todos los sistemas.
  const url = new URL(baseURL);
  const host = url.host;
  url.hostname = '127.0.0.1';
  return { baseURL: url.href, extraHTTPHeaders: { host } };
}

const test = base.extend({
  api: async ({ playwright, baseURL }, use) => {
    const api = await playwright.request.newContext(opcionesApi(baseURL));
    try {
      await use(api);
    } finally {
      await api.dispose();
    }
  },
});

async function crearPruebaPOS(playwright, baseURL) {
  const admin = await playwright.request.newContext(opcionesApi(baseURL));
  try {
    const login = await admin.post('/api/auth', {
      data: { accion: 'login', nombreUsuario: 'propietario e2e', pin: process.env.POS_E2E_CLAVE },
    });
    expect(login.status()).toBe(200);
    const respuesta = await admin.post('/api/auth/device', { data: { accion: 'crear-desafio' } });
    expect(respuesta.status()).toBe(200);
    const { desafio: { codigo } } = await respuesta.json();
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const challenge = randomUUID();
    const pareja = await admin.post('/api/auth/device', {
      data: {
        accion: 'emparejar', codigo,
        nombre: `Terminal ${challenge}`,
        clavePublica: publicKey.export({ type: 'spki', format: 'pem' }),
      },
    });
    expect(pareja.status()).toBe(200);
    const { dispositivo } = await pareja.json();
    return {
      deviceId: Number(dispositivo.id),
      challenge,
      signature: sign('sha256', Buffer.from(challenge), { key: privateKey, dsaEncoding: 'ieee-p1363' })
        .toString('base64url'),
    };
  } finally {
    await admin.dispose();
  }
}

async function crearCodigoEmparejamiento(playwright, baseURL) {
  const admin = await playwright.request.newContext(opcionesApi(baseURL));
  try {
    const login = await admin.post('/api/auth', {
      data: { accion: 'login', nombreUsuario: 'propietario e2e', pin: process.env.POS_E2E_CLAVE },
    });
    expect(login.status()).toBe(200);
    const respuesta = await admin.post('/api/auth/device', { data: { accion: 'crear-desafio' } });
    expect(respuesta.status()).toBe(200);
    const { desafio } = await respuesta.json();
    return desafio.codigo;
  } finally {
    await admin.dispose();
  }
}

function loginCajero(request, datos = {}) {
  return request.post('/api/auth', {
    data: { accion: 'login', nombreUsuario: 'cajero e2e', pin: process.env.POS_E2E_PIN, ...datos },
  });
}

test.describe('Aislamiento de tenants y dispositivos POS', () => {
  test('la pantalla de caja inicia sesión con nombre de usuario y prueba del dispositivo', async ({ page, playwright, baseURL }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Ir a Caja (Ventas)' })).toBeVisible({ timeout: 15_000 });
    await page.goto('/caja');
    await expect(page.getByText('Iniciar Sesión en Caja', { exact: true })).toBeVisible({ timeout: 15_000 });
    const codigo = await crearCodigoEmparejamiento(playwright, baseURL);
    await page.getByRole('button', { name: 'Emparejar terminal' }).click();
    await page.getByLabel('Código de emparejamiento').fill(codigo);
    await page.getByLabel('Nombre de la terminal').fill('Caja navegador E2E');
    await page.getByRole('button', { name: 'Activar terminal' }).click();
    await expect(page.getByText('Terminal emparejada y lista para iniciar sesión.')).toBeVisible();

    await page.getByLabel('Selecciona tu Usuario').selectOption({ label: 'Cajero E2E' });
    await page.getByLabel('PIN / Contraseña').fill(process.env.POS_E2E_PIN);
    const [peticionLogin, respuestaLogin] = await Promise.all([
      page.waitForRequest((request) => request.url().endsWith('/api/auth') && request.method() === 'POST'),
      page.waitForResponse((response) => response.url().endsWith('/api/auth') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Ingresar a Caja' }).click(),
    ]);

    expect(peticionLogin.postDataJSON()).toMatchObject({
      accion: 'login', nombreUsuario: 'cajero e2e', pin: process.env.POS_E2E_PIN,
    });
    expect(peticionLogin.postDataJSON()).not.toHaveProperty('usuarioId');
    expect(peticionLogin.postDataJSON()).toMatchObject({
      deviceId: expect.any(Number), challenge: expect.any(String), signature: expect.any(String),
    });
    expect(respuestaLogin.status()).toBe(200);
  });

  test('1. un cajero autorizado puede iniciar sesión', async ({ api, playwright, baseURL }) => {
    const prueba = await crearPruebaPOS(playwright, baseURL);
    const response = await loginCajero(api, prueba);
    expect(response.status()).toBe(200);
    expect((await response.json()).usuario).toMatchObject({
      rol: 'user', tenantId: process.env.POS_E2E_TENANT_ID, deviceId: prueba.deviceId,
    });
    const repetida = await loginCajero(api, prueba);
    expect(repetida.status()).toBe(403);
  });

  test('2. credenciales sin prueba de dispositivo no permiten acceso de cajero', async ({ api }) => {
    const response = await loginCajero(api);
    expect(response.status()).toBe(403);
  });

  test('3. el tenant enviado por el cliente no puede sustituir al tenant del host', async ({ api, playwright, baseURL }) => {
    const prueba = await crearPruebaPOS(playwright, baseURL);
    const tenantAjeno = process.env.POS_E2E_OTRO_TENANT_ID;
    expect(tenantAjeno).toBeTruthy();
    const response = await loginCajero(api, { ...prueba, tenantId: tenantAjeno });
    expect(response.status()).toBe(200);
    const { usuario } = await response.json();
    expect(usuario.tenantId).toBe(process.env.POS_E2E_TENANT_ID);
    expect(usuario.tenantId).not.toBe(tenantAjeno);
  });
});

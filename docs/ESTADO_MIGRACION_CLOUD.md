# Estado de migración cloud multi-tenant

Última actualización: 2026-11-21

## Decisión arquitectónica

La plataforma opera exclusivamente sobre PostgreSQL:

- Aplicación Next.js compartida.
- PostgreSQL como motor operativo.
- Una base PostgreSQL independiente por negocio.
- Registro central de tenants.
- Backups y restauraciones independientes por negocio.
- Cajeros restringidos a dispositivos POS registrados.
- Administradores y propietarios con acceso multidispositivo.

`cafeteria` es el tenant piloto. La decisión de migrar a PostgreSQL se conserva
en el [ADR-001](ADR-001-POSTGRES-ONLY.md).

## Cambios realizados

### Control multi-tenant

- `database/postgres.js`: pools PostgreSQL perezosos y separados por URL.
- `server/tenancy/tenant-registry.js`: registro central y resolución de bases por tenant.
- `server/tenancy/tenant-context.js`: resolución por subdominio y contexto `AsyncLocalStorage`.
- `server/tenancy/request-context.js`: wrapper para ejecutar Route Handlers dentro del tenant correcto.
- `database/migraciones-control.js`: tabla `control_tenants`.

### Persistencia y sesiones

- `server/repositories/db.js`: acceso a PostgreSQL, con transacciones ligadas a la conexión del tenant.
- `server/actions/_wrapper.js`: las Server Actions resuelven automáticamente el tenant.
- `app/api/caja/route.js`, `app/api/configuracion/route.js` y `app/api/reportes/route.js`: ejecutan sus consultas dentro del contexto tenant.
- `server/lib/sesion.js`: JWT con `tenantId`, validación de tenant y exclusión de credenciales del token.

### Usuarios y credenciales

- Usuarios sin correo obligatorio.
- `nombre`: nombre visible.
- `nombre_usuario`: identificador de acceso.
- Un mismo usuario puede existir en tenants diferentes.
- PIN numérico de mínimo 4 dígitos para cajeros.
- Contraseña administrativa de mínimo 8 caracteres con letras y números.
- Bcrypt con 10 rounds.
- Eliminada la comparación contra credenciales en texto plano.

### Dispositivos POS

- `dispositivos_pos` para registrar terminales por negocio.
- Emparejamiento mediante código temporal/QR.
- Cajeros requieren `deviceId` y prueba criptográfica.
- Administradores y propietarios no requieren dispositivo POS.
- Revocación de terminales y validación del estado en cada sesión.
- UI administrativa para listar, emparejar y revocar terminales.
- Pruebas unitarias de aislamiento en `tests/tenant-isolation.test.js`.

### PostgreSQL operativo

- `database/migraciones-tenant.js`: migraciones SQL versionadas de las tablas operativas del POS.
- `database/provisionar-tenant.js`: inicialización de cada base operativa y sincronización de la versión con el registro central.
- La migración incluye configuración, usuarios, cajas, productos, insumos, recetas, ventas, pagos, kardex, lotes, SMTP, notificaciones y dispositivos.

### Reportes y analíticas

- Consultas PostgreSQL para tendencias, filtros por fecha, modificadores, CSV, Excel, RCV de compras y analíticas comerciales.
- Los instantes se conservan como `TIMESTAMPTZ` y los períodos de reporte usan `America/La_Paz`.
- `tests/postgres-reportes.test.js` verifica resultados financieros, Kardex y aislamiento en dos bases temporales con IDs de turno coincidentes y ventas distintas.

### Semilla y respaldos

- `npm run seed` carga los datos de prueba en el tenant PostgreSQL ya aprovisionado.
- `npm run backup -- <slug>` genera un respaldo por tenant con `pg_dump`.
- En la Fase 3 se verificó la semilla y se restauró un respaldo en una base temporal con `pg_restore`. Coincidieron los movimientos y sus importes.

## Dependencias añadidas

- `pg`
- `qrcode`

## Instalación requerida en la otra computadora

1. Instalar Node.js compatible con el proyecto.
2. Clonar o copiar el proyecto.
3. Ejecutar:

```powershell
npm ci
```

4. Instalar PostgreSQL 16 o 17 para Windows desde el instalador oficial:

https://www.postgresql.org/download/windows/

Durante la instalación:

- Puerto: `5432`.
- Usuario administrador: `postgres`.
- Definir una contraseña y conservarla de forma segura.
- Instalar también pgAdmin 4.
- Mantener activo el servicio de PostgreSQL.

5. Verificar:

```powershell
psql --version
Get-Service -Name 'postgresql*'
```

## Configuración local de referencia

Crear `.env.local` para desarrollo, sin subirlo a Git:

```env
NODE_ENV=development
TENANCY_MODE=AWS_MULTI_TENANT
TENANT_HOST_SUFFIX=localhost
CONTROL_DATABASE_URL=postgresql://postgres:CONTRASEÑA@localhost:5432/control_plane
TENANT_DATABASE_URLS_JSON={"cafeteria":"postgresql://postgres:CONTRASEÑA@localhost:5432/negocio_001"}
PG_SSL=false
PG_POOL_MAX=10
SESSION_SECRET=una-clave-local-de-al-menos-32-caracteres
```

Para pruebas locales por subdominio puede ser necesario configurar entradas en el archivo `hosts`, por ejemplo:

```text
127.0.0.1 cafeteria.localhost
```

No guardar contraseñas reales en este documento.

## Pendiente de realizar

### Migración de datos y operación cloud

- Migrar una copia de los datos del piloto, conciliar sus saldos y reportes históricos y definir el corte operativo.
- Validar respaldo y restauración por negocio en la infraestructura de destino antes del corte.

### Dispositivos

- Verificar el inicio de sesión desde la pantalla de caja. Los casos E2E de autenticación POS ejercitan el flujo por API.
- Mover los desafíos de emparejamiento desde memoria a Redis o PostgreSQL para soportar varias instancias AWS y reinicios.
- Validar claves públicas durante el emparejamiento, no solo durante el login.

## Comandos útiles

```powershell
npm run test:all
node --env-file=.env.local database/migraciones-control.js
node --env-file=.env.local database/provisionar-tenant.js cafeteria
npm run build
```

Para ejecutar las pruebas, configurar `POSTGRES_TEST_URL` con una base de
mantenimiento separada y un rol con permiso `CREATEDB`. La suite crea y elimina
sus bases temporales.

## Estado actual

- La Fase 3 pasó 20 pruebas PostgreSQL, 37 pasos del simulador y 7 E2E en Chromium, sin omisiones.
- La Fase 4 retiró los módulos, dependencias y pruebas del motor anterior. Con una instalación limpia, pasaron `npm run build` y `npm run test:all` (20 pruebas PostgreSQL, 37 pasos del simulador y 7 E2E en Chromium, sin omisiones).
- El despliegue en AWS y la migración de los datos del piloto siguen pendientes.

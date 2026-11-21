# Estado de migración cloud multi-tenant

Última actualización: 2026-11-20

## Decisión arquitectónica

El sistema será 100% cloud:

- Aplicación Next.js compartida.
- PostgreSQL como motor operativo.
- Una base PostgreSQL independiente por negocio.
- Registro central de tenants.
- Backups y restauraciones independientes por negocio.
- Cajeros restringidos a dispositivos POS registrados.
- Administradores y propietarios con acceso multidispositivo.

No se implementará un instalador local ni un modo offline para negocios.

## Cambios realizados

### Control multi-tenant

- `database/postgres.js`: pools PostgreSQL perezosos y separados por URL.
- `server/tenancy/tenant-registry.js`: registro central y resolución de bases por tenant.
- `server/tenancy/tenant-context.js`: resolución por subdominio y contexto `AsyncLocalStorage`.
- `server/tenancy/request-context.js`: wrapper para ejecutar Route Handlers dentro del tenant correcto.
- `database/migraciones-control.js`: tabla `control_tenants`.

### Persistencia y sesiones

- `server/repositories/db.js`: soporte inicial para SQLite local y PostgreSQL multi-tenant.
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

- `database/postgres-schema.js`: esquema Drizzle inicial de identidad y dispositivos.
- `database/migraciones-tenant.js`: migración SQL completa de las tablas operativas del POS.
- La migración incluye configuración, usuarios, cajas, productos, insumos, recetas, ventas, pagos, kardex, lotes, SMTP, notificaciones y dispositivos.

### Regresión corregida

- Se agregó `sistemaEstaInstalado()` a `server/repositories/configuracion.repo.js`.
- El simulador integral pasó de 36/37 a 37/37 pasos exitosos.

## Dependencias añadidas

- `pg`
- `qrcode`

## Instalación requerida en la otra computadora

1. Instalar Node.js compatible con el proyecto.
2. Clonar o copiar el proyecto.
3. Ejecutar:

```powershell
npm install
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

## Variables de entorno pendientes

Crear `.env.local` para desarrollo, sin subirlo a Git:

```env
NODE_ENV=development
TENANCY_MODE=AWS_MULTI_TENANT
TENANT_HOST_SUFFIX=localhost
CONTROL_DATABASE_URL=postgresql://postgres:CONTRASEÑA@localhost:5432/control_plane
TENANT_DATABASE_URLS_JSON={"tenant-id":"postgresql://postgres:CONTRASEÑA@localhost:5432/negocio_001"}
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

### Prioridad alta

1. Crear las bases `control_plane` y `negocio_001` en PostgreSQL.
2. Ejecutar `migraciones-control.js` sobre `control_plane`.
3. Registrar el primer tenant en `control_tenants`.
4. Ejecutar `migraciones-tenant.js` usando la conexión del tenant registrado.
5. Adaptar los repositorios SQL de SQLite a PostgreSQL.

### Incompatibilidades conocidas

`server/repositories/db.js` todavía hace una conversión inicial de SQL, pero no resuelve todas las diferencias entre SQLite y PostgreSQL. Deben revisarse:

- `lastID` y sentencias `RETURNING`.
- `INSERT OR IGNORE`.
- `datetime`, `strftime` y funciones SQLite.
- `last_insert_rowid`.
- Consultas con `COLLATE NOCASE`.
- Tipos de fechas y números.
- Repositorios de ventas, inventario, cajas y reportes.

### Dispositivos

- Mover los desafíos de emparejamiento desde memoria a Redis o PostgreSQL para soportar varias instancias AWS y reinicios.
- Validar claves públicas durante el emparejamiento, no solo durante el login.

### Verificación

- Probar las migraciones contra PostgreSQL real.
- Crear dos tenants reales y comprobar aislamiento de usuarios, ventas, inventario y reportes.
- Ejecutar `npm test` después de cada adaptación.
- Ejecutar `npm run test:e2e` con PostgreSQL y tenants preparados.
- Corregir cualquier diferencia encontrada por reportes financieros.

## Comandos útiles

```powershell
npm test
node database/migraciones-control.js
node database/migraciones-tenant.js
npm run build
npm run test:e2e
```

## Estado actual

- SQLite: simulador integral funcionando, 37/37 pasos correctos.
- PostgreSQL: código de conexión y migraciones preparados, aún no ejecutados contra un servidor real.
- AWS: todavía no desplegado.
- Git: no se creó commit ni se hizo push.

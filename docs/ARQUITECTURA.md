# Arquitectura Técnica del Sistema

Este documento resume la arquitectura del sistema POS, su modelo de seguridad, la estructura de base de datos y las reglas financieras e inventariales implementadas.

---

## 1. Stack Tecnológico

- **Frontend / Fullstack:** Next.js 16 (App Router) con React 19.
- **Base de Datos:** SQLite3 local (`sqlite3`) con SQL nativo parametrizado (sin ORM).
- **Autenticación:** JWT firmado con `jose` en cookies `HttpOnly` (`pos_session`) y hash de contraseñas con `bcryptjs` (10 rondas).
- **Despliegue y Respaldos:** PM2 (`ecosystem.config.js`), Docker (`Dockerfile` / `docker-compose.yml`) y respaldo en caliente con `VACUUM INTO` (`scripts/backup.js`).

---

## 2. Seguridad y Control de Sesiones (`server/sesion.js`)

- **Validación exclusiva en servidor:** La identidad, rol y permisos de cada petición se extraen del token JWT validado en servidor, nunca de campos enviados por el cliente.
- **TTL diferenciado por rol:**
  - `developer`: 15 minutos.
  - `superadmin` / `admin`: 30 minutos.
  - `user` (Cajero): 8 horas.
- **`INSTANCE_BOOT_ID`:** Cada arranque del proceso Node genera un identificador único de instancia que invalida tokens administrativos/técnicos de arranques anteriores.
- **Inactividad y cookies:** Los perfiles administrativos usan cookies de sesión (se destruyen al cerrar el navegador) y cierre automático por inactividad de 15 minutos en frontend.
- **Rate limiting:** Control en memoria de intentos fallidos de inicio de sesión.
- **Cuenta `developer`:** Sincronizada automáticamente con la variable `DEVELOPER_PASSWORD` y oculta de los listados estándar de usuarios.

---

## 3. Base de Datos y Migraciones (`database/`)

- **`database/database.js`:**
  - Ruta configurable mediante `DATABASE_PATH` (por defecto `./caja.db`).
  - Activa `PRAGMA foreign_keys = ON`, modo WAL y `PRAGMA busy_timeout = 5000` para manejar concurrencia sin bloqueos prematuros.
- **`database/migraciones.js`:**
  - Controla la versión del esquema con `PRAGMA user_version` (actualmente v1 a v5).
  - Todas las migraciones se ejecutan de forma transaccional e idempotente al iniciar el servidor.
- **Transacciones atómicas:** Toda escritura de negocio (ventas, egresos, compras, cierres, anulaciones) corre dentro de `transaccion(async (dbTx) => { ... })` en `server/queries.js`.
- **Fechas:** Almacenadas en UTC (`CURRENT_TIMESTAMP`) y convertidas con `'localtime'` en consultas y filtros `WHERE`.

---

## 4. Reglas de Negocio Principales

### Control de Caja y Arqueo Ciego
- Solo se registran ventas y egresos en cajas con estado `'abierta'`.
- Al cerrar turno, el cajero ingresa `efectivo_real` sin ver previamente `efectivo_esperado`.
- Fórmula de arqueo físico:
  ```text
  efectivo_esperado = monto_inicial + ingresos_efectivo (ventas + inyecciones de cambio) - egresos_efectivo
  diferencia_efectivo = efectivo_real - efectivo_esperado
  ```
- **Inyecciones de sencillo (`ingreso_efectivo`):** Aumentan el efectivo físico esperado en cajón sin sumarse a las ventas ni alterar utilidades.
- **Pagos QR:** Se concilian aparte (`qr_esperado`) sin mezclarse con el efectivo físico.
- **Reaperturas auditadas:** Incrementan `veces_reabierta` y registran usuario, fecha/hora y motivo en `historial_reaperturas`.

### Inventario Híbrido y Costo Promedio Ponderado (NIC 2)
- Modalidades de producto:
  - `'libre'`: Sin control de inventario.
  - `'directo'`: Producto unitario de reventa con descuento atómico (`UPDATE ... WHERE stock >= ?`).
  - `'receta'`: Escandallo multi-insumo que descuenta insumos proporcionalmente y calcula disponibilidad máxima.
- Las compras de insumos actualizan el costo por **Costo Promedio Ponderado** y recalculan en cascada el costo de las recetas asociadas.
- `detalle_movimientos` congela `precio_unitario` y `costo_unitario` en el instante de la venta para garantizar exactitud histórica en estadísticas y anulaciones.

### Cálculos Financieros
- `Ventas Totales = SUM(subtotal)` de ventas completadas.
- `Costo Total de Ventas = SUM(cantidad * costo_unitario)`.
- `Ganancia Bruta = Ventas Totales - Costo Total de Ventas`.
- `Flujo Neto Operativo = Ganancia Bruta - Total Egresos`.

---

## 5. Respaldos (`scripts/backup.js`)

El comando `npm run backup`:
1. Ejecuta `VACUUM INTO` sobre la base de datos activa (copia atómica en caliente sin detener el POS).
2. Guarda el archivo en `backups/` (o `BACKUP_DIR`) con marca de tiempo.
3. Conserva las últimas `MAX_BACKUPS_LOCAL` copias (30 por defecto).
4. Si `S3_BUCKET` está definido y AWS CLI está disponible, sube la copia al bucket configurado.

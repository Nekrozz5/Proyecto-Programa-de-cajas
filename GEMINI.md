# Contexto del Proyecto: Sistema POS y Control de Cajas Híbrido

## 1. Stack Tecnológico y Arquitectura
- **Entorno:** Node.js (CommonJS) con Next.js (App Router) y SQLite3 local (`caja.db`).
- **Autenticación y Seguridad:** JWT con cookies HttpOnly gestionadas desde el servidor (`jose`), contraseñas hasheadas con `bcryptjs` (salt rounds = 10) y control de intentos fallidos en memoria con rate limiting.
- **Estructura de Carpetas:**
  - `database/database.js`: Inicialización de SQLite, activación de claves foráneas (`PRAGMA foreign_keys = ON`), modo WAL y ejecución automática de migraciones.
  - `database/migraciones.js`: Sistema de migraciones versionado con `PRAGMA user_version`. Toda mutación al esquema se aplica de forma transaccional e idempotente aquí.
  - `server/queries.js`: Lógica de negocio y consultas con promesas nativas (`async/await`) usando `runQuery`, `getQuery`, `allQuery` y `transaccion()`.
  - `server/sesion.js`: Manejo de sesión JWT del servidor (crear, validar, renovar y destruir cookies HttpOnly `pos_session`).
  - `app/api/caja/route.js` y `app/api/reportes/route.js`: Endpoints del backend en Next.js.
  - `app/caja/page.js` y `app/admin/page.js`: Vistas de operador y administrador.

## 2. Reglas de Negocio Obligatorias
- **Roles y Permisos:**
  - `user` (Cajero): Abre/cierra turnos, selecciona productos, cobra en efectivo (con cálculo de cambio) o QR, y registra egresos con motivo obligatorio.
  - `admin` (Administrador): Todo lo del cajero + crear/borrar usuarios con baja lógica (`activo = 0`), anular ventas reintegrando stock o insumos automáticamente, gestión de catálogo/insumos, acceso a estadísticas financieras y reportes.
  - `superadmin`: Acceso ampliado de administración y auditoría del sistema de negocio.
  - `developer` (Oculto): Rol técnico especial reservado para tareas de diagnóstico, migraciones de datos y mantenimiento profundo. No se expone en listados estándar de creación de usuarios de caja.
- **Configuración del Negocio (`configuracion_negocio`):**
  - Tabla singleton (`id = 1`) que define el nombre del establecimiento, la modalidad operativa y las banderas funcionales activas: `usa_stock_directo`, `usa_vencimiento` y `usa_recetas_ensamblaje`.
- **Arqueo Ciego:**
  - Al cerrar caja, el cajero debe contar físicamente su efectivo e ingresar el `efectivo_real` sin ver de antemano el cálculo de `efectivo_esperado`.
  - El sistema calcula internamente:
    `efectivo_esperado = monto_inicial + ingresos_efectivo - egresos_efectivo`
    y registra la `diferencia_efectivo = efectivo_real - efectivo_esperado`.
  - Los cobros por QR se concilian por separado (`qr_esperado`) sin mezclarse con el dinero físico del cajón.
- **Reaperturas Auditadas de Caja:**
  - Reabrir una caja cerrada es una operación privilegiada y restringida.
  - Cada reapertura incrementa el contador `veces_reabierta` y anexa un registro al campo `historial_reaperturas` (usuario que autorizó/ejecutó, fecha/hora y motivo documentado).
- **Inventario Híbrido y Costo Promedio Ponderado (NIC 2):**
  - Soporta productos de tipo `'libre'`, `'directo'` (reventa en ferretería/micromercado) y `'receta'` (escandallo de insumos para cafetería/restaurante).
  - Las compras de insumos actualizan el costo unitario mediante Costo Promedio Ponderado y recalculan en cascada el costo de los productos asociados.
  - `detalle_movimientos` congela el `precio_unitario` y `costo_unitario` al momento de la venta.

## 3. Reglas Técnicas Obligatorias
- **Transacciones en escrituras:** Toda función o procedimiento que escriba en la base de datos (ventas, egresos, compras, cierres, anulaciones, migraciones) debe ejecutarse obligatoriamente dentro de `transaccion(async (dbTx) => { ... })`.
- **Sesión exclusivamente en el servidor:** La identidad y permisos del usuario se resuelven siempre desde el token de sesión validado en el servidor (`server/sesion.js`), nunca a partir de datos manipulables enviados desde el cliente.
- **Seguridad en contraseñas:** Contraseñas y PINs gestionados con hash `bcrypt` (10 rondas mínimo). Queda estrictamente prohibido el uso o inclusión de cuentas con claves fijas o hardcodeadas en el código fuente.
- **Estado de caja y validación numérica:** Las ventas y egresos solo pueden registrarse en cajas en estado `'abierta'`. Todas las cantidades y montos monetarios deben ser números estrictamente mayores a cero (`> 0`).
- **Descuento de stock atómico:** Todo decremento de inventario debe realizarse con un `UPDATE` atómico (`WHERE stock >= ?` o validación concurrente equivalente) para evitar sobreventas o valores negativos involuntarios.
- **Manejo de fechas y zonas horarias:** Las fechas se almacenan en UTC (`CURRENT_TIMESTAMP`). Al consultar o filtrar fechas para el usuario, utilizar siempre `'localtime'` en SQLite, incluyendo las cláusulas `WHERE` (ej. `datetime(fecha_hora, 'localtime')`).
- **Evolución del esquema:** Los cambios de esquema se realizan única y exclusivamente mediante migraciones en `database/migraciones.js`, administrando la versión con `PRAGMA user_version`.
- **Confirmación en cambios críticos:** Antes de modificar el esquema de base de datos o la lógica de cálculo financiero, se debe explicar el impacto detalladamente al usuario y esperar su confirmación explícita.
- **SQL nativo sin ORMs:** Mantener consultas SQL nativas y parametrizadas (`?`) en `server/queries.js`, evitando constructores de consulta u ORMs externos.

## 4. Comandos
- **Instalación de dependencias:**
  ```bash
  npm install
  ```
- **Iniciar servidor de desarrollo:**
  ```bash
  npm run dev
  ```
- **Compilar para producción:**
  ```bash
  npm run build
  ```
- **Iniciar servidor en producción:**
  ```bash
  npm run start
  ```
- **Ejecución de pruebas puntuales:**
  ```bash
  node test.js
  ```

## 5. Estado del Proyecto
- **Hecho:**
  - Migración a arquitectura con esquema versionado (`database/migraciones.js`, PRAGMA `user_version`).
  - Estandarización de `monto_inicial` en lugar de `fondo_inicial`.
  - Definición de roles (`user`, `admin`, `superadmin`, `developer`) y soporte para contraseñas hasheadas con `bcrypt`.
  - Módulo de sesiones seguras en servidor (`server/sesion.js`) con cookies HttpOnly y firmado JWT.
  - Rate limiting y protección contra ataques de fuerza bruta en login.
  - Implementación de transacciones atómicas seguras en `server/queries.js`.
  - Lógica de arqueo ciego, control de apertura única por usuario y trazabilidad de reaperturas auditadas.
  - Soporte de inventario híbrido (`libre`, `directo`, `receta`) con costeo ponderado.
  - Tabla de configuración del negocio (`configuracion_negocio`).
  - Corrección de consultas temporales a zona local (`'localtime'`) en endpoints de reportes y arqueo.
- **En Progreso:**
  - Refinamiento de la auditoría integral y alineación completa de componentes frontend con los endpoints protegidos.
- **Pendiente:**
  - Pruebas automatizadas E2E de flujos de venta y arqueo concurrentes.
  - Pantallas de configuración avanzada de negocio para administradores en frontend.
  - Reportes exportables (PDF / Excel) de arqueos históricos y movimientos de insumos.

# Contexto del Proyecto: Sistema POS y Control de Cajas Híbrido

## 1. Stack Tecnológico y Arquitectura
- **Entorno:** Node.js (CommonJS) con Next.js (App Router) y SQLite3 local (`caja.db`).
- **Autenticación y Seguridad:** JWT con cookies HttpOnly gestionadas desde el servidor (`jose`), contraseñas hasheadas con `bcryptjs` (salt rounds = 10), control de intentos fallidos en memoria con rate limiting y sincronización automática de credenciales técnicas (`DEVELOPER_PASSWORD` en `.env.local`).
- **Control de Sesiones Avanzado (`server/sesion.js`):**
  - TTL diferenciado por rol: `developer` (15 min), `superadmin` / `admin` (30 min), `user` (8 horas).
  - `INSTANCE_BOOT_ID`: Identificador de arranque del proceso que invalida de inmediato tokens administrativos/técnicos al reiniciar el servidor (`npm run dev`), eliminando sesiones zombis.
  - Cookies de sesión estrictas (Session Cookies destruidas al cerrar ventana) para perfiles administrativos y cierre por inactividad en frontend (15 min).
- **Estructura de Carpetas:**
  - `database/database.js`: Inicialización de SQLite, activación de claves foráneas (`PRAGMA foreign_keys = ON`), modo WAL y ejecución automática de migraciones.
  - `database/migraciones.js`: Sistema de migraciones versionado con `PRAGMA user_version`. Toda mutación al esquema se aplica de forma transaccional e idempotente (migraciones v1 a v5).
  - `server/queries.js`: Lógica de negocio y consultas con promesas nativas (`async/await`) usando `runQuery`, `getQuery`, `allQuery` y `transaccion()`.
  - `server/sesion.js`: Manejo de sesión JWT del servidor (crear, validar, renovar y destruir cookies HttpOnly `pos_session`).
  - `app/api/caja/route.js` y `app/api/reportes/route.js`: Endpoints del backend en Next.js.
  - `app/caja/page.js` y `app/admin/page.js`: Vistas de operador y administrador.

## 2. Reglas de Negocio Obligatorias
- **Roles y Permisos:**
  - `user` (Cajero): Abre/cierra turnos, selecciona productos mediante pestañas de categorías, cobra en efectivo (con cálculo reactivo de cambio) o QR, registra egresos menores e ingresos de sencillo/cambio con motivo obligatorio.
  - `admin` (Administrador): Todo lo del cajero + crear/borrar usuarios con baja lógica (`activo = 0`), anular ventas reintegrando stock o insumos automáticamente, gestión integral de catálogo (modalidades unitario, receta, libre), compras con CPP, acceso a estadísticas financieras y reportes.
  - `superadmin`: Acceso ampliado de administración y auditoría del sistema de negocio.
  - `developer` (Oculto): Rol técnico especial reservado para tareas de diagnóstico, migraciones de datos y mantenimiento profundo. No se expone en listados estándar de creación de usuarios de caja.
- **Configuración del Negocio (`configuracion_negocio`):**
  - Tabla singleton (`id = 1`) que define el nombre del establecimiento, la modalidad operativa y las banderas funcionales activas: `usa_stock_directo`, `usa_vencimiento` y `usa_recetas_ensamblaje`.
- **Arqueo Ciego e Inyecciones de Efectivo:**
  - Al cerrar caja, el cajero debe contar físicamente su efectivo e ingresar el `efectivo_real` sin ver de antemano el cálculo de `efectivo_esperado`.
  - El sistema calcula internamente:
    `efectivo_esperado = monto_inicial + ingresos_efectivo (ventas + inyecciones de cambio) - egresos_efectivo`
    y registra la `diferencia_efectivo = efectivo_real - efectivo_esperado`.
  - Los aportes de sencillo (`ingreso_efectivo`) incrementan el dinero esperado en el cajón físico, pero **no** suman a las ventas ni alteran las ganancias operativas de productos.
  - Los cobros por QR se concilian por separado (`qr_esperado`) sin mezclarse con el dinero físico del cajón.
- **Reaperturas Auditadas de Caja:**
  - Reabrir una caja cerrada es una operación privilegiada y restringida.
  - Cada reapertura incrementa el contador `veces_reabierta` y anexa un registro al campo `historial_reaperturas` (usuario que autorizó/ejecutó, fecha/hora y motivo documentado).
- **Inventario Híbrido y Costo Promedio Ponderado (NIC 2):**
  - Soporta productos de tipo `'libre'`, `'directo'` (reventa / unitario) y `'receta'` (escandallo multi-insumo para cafetería/restaurante).
  - Las compras de insumos actualizan el costo unitario mediante Costo Promedio Ponderado y recalculan en cascada el costo de los productos asociados.
  - `detalle_movimientos` congela el `precio_unitario` y `costo_unitario` al momento de la venta.
- **Cálculo Financiero y Estadísticas de Ganancia:**
  - `Ventas Totales = SUM(subtotal)` de movimientos completados de venta.
  - `Costo Total de Ventas = SUM(cantidad * costo_unitario)` con costos congelados al momento de cada venta.
  - `Ganancia Bruta = Ventas Totales - Costo Total de Ventas`.
  - `Flujo Neto Operativo = Ganancia Bruta - Total Egresos`.
  - `Ganancia por Producto = SUM(subtotal - (cantidad * costo_unitario))`.

## 3. Reglas Técnicas Obligatorias
- **Compatibilidad y Reseteo de Base de Datos:** Si un rediseño del esquema de base de datos no es compatible con versiones anteriores locales, está autorizado reiniciar o eliminar la base de datos local (`caja.db`) y sus copias de seguridad para inicializar el proyecto con un esquema limpio.
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
  - Migración a arquitectura con esquema versionado (`database/migraciones.js`, PRAGMA `user_version` hasta v5).
  - Migraciones v4 y v5: Tabla `categorias` para catálogo interactivo por pestañas, normalización multicategoría y limpieza de categoría 'General'.
  - Sincronización automática y segura de la cuenta `developer` vinculada a `DEVELOPER_PASSWORD` en `.env.local` con hash bcrypt.
  - Módulo de sesiones seguras (`server/sesion.js`) con `INSTANCE_BOOT_ID` (invalidación automática al reiniciar servidor), TTL por rol (15 min dev, 30 min admin, 8 h cajero) y session cookies para roles administrativos.
  - Cierre automático de sesión en frontend tras 15 minutos de inactividad para roles privilegiados en `/admin` y `/caja`.
  - Nueva acción `ingreso_efectivo` para inyección de cambio/sencillo al cajón sin inflar las ventas ni distorsionar utilidades.
  - Rediseño de creación de productos en `app/admin/page.js`: modalidades asistidas `unitario` (autocreación o enlace a insumo con proveedor y vencimiento), `receta` (escandallo multi-insumo dinámico) y `libre`.
  - Optimización de catálogo en caja (`app/caja/page.js`): navegación por pestañas de categorías, inputs numéricos reactivos con debounce, validación atómica de stock en carrito y botón para eliminar ítems.
  - Implementación de transacciones atómicas seguras en `server/queries.js`.
  - Lógica de arqueo ciego, control de apertura única por usuario y trazabilidad de reaperturas auditadas.
  - Soporte de inventario híbrido (`libre`, `directo`, `receta`) con costeo ponderado y rollback garantizado en anulaciones.
  - Elaboración de batería de 7 escenarios de prueba integral documentados en `pruebas.txt`.
- **En Progreso:**
  - Validación y ejecución de la suite de pruebas funcionales y de concurrencia (`pruebas.txt`).
  - Alineación de estilos y ergonomía responsiva para pantallas táctiles de POS y tablets.
- **Pendiente:**
  - Reportes exportables (PDF / Excel) de arqueos históricos, tickets de venta y movimientos de insumos.
  - Panel visual de estadísticas financieras y análisis de rentabilidad avanzada (Ganancia Bruta, Costo de Ventas, Flujo Neto Operativo).
  - Panel de auditoría dedicada de reaperturas de caja y anulaciones de movimientos con filtrado por fecha y responsable.

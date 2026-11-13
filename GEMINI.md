# Contexto del Proyecto: Sistema POS y Control de Cajas Híbrido

## 1. Stack Tecnológico y Arquitectura
- **Entorno:** Node.js (CommonJS) con Next.js (App Router) y SQLite3 local (`caja.db`).
- **Autenticación y Seguridad:** JWT con cookies HttpOnly gestionadas desde el servidor (`jose`), contraseñas hasheadas con `bcryptjs` (salt rounds = 10), control de intentos fallidos en memoria con rate limiting y sincronización automática de credenciales técnicas (`DEVELOPER_PASSWORD` en `.env.local`).
- **Control de Sesiones Avanzado (`server/sesion.js`):**
  - TTL diferenciado por rol: `developer` (15 min), `superadmin` / `admin` (30 min), `user` (8 horas).
  - `INSTANCE_BOOT_ID`: Identificador de arranque del proceso que invalida de inmediato tokens administrativos/técnicos al reiniciar el servidor (`npm run dev`), eliminando sesiones zombis.
  - Cookies de sesión estrictas (Session Cookies destruidas al cerrar ventana) para perfiles administrativos y cierre por inactividad en frontend (15 min).
- **Infraestructura y Preparación para Producción:**
  - Base de datos portable con ruta configurable por variable de entorno `DATABASE_PATH` y concurrencia gestionada con `PRAGMA busy_timeout = 5000` en `database/database.js`.
  - Script de respaldo atómico en caliente (`scripts/backup.js`) ejecutado con `npm run backup` usando SQLite `VACUUM INTO`, purga local automática y soporte opcional para sincronización a AWS S3.
  - Empaquetado optimizado en `next.config.js` con `serverExternalPackages: ['sqlite3', 'bcryptjs']`.
  - Contenerización lista para despliegue con `Dockerfile` multi-stage y `docker-compose.yml`.
  - Gestión de procesos para servidores Linux con PM2 (`ecosystem.config.js`).
  - Guía completa de arquitectura y despliegue en la nube en `DEPLOY_AWS.md`.
- **Estructura de Carpetas:**
  - `database/database.js`: Inicialización de SQLite, activación de claves foráneas (`PRAGMA foreign_keys = ON`), modo WAL, timeout y ejecución automática de migraciones.
  - `database/migraciones.js`: Sistema de migraciones versionado con `PRAGMA user_version`. Toda mutación al esquema se aplica de forma transaccional e idempotente (migraciones v1 a v5).
  - `server/queries.js`: Lógica de negocio y consultas con promesas nativas (`async/await`) usando `runQuery`, `getQuery`, `allQuery` y `transaccion()`.
  - `server/sesion.js`: Manejo de sesión JWT del servidor (crear, validar, renovar y destruir cookies HttpOnly `pos_session`).
  - `scripts/backup.js`: Script de copia de seguridad atómica con retención configurable.
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
- **Ejecutar respaldo en caliente de la base de datos (SQLite VACUUM INTO + S3):**
  ```bash
  npm run backup
  ```
- **Despliegue con PM2 en servidor Linux:**
  ```bash
  pm2 start ecosystem.config.js
  ```
- **Despliegue con Docker Compose:**
  ```bash
  docker compose up -d --build
  ```
- **Ejecución de pruebas puntuales:**
  ```bash
  node test.js
  ```

## 5. Configuración del Entorno de Desarrollo (VS Code / Antigravity IDE)
Para garantizar una experiencia consistente al trabajar en múltiples equipos (ej. PC y Laptop):

### A. Extensiones de VS Code Configuradas (`.vscode/extensions.json`)
- **SQLite Viewer (`qwtel.sqlite-viewer`):** Permite inspeccionar, consultar y filtrar tablas de `caja.db` directamente desde el explorador de VS Code sin instalar software adicional.
- **Docker (`ms-azuretools.vscode-docker`):** Facilita la gestión de imágenes, contenedores y archivos `Dockerfile` / `docker-compose.yml`.
- **ESLint (`dbaeumer.vscode-eslint`):** Asegura consistencia de sintaxis y detección temprana de errores en JavaScript/React.
- **Prettier (`esbenp.prettier-vscode`):** Formateador uniforme de código según las reglas del proyecto.

### B. Ajustes de Workspace (`.vscode/settings.json`)
- Ocultación de archivos efímeros de base de datos (`caja.db-journal`, `caja.db-shm`).
- Exclusión en el observador de archivos (*file watcher*) de las carpetas `backups/`, `.next/` y `node_modules/` para evitar ralentización en el editor.
- Formateo automático al guardar (`editor.formatOnSave: true`) con tabulación de 4 espacios.

### C. Trabajo con Antigravity IDE en Múltiples Equipos
- **Catálogo de Modelos:** Para disponer de modelos avanzados (Gemini 4 Argon, Gemini 3.8 Flash, Claude 5.5 Sonnet/Opus), es necesario iniciar sesión en Antigravity con la misma cuenta de Google en la laptop.
- **Memoria del Agente (Local-First):** Las conversaciones residen en el disco local (`~/.gemini/antigravity/brain`). Por tanto, este archivo `GEMINI.md` actúa como la **fuente única de verdad** compartida para que el agente en la laptop comprenda el estado del proyecto sin requerir el historial previo de chat.
- **Variables de Entorno Locales:** Al clonar o abrir el proyecto en un equipo nuevo, verificar la existencia de `.env.local` con `DEVELOPER_PASSWORD=...` para permitir el acceso al perfil técnico de mantenimiento.

## 6. Estado del Proyecto
- **Hecho:**
  - Preparación integral para producción y despliegue en AWS / VPS:
    - Ruta de base de datos configurable mediante `DATABASE_PATH` en `database/database.js` y `PRAGMA busy_timeout = 5000` para alta concurrencia.
    - Script atómico de respaldo en caliente (`scripts/backup.js`) con `VACUUM INTO`, purga automática local y subida opcional a Amazon S3 (`npm run backup`).
    - Configuración de empaquetado de producción en `next.config.js` (`serverExternalPackages: ['sqlite3', 'bcryptjs']`).
    - Empaquetado en contenedores con `Dockerfile` multi-stage y `docker-compose.yml`.
    - Configuración de procesos resilientes para servidores Linux en `ecosystem.config.js` (PM2).
    - Plantilla de variables de producción `.env.production.example` y guía completa `DEPLOY_AWS.md`.
  - Configuración del workspace para VS Code y Antigravity IDE:
    - Creación de `.vscode/extensions.json` con recomendaciones (SQLite Viewer, Docker, ESLint, Prettier).
    - Creación de `.vscode/settings.json` optimizando observadores de archivos, exclusión de logs/backups y formateo.
    - Documentación de pautas de sincronización entre PC y laptop.
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

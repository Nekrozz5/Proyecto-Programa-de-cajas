# Contexto del Proyecto: Sistema POS y Control de Cajas Híbrido

## 1. Stack Tecnológico y Arquitectura
- **Entorno:** Node.js con Next.js (App Router), Tailwind CSS, Shadcn UI y SQLite3 local (`caja.db`).
- **Autenticación y Seguridad:** JWT con cookies HttpOnly gestionadas desde el servidor (`jose`), contraseñas hasheadas con `bcryptjs` (salt rounds = 10), control de intentos fallidos en memoria con rate limiting dual (por IP con `TRUST_PROXY` y por cuenta de usuario) y sincronización automática de credenciales técnicas (`DEVELOPER_PASSWORD` en `.env.local`).
- **Control de Sesiones Avanzado (`server/sesion.js`):**
  - TTL diferenciado por rol: `developer` (15 min), `propietario` / `admin` (30 min), `user` (8 horas).
  - `INSTANCE_BOOT_ID`: Identificador de arranque del proceso que invalida de inmediato tokens administrativos/técnicos al reiniciar el servidor (`npm run dev`), eliminando sesiones zombis.
  - Cookies de sesión estrictas (Session Cookies destruidas al cerrar ventana) para perfiles administrativos y cierre por inactividad en frontend (15 min).
- **Infraestructura y Preparación para Producción Local / Híbrida:**
  - Base de datos portable con ruta configurable por variable de entorno `DATABASE_PATH` y concurrencia gestionada con `PRAGMA busy_timeout = 5000` y modo WAL en `database/database.js`.
  - Script de respaldo atómico en caliente (`scripts/backup.js`) ejecutado con `npm run backup` usando SQLite `VACUUM INTO` y purga local automática.
  - Empaquetado optimizado en `next.config.js` con `serverExternalPackages: ['sqlite3', 'better-sqlite3', 'bcryptjs', 'exceljs', 'nodemailer']`.
  - Gestión de procesos con PM2 (`ecosystem.config.js`) y actualización segura automatizada (`scripts/update.js`).
  - Blindaje contra errores de máquina cliente: protección `notranslate` en `app/layout.js` (contra fallos del DOM en React por traducción automática de Chrome) y `Cache-Control: no-store` en `/api/caja`.
  - Validación temprana y perezosa de secretos de producción mediante `server/secretos.js` e `instrumentation.js`.
  - Soporte nativo para operación dual (PC local por `http://localhost:3000` / LAN + acceso móvil remoto por `https://` vía Cloudflare Tunnel) con detección automática de `cf-connecting-ip` y cookie `Secure` adaptativa por protocolo.
  - Documentación organizada en `README.md` y la carpeta `docs/` (`docs/ARQUITECTURA.md`, `docs/PRUEBAS.md`).
- **APIs, Reportes y Notificaciones:**
  - `exceljs` (`^4.4.0`): Generación de libros Excel (`.xlsx`) en servidor con 10 hojas contables y de auditoría (`Movimientos`, `Arqueos de Caja`, `Detalle Ventas (CMV)` con prorrateo exacto de descuentos, `Rentabilidad por Producto`, `Compras y Mermas`, `Inventario Kardex`, `Kardex Productos`, `Kardex Insumos`, `Historial Anulaciones` y `Resumen Contable`).
  - `jspdf` (`^4.2.1`) y `jspdf-autotable` (`^5.0.9`): Exportación de reportes PDF de caja auditada en el navegador (`app/admin/exportarPDF.js`) con resumen ejecutivo, liquidación de impuestos (Débito IVA, IT, Crédito Fiscal IVA), arqueo ciego de efectivo y QR, rentabilidad por producto neta de descuentos, movimientos y anulaciones.
  - `recharts` (`^3.10.1`): Gráficos financieros interactivos en `/admin` (`app/admin/GraficosFinancieros.js`).
  - `nodemailer` (`^10.5.0`): Notificaciones automáticas por correo electrónico vía SMTP (`server/mailer.js`) al cerrar cada turno, con plantilla HTML ejecutiva (conciliación separada de cajón físico efectivo vs. cuenta QR, ventas mixtas y descuentos), soporte para inyección de transporte de prueba (`configurarTransporterPrueba`) y libro Excel `.xlsx` adjunto en caliente.
- **Estructura de Carpetas:**
  - `README.md`: Punto de entrada, estructura general y comandos rápidos.
  - `docs/`: Documentación técnica (`ARQUITECTURA.md`) y checklist de pruebas (`PRUEBAS.md`).
  - `database/database.js`: Inicialización de SQLite, activación de claves foráneas (`PRAGMA foreign_keys = ON`), modo WAL, timeout y ejecución automática de migraciones.
  - `database/schema.js`: Definición centralizada del esquema tipado con Drizzle ORM (20 tablas y relaciones completas, incluyendo `producto_lotes`).
  - `database/drizzle.js`: Cliente Drizzle singleton sobre `better-sqlite3` con modo WAL y timeout de 5000ms.
  - `database/migraciones.js`: Sistema de migraciones versionado con `PRAGMA user_version` y respaldo automático previo a toda migración (`VACUUM INTO backups/caja-pre-migracion-vX-a-vY-*.db`). Toda mutación al esquema se aplica de forma transaccional e idempotente (migraciones v1 a v16).
  - `server/actions/`: Capa de mutaciones protegidas mediante Server Actions (`'use server'`) validadas con `_wrapper.js`: `turnos.actions.js`, `ventas.actions.js`, `catalogo.actions.js`, `inventario.actions.js`, `notificaciones.actions.js`, `admin.actions.js`.
  - `server/domain/`: Lógica pura de negocio y reglas desacopladas: `costos.js` (CPP NIC 2, cascada de recetas/combos) y `fiscal.js` (snapshot tributario, bases IVA/IT).
  - `server/repositories/`: Módulos de persistencia SQL parametrizada (`db.js`, `auth.repo.js`, `cajas.repo.js`, `catalogo.repo.js`, `configuracion.repo.js`, `inventario.repo.js`, `ventas.repo.js`, `reportes.repo.js`, `index.js`).
  - `server/lib/`: Infraestructura y servicios técnicos (`sesion.js`, `secretos.js`, `mailer.js`, `licencia.js`).
  - `server/queries.js`: Fachada central y barrel que re-exporta los repositorios para retrocompatibilidad.
  - `instrumentation.js`: Gancho de arranque de Next.js para validación temprana de seguridad (`server/lib/secretos.js`).
  - `scripts/`: Scripts utilitarios del sistema:
    - `backup.js`: Respaldo atómico en caliente con `VACUUM INTO`.
    - `update.js`: Actualización segura automatizada (`npm run update`).
    - `seed_cafeteria.js`: Carga integral de datos realistas (lotes PEPS, combos, Kardex dual).
    - `generar-clave.js`: Utilidad CLI para emitir y verificar licencias criptográficas Ed25519.
    - `preparar-dist.js`: Recolector y empaquetador para la distribución en `dist/`.
    - `iniciar-pos.bat`, `detener-pos.bat`, `lanzar-silencioso.vbs`: Scripts de control del servicio en Windows.
  - `installer/`: Script de Inno Setup (`pos-cajas.iss`) para generar el instalador de escritorio de Windows.
  - `app/api/caja/route.js`: Endpoint exclusivo `GET` con `Cache-Control: no-store` para lectura de estado inicial, catálogo y sincronización/polling de turnos.
  - `app/api/auth/route.js`: Endpoint `POST` para `login`, `logout` e `instalacion_inicial` con gestión de cookies `HttpOnly` (`pos_session`).
  - `app/api/reportes/route.js`: Endpoint administrativo `GET` para tendencias JSON, exportación CSV (`?formato=csv`) y exportación Excel (`?formato=xlsx` con 10 hojas contables).
  - `app/admin/`: Panel de administración modular con `layout.js` y contexto global (`_context/AdminContext.js`) desacoplado en subrutas (`resumen/`, `catalogo/`, `insumos/`, `arqueos/`, `usuarios/`, `configuracion/`, `exportacion/`) con subcomponentes en `_components/` (`TabCatalogo.js`, `TabTurnosArqueos.js`, `TabUsuariosCajas.js`, `TabKardex.js`, `TabConfigFiscal.js`, `TabConfiguracionCorreos.js`, `ModalVerificarEmail.js`, `TabExportacion.js`, `TabResumen.js`, `GraficosFinancieros.js`, `exportarPDF.js`).
  - `app/caja/`: Terminal POS modular con `layout.js` y contexto global (`_context/CajaContext.js`) desacoplado en subrutas (`pos/`, `movimientos/`) con subcomponentes atómicos en `_components/` (`CatalogoProductos.js`, `CarritoVenta.js`, `ModalCobro.js`, `ModalModificadores.js`, `ModalArqueoCiego.js`, `ModalMovimientosEfectivo.js`, `HistorialTurno.js`, `AperturaTurno.js`, `LoginCaja.js`) y hooks en `_hooks/` (`useCarrito.js`, `useInactividad.js`).
  - `components/ui/`: Componentes UI reutilizables de Shadcn (`badge.jsx`, `button.jsx`, `card.jsx`, `dialog.jsx`, `input.jsx`, `password-input.jsx`, `separator.jsx`, `table.jsx`, `tabs.jsx`).
  - `lib/utils.js`: Utilidad central `cn` (`clsx` + `tailwind-merge`) para combinación dinámica de clases Tailwind.
  - `next.config.js`: Optimización de paquetes nativos con `serverExternalPackages` y configuración de `experimental.serverActions.allowedOrigins` (`localhost:3000`, `127.0.0.1:3000`, `*.trycloudflare.com`, `ALLOWED_ORIGINS`).

## 2. Reglas de Negocio Obligatorias
- **Roles y Permisos:**
  - `user` (Cajero): Abre/cierra turnos, selecciona productos mediante pestañas de categorías, cobra en efectivo (con cálculo reactivo de cambio) o QR, registra egresos menores e ingresos de sencillo/cambio con motivo obligatorio.
  - `admin` (Administrador): Todo lo del cajero + crear/borrar usuarios con baja lógica (`activo = 0`), anular ventas reintegrando stock o insumos automáticamente, gestión integral de catálogo (modalidades unitario, receta, libre), compras con CPP, acceso a estadísticas financieras y reportes.
  - `propietario`: Acceso ampliado de administración y auditoría del sistema de negocio. En la interfaz se presenta como "Propietario(a)".
  - `developer` (Oculto): Rol técnico especial reservado para tareas de diagnóstico, migraciones de datos y mantenimiento profundo. No se expone en listados estándar de creación de usuarios de caja.
- **Configuración del Negocio (`configuracion_negocio`):**
  - Tabla singleton (`id = 1`) que define el nombre del establecimiento, la modalidad operativa y las banderas funcionales activas: `usa_stock_directo`, `usa_vencimiento` y `usa_recetas_ensamblaje`.
- **Múltiples Estaciones Físicas de Caja y N° de Turno:**
  - Separación entre **Estación de Caja Física** (`cajas_fisicas`: terminal de cobro) y **Turno de Operación / Arqueo** (`cajas`: sesión de trabajo correlativa).
  - Regla de mínimo: El negocio debe contar con al menos 1 caja física activa. No se puede desactivar la última caja física.
  - Desactivación protegida: No se puede desactivar una caja física con un turno abierto en curso. Baja lógica (`activa = 0`) para preservar históricos de ventas y arqueos.
  - Multicaja simultánea: Permite operar múltiples cajas físicas abiertas al mismo tiempo por distintos cajeros.
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
  - Soporta productos de tipo `'libre'`, `'directo'` (reventa / unitario), `'receta'` (escandallo multi-insumo para cafetería/restaurante) y `'combo'` (v8: paquetes de productos y promociones).
  - Las compras de insumos y artículos directos actualizan el costo unitario mediante Costo Promedio Ponderado y recalculan en cascada el costo de recetas y de combos que los contengan.
  - `detalle_movimientos` congela el `precio_unitario` y `costo_unitario` al momento de la venta.
- **Combos y Promociones con Descuento Real de Inventario, Límites y Vigencia (v8):**
  - Soporte de tipo de producto `combo` vinculado a múltiples componentes mediante `combo_componentes`.
  - Descomposición atómica de inventario: descuenta stock directo de componentes `directo`, o insumos de las recetas de los componentes `receta`, agrupando consumos de insumos compartidos.
  - Costo ponderado automático: se calcula dinámicamente como la suma de los costos reales de sus componentes y se congela al vender.
  - Modos de venta excluyentes:
    - *Sin límite*: limitado únicamente por el cuello de botella del inventario físico disponible de sus componentes.
    - *Cantidad máxima*: límite de unidades fijas definido por el administrador con contador regresivo automático (`limite_unidades_restante`) que bloquea el combo al agotarse.
  - Disponibilidad reactiva en el POS: calcula el mínimo entre el inventario físico disponible y el límite de unidades restante.
  - Vigencia temporal: control de fechas y horas (`fecha_inicio_vigencia` y `fecha_fin_vigencia`) opcionales para bloquear o habilitar promociones automáticamente.
  - Auditoría y anulación atómica: `detalle_movimientos_combos` congela componentes y cantidades de venta, y las anulaciones restituyen tanto el stock de inventario como el contador de combos restantes.
- **Grupos de Modificadores, Reemplazos y Complementos de Recetas (v7):**
  - Soporte de grupos configurables vinculados a productos (`grupos_modificadores` y `producto_grupos_modificadores`).
  - Tipo de selección `unica` (radio button) o `multiple` (checkbox), con bandera `es_obligatorio`.
  - Reemplazo de insumos de recetas (`insumo_reemplazado_id`): resta el insumo base de la receta y consume el insumo sustituto en la cantidad indicada, recalculando costo y stock de forma atómica.
  - Adición de insumos (shots/toppings extra) o modificadores operativos/libres con recargo de precio adicional (`precio_adicional`).
  - Auditoría atómica: `detalle_movimientos_modificadores` congela el precio y costo adicional al momento de la venta, garantizando trazabilidad y restitución exacta del stock en caso de anulación.
- **Cálculo Financiero, Régimen Tributario Modular y Estadísticas de Ganancia (v9 - v11):**
  - `Ventas Totales (Netas) = SUM(monto)` de movimientos completados con `tipo = 'ingreso'` y `categoria_contable = 'venta'`.
  - `Costo Total de Ventas (CMV) = SUM(cantidad * costo_unitario)` con costos congelados al momento de cada venta.
  - `Ganancia Bruta = Ventas Totales - Costo Total de Ventas`.
  - `Flujo Neto Operativo = Ganancia Bruta - Total Egresos`.
  - `Ganancia por Producto`: distribuye proporcionalmente cualquier `descuento_total` del ticket entre las líneas de venta (`detalle_movimientos`), absorbiendo el centavo residual en la última línea para garantizar que `SUM(ingresos_netos_producto) === Ventas Totales` y `SUM(ganancia_producto) === Ganancia Bruta`.
  - **Fuente de verdad de pagos:** `movimientos_pagos` registra el desglose exacto (`efectivo` y `qr`) para pagos simples y mixtos (`metodo_pago = 'mixto'`). El cambio solo se calcula y entrega sobre la porción en efectivo.
  - **Régimen Tributario Modular y Snapshot Fiscal:**
    - Soporta `simplificado_control_interno` (IVA = 0, IT = 0, prohibición estricta de emitir factura en frontend y backend) y `regimen_general` (alícuotas configurables `iva_porcentaje`, `it_porcentaje` y base `it_base` configurable entre `'todas_las_ventas'` o `'solo_facturadas'`).
    - Cada venta y egreso congela su snapshot tributario (`regimen_tributario`, `iva_porcentaje`, `it_porcentaje`, `iva_monto`, `it_monto`) en `movimientos`, garantizando inmutabilidad histórica ante cambios futuros de tasas o régimen.
    - Validación estricta en backend de permisos fiscales por negocio (`emite_factura`, `usa_respaldo_compras_egresos`), por operador (`puede_registrar_respaldo_fiscal`) y por estación física (`habilita_respaldo_fiscal`).
  - **Kardex Cronológico Dual (Productos Directos e Insumos):**
    - `movimientos_productos_directos` y `movimientos_insumos` registran cronológicamente `inventario_inicial`, `compra`, `venta`/`consumo_venta`, `merma`, `reingreso_anulacion` y `ajuste`, almacenando `stock_resultante` y `costo_promedio_resultante` en cada fila.
    - Los insumos métricos preservan hasta 6 decimales en `costo_por_unidad` (ej. `Bs 0.0015/ml`).
    - Funciones de auditoría `verificarIntegridadKardexDirecto()` y `verificarIntegridadKardexInsumos()` verifican que el stock actual coincida exactamente con la suma algebraica del Kardex.
  - **Trazabilidad de Lotes y Vencimiento PEPS / FIFO (v12):**
    - Tabla `producto_lotes` vinculada a productos directos para seguimiento de partidas perecederas con fecha de caducidad.
    - Entrada por lote en compras y mermas imputadas a lotes específicos.
    - Descuento en ventas con selección manual de lote o política automática PEPS (Primero en Expirar, Primero en Salir / FIFO: `ORDER BY fecha_vencimiento ASC, id ASC`).
    - Actualización atómica con validación de concurrencia (`WHERE stock >= ?`) impidiendo existencias negativas.
  - **Respaldo Fiscal RCV SIAT en Compras (v13):**
    - Inclusión de columnas `nro_autorizacion_cuf`, `codigo_control` y `tipo_compra` en `movimientos_insumos`, `movimientos_productos_directos` y `movimientos`.
    - Cumplimiento formal para exportación de libros de compras homologados con Impuestos Nacionales.
  - **Soporte de Canales de Delivery y Apps de Comida (v14):**
    - Bandera `habilita_apps_comida` en `configuracion_negocio`.
    - Registro de `canal_venta` ('local', 'delivery_propio', 'pedidos_ya', 'yango'), `datos_entrega` y `referencia_externa` en `movimientos`.
    - Métodos de pago dedicados `pedidos_ya` y `yango` en `movimientos_pagos`, desacoplados del arqueo de efectivo de caja física.
  - **Servidor SMTP Dinámico y Destinatarios Verificados (v15):**
    - Tabla `configuracion_smtp` para edición de parámetros de correo en caliente desde la interfaz sin reiniciar Node ni alterar archivos `.env`.
    - Tabla `notificacion_destinatarios` con verificación obligatoria mediante código de seguridad de 6 dígitos enviado por correo.
  - **Jerarquía de Roles y Propietario(a) (v16):**
    - Consolidación del rol `propietario` (sustituyendo superadmin) con acceso completo a auditoría y configuración.
  - **Motor de Licenciamiento Criptográfico Offline (Ed25519):**
    - Validación matemática asimétrica local mediante `server/lib/licencia.js` con clave pública embebida (`POS-ACT-...`).
    - Emisión segura de claves exclusivamente por el desarrollador mediante `scripts/generar-clave.js` (`npm run licencia`).
  - **Distribución de Escritorio Windows e Instalador:**
    - Empaquetador nativo con Inno Setup (`installer/pos-cajas.iss`) que genera `Setup-POS-Cajas-v1.0.exe`.
    - Lanzador silencioso `lanzar-silencioso.vbs` y modo ventana aislada (Kiosco) con Microsoft Edge sin consola CMD.

## 3. Reglas Técnicas Obligatorias
- **Compatibilidad y Reseteo de Base de Datos:** Si un rediseño del esquema de base de datos no es compatible con versiones anteriores locales, está autorizado reiniciar o eliminar la base de datos local (`caja.db`) y sus copias de seguridad para inicializar el proyecto con un esquema limpio.
- **Transacciones en escrituras:** Toda función o procedimiento que escriba en la base de datos (ventas, egresos, compras, cierres, anulaciones, migraciones) debe ejecutarse obligatoriamente dentro de `transaccion(async (dbTx) => { ... })`.
- **Sesión exclusivamente en el servidor:** La identidad y permisos del usuario se resuelven siempre desde el token de sesión validado en el servidor (`server/sesion.js`), nunca a partir de datos manipulables enviados desde el cliente.
- **Seguridad en contraseñas:** Contraseñas y PINs gestionados con hash `bcrypt` (10 rondas mínimo). Queda estrictamente prohibido el uso o inclusión de cuentas con claves fijas o hardcodeadas en el código fuente. Mínimo 8 caracteres para administradores/developers y 4 para cajeros.
- **Estado de caja y validación numérica:** Las ventas y egresos solo pueden registrarse en cajas en estado `'abierta'`. Todas las cantidades y montos monetarios deben ser números estrictamente mayores a cero (`> 0`).
- **Descuento de stock atómico:** Todo decremento de inventario debe realizarse con un `UPDATE` atómico (`WHERE stock >= ?` o validación concurrente equivalente) para evitar sobreventas o valores negativos involuntarios.
- **Manejo de fechas y zonas horarias:** Las fechas se almacenan en UTC (`CURRENT_TIMESTAMP`). Al consultar o filtrar fechas para el usuario, utilizar siempre `'localtime'` en SQLite, incluyendo las cláusulas `WHERE` (ej. `datetime(fecha_hora, 'localtime')`).
- **Evolución del esquema:** Los cambios de esquema se realizan única y exclusivamente mediante migraciones en `database/migraciones.js`, administrando la versión con `PRAGMA user_version`.
- **Confirmación en cambios críticos:** Antes de modificar el esquema de base de datos o la lógica de cálculo financiero, se debe explicar el impacto detalladamente al usuario y esperar su confirmación explícita.
- **SQL nativo y Drizzle ORM:** El proyecto cuenta con Drizzle ORM configurado sobre `better-sqlite3` (`database/schema.js`, `database/drizzle.js`) coexistiendo con las consultas SQL parametrizadas en `server/repositories/db.js`. Toda consulta tipada puede apoyarse en `drizzleDb` y el esquema centralizado de 20 tablas, manteniendo control absoluto de transacciones y modo WAL.
- **Control de Versiones y Operaciones en Git (Estrictamente Bajo Demanda):**
  - **Ejecución Bajo Demanda (Ahorro de Tokens):** La IA conoce perfectamente todos los comandos y procedimientos de Git local, pero **NO** debe ejecutar `git add`, `git commit` ni operaciones de repositorio automáticamente tras cada cambio de código. Solo ejecutará acciones en Git cuando el usuario lo solicite expresamente (ej. *"haz commit"*, *"guarda los cambios en el repositorio"*, *"prepara el commit"*).
  - **Operaciones Locales Permitidas a la IA:** Cuando el usuario lo solicite: inspeccionar el árbol (`git status`, `git diff`, `git log`), crear y cambiar de ramas (`git branch`, `git checkout`, `git switch`), preparar archivos (`git add`) y redactar commits atómicos y descriptivos (`git commit`).
  - **Exclusivo del Usuario Humano (Operaciones Remotas con Autenticación):** Cualquier operación que involucre interactuar con GitHub requiriendo inicio de sesión o credenciales (`git push`, subida de tags o ramas) debe ser ejecutada obligatoriamente por el usuario humano. La IA solo proporcionará el comando exacto.
  - **Versionamiento Semántico Obligatorio en Cada Subida/Release (SemVer):** Ante cada solicitud de subida a GitHub, preparación de versión o release, la IA debe incrementar y sincronizar la versión aplicando estrictamente las reglas de Versionamiento Semántico (`MAJOR.MINOR.PATCH`):
    - **PATCH (Z en X.Y.Z):** Corrección de bugs, retoques menores de interfaz (UI/UX), ajustes cosméticos o de estilo, documentación y refactorizaciones sin alteración funcional.
    - **MINOR (Y en X.Y.0):** Nuevas funcionalidades, módulos agregados, nuevos endpoints o capacidades operativas retrocompatibles (el contador `PATCH` se reinicia a `0`).
    - **MAJOR (X en X.0.0):** Cambios estructurales rompedores (*breaking changes*), rediseño mayor de arquitectura o cambios de esquema incompatibles hacia atrás (los contadores `MINOR` y `PATCH` se reinician a `0`).
    - **Sincronización Mandatoria de Archivos:** La versión debe reflejarse simultáneamente en `package.json` (`"version": "X.Y.Z"`) y en `installer/pos-cajas.iss` (`#define MyAppVersion "X.Y.Z"` y `OutputBaseFilename=Setup-POS-Cajas-vX.Y.Z`), estructurando el commit con formato descriptivo (ej. `chore(release): vX.Y.Z - <descripción>`).
  - **Compilación del Instalador (Estrictamente Bajo Demanda):** Está autorizado y es obligatorio actualizar los números de versión en los archivos, pero **NO** se debe ejecutar la compilación del instalador (`npm run installer:build`, `scripts/preparar-dist.js` o `ISCC.exe`) automáticamente tras una subida o actualización regular. Solo se compilará el instalador cuando el usuario lo solicite explícitamente (ej. *"compila el instalador"*, *"genera el setup"*, *"arma el ejecutable"*), para evitar tiempos prolongados de espera y consumo innecesario de recursos/tokens.
- **Testing y Búsqueda de Bugs (Estrictamente Bajo Demanda):**
  - La IA está capacitada para ejecutar diagnósticos de estrés, suites de prueba automatizadas (`scratch/test_*.js`) y compilaciones de verificación (`npm run build`), pero **NO** debe ejecutarlos proactivamente ni de forma automática tras cada ajuste menor para evitar consumo innecesario de tokens y tiempo.
  - La suite de pruebas y diagnóstico de errores solo se ejecutará cuando el usuario lo ordene explícitamente (ej. *"haz una prueba"*, *"busca fallos o bugs"*, *"ejecuta el testeo"*).
- **Planificación por Fases y Ahorro de Tokens (Skill `phase-planner`):**
  - Ante solicitudes de avance, nuevos módulos o refactorizaciones de envergadura (como la adopción progresiva de Shadcn), la IA debe apoyarse en la skill `phase-planner` (`.agents/skills/phase-planner/SKILL.md`).
  - La descomposición debe dividir el desarrollo en fases atómicas secuenciales, generando para cada una un prompt quirúrgico autocontenido con lista cerrada de archivos, restricciones estrictas y criterio de terminado (DoD) para maximizar el ahorro de tokens y prevenir alucinaciones.

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
- **Ejecutar respaldo en caliente de la base de datos (SQLite VACUUM INTO):**
  ```bash
  npm run backup
  ```
- **Actualizar un equipo en producción de forma segura (Backup + Git Pull + npm ci + Build):**
  ```bash
  npm run update
  ```
- **Cargar datos de prueba integrales (Seed con Lotes PEPS, Régimen Fiscal, Kardex Dual, Combos y Modificadores):**
  ```bash
  npm run seed
  ```
- **Ejecutar simulación integral automatizada E2E:**
  ```bash
  npm run simular
  ```
- **Gestión de licencias criptográficas Ed25519 (CLI):**
  ```bash
  npm run licencia -- emitir --negocio "Nombre Negocio" --vence "2028-12-31" --cajas 2
  npm run licencia -- verificar --clave "POS-ACT-..."
  ```
- **Empaquetar archivos de distribución para instalador Windows:**
  ```bash
  npm run dist:prepare
  ```
- **Iniciar servidor en Windows (Segundo Plano):**
  ```bash
  npm run app:start
  ```
- **Detener servidor en Windows y liberar puerto 3000:**
  ```bash
  npm run app:stop
  ```
- **Despliegue con PM2:**
  ```bash
  pm2 start ecosystem.config.js
  ```
- **Flujo de Trabajo Git / GitHub:**
  - *Comandos locales (ejecutables por la IA):*
    ```bash
    git status
    git diff
    git add .
    git commit -m "feat/fix: descripción del cambio"
    ```
  - *Comando de sincronización remota (exclusivo para el usuario con inicio de sesión):*
    ```bash
    git push origin <rama>
    ```

## 5. Configuración del Entorno de Desarrollo (VS Code / Antigravity IDE)
Para garantizar una experiencia consistente al trabajar en múltiples equipos (ej. PC y Laptop):

### A. Extensiones de VS Code Configuradas (`.vscode/extensions.json`)
- **SQLite Viewer (`qwtel.sqlite-viewer`):** Permite inspeccionar, consultar y filtrar tablas de `caja.db` directamente desde el explorador de VS Code sin instalar software adicional.
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
- **Sincronización con GitHub:** La IA realiza todo el trabajo preparatorio y los commits en local; para subir los cambios a GitHub entre máquinas, el usuario humano ejecuta el `git push` correspondiente con su autenticación.

### D. Configuración y Ejecución en una Computadora Nueva (Primer Clon)
Cuando se clona o actualiza este repositorio en un equipo nuevo, el agente y el desarrollador deben verificar y completar los siguientes requisitos:
1. **Prerrequisitos del Sistema:**
   - **Node.js** (v20 LTS o superior; probado hasta v26) y **npm**.
   - **Git** para clonar y sincronizar el repositorio.
   - *(Solo en Linux/VPS si no existen binarios precompilados de `sqlite3`)*: `build-essential` y `python3`.
2. **Dependencias y APIs Instaladas (`package.json`):**
   - **Core / Backend / Auth:** `next` (`^16.4.3`), `react` (`^19.3.1`), `react-dom` (`^19.3.1`), `sqlite3` (`^6.0.1`), `bcryptjs` (`^3.0.3`), `jose` (`^6.2.17`).
   - **Notificaciones y Correo:** `nodemailer` (`^10.5.0`).
   - **Reportes y Gráficos:** `exceljs` (`^4.4.0`), `jspdf` (`^4.2.1`), `jspdf-autotable` (`^5.0.9`), `recharts` (`^3.10.1`).
3. **Política de Ejecución en Windows (PowerShell):**
   - Si PowerShell bloquea `npm.ps1` con `PSSecurityException` (`UnauthorizedAccess`), habilitar scripts locales una sola vez para el usuario actual:
     ```powershell
     Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
     ```
   - Como alternativa inmediata sin cambiar políticas, usar `npm.cmd run dev`.
4. **Instalación de Dependencias y `sqlite3` en npm 11+:**
   - Ejecutar `npm install` (o `npm.cmd install`) cada vez que se clona el repo o se agregan nuevas librerías en `package.json`.
   - En **npm 11+**, puede aparecer la advertencia `allowScripts` para `sqlite3@6.0.1`. Verificar con `node -e "require('sqlite3')"` que el módulo nativo cargue correctamente; si falla o se desea silenciar el aviso, aprobarlo con `npm install-scripts approve sqlite3`.
5. **Archivo `.env.local` (Obligatorio, ignorado por Git):**
   - Crear `.env.local` en la raíz con:
     ```env
     NODE_ENV=development
     PORT=3000
     DATABASE_PATH=./caja.db
     SESSION_SECRET=<cadena_hex_aleatoria_de_al_menos_32_caracteres>
     DEVELOPER_PASSWORD=<tu_contraseña_developer>

     # Opcional: Configuración SMTP para notificaciones por correo
     # SMTP_HOST=smtp.gmail.com
     # SMTP_PORT=465
     # SMTP_SECURE=true
     # SMTP_USER=tu_correo@gmail.com
     # SMTP_PASS=tu_contraseña_de_aplicacion
     # EMAIL_DESTINATARIO_CIERRE=dueno@empresa.com
     ```
6. **Comprobación Rápida del Entorno:**
   - Verificar en PowerShell que todo esté listo antes de iniciar:
     ```powershell
     node -v; npm -v; Test-Path node_modules\next; Test-Path node_modules\sqlite3; Test-Path node_modules\nodemailer; Test-Path node_modules\exceljs; Test-Path node_modules\recharts; Test-Path node_modules\jspdf; Test-Path .env.local
     ```
7. **Ejecución en la Computadora:**
   - **Modo desarrollo:** `npm run dev` (o `npm.cmd run dev`). Al iniciar, `caja.db` se crea y migra automáticamente si aún no existe. Abrir `http://localhost:3000` en el navegador.
   - **Modo producción local:** `npm run build` seguido de `npm run start` (compila con `--webpack` y externaliza `sqlite3`, `bcryptjs` y `exceljs`).

## 6. Estado del Proyecto
- **Hecho:**
  - **Notificaciones automáticas por correo electrónico de Cierre de Caja y Arqueo:**
    - Módulo centralizado `server/mailer.js` con `nodemailer` para envíos SMTP transparentes, resilientes y con $0 costo mensual.
    - Plantilla HTML ejecutiva responsiva con diseño limpio: estación de cobro, cajero, balance de ventas (Efectivo vs. QR), inyección de sencillo, egresos, y tarjeta destacada con la diferencia de arqueo (cuadrado exacto, sobrante o faltante).
    - Adjunto automático del libro oficial en Excel (`Reporte_Turno_XX.xlsx`) generado en caliente con `exceljs`.
    - Despacho en segundo plano al ejecutar `cerrarCaja` en `/api/caja`, garantizando que el cierre de caja del cajero sea instantáneo e inmune a fallos de red.
    - Soporte administrativo en `/admin`: indicador visual de estado del servicio, botón para enviar correo de prueba y opción para reenviar el reporte por correo de cualquier turno cerrado previo.
    - Configuración segura vía variables de entorno en `.env.local` y `.env.production.example` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_DESTINATARIO_CIERRE`).
  - **Reportes exportables en Excel (`.xlsx`), PDF y CSV:**
    - Exportación Excel en servidor (`generarReporteExcel` en `server/queries.js` con `exceljs`) servida desde `GET /api/reportes?formato=xlsx`, generando hojas *Movimientos* y *Arqueos de Caja*.
    - Exportación PDF en cliente (`exportarReportePDF` en `app/admin/exportarPDF.js` con `jspdf` y `jspdf-autotable`) con resumen financiero, desglose por método de pago y tabla de movimientos de la caja auditada.
    - Integración de botones de descarga `.xlsx`, `.pdf` y `.csv` en el panel lateral de `app/admin/page.js`.
  - **Panel visual de estadísticas financieras (`app/admin/GraficosFinancieros.js`):**
    - Gráficos interactivos con `recharts` integrados en `/admin`: comparativa semanal Ingresos vs Egresos (7 días), flujo de ventas por hora, top productos por ingresos/ganancia y distribución por método de pago.
  - **Endurecimiento de Seguridad y Soporte de Acceso Remoto (Cloudflare Tunnel / Híbrido):**
    - Protección estricta de `instalacion_inicial`: exigencia de `SETUP_TOKEN` validado con `crypto.timingSafeEqual` y transacción atómica unificada para configuración y alta del o la Propietario(a).
    - Rate limiting avanzado de autenticación: soporte de `TRUST_PROXY` (lectura de `cf-connecting-ip` para Cloudflare Tunnel y `x-real-ip` para proxies) y contador secundario independiente por cuenta de usuario (20 intentos en 15 min con caducidad autónoma).
    - Cookie `Secure` adaptativa por protocolo en `server/sesion.js`: permite operación simultánea por `http://localhost:3000` (o LAN sin internet) para el cajero local y por `https://` para acceso móvil remoto del dueño/administrador.
    - Política de fortaleza de claves/PIN: mínimo 8 caracteres para administradores/developers y 4 para cajeros en creación y cambio de contraseñas.
    - Validación segura y perezosa de secretos: `server/secretos.js` e `instrumentation.js` para abortar arranques en producción con secretos por defecto o débiles sin romper `next build`.
    - Ocultamiento de directorio administrativo: `GET /api/caja` sin sesión solo entrega cajeros (sin rol) y estado booleano de instalación; login administrativo en `/admin` siempre manual.
    - SQLite de alto rendimiento: activación de `PRAGMA journal_mode = WAL` y `PRAGMA foreign_keys = ON` en la conexión, y verificación de backups en caliente con `VACUUM INTO`.
  - **Preparación integral para producción local e híbrida:**
    - Ruta de base de datos configurable mediante `DATABASE_PATH` en `database/database.js` y `PRAGMA busy_timeout = 5000` para alta concurrencia.
    - Script atómico de respaldo en caliente (`scripts/backup.js`) con `VACUUM INTO` y purga automática local (`npm run backup`).
    - Script de actualización segura (`scripts/update.js`) con backup preventivo + `git pull` + `npm ci` + `npm run build` (`npm run update`).
    - Blindaje contra errores de navegador/máquina cliente (`notranslate` en `app/layout.js` y `Cache-Control: no-store` en `/api/caja`).
    - Configuración de empaquetado de producción en `next.config.js` (`serverExternalPackages: ['sqlite3', 'bcryptjs', 'exceljs']`).
    - Configuración de procesos resilientes en `ecosystem.config.js` (PM2).
    - Plantilla de variables de producción `.env.production.example`.
    - Documentación ordenada en `README.md` y `docs/` (`ARQUITECTURA.md`, `PRUEBAS.md`), con limpieza de archivos exclusivos de AWS y Docker.
  - **Configuración del workspace para VS Code y Antigravity IDE:**
    - Creación de `.vscode/extensions.json` con recomendaciones (SQLite Viewer, ESLint, Prettier).
    - Creación de `.vscode/settings.json` optimizando observadores de archivos, exclusión de logs/backups y formateo.
    - Documentación de pautas de sincronización entre PC y laptop.
  - **Migración a arquitectura contable y de auditoría versionada (`database/migraciones.js`, PRAGMA `user_version` hasta v16):**
    - **Migración v16**: Actualización del rol administrativo de `superadmin` a `propietario` en la tabla `usuarios` y normalización del CHECK constraint.
    - **Migración v15**: Configuración SMTP dinámica en base de datos (`configuracion_smtp`) y gestión de destinatarios autorizados con código de verificación numérico temporal (`notificacion_destinatarios`).
    - **Migración v14**: Soporte de apps de comida y delivery (`habilita_apps_comida`, `canal_venta`, `datos_entrega`, `referencia_externa` y métodos de pago `pedidos_ya` y `yango`).
    - **Migración v13**: Columnas fiscales de respaldo RCV SIAT (`nro_autorizacion_cuf`, `codigo_control`, `tipo_compra`) en `movimientos_insumos`, `movimientos_productos_directos` y `movimientos`.
    - **Migración v12**: Trazabilidad de vencimientos por lote en `producto_lotes`, migración de stock previo y política automática de salida PEPS (Primero en Expirar, Primero en Salir / FIFO).
    - **Migración v11**: Índice único parcial `una_caja_abierta_por_estacion` en `cajas`, Kardex cronológico completo para `movimientos_insumos` (`stock_resultante`, `costo_promedio_resultante`, tipos `inventario_inicial` y `ajuste`), preservación de hasta 6 decimales en costos unitarios métricos de insumos y reconciliación integral de `movimientos_pagos`.
    - **Migración v10**: Snapshot fiscal inmutable por movimiento (`regimen_tributario`, `iva_porcentaje`, `it_porcentaje`, `iva_monto`, `it_monto`), parámetro configurable `it_base` (`'todas_las_ventas'` vs `'solo_facturadas'`), `costo_promedio_resultante` en `movimientos_productos_directos`, siembra de saldos de apertura de Kardex y respaldo automático previo a toda migración (`VACUUM INTO backups/`).
    - **Migración v9**: Régimen tributario modular, pagos mixtos (`movimientos_pagos`), permisos fiscales por usuario y por estación física, compras con respaldo fiscal y tabla `movimientos_productos_directos`.
    - **Migración v8**: Tabla `combo_componentes` y `detalle_movimientos_combos` para combos y promociones con límites y vigencia temporal.
    - **Migración v7**: Tablas `grupos_modificadores`, `modificadores_opciones`, `producto_grupos_modificadores` y `detalle_movimientos_modificadores`. Soporte integral de complementos y reemplazos de recetas con selección única/múltiple, obligatoriedad, recargos de precio, descuento atómico en `movimientos_insumos` y congelación de costos/precios en auditoría de ventas.
    - **Migración v6**: Tabla `cajas_fisicas` para gestión multicaja de terminales/estaciones con "Caja 1 - Principal" por defecto, vinculación `caja_fisica_id` en `cajas`, soporte de múltiples cajas abiertas en simultáneo y reformulación de terminología de `Caja #` a `N° Turno` en UI, Excel (.xlsx) y PDF.
    - **Migraciones v4 y v5**: Tabla `categorias` para catálogo interactivo por pestañas, normalización multicategoría y limpieza de categoría 'General'.
  - **Empaquetado de Escritorio para Windows y Modo Kiosco:**
    - Script de compilación Inno Setup (`installer/pos-cajas.iss`) que genera el instalador nativo de Windows (`Setup-POS-Cajas-v1.0.exe`).
    - Script recolector `scripts/preparar-dist.js` (`npm run dist:prepare`).
    - Scripts de arranque silencioso (`scripts/lanzar-silencioso.vbs`) e inicio/detención en lote (`iniciar-pos.bat`, `detener-pos.bat`).
    - Modo Kiosco automático para terminales táctiles en Microsoft Edge aislado (`--app=http://localhost:3000/caja/pos`).
  - **Licenciamiento Criptográfico Offline Asimétrico (Ed25519):**
    - Motor en `server/lib/licencia.js` para validación instantánea y offline de claves maestras (`POS-ACT-...`).
    - Utilidad CLI para el desarrollador `scripts/generar-clave.js` (`npm run licencia`) para emitir licencias por cliente, fecha de expiración y límite de cajas.
  - **Simulación Integral Automatizada (E2E):**
    - Script de verificación de ciclo comercial completo `tests/simulador_integral.js` (`npm run simular`).
  - **Seguridad de cuentas y sesiones:**
    - Sincronización automática y segura de la cuenta `developer` vinculada a `DEVELOPER_PASSWORD` en `.env.local` con hash bcrypt.
    - Módulo de sesiones seguras (`server/sesion.js`) con `INSTANCE_BOOT_ID` (invalidación automática al reiniciar servidor), TTL por rol (15 min dev, 30 min admin, 8 h cajero) y session cookies para roles administrativos.
    - Cierre automático de sesión en frontend tras 15 minutos de inactividad para roles privilegiados en `/admin` y `/caja`.
  - **Operaciones de caja, catálogo y control de mermas:**
    - Acción `ingreso_efectivo` para inyección de cambio/sencillo al cajón sin inflar las ventas ni distorsionar utilidades.
    - Cobros en efectivo, QR y pagos mixtos (`efectivo` + `qr`) con campo de descuento en ticket, validación en vivo, vista de `Historial del Turno` y anulación en línea en `app/caja/page.js`.
    - Creación de productos en `app/admin/page.js` con modalidades `directo` (stock propio y Kardex directo), `unitario` (relación 1 a 1 con insumo), `receta` (escandallo multi-insumo), `combo` y `libre`.
    - Formularios completos de registro de mermas de productos directos (`merma_producto_directo`) y de insumos (`merma_insumo`) con consulta de stock/CPP en vivo, cálculo de pérdida estimada, paso de confirmación explícita y visualización del resultado, integrados con el visor cronológico de Kardex y verificador de integridad en `app/admin/page.js`.
    - Batería integral de 16 escenarios de verificación funcional documentada en `docs/PRUEBAS.md` cubriendo combos, modificadores, régimen fiscal, pagos mixtos y Kardex.
    - Suites de pruebas automatizadas (`scratch/test_migracion_v8_v9.js` y `scratch/test_ventas_v9.js`) con 121 verificaciones contables, de concurrencia, casos borde, exportaciones (CSV, XLSX de 10 hojas, PDF) y transporte simulado Nodemailer.
- **Pendiente (Sujeto a entorno externo / hardware):**
  - Prueba con credenciales SMTP reales de un proveedor de correo externo (cuando se configuren `SMTP_USER` y `SMTP_PASS` reales en `.env.local`).
  - Impresión térmica directa (ESC/POS) de tickets individuales si se requiere conectar impresora física.

# Contexto del Proyecto: Sistema POS y Control de Cajas Híbrido

## 1. Stack Tecnológico y Arquitectura
- **Entorno:** Node.js (CommonJS) con Next.js (App Router) y SQLite3 local (`caja.db`).
- **Autenticación y Seguridad:** JWT con cookies HttpOnly gestionadas desde el servidor (`jose`), contraseñas hasheadas con `bcryptjs` (salt rounds = 10), control de intentos fallidos en memoria con rate limiting dual (por IP con `TRUST_PROXY` y por cuenta de usuario) y sincronización automática de credenciales técnicas (`DEVELOPER_PASSWORD` en `.env.local`).
- **Control de Sesiones Avanzado (`server/sesion.js`):**
  - TTL diferenciado por rol: `developer` (15 min), `superadmin` / `admin` (30 min), `user` (8 horas).
  - `INSTANCE_BOOT_ID`: Identificador de arranque del proceso que invalida de inmediato tokens administrativos/técnicos al reiniciar el servidor (`npm run dev`), eliminando sesiones zombis.
  - Cookies de sesión estrictas (Session Cookies destruidas al cerrar ventana) para perfiles administrativos y cierre por inactividad en frontend (15 min).
- **Infraestructura y Preparación para Producción Local / Híbrida:**
  - Base de datos portable con ruta configurable por variable de entorno `DATABASE_PATH` y concurrencia gestionada con `PRAGMA busy_timeout = 5000` y modo WAL en `database/database.js`.
  - Script de respaldo atómico en caliente (`scripts/backup.js`) ejecutado con `npm run backup` usando SQLite `VACUUM INTO` y purga local automática.
  - Empaquetado optimizado en `next.config.js` con `serverExternalPackages: ['sqlite3', 'bcryptjs', 'exceljs']`.
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
  - `database/migraciones.js`: Sistema de migraciones versionado con `PRAGMA user_version` y respaldo automático previo a toda migración (`VACUUM INTO backups/caja-pre-migracion-vX-a-vY-*.db`). Toda mutación al esquema se aplica de forma transaccional e idempotente (migraciones v1 a v11).
  - `server/queries.js`: Lógica de negocio y consultas con promesas nativas (`async/await`) usando `runQuery`, `getQuery`, `allQuery` y `enTransaccion()`.
  - `server/sesion.js`: Manejo de sesión JWT del servidor (crear, validar, renovar y destruir cookies HttpOnly `pos_session`).
  - `server/mailer.js`: Servicio SMTP (`nodemailer`) con plantillas HTML responsivas y adjuntos en background.
  - `server/secretos.js`: Verificación estricta de variables de entorno y secretos pre-arranque en producción.
  - `instrumentation.js`: Gancho de arranque de Next.js para validación temprana de seguridad.
  - `scripts/backup.js`: Script de copia de seguridad atómica con retención configurable.
  - `scripts/update.js`: Script de actualización segura automatizada (`npm run update`: backup previo + `git pull` + `npm ci` + `build`).
  - `app/api/caja/route.js`: Endpoint principal (`GET` de estado/sesión/catálogo/auditoría/kardexDetallado y `POST` por `accion`: `login`, `logout`, `instalacion_inicial`, `abrir`, `reabrir`, `vender`, `egreso`, `ingreso_efectivo`, `cerrar`, `anular`, `crear_usuario`, `borrar_usuario`, `cambiar_password`, `guardar_configuracion`, `guardar_configuracion_contable`, `actualizar_permiso_fiscal_caja`, `actualizar_permiso_fiscal_usuario`, `crear_categoria`, `crear_producto`, `comprar_producto_directo`, `merma_producto_directo`, `verificar_integridad_kardex`, `crear_insumo`, `comprar_insumo`, `merma_insumo`, `asignar_receta`, `crear_caja_fisica`, `desactivar_caja_fisica`, `reactivar_caja_fisica`, `crear_grupo_modificador`, `actualizar_grupo_modificador`, `eliminar_grupo_modificador`, `asignar_modificadores_producto`, `probar_email`, `reenviar_cierre_email`).
  - `app/api/reportes/route.js`: Endpoint administrativo (`GET`) para tendencias JSON, exportación CSV (`?formato=csv`) y exportación Excel (`?formato=xlsx`, con filtros opcionales `cajaId`, `desde`, `hasta`, `usuarioId`, `cajaFisicaId` y metadatos del usuario generador).
  - `app/caja/page.js` y `app/admin/page.js`: Vistas de operador y administrador.
  - `app/admin/GraficosFinancieros.js` y `app/admin/exportarPDF.js`: Módulos de visualización financiera y exportación PDF del panel administrativo.

## 2. Reglas de Negocio Obligatorias
- **Roles y Permisos:**
  - `user` (Cajero): Abre/cierra turnos, selecciona productos mediante pestañas de categorías, cobra en efectivo (con cálculo reactivo de cambio) o QR, registra egresos menores e ingresos de sencillo/cambio con motivo obligatorio.
  - `admin` (Administrador): Todo lo del cajero + crear/borrar usuarios con baja lógica (`activo = 0`), anular ventas reintegrando stock o insumos automáticamente, gestión integral de catálogo (modalidades unitario, receta, libre), compras con CPP, acceso a estadísticas financieras y reportes.
  - `superadmin`: Acceso ampliado de administración y auditoría del sistema de negocio.
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
- **SQL nativo sin ORMs:** Mantener consultas SQL nativas y parametrizadas (`?`) en `server/queries.js`, evitando constructores de consulta u ORMs externos.
- **Control de Versiones y Operaciones en Git (Estrictamente Bajo Demanda):**
  - **Ejecución Bajo Demanda (Ahorro de Tokens):** La IA conoce perfectamente todos los comandos y procedimientos de Git local, pero **NO** debe ejecutar `git add`, `git commit` ni operaciones de repositorio automáticamente tras cada cambio de código. Solo ejecutará acciones en Git cuando el usuario lo solicite expresamente (ej. *"haz commit"*, *"guarda los cambios en el repositorio"*, *"prepara el commit"*).
  - **Operaciones Locales Permitidas a la IA:** Cuando el usuario lo solicite: inspeccionar el árbol (`git status`, `git diff`, `git log`), crear y cambiar de ramas (`git branch`, `git checkout`, `git switch`), preparar archivos (`git add`) y redactar commits atómicos y descriptivos (`git commit`).
  - **Exclusivo del Usuario Humano (Operaciones Remotas con Autenticación):** Cualquier operación que involucre interactuar con GitHub requiriendo inicio de sesión o credenciales (`git push`, subida de tags o ramas) debe ser ejecutada obligatoriamente por el usuario humano. La IA solo proporcionará el comando exacto.
- **Testing y Búsqueda de Bugs (Estrictamente Bajo Demanda):**
  - La IA está capacitada para ejecutar diagnósticos de estrés, suites de prueba automatizadas (`scratch/test_*.js`) y compilaciones de verificación (`npm run build`), pero **NO** debe ejecutarlos proactivamente ni de forma automática tras cada ajuste menor para evitar consumo innecesario de tokens y tiempo.
  - La suite de pruebas y diagnóstico de errores solo se ejecutará cuando el usuario lo ordene explícitamente (ej. *"haz una prueba"*, *"busca fallos o bugs"*, *"ejecuta el testeo"*).

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
    - Protección estricta de `instalacion_inicial`: exigencia de `SETUP_TOKEN` validado con `crypto.timingSafeEqual` y transacción atómica unificada para configuración y alta del Super Admin.
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
  - **Migración a arquitectura contable y de auditoría versionada (`database/migraciones.js`, PRAGMA `user_version` hasta v11):**
    - **Migración v11**: Índice único parcial `una_caja_abierta_por_estacion` en `cajas`, Kardex cronológico completo para `movimientos_insumos` (`stock_resultante`, `costo_promedio_resultante`, tipos `inventario_inicial` y `ajuste`), preservación de hasta 6 decimales en costos unitarios métricos de insumos y reconciliación integral de `movimientos_pagos`.
    - **Migración v10**: Snapshot fiscal inmutable por movimiento (`regimen_tributario`, `iva_porcentaje`, `it_porcentaje`, `iva_monto`, `it_monto`), parámetro configurable `it_base` (`'todas_las_ventas'` vs `'solo_facturadas'`), `costo_promedio_resultante` en `movimientos_productos_directos`, siembra de saldos de apertura de Kardex y respaldo automático previo a toda migración (`VACUUM INTO backups/`).
    - **Migración v9**: Régimen tributario modular, pagos mixtos (`movimientos_pagos`), permisos fiscales por usuario y por estación física, compras con respaldo fiscal y tabla `movimientos_productos_directos`.
    - **Migración v8**: Tabla `combo_componentes` y `detalle_movimientos_combos` para combos y promociones con límites y vigencia temporal.
    - **Migración v7**: Tablas `grupos_modificadores`, `modificadores_opciones`, `producto_grupos_modificadores` y `detalle_movimientos_modificadores`. Soporte integral de complementos y reemplazos de recetas con selección única/múltiple, obligatoriedad, recargos de precio, descuento atómico en `movimientos_insumos` y congelación de costos/precios en auditoría de ventas.
    - **Migración v6**: Tabla `cajas_fisicas` para gestión multicaja de terminales/estaciones con "Caja 1 - Principal" por defecto, vinculación `caja_fisica_id` en `cajas`, soporte de múltiples cajas abiertas en simultáneo y reformulación de terminología de `Caja #` a `N° Turno` en UI, Excel (.xlsx) y PDF.
    - **Migraciones v4 y v5**: Tabla `categorias` para catálogo interactivo por pestañas, normalización multicategoría y limpieza de categoría 'General'.
  - **Seguridad de cuentas y sesiones:**
    - Sincronización automática y segura de la cuenta `developer` vinculada a `DEVELOPER_PASSWORD` en `.env.local` con hash bcrypt.
    - Módulo de sesiones seguras (`server/sesion.js`) con `INSTANCE_BOOT_ID` (invalidación automática al reiniciar servidor), TTL por rol (15 min dev, 30 min admin, 8 h cajero) y session cookies para roles administrativos.
    - Cierre automático de sesión en frontend tras 15 minutos de inactividad para roles privilegiados en `/admin` y `/caja`.
  - **Operaciones de caja, catálogo y control de mermas:**
    - Acción `ingreso_efectivo` para inyección de cambio/sencillo al cajón sin inflar las ventas ni distorsionar utilidades.
    - Cobros en efectivo, QR y pagos mixtos (`efectivo` + `qr`) con campo de descuento en ticket, validación en vivo, vista de `Historial del Turno` y anulación en línea en `app/caja/page.js`.
    - Creación de productos en `app/admin/page.js` con modalidades `directo` (stock propio y Kardex directo), `unitario` (relación 1 a 1 con insumo), `receta` (escandallo multi-insumo), `combo` y `libre`.
    - Formularios completos de registro de mermas de productos directos (`merma_producto_directo`) y de insumos (`merma_insumo`) con consulta de stock/CPP en vivo, cálculo de pérdida estimada, paso de confirmación explícita y visualización del resultado, integrados con el visor cronológico de Kardex y verificador de integridad en `app/admin/page.js`.
    - Suites de pruebas automatizadas (`scratch/test_migracion_v8_v9.js` y `scratch/test_ventas_v9.js`) con 121 verificaciones contables, de concurrencia, casos borde, exportaciones (CSV, XLSX de 10 hojas, PDF) y transporte simulado Nodemailer.
- **Pendiente (Sujeto a entorno externo / hardware):**
  - Prueba con credenciales SMTP reales de un proveedor de correo externo (cuando se configuren `SMTP_USER` y `SMTP_PASS` reales en `.env.local`).
  - Impresión térmica directa (ESC/POS) de tickets individuales si se requiere conectar impresora física.

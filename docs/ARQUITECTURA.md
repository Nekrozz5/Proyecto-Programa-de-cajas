# Arquitectura Técnica del Sistema

Este documento describe la arquitectura global del sistema POS y Control de Cajas, su modelo de seguridad, la base de datos relacional con SQLite3, el esquema de migraciones versionadas (v1 a v11), el motor tributario modular, los pagos mixtos, el Kardex cronológico dual (NIC 2), los combos, los modificadores de recetas, y el sistema de reportes y notificaciones.

---

## 1. Stack Tecnológico

- **Frontend / Fullstack:** Next.js 16 (App Router) con React 19.
- **Estilos y Componentes UI:** Tailwind CSS con Shadcn UI (`components/ui/*`, `@base-ui/react`, `class-variance-authority`, `lucide-react`) y diseño responsivo adaptado a terminal táctil y escritorio.
- **Base de Datos:** SQLite3 local (`sqlite3@^6.0.1`) con SQL nativo parametrizado (`?`) sin ORMs.
- **Autenticación y Criptografía:** JWT firmado con `jose` (`^6.2.17`) en cookies `HttpOnly` (`pos_session`) y hash de contraseñas con `bcryptjs` (`^3.0.3`) (10 rondas de salt).
- **Reportes y Visualización:**
  - `exceljs` (`^4.4.0`): Generación en servidor de libros Excel `.xlsx` con 10 hojas contables y de auditoría.
  - `jspdf` (`^4.2.1`) y `jspdf-autotable` (`^5.0.9`): Generación en cliente de reportes PDF de balance fiscal, arqueo ciego y auditoría de turno.
  - `recharts` (`^3.10.1`): Gráficos interactivos de métricas financieras en `/admin` (flujo horario, balance de 7 días, top productos, métodos de pago).
- **Servicio de Notificaciones:** `nodemailer` (`^10.5.0`): Envíos SMTP en segundo plano con plantilla HTML ejecutiva y libro Excel `.xlsx` adjunto en caliente.
- **Despliegue, Actualización y Respaldos:** PM2 (`ecosystem.config.js`), actualización automatizada (`scripts/update.js`) y respaldo atómico en caliente con `VACUUM INTO` (`scripts/backup.js`).
- **Blindaje Multi-Dispositivo y Cloudflare Tunnel:** Protección contra traducción automática del DOM (`notranslate` en `app/layout.js`), encabezados `Cache-Control: no-store` en `GET /api/caja` para lecturas en tiempo real sin caché, y configuración de `experimental.serverActions.allowedOrigins` en `next.config.js` (`*.trycloudflare.com`, `localhost:3000`) para ejecución segura de Server Actions en entornos remotos e híbridos.

---

## 2. Arquitectura de Capas y Estructura de Carpetas

El sistema implementa una arquitectura en capas limpias que separa la interfaz visual, las mutaciones seguras del servidor, la lógica pura de dominio, la persistencia en base de datos y la infraestructura técnica:

```text
├── app/                              # Next.js App Router (Frontend y API Routes mínimas)
│   ├── layout.js                     # Root layout protegido con notranslate
│   ├── page.js                       # Asistente de instalación inicial y redirección
│   ├── api/
│   │   ├── auth/route.js             # POST: login, logout, instalacion_inicial con cookies HttpOnly
│   │   ├── caja/route.js             # GET: lectura única de estado, catálogo y sincronización (no-store)
│   │   └── reportes/route.js         # GET: exportación de libros Excel (.xlsx), CSV y tendencias JSON
│   ├── admin/
│   │   ├── page.js                   # Panel administrativo principal
│   │   ├── GraficosFinancieros.js    # Visualizaciones con recharts
│   │   ├── exportarPDF.js            # Exportación de reporte PDF con jsPDF
│   │   └── _components/              # Componentes modulares por pestaña administrativa:
│   │       ├── TabCatalogo.js        # Gestión de categorías, productos, recetas y modificadores
│   │       ├── TabTurnosArqueos.js   # Historial de turnos, arqueos, reaperturas y auditoría
│   │       ├── TabUsuariosCajas.js   # ABM de cajeros, estaciones físicas y permisos
│   │       ├── TabKardex.js          # Kardex detallado e integridad matemática
│   │       ├── TabConfigFiscal.js    # Régimen tributario, alícuotas y modalidad de negocio
│   │       ├── TabExportacion.js     # Descarga de reportes contables
│   │       └── TabResumen.js         # Métricas ejecutivas y anulación de ventas
│   └── caja/
│       ├── page.js                   # Terminal POS del operador / cajero
│       ├── _hooks/                   # Hooks personalizados de interfaz:
│       │   ├── useCarrito.js         # Estado reactivo del carrito de compras y prorrateo
│       │   └── useInactividad.js     # Temporizador de cierre de sesión por inactividad
│       └── _components/              # Componentes modulares de operación:
│           ├── CatalogoProductos.js  # Selección visual de productos por categorías
│           ├── CarritoVenta.js       # Resumen de orden, descuentos y totales
│           ├── ModalCobro.js         # Cobro efectivo, QR y pagos mixtos con cálculo de cambio
│           ├── ModalModificadores.js # Selección de reemplazos y complementos de recetas
│           ├── ModalArqueoCiego.js   # Conteo físico a ciegas y cierre de turno
│           ├── ModalMovimientosEfectivo.js # Registro de egresos e inyecciones de cambio
│           ├── HistorialTurno.js     # Ventas del turno actual y reemisión de tickets
│           ├── AperturaTurno.js      # Selección de caja física y fondo inicial
│           └── LoginCaja.js          # Selector de cajero y PIN numérico
├── components/ui/                    # Primitivas UI reutilizables de Shadcn (button, card, input, badge, table, dialog, etc.)
├── lib/
│   └── utils.js                      # Utilidad cn() (clsx + tailwind-merge) para clases dinámicas
├── server/                           # Núcleo de backend y lógica del servidor
│   ├── actions/                      # Capa de mutaciones protegidas con Server Actions ('use server')
│   │   ├── _wrapper.js               # Envoltorio seguro: validación de sesión HttpOnly y RBAC estricto
│   │   ├── turnos.actions.js         # Apertura, cierre con arqueo ciego y reapertura auditada
│   │   ├── ventas.actions.js         # Venta atómica, anulación, egresos e ingresos de cambio
│   │   ├── catalogo.actions.js       # Categorías, productos, recetas y modificadores
│   │   ├── inventario.actions.js     # Compras CPP, mermas, insumos y auditoría de Kardex
│   │   └── admin.actions.js          # Usuarios, contraseñas, permisos fiscales, config y email
│   ├── domain/                       # Lógica pura de negocio independiente de frameworks
│   │   ├── costos.js                 # Algoritmos de CPP (NIC 2), recálculo en cascada y descomposición
│   │   └── fiscal.js                 # Snapshot tributario, bases imponibles y liquidación IVA/IT
│   ├── repositories/                 # Capa de persistencia SQL nativa (SQLite3) con transacciones
│   │   ├── db.js                     # Pool SQLite, helpers de consulta y transacciones atómicas
│   │   ├── auth.repo.js              # Autenticación, usuarios, roles, contraseñas y permisos fiscales
│   │   ├── cajas.repo.js             # Cajas físicas, turnos, arqueos, cierres y reaperturas
│   │   ├── catalogo.repo.js          # Categorías, productos, recetas, combos y modificadores
│   │   ├── configuracion.repo.js     # Configuración de negocio, régimen tributario y singleton
│   │   ├── inventario.repo.js        # Kardex dual, compras, mermas, insumos y verificación matemática
│   │   ├── ventas.repo.js            # Ventas, detalle de venta, pagos mixtos, egresos y anulaciones
│   │   ├── reportes.repo.js          # Métricas de rentabilidad, balance financiero y Excel 10 hojas
│   │   └── index.js                  # Barrel exportador unificado de persistencia
│   ├── lib/                          # Servicios de infraestructura y seguridad
│   │   ├── sesion.js                 # Firma/verificación JWT, cookies HttpOnly, bootId y rate limit
│   │   ├── secretos.js               # Validación estricta de variables de entorno y fallos tempranos
│   │   └── mailer.js                 # Servicio SMTP con nodemailer, plantillas HTML y adjuntos Excel
│   ├── queries.js                    # Fachada y barrel central retrocompatible de repositorios
│   ├── sesion.js                     # Re-export retrocompatible hacia server/lib/sesion
│   ├── secretos.js                   # Re-export retrocompatible hacia server/lib/secretos
│   └── mailer.js                     # Re-export retrocompatible hacia server/lib/mailer
├── database/                         # Persistencia relacional
│   ├── database.js                   # Conexión SQLite, pragmas (WAL, busy_timeout) y migraciones
│   └── migraciones.js                # Migraciones versionadas idempotentes con PRAGMA user_version (v1-v11)
├── scripts/                          # Scripts operacionales y de mantenimiento
│   ├── backup.js                     # Copia de seguridad atómica con VACUUM INTO
│   ├── update.js                     # Actualización desatendida y segura del sistema
│   └── seed_v11.js                   # Datos de prueba integrales para desarrollo
└── docs/                             # Documentación técnica y checklists
    ├── ARQUITECTURA.md               # Especificación técnica exhaustiva
    └── PRUEBAS.md                    # Plan de validación y casos de prueba
```

---

## 3. Seguridad y Control de Sesiones (`server/lib/sesion.js` y `server/lib/secretos.js`)

- **Validación exclusiva en servidor:** La identidad, rol y permisos de cada petición se extraen directamente del token JWT validado en servidor, nunca de campos enviados por el cliente.
- **TTL diferenciado por rol:**
  - `developer`: 15 minutos.
  - `superadmin` / `admin`: 30 minutos.
  - `user` (Cajero): 8 horas.
- **`INSTANCE_BOOT_ID`:** Cada arranque del proceso Node genera un identificador único de instancia. Si el servidor se reinicia, todos los tokens administrativos y técnicos de arranques anteriores quedan invalidados inmediatamente, eliminando sesiones zombis.
- **Inactividad y cookies de sesión:** Los perfiles administrativos utilizan Session Cookies (se destruyen al cerrar la ventana) y cuentan con un detector de inactividad de 15 minutos en frontend que fuerza el logout.
- **Rate limiting dual:**
  - Por IP de origen con soporte de `TRUST_PROXY` (lectura segura de `cf-connecting-ip` para Cloudflare Tunnel y `x-real-ip` para proxies inversos, separando el tráfico externo del cajero local).
  - Por cuenta de usuario individual en memoria (límite de intentos fallidos con caducidad autónoma para frenar ataques de fuerza bruta).
- **Cookie `Secure` adaptativa:** En producción, `server/sesion.js` activa `secure: true` cuando la conexión proviene de HTTPS (como el acceso móvil remoto por túnel) y permite `secure: false` en conexiones HTTP locales (`localhost` o LAN sin internet) para que ambos entornos operen en paralelo sin bloqueos de sesión.
- **Instalación Inicial Protegida (`SETUP_TOKEN`):** El endpoint de instalación inicial exige un token preconfigurado en las variables de entorno, validado con comparación en tiempo constante (`crypto.timingSafeEqual`) para evitar fugas de información por canales laterales.
- **Validación Temprana de Secretos (`instrumentation.js`):** El hook `register()` de Next.js ejecuta `validarOAbortarArranque()` al iniciar el servidor de producción. Si algún secreto obligatorio está ausente, usa valores por defecto o no cumple la longitud mínima requerida, aborta el arranque de inmediato con un mensaje descriptivo sin romper la fase de compilación (`next build`).
- **Cuenta `developer`:** Sincronizada automáticamente con la variable `DEVELOPER_PASSWORD` y oculta de los listados estándar de usuarios.
- **Permisos Fiscales Granulares:** Validación estricta en backend de permisos fiscales por negocio (`emite_factura`, `usa_respaldo_compras_egresos`), por operador (`puede_registrar_respaldo_fiscal`) y por estación física (`habilita_respaldo_fiscal`).

---

## 4. Base de Datos y Sistema de Migraciones Versionadas (`database/`)

- **`database/database.js`:**
  - Ruta de base de datos configurable mediante `DATABASE_PATH` (por defecto `./caja.db`).
  - Activa `PRAGMA foreign_keys = ON`.
  - Modo WAL (`PRAGMA journal_mode = WAL`) para lecturas concurrentes sin bloqueo.
  - `PRAGMA busy_timeout = 5000` para tolerar esperas de escritura sin bloqueos prematuros.
  - Respaldo automático preventivo previo a la aplicación de cualquier migración (`VACUUM INTO backups/caja-pre-migracion-vX-a-vY-*.db`).
- **`database/migraciones.js` (Evolución v1 a v11):**
  - **v1:** Esquema base de cajas, usuarios, movimientos y detalle de movimientos.
  - **v2:** Módulo de insumos, compras con CPP, recetas de ensamble y configuración de negocio.
  - **v3:** Auditoría de reaperturas (`veces_reabierta`, `historial_reaperturas`).
  - **v4:** Tabla `categorias` para catálogo interactivo estructurado.
  - **v5:** Normalización multicategoría de productos y saneamiento de registros legados.
  - **v6:** Tabla `cajas_fisicas` (estaciones de cobro física/terminales) con vinculación a `cajas` (turnos).
  - **v7:** Tablas `grupos_modificadores`, `modificadores_opciones`, `producto_grupos_modificadores` y `detalle_movimientos_modificadores` para complementos y reemplazos de recetas.
  - **v8:** Soporte de tipo de producto `combo`, tablas `combo_componentes` y `detalle_movimientos_combos`, límites de unidades máximas (`limite_unidades_restante`) y control de vigencia temporal.
  - **v9:** Régimen tributario modular (`configuracion_negocio`), normalización de pagos en `movimientos_pagos`, compras con respaldo fiscal en `movimientos_insumos`, y creación del Kardex de productos directos (`movimientos_productos_directos`).
  - **v10:** Snapshot fiscal por movimiento (`regimen_tributario`, alícuotas e importes IVA/IT congelados), parámetro configurable `it_base` ('todas_las_ventas' | 'solo_facturadas'), `costo_promedio_resultante` en productos directos y saldos de apertura.
  - **v11:** Kardex cronológico dual enriquecido en `movimientos_insumos` (`stock_resultante`, `costo_promedio_resultante`, `monto_total_compra`), reparación de costos métricos truncados y recálculo en cascada de recetas/combos, e índice multicaja por estación física (`idx_cajas_abiertas_fisica`).
- **Transacciones atómicas:** Toda mutación de negocio corre dentro de `transaccion(async (dbTx) => { ... })` en `server/queries.js`.
- **Manejo de fechas:** Almacenadas en UTC (`CURRENT_TIMESTAMP`) y proyectadas con `'localtime'` en SQLite para filtros y visualización del usuario (`datetime(fecha_hora, 'localtime')`).

---

## 5. Reglas de Negocio Principales

### A. Estaciones Físicas de Caja y N° de Turno (`cajas_fisicas` vs `cajas`)
- **Estación Física (`cajas_fisicas`):** Representa el punto de cobro físico (ej. "Caja 1 - Barra", "Caja 2 - Terraza").
- **Turno de Operación (`cajas`):** Representa una sesión contable correlativa con cajero asignado, fondo inicial y balance de cierre.
- **Multicaja simultánea:** Múltiples cajas físicas pueden operar con turnos abiertos en paralelo por distintos cajeros.
- **Regla de mínimo y baja lógica:** Se requiere al menos 1 caja física activa. No se puede desactivar una terminal con un turno abierto en curso.

### B. Arqueo Ciego e Inyecciones de Efectivo
- Ventas y egresos restringidos exclusivamente a cajas en estado `'abierta'`.
- Conteo a ciegas al cerrar turno (`efectivo_real`) sin ver previamente `efectivo_esperado`.
- Fórmula contable de arqueo físico:
  ```text
  efectivo_esperado = monto_inicial + ingresos_efectivo (ventas + inyecciones de cambio) - egresos_efectivo
  diferencia_efectivo = efectivo_real - efectivo_esperado
  ```
- **Inyecciones de sencillo (`ingreso_efectivo`):** Aumentan el dinero físico esperado en cajón sin sumarse a las ventas ni alterar las utilidades operativas.
- **Cobros por QR:** Se concilian aparte (`qr_esperado`) sin mezclarse con el dinero físico del cajón.

### C. Régimen Tributario Modular y Snapshot Fiscal (v9-v11)
- **Modalidades de Régimen:**
  - `simplificado_control_interno`: IVA = 0, IT = 0. Prohibición estricta de emitir facturas tanto en frontend como en backend.
  - `regimen_general`: Alícuotas configurables (`iva_porcentaje = 13%`, `it_porcentaje = 3%`), base del IT configurable (`it_base = 'todas_las_ventas'` o `'solo_facturadas'`), y emisión de facturas con NIT, razón social y CUF.
- **Inmutabilidad Tributaria (Snapshot Fiscal):** Cada venta y egreso congela sus parámetros fiscales (`regimen_tributario`, `iva_porcentaje`, `it_porcentaje`, `iva_monto`, `it_monto`) en la fila de `movimientos`, garantizando que reportes históricos nunca se alteren ante futuros cambios de alícuotas o de régimen tributario.

### D. Pagos Mixtos Flexibles (Efectivo + QR)
- **Fuente de verdad:** `movimientos_pagos` almacena el desglose por método de pago para cada venta.
- **Cálculo de cambio:** Cuando un cliente realiza un pago mixto (ej. Total 30 Bs: 10 Bs efectivo + 20 Bs QR) y entrega un billete mayor (ej. 20 Bs para la porción en efectivo), el sistema calcula el cambio (10 Bs) exclusivamente sobre la parte en efectivo.

### E. Kardex Cronológico Dual y NIC 2 (Costo Promedio Ponderado)
- **Kardex de Productos Directos (`movimientos_productos_directos`):** Registra `inventario_inicial`, `compra`, `venta`, `merma`, `reingreso_anulacion` y `ajuste`, manteniendo `stock_resultante` y `costo_promedio_resultante`.
- **Kardex de Insumos de Receta (`movimientos_insumos`):** Registra todos los consumos por ventas de recetas, combos, compras y mermas. Preserva hasta 6 decimales de precisión en el costo unitario de insumos métricos (ej. `0.0015 Bs/ml`).
- **Auditoría Matemática de Integridad:** Las funciones `verificarIntegridadKardexDirecto()` y `verificarIntegridadKardexInsumos()` comprueban algebraicamente que la sumatoria histórica de movimientos coincida exactamente con el stock actual y el último saldo de Kardex, detectando cualquier inconsistencia con 0 descuadres tolerados.

### F. Combos y Promociones (v8)
- Productos de tipo `combo` vinculados a múltiples componentes mediante `combo_componentes`.
- **Descomposición atómica:** Al venderse un combo, el sistema descuenta el stock directo de los componentes unitarios, o los insumos de las recetas de los componentes de receta, agrupando consumos de ingredientes repetidos.
- **Costeo dinámico en cascada:** El costo del combo es la suma exacta de los costos unitarios de sus componentes al momento de la venta y se congela en `detalle_movimientos`.
- **Modos de venta:**
  - *Sin límite:* La disponibilidad se determina por el cuello de botella de los insumos y productos que lo componen.
  - *Con límite regresivo:* Límite de unidades fijas (`limite_unidades_restante`) que descuenta automáticamente y bloquea el combo al agotarse.
- **Vigencia temporal:** Control de fecha y hora de inicio y fin para campañas promocionales.
- **Auditoría y Anulación:** `detalle_movimientos_combos` congela los componentes y cantidades vendidas, permitiendo restituir el stock y el contador de combos restantes al anular el ticket.

### G. Grupos de Modificadores, Reemplazos y Complementos de Recetas (v7)
- **Grupos configurables (`grupos_modificadores`):** Selección `unica` (radio button) o `multiple` (checkbox), con indicador de obligatoriedad (`es_obligatorio`).
- **Opciones de Modificador (`modificadores_opciones`):**
  - **Reemplazos de Insumos (`insumo_reemplazado_id`):** Resta el insumo original de la receta y consume el insumo sustituto en la cantidad indicada (ej. Leche entera -> Almendras / Deslactosada), recalculando el costo total de la línea de forma atómica.
  - **Adiciones de Insumos:** Consumen insumos extra (ej. Extra shot de espresso, crema chantilly).
  - **Modificadores Operativos:** Sin insumo vinculado (ej. "Tostado", "Sin azúcar").
  - **Precio adicional (`precio_adicional`):** Se adiciona al precio unitario base del producto.
- **Trazabilidad y Congelamiento (`detalle_movimientos_modificadores`):** Congela precio y costo adicional por cada opción para garantizar restitución exacta en caso de anulación.

### H. Cálculos Financieros y Prorrateo de Descuentos
- `Ventas Totales = SUM(monto)` de movimientos completados de venta.
- `Costo Total de Ventas (CMV) = SUM(cantidad * costo_unitario)` con costos congelados.
- `Ganancia Bruta = Ventas Totales - Costo Total de Ventas`.
- `Flujo Neto Operativo = Ganancia Bruta - Total Egresos`.
- **Prorrateo Exacto de Descuentos:** En tickets con descuento, el sistema distribuye proporcionalmente el descuento entre las líneas de venta (`detalle_movimientos`) y absorbe cualquier residuo fraccionario en la última línea, garantizando matemáticamente que:
  $$\sum \text{ingresos\_netos\_producto} \equiv \text{Ventas Totales}$$
  $$\sum \text{ganancia\_producto} \equiv \text{Ganancia Bruta}$$

---

## 6. Servicio de Notificaciones por Correo (`server/lib/mailer.js`)

- **Despacho Asíncrono en Segundo Plano:** Al cerrarse un turno mediante `cerrarTurnoAction`, se despacha la notificación SMTP sin bloquear la respuesta de la Server Action al cajero.
- **Plantilla Ejecutiva Responsiva:** Estación física, turno, cajero, balance de ventas (Efectivo vs. QR), inyección de sencillo, egresos y tarjeta destacada con la diferencia de arqueo (cuadrado, sobrante o faltante).
- **Adjunto Oficial Excel:** Genera en caliente con `exceljs` el libro oficial (`Reporte_Turno_XX.xlsx`) y lo anexa al correo electrónico.
- **Control Administrativo:** Diagnóstico SMTP con envío de prueba y reenvío bajo demanda de cualquier turno previo en `/admin`.

---

## 7. Reportes Contables y Auditoría (Excel 10 Hojas y PDF Fiscal)

- **Libro Excel `.xlsx` (`server/repositories/reportes.repo.js` con `exceljs`):** Servido desde `GET /api/reportes?formato=xlsx`:
  1. *Movimientos:* Registro cronológico completo de ingresos y egresos.
  2. *Arqueos de Caja:* Historial de turnos, diferencias y conciliación.
  3. *Detalle Ventas (CMV):* Ventas línea por línea con costos congelados y descuento prorrateado.
  4. *Rentabilidad por Producto:* Unidades vendidas, ingresos netos, costo total y margen porcentual.
  5. *Compras y Mermas:* Entradas con crédito fiscal y salidas por desperdicio.
  6. *Inventario Kardex:* Resumen consolidado de existencias y valorización.
  7. *Kardex Productos:* Trazabilidad cronológica de productos directos.
  8. *Kardex Insumos:* Trazabilidad cronológica de insumos con saldos acumulados.
  9. *Historial Anulaciones:* Auditoría de tickets cancelados con responsable y motivo.
  10. *Resumen Contable:* Balance general y liquidación impositiva.
- **Reporte PDF de Auditoría de Caja (`app/admin/exportarPDF.js` con `jspdf`):** Resumen financiero de la caja auditada, desglose por método de pago, liquidación de impuestos (Débito IVA, IT, Crédito Fiscal IVA en compras/egresos), arqueo ciego y detalle de movimientos.

---

## 8. Respaldos Atómicos y Actualizaciones Seguras

- **Respaldos Atómicos (`scripts/backup.js`):** `npm run backup` ejecuta `VACUUM INTO` sobre la base de datos activa (copia en caliente atómica sin interrumpir el servicio) y aplica purga local según `MAX_BACKUPS_LOCAL` (30 copias por defecto).
- **Actualización Segura Automatizada (`scripts/update.js`):** `npm run update` ejecuta un ciclo seguro de 5 fases: respaldo preventivo de `caja.db`, descarga limpia con `git pull --ff-only`, instalación reproducible con `npm ci`, compilación con `next build` y reinicio automático de PM2 si estuviera activo.

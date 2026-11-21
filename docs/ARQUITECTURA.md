# Arquitectura Técnica del Sistema (Cloud / AWS)

Este documento describe la arquitectura del sistema POS y Control de Cajas en AWS. Incluye la persistencia exclusiva en PostgreSQL, el esquema de migraciones, el modelo de seguridad y los flujos de caja, inventario, fiscalidad y reportes.

---

## 1. Stack Tecnológico

- **Frontend / Fullstack:** Next.js 16 (App Router) con React 19.
- **Estilos y Componentes UI:** Tailwind CSS con Shadcn UI (`components/ui/*`, `@base-ui/react`, `class-variance-authority`, `lucide-react`) y diseño responsivo táctil y web.
- **Base de Datos:** PostgreSQL con el cliente `pg` y SQL parametrizado (`$1`, `$2`, etc.). El registro central y las bases operativas de los negocios tienen pools separados.
- **Autenticación y Criptografía:** JWT firmado con `jose` (`^6.2.17`) en cookies `HttpOnly` (`pos_session`) y hash de contraseñas con `bcryptjs` (`^3.0.3`) (10 rondas de salt).
- **Reportes y Visualización:**
  - `exceljs` (`^4.4.0`): Generación en servidor de libros Excel `.xlsx` con 10 hojas contables y de auditoría.
  - `jspdf` (`^4.2.1`) y `jspdf-autotable` (`^5.0.9`): Generación en cliente de reportes PDF de balance fiscal, arqueo ciego y auditoría de turno.
  - `recharts` (`^3.10.1`): Gráficos interactivos de métricas financieras en `/admin` (flujo horario, balance de 7 días, top productos, métodos de pago).
- **Servicio de Notificaciones:** `nodemailer` (`^10.5.0`): Envíos SMTP en segundo plano con plantilla HTML ejecutiva, configuración dinámica en BD (`configuracion_smtp`), verificación de destinatarios (`notificacion_destinatarios`) y libro Excel `.xlsx` adjunto en caliente.
- **Despliegue Cloud en AWS y Respaldos:** Ejecución continua con PM2 (`ecosystem.config.js`) y respaldo lógico PostgreSQL por negocio (`scripts/backup-postgres.js`).
- **Blindaje Multi-Dispositivo en la Nube:** Protección contra traducción automática del DOM (`notranslate` en `app/layout.js`), encabezados `Cache-Control: no-store` en `GET /api/caja` para lecturas en tiempo real sin caché, y configuración de `experimental.serverActions.allowedOrigins` en `next.config.js` (`ALLOWED_ORIGINS`) para ejecución segura de Server Actions en AWS.

---

## 2. Arquitectura de Capas y Estructura de Carpetas

El sistema implementa una arquitectura en capas limpias que separa la interfaz visual, las mutaciones seguras del servidor, la lógica pura de dominio, la persistencia en base de datos y la infraestructura técnica:

```text
├── app/                              # Next.js App Router (Frontend y API Routes)
│   ├── layout.js                     # Root layout protegido con notranslate
│   ├── page.js                       # Portal principal del sistema
│   ├── api/
│   │   ├── auth/route.js             # POST: login, logout con cookies HttpOnly
│   │   ├── caja/route.js             # GET: lectura única de estado, catálogo y sincronización (no-store)
│   │   ├── configuracion/route.js    # GET/POST/PUT/PATCH: configuración general del negocio
│   │   └── reportes/route.js         # GET: exportación de libros Excel (.xlsx), CSV y tendencias JSON
│   ├── admin/
│   │   ├── layout.js                 # Layout administrativo con AdminProvider para estado global
│   │   ├── page.js                   # Redirección hacia panel administrativo
│   │   ├── GraficosFinancieros.js    # Visualizaciones con recharts
│   │   ├── exportarPDF.js            # Exportación de reporte PDF con jsPDF
│   │   ├── _context/
│   │   │   └── AdminContext.js       # Contexto global compartido para pestañas y sincronización
│   │   ├── resumen/page.js           # Subruta: Métricas ejecutivas, balance y anulación de ventas
│   │   ├── catalogo/page.js          # Subruta: Categorías, productos, combos, recetas y modificadores
│   │   ├── insumos/page.js           # Subruta: Insumos de producción, compras y mermas
│   │   ├── arqueos/page.js           # Subruta: Historial de turnos, arqueos ciegos y reaperturas
│   │   ├── usuarios/page.js          # Subruta: Cajeros, permisos fiscales y terminales de caja
│   │   ├── inteligencia/page.js      # Subruta: Inteligencia de negocio y analíticas
│   │   ├── configuracion/page.js     # Subruta: Configuración fiscal, SMTP y parámetros del negocio
│   │   ├── exportacion/page.js       # Subruta: Descarga de reportes contables Excel/PDF
│   │   └── _components/              # Componentes modulares administrativos:
│   │       ├── TabCatalogo.js        # Gestión de catálogo, combos, lotes y modificadores
│   │       ├── TabTurnosArqueos.js   # Historial de turnos, arqueos, reaperturas y auditoría
│   │       ├── TabUsuariosCajas.js   # ABM de cajeros, estaciones físicas y permisos
│   │       ├── TabKardex.js          # Kardex detallado e integridad matemática
│   │       ├── TabConfigFiscal.js    # Régimen tributario, alícuotas y modalidad de negocio
│   │       ├── TabConfiguracionCorreos.js # Configuración SMTP y destinatarios de notificaciones
│   │       ├── ModalVerificarEmail.js # Modal para verificación de código temporal de correo
│   │       ├── TabExportacion.js     # Descarga de reportes contables
│   │       └── TabResumen.js         # Métricas ejecutivas y anulación de ventas
│   └── caja/
│       ├── layout.js                 # Layout de caja con CajaProvider para estado reactivo del POS
│       ├── page.js                   # Redirección hacia terminal de caja
│       ├── _context/
│       │   └── CajaContext.js        # Contexto reactivo para turno activo, carrito y catálogo
│       ├── pos/page.js               # Subruta: Terminal táctil de cobro, categorías y carrito
│       ├── movimientos/page.js       # Subruta: Historial de movimientos del turno e ingresos/egresos
│       ├── _components/              # Componentes visuales atómicos del POS:
│       │   ├── CatalogoProductos.js  # Grilla táctil de productos, buscador y selector de lotes
│       │   ├── CarritoVenta.js       # Carrito reactivo con cálculo de totales y descuentos
│       │   ├── ModalCobro.js         # Modal multi-método (Efectivo, QR, Mixto, PedidosYa, Yango)
│       │   ├── ModalModificadores.js # Modal de personalización de recetas y complementos
│       │   ├── ModalArqueoCiego.js   # Arqueo de efectivo ciego al cerrar turno
│       │   ├── ModalMovimientosEfectivo.js # Egresos e inyección de sencillo
│       │   ├── HistorialTurno.js     # Visualización de tickets y anulación autorizada
│       │   ├── AperturaTurno.js      # Formulario de apertura de turno con fondo inicial
│       │   └── LoginCaja.js          # Acceso simplificado por PIN o contraseña
│       └── _hooks/
│           ├── useCarrito.js         # Hook reactivo de gestión del carrito de compras
│           └── useInactividad.js     # Detector de inactividad para cierre de sesión
├── server/
│   ├── actions/                      # Capa de Server Actions protegidas ('use server')
│   │   ├── _wrapper.js               # Envoltorio de validación de token y roles
│   │   ├── admin.actions.js          # Usuarios, terminales físicas y configuración del negocio
│   │   ├── catalogo.actions.js       # Categorías, productos, combos, recetas y modificadores
│   │   ├── inventario.actions.js     # Compras con RCV SIAT, mermas y ajustes de inventario
│   │   ├── notificaciones.actions.js # Gestión de SMTP, guardado dinámico y verificación de código
│   │   ├── turnos.actions.js         # Apertura, cierre con arqueo ciego y reaperturas
│   │   └── ventas.actions.js         # Cobro atómico multi-método, delivery y anulación de tickets
│   ├── domain/                       # Lógica pura de dominio y reglas desacopladas
│   │   ├── costos.js                 # Costo Promedio Ponderado (CPP NIC 2), cascada de recetas y combos
│   │   └── fiscal.js                 # Snapshot tributario, bases imponibles IVA e IT
│   ├── repositories/                 # Capa de persistencia SQL parametrizada
│   │   ├── db.js                     # Consultas y transacciones en el contexto PostgreSQL del tenant
│   │   ├── analiticas.repo.js        # Inteligencia de negocio y proyecciones
│   │   ├── auth.repo.js              # Usuarios, credenciales bcrypt y permisos
│   │   ├── cajas.repo.js             # Terminales físicas, turnos, arqueos y reaperturas
│   │   ├── catalogo.repo.js          # Catálogo, categorías, recetas, modificadores y combos
│   │   ├── configuracion.repo.js     # Parámetros del negocio, régimen fiscal y SMTP dinámico
│   │   ├── inventario.repo.js        # Kardex de productos directos, insumos, compras RCV y mermas
│   │   ├── reportes.repo.js          # Extracción de estadísticas y generación de libro Excel
│   │   ├── ventas.repo.js            # Ventas, pagos multi-método, snapshot fiscal y anulaciones
│   │   └── index.js                  # Barrel de repositorios
│   ├── lib/                          # Servicios técnicos e infraestructura
│   │   ├── mailer.js                 # Generación y despacho asíncrono de reportes por correo
│   │   ├── secretos.js               # Validación estricta de variables de entorno y claves
│   │   └── sesion.js                 # JWT, cookies HttpOnly, rate limiting dual e INSTANCE_BOOT_ID
│   └── queries.js                    # Fachada y barrel retrocompatible
├── database/
│   ├── postgres.js                   # Pools de conexión PostgreSQL por URL
│   ├── migraciones-control.js        # Registro central de tenants
│   ├── migraciones-tenant.js         # Migraciones versionadas del POS
│   └── provisionar-tenant.js         # Migración e inicialización por negocio
├── components/ui/                    # Componentes reutilizables Shadcn UI
├── public/
│   ├── manifest.json                 # Especificación de Aplicación Web Progresiva (PWA)
│   └── icons/                        # Iconos para PWA y dispositivos móviles
├── scripts/
│   ├── backup-postgres.js            # Respaldo lógico por tenant con pg_dump
│   └── seed_cafeteria.js             # Sembrado integral con catálogo, lotes, fiscal y Kardex
└── tests/
    ├── postgres-*.test.js           # Integración, migraciones y aislamiento PostgreSQL
    ├── simulador_integral.js         # Simulador integral de flujo comercial automatizado
    └── e2e/                         # Pruebas de navegador con Playwright
```

---

## 3. Seguridad y Control de Sesiones (`server/lib/sesion.js`)

- **Validación exclusiva en servidor:** La identidad, rol y permisos de cada petición se resuelven exclusivamente a partir del token JWT validado en servidor, nunca de campos enviados por el cliente.
- **TTL diferenciado por rol:**
  - `developer`: 15 minutos.
  - `propietario` / `admin`: 30 minutos.
  - `user` (Cajero): 8 horas.
- **`INSTANCE_BOOT_ID`:** Cada arranque del proceso genera un identificador único en memoria. Al reiniciar el servidor (`npm run dev` o PM2), todos los tokens administrativos y técnicos de arranques anteriores quedan invalidados de inmediato, eliminando sesiones zombis.
- **Inactividad y cookies de sesión:** Los perfiles administrativos utilizan Session Cookies (se destruyen al cerrar la ventana) y cuentan con un detector de inactividad de 15 minutos en frontend que fuerza el logout.
- **Rate limiting dual:**
  - Por IP de origen con soporte de `TRUST_PROXY` (lectura segura de `x-forwarded-for` y `x-real-ip` para balanceadores AWS ALB / CloudFront / Nginx).
  - Por cuenta de usuario individual en memoria (límite de intentos fallidos con caducidad autónoma para frenar ataques de fuerza bruta).
- **Cookie `Secure` adaptativa:** En producción, `server/lib/sesion.js` activa `secure: true` cuando la conexión proviene de HTTPS (`x-forwarded-proto: https`) y permite `secure: false` en conexiones HTTP de desarrollo o pruebas internas.

---

## 4. Base de Datos y Sistema de Migraciones Versionadas (`database/`)

- `database/postgres.js` mantiene un pool por URL. `CONTROL_DATABASE_URL` apunta al registro de tenants y `TENANT_DATABASE_URLS_JSON` resuelve la conexión operativa por UUID o slug.
- `database/migraciones-control.js` prepara `control_tenants`. `database/migraciones-tenant.js` aplica las versiones pendientes en cada base operativa. El DDL y las entradas en `schema_migrations` se confirman en una misma transacción.
- El esquema operativo reúne configuración, usuarios y dispositivos POS, cajas y turnos, catálogo y recetas, ventas y pagos, Kardex y lotes, fiscalidad, SMTP y notificaciones. PostgreSQL aplica las claves foráneas, restricciones e índices de las migraciones.
- `npm run provision:tenant -- <slug>` ejecuta las migraciones e inicializa el negocio registrado. Después de confirmar la base operativa, actualiza la versión en el registro central.
- Los reportes agrupan los instantes de PostgreSQL por día en `America/La_Paz`. El aislamiento y la resolución de conexiones se detallan en [Arquitectura multi-negocio](ARQUITECTURA_MULTI_TENANT.md).

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
- **Cobros por QR y Apps:** Se concilian aparte (`qr_esperado`) sin mezclarse con el dinero físico del cajón.

### C. Régimen Tributario Modular y Respaldo RCV SIAT (v9-v13)
- **Modalidades de Régimen:**
  - `simplificado_control_interno`: IVA = 0, IT = 0. Prohibición estricta de emitir facturas tanto en frontend como en backend.
  - `regimen_general`: Alícuotas configurables (`iva_porcentaje = 13%`, `it_porcentaje = 3%`), base del IT configurable (`it_base = 'todas_las_ventas'` o `'solo_facturadas'`), y emisión de facturas con NIT, razón social y CUF.
- **Inmutabilidad Tributaria (Snapshot Fiscal):** Cada venta y egreso congela sus parámetros fiscales (`regimen_tributario`, `iva_porcentaje`, `it_porcentaje`, `iva_monto`, `it_monto`) en la fila de `movimientos`.
- **Respaldo Fiscal SIAT RCV (v13):** Las compras de mercadería e insumos registran `nro_autorizacion_cuf`, `codigo_control` y `tipo_compra`, permitiendo generar el libro contable de compras homologado al formato RCV de Impuestos Nacionales.

### D. Canales de Venta, Delivery y Apps de Comida (v14)
- **Canales soportados:** `local` (consumo en sala/mostrador), `delivery_propio`, `pedidos_ya` y `yango`.
- **Datos de entrega:** Cada ticket de delivery almacena dirección, cliente y teléfono en `datos_entrega`, además de la `referencia_externa` del pedido generado en la plataforma.
- **Métodos de pago específicos:** Los cobros liquidados por plataformas externas se registran en `movimientos_pagos` bajo su método respectivo (`pedidos_ya` o `yango`), manteniendo separada la conciliación de cobros de plataformas de los ingresos en efectivo o QR del negocio.

### E. Pagos Mixtos Flexibles (Efectivo + QR)
- **Fuente de verdad:** `movimientos_pagos` almacena el desglose por método de pago para cada venta.
- **Cálculo de cambio:** Cuando un cliente realiza un pago mixto y entrega un billete mayor para la porción en efectivo, el sistema calcula el cambio exclusivamente sobre la parte en efectivo.

### F. Kardex Cronológico Dual y NIC 2 (Costo Promedio Ponderado)
- **Kardex de Productos Directos (`movimientos_productos_directos`):** Registra `inventario_inicial`, `compra`, `venta`, `merma`, `reingreso_anulacion` y `ajuste`, manteniendo `stock_resultante` y `costo_promedio_resultante`.
- **Kardex de Insumos de Receta (`movimientos_insumos`):** Registra todos los consumos por ventas de recetas, combos, compras y mermas. Preserva hasta 6 decimales de precisión en el costo unitario de insumos métricos (ej. `0.0015 Bs/ml`).
- **Auditoría Matemática de Integridad:** Las funciones `verificarIntegridadKardexDirecto()` y `verificarIntegridadKardexInsumos()` comprueban algebraicamente que la sumatoria histórica de movimientos coincida exactamente con el stock actual y el último saldo de Kardex, detectando cualquier inconsistencia con 0 descuadres tolerados.

### G. Trazabilidad de Vencimientos por Lote y Política PEPS (v12)
- **Tabla `producto_lotes`:** Almacena cada partida de productos directos con fecha de vencimiento, stock y costo unitario.
- **Descuento Atómico y Salida PEPS (FIFO):**
  - *Selección manual de lote:* El cajero puede vender seleccionando un lote concreto en el POS.
  - *Política Automática PEPS:* Si no se especifica lote, el motor consume automáticamente los lotes más próximos a caducar (`ORDER BY fecha_vencimiento ASC, id ASC`).
  - *Validación concurrente:* `WHERE id = ? AND stock >= ?` previene existencias negativas.

### H. Combos, Promociones y Modificadores de Receta (v7-v8)
- **Combos (`combo_componentes`):** Descuento atómico de stock de componentes directos e insumos de recetas, con costeo dinámico en cascada, vigencia temporal y modos con o sin límite de unidades.
- **Modificadores (`grupos_modificadores`):** Reemplazos inteligentes de insumos (sustitución atómica sin descontar el insumo base), adición de extras y modificadores operativos, congelados en `detalle_movimientos_modificadores`.

---

## 6. Servicio SMTP Dinámico y Notificaciones por Correo (`server/lib/mailer.js`)

- **Configuración Dinámica en Base de Datos (v15):** La tabla `configuracion_smtp` permite editar servidor, puerto, credenciales y seguridad SSL/TLS directamente desde el panel de administración (`/admin/configuracion`) sin necesidad de reiniciar el servidor ni editar archivos `.env`.
- **Verificación de Destinatarios por Código Numérico:** La tabla `notificacion_destinatarios` administra las casillas receptoras. Al registrar un correo, el sistema envía un código temporal de 6 dígitos que debe ser verificado en la interfaz para autorizar la recepción de reportes de cierre de caja.
- **Despacho Asíncrono en Segundo Plano:** Al cerrarse un turno mediante `cerrarTurnoAction`, se despacha la notificación SMTP sin bloquear la respuesta de la Server Action al cajero.
- **Adjunto Oficial Excel:** Genera en caliente con `exceljs` el libro oficial (`Reporte_Turno_XX.xlsx`) y lo anexa al correo electrónico.

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

## 8. Operación Cloud en AWS y Producción con PM2

- **Despliegue en Instancia AWS (`ecosystem.config.js`):** PM2 se configura en modo `fork` con una instancia, reinicio automático y límite de memoria de 1 GB. El rate limiting y `INSTANCE_BOOT_ID` residen en el proceso.
- **Validación Estricta de Secretos en Arranque (`instrumentation.js` y `server/lib/secretos.js`):** Con `NODE_ENV=production`, el servidor valida que `SESSION_SECRET` (mínimo 32 caracteres aleatorios) y `DEVELOPER_PASSWORD` no sean valores por defecto ni marcadores de ejemplo antes de aceptar tráfico.
- **Operación detrás de Proxy Inverso / Balanceador AWS (Nginx / ALB / CloudFront):**
  - `TRUST_PROXY=true` habilita la lectura confiable de la IP real del cliente (`x-forwarded-for` / `x-real-ip`) para el rate limiting por IP.
  - Detección automática de protocolo HTTPS mediante `x-forwarded-proto` para cookies de sesión seguras.
- **Respaldo PostgreSQL (`scripts/backup-postgres.js`):** `npm run backup -- <slug>` ejecuta `pg_dump` en formato personalizado y aplica retención por tenant. El archivo se publica en el directorio de respaldos una vez completada la copia.

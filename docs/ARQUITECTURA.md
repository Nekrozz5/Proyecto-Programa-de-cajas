# Arquitectura Técnica del Sistema

Este documento describe la arquitectura global del sistema POS y Control de Cajas, su modelo de seguridad, la base de datos relacional con SQLite3, el esquema de migraciones versionadas (v1 a v16), el motor tributario modular con RCV SIAT, los pagos mixtos, los canales de delivery (PedidosYa / Yango), el Kardex cronológico dual (NIC 2), los combos, los modificadores de recetas, la trazabilidad de lotes con política PEPS (FIFO), el servicio SMTP dinámico con verificación de destinatarios, el motor de licenciamiento offline por criptografía asimétrica (Ed25519), la distribución de escritorio para Windows y el sistema de reportes contables.

---

## 1. Stack Tecnológico

- **Frontend / Fullstack:** Next.js 16 (App Router) con React 19.
- **Estilos y Componentes UI:** Tailwind CSS con Shadcn UI (`components/ui/*`, `@base-ui/react`, `class-variance-authority`, `lucide-react`) y diseño responsivo táctil y de escritorio.
- **Base de Datos:** SQLite3 local (`sqlite3@^6.0.1` y `better-sqlite3@^13.2.0`) con SQL nativo parametrizado (`?`) y Drizzle ORM singleton (`database/drizzle.js`, `database/schema.js`).
- **Autenticación y Criptografía:** JWT firmado con `jose` (`^6.2.17`) en cookies `HttpOnly` (`pos_session`), hash de contraseñas con `bcryptjs` (`^3.0.3`) (10 rondas de salt) y licenciamiento offline asimétrico con Ed25519 (`server/lib/licencia.js`).
- **Reportes y Visualización:**
  - `exceljs` (`^4.4.0`): Generación en servidor de libros Excel `.xlsx` con 10 hojas contables y de auditoría.
  - `jspdf` (`^4.2.1`) y `jspdf-autotable` (`^5.0.9`): Generación en cliente de reportes PDF de balance fiscal, arqueo ciego y auditoría de turno.
  - `recharts` (`^3.10.1`): Gráficos interactivos de métricas financieras en `/admin` (flujo horario, balance de 7 días, top productos, métodos de pago).
- **Servicio de Notificaciones:** `nodemailer` (`^10.5.0`): Envíos SMTP en segundo plano con plantilla HTML ejecutiva, configuración dinámica en BD (`configuracion_smtp`), verificación de destinatarios (`notificacion_destinatarios`) y libro Excel `.xlsx` adjunto en caliente.
- **Instalador de Escritorio y Empaquetado:** Inno Setup 6 (`installer/pos-cajas.iss`), script recolector `scripts/preparar-dist.js`, lanzador silencioso VBScript (`scripts/lanzar-silencioso.vbs`) y modo aplicación en navegador Edge/Chrome.
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
│   │   ├── db.js                     # Primitivas SQLite (get, all, run, transaccion)
│   │   ├── auth.repo.js              # Usuarios, credenciales bcrypt y permisos
│   │   ├── cajas.repo.js             # Terminales físicas, turnos, arqueos y reaperturas
│   │   ├── catalogo.repo.js          # Catálogo, categorías, recetas, modificadores y combos
│   │   ├── configuracion.repo.js     # Parámetros del negocio, régimen fiscal y SMTP dinámico
│   │   ├── inventario.repo.js        # Kardex de productos directos, insumos, compras RCV y mermas
│   │   ├── reportes.repo.js          # Extracción de estadísticas y generación de libro Excel
│   │   ├── ventas.repo.js            # Ventas, pagos multi-método, snapshot fiscal y anulaciones
│   │   └── index.js                  # Barrel de repositorios
│   ├── lib/                          # Servicios técnicos e infraestructura
│   │   ├── licencia.js               # Validación criptográfica de claves de activación Ed25519
│   │   ├── mailer.js                 # Generación y despacho asíncrono de reportes por correo
│   │   ├── secretos.js               # Validación estricta de variables de entorno y claves
│   │   └── sesion.js                 # JWT, cookies HttpOnly, rate limiting dual e INSTANCE_BOOT_ID
│   └── queries.js                    # Fachada y barrel retrocompatible
├── database/
│   ├── database.js                   # Conexión SQLite (WAL, busy_timeout, foreign_keys)
│   ├── schema.js                     # Esquema tipado Drizzle ORM (20 tablas)
│   ├── drizzle.js                    # Cliente Drizzle singleton sobre better-sqlite3
│   └── migraciones.js                # Sistema de migraciones versionado con PRAGMA user_version (v1 a v16)
├── components/ui/                    # Componentes reutilizables Shadcn UI
├── installer/
│   └── pos-cajas.iss                 # Script de compilación de instalador Windows con Inno Setup
├── public/
│   ├── manifest.json                 # Especificación de Aplicación Web Progresiva (PWA)
│   └── icons/                        # Iconos para PWA y accesos directos
├── scripts/
│   ├── backup.js                     # Respaldo atómico en caliente con VACUUM INTO
│   ├── update.js                     # Actualización automatizada (backup + pull + ci + build)
│   ├── seed_cafeteria.js             # Sembrado integral con catálogo, lotes, fiscal y Kardex
│   ├── generar-clave.js              # Generador CLI de licencias asimétricas Ed25519
│   ├── preparar-dist.js              # Script recolector para el instalador de distribución
│   ├── iniciar-pos.bat               # Inicio del servidor en Windows
│   ├── detener-pos.bat               # Detención ordenada del servidor
│   └── lanzar-silencioso.vbs         # Arranque silencioso sin ventana negra de terminal
└── tests/
    ├── simulador_integral.js         # Simulador integral de flujo comercial automatizado
    ├── test_migracion_v8_v9.js       # Batería de pruebas contables de migración v8 a v9
    └── test_ventas_v9.js             # Suite de pruebas de ventas, Kardex y concurrencia
```

---

## 3. Seguridad, Control de Sesiones y Licenciamiento

### A. Control de Sesiones (`server/lib/sesion.js`)
- **Validación exclusiva en servidor:** La identidad, rol y permisos de cada petición se resuelven exclusivamente a partir del token JWT validado en servidor, nunca de campos enviados por el cliente.
- **TTL diferenciado por rol:**
  - `developer`: 15 minutos.
  - `propietario` / `admin`: 30 minutos.
  - `user` (Cajero): 8 horas.
- **`INSTANCE_BOOT_ID`:** Cada arranque del proceso genera un identificador único en memoria. Al reiniciar el servidor (`npm run dev` o PM2), todos los tokens administrativos y técnicos de arranques anteriores quedan invalidados de inmediato, eliminando sesiones zombis.
- **Inactividad y cookies de sesión:** Los perfiles administrativos utilizan Session Cookies (se destruyen al cerrar la ventana) y cuentan con un detector de inactividad de 15 minutos en frontend que fuerza el logout.
- **Rate limiting dual:**
  - Por IP de origen con soporte de `TRUST_PROXY` (lectura segura de `cf-connecting-ip` para Cloudflare Tunnel y `x-real-ip` para proxies inversos).
  - Por cuenta de usuario individual en memoria (límite de intentos fallidos con caducidad autónoma para frenar ataques de fuerza bruta).
- **Cookie `Secure` adaptativa:** En producción, `server/sesion.js` activa `secure: true` cuando la conexión proviene de HTTPS y permite `secure: false` en conexiones HTTP locales (`localhost` o LAN) para operar simultáneamente sin conflictos de cookie.

### B. Motor de Licenciamiento Offline Asimétrico (`server/lib/licencia.js`)
- **Criptografía Asimétrica Ed25519:** La aplicación contiene una clave pública embebida (`LLAVE_PUBLICA_MAESTRA_PEM`). Solo el desarrollador posee la clave privada para firmar licencias de activación.
- **Estructura de la Clave:** `POS-ACT-<payload_base64url>.<firma_base64url>`
  - Payload firmado con: nombre del negocio, NIT/CI, tipo de plan, fecha de emisión, fecha de vencimiento (o vitalicia), límite de terminales físicas y Machine ID de hardware opcional.
- **Verificación 100% Offline:** La aplicación no realiza llamadas externas ni depende de internet para verificar la autenticidad de la licencia; la verificación matemática se realiza localmente en microsegundos.
- **Generación de Claves (`scripts/generar-clave.js`):** Utilidad de línea de comandos para que el desarrollador emita claves válidas y asigne licencias a nuevos clientes:
  ```bash
  npm run licencia -- emitir --negocio "Café Central" --vence "2027-12-31" --cajas 3
  ```

---

## 4. Base de Datos y Sistema de Migraciones Versionadas (`database/`)

- **`database/database.js`:**
  - Ruta de base de datos configurable mediante `DATABASE_PATH` (por defecto `./caja.db`).
  - Activa `PRAGMA foreign_keys = ON`.
  - Modo WAL (`PRAGMA journal_mode = WAL`) para lecturas concurrentes sin bloqueo.
  - `PRAGMA busy_timeout = 5000` para tolerar esperas de escritura sin bloqueos prematuros.
  - Respaldo automático preventivo previo a la aplicación de cualquier migración (`VACUUM INTO backups/caja-pre-migracion-vX-a-vY-*.db`).

- **`database/migraciones.js` (Evolución Integral v1 a v16):**
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
  - **v12:** Creación de tabla `producto_lotes` para trazabilidad de vencimientos por lote, índices por producto y fecha de caducidad, migración de stock inicial con vencimiento, y soporte de salida PEPS (Primero en Expirar, Primero en Salir / FIFO) o selección manual de lote.
  - **v13:** Columnas fiscales de respaldo RCV SIAT (`nro_autorizacion_cuf`, `codigo_control`, `tipo_compra`) añadidas a `movimientos_insumos`, `movimientos_productos_directos` y `movimientos`.
  - **v14:** Soporte para apps de comida y delivery: bandera `habilita_apps_comida` en `configuracion_negocio`, columnas `canal_venta`, `datos_entrega` y `referencia_externa` en `movimientos`, y ampliación del CHECK constraint en `movimientos_pagos` para permitir métodos `pedidos_ya` y `yango`.
  - **v15:** Configuración SMTP dinámica en base de datos (`configuracion_smtp`) y tabla de destinatarios de notificaciones (`notificacion_destinatarios`) con estado de verificación por código numérico de un solo uso.
  - **v16:** Actualización del rol administrativo de `superadmin` a `propietario` en la tabla `usuarios` y normalización del CHECK constraint (`user`, `admin`, `propietario`, `developer`).

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

## 8. Distribución de Escritorio para Windows y Arquitectura Híbrida

- **Empaquetado Nativo con Inno Setup (`installer/pos-cajas.iss`):** Compila un instalador ejecutable (`Setup-POS-Cajas-v1.4.0.exe`) con compresión sólida LZMA2 que instala el servidor local, dependencias nativas y crea los accesos directos necesarios.
- **Arquitectura 100% Autónoma (Plug & Play):**
  - **Motor Node.js Embebido (`bin/node.exe`):** Se empaqueta un runtime portable local que elimina la necesidad de preinstalar Node.js en Windows.
  - **Microsoft Visual C++ Redistributable (`redist/vc_redist.x64.exe`):** Inno Setup verifica en el registro de Windows si las DLLs nativas (`msvcp140.dll` y `vcruntime140.dll`) están presentes; si no existen (PC virgen de fábrica), las instala silenciosamente en segundo plano.
  - **Arranque Directo sin npm:** `iniciar-servidor.vbs` invoca directamente `bin\node.exe node_modules\next\dist\bin\next start`.
- **Cierre Quirúrgico de Procesos y Purga de Caché (`scripts/detener-pos.bat`):** Cierra ventanas de Microsoft Edge que ejecutan el POS (`localhost:3000`), finaliza procesos residuales de Node/WScript y libera el puerto 3000. Durante actualizaciones, Inno Setup purga completamente la carpeta `.next` previa para evitar conflictos de chunks antiguos sin requerir reinicio de Windows.
- **Generación de Secretos Criptográficos Únicos (`scripts/inicializar-entorno.js`):** Cada instalación autogenera su propio `SESSION_SECRET` (64 caracteres hex) y contraseña técnica de producción, evitando secretos compartidos.
- **Regla Simétrica de Firewall de Windows:** Configura automáticamente la regla de entrada en el puerto 3000 al instalar para permitir terminales móviles en LAN y la elimina al desinstalar.
- **Arranque Silencioso en Segundo Plano (`scripts/lanzar-silencioso.vbs`):** Inicia el servidor Node.js en el puerto 3000 de forma completamente oculta, sin mostrar ventanas de consola (CMD) al usuario.
- **Modo Aplicación (Kiosco):** Abre automáticamente la interfaz POS en una ventana aislada de Microsoft Edge (`--app=http://localhost:3000/caja/pos`) sin barras de navegación ni distracciones para el cajero.
- **Preservación Inviolable de Datos:** La base de datos `caja.db` cuenta con la directiva `onlyifdoesntexist` en el instalador y backup preventivo antes de cada actualización, asegurando que jamás se borren ventas ni inventario. Al desinstalar, ofrece un diálogo para conservar el historial contable.

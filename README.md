# Sistema POS y Control de Cajas (Cloud / AWS)

Aplicación web integral de Punto de Venta (POS), control de turnos/arqueo ciego, estaciones multicaja, motor fiscal modular (IVA / IT / RCV SIAT), canales de delivery (PedidosYa / Yango), trazabilidad de lotes PEPS (FIFO), combos/promociones, modificadores de recetas, Kardex dual cronológico (NIC 2), notificaciones SMTP dinámicas con verificación de código y reportes contables en Excel (10 hojas) y PDF, construida con **Next.js (App Router)** y desplegada en **AWS**.

---

## Documentación

| Documento | Descripción |
| :--- | :--- |
| [GUIA_DESARROLLO.md](GUIA_DESARROLLO.md) | **Guía Rápida: Frontend vs Backend.** Mapa visual del proyecto, qué carpetas tocar según lo que quieras programar y reglas clave para colaboradores. |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diseño técnico, modelo de seguridad, base de datos relacional, migraciones, motor fiscal, Kardex dual, lotes PEPS, delivery, SMTP dinámico y reportes. |
| [docs/PRUEBAS.md](docs/PRUEBAS.md) | Batería de escenarios de verificación funcional, concurrencia, stock, lotes, arqueo, combos, modificadores, régimen fiscal, pagos mixtos, delivery y SMTP. |
| [GEMINI.md](GEMINI.md) | Reglas de negocio obligatorias, directrices técnicas, variables de entorno y estado actual del proyecto (fuente de verdad para desarrollo y agentes). |

---

## Características Principales

- **Control de Turnos y Arqueo Ciego:** Apertura de caja, cobro reactivo con cálculo de cambio, conciliación separada de efectivo vs. QR, egresos documentados e inyección de sencillo (`ingreso_efectivo`). Cierre ciego con detección de descuadres (sobrante/faltante) y trazabilidad inmutable de reaperturas auditadas.
- **Multicaja y Estaciones Físicas:** Gestión de terminales físicas de cobro (`cajas_fisicas`) operando turnos independientes en paralelo, con protección de última caja activa y baja lógica protegida.
- **Trazabilidad de Lotes y Vencimiento PEPS / FIFO (v12):** Gestión de lotes en `producto_lotes` con fecha de expiración, compras con ingreso de lote, mermas imputadas y ventas con política automática PEPS (Primero en Expirar, Primero en Salir) o selección manual de lote específico en el POS.
- **Respaldo Fiscal SIAT RCV (v13):** Captura y validación de campos fiscales para el Registro de Compras y Ventas (N° Autorización / CUF, Código de Control, Tipo de Compra) en compras de insumos, productos directos y movimientos.
- **Canales de Delivery y Apps de Comida (v14):** Soporte nativo para ventas por mostrador o delivery (PedidosYa y Yango Delivery) con registro de datos de entrega, referencias externas y conciliación de métodos de pago específicos.
- **Configuración SMTP Dinámica y Verificación por Email (v15):** Administración en caliente del servidor de correo en base de datos (`configuracion_smtp`) y lista de destinatarios autorizados con verificación de seguridad mediante código numérico temporal (`notificacion_destinatarios`).
- **Rol Propietario y Jerarquía Segura (v16):** Consolidación del perfil de máxima autoridad empresarial (`propietario`), diferenciado de administradores (`admin`), cajeros (`user`) y soporte técnico (`developer`).
- **Régimen Tributario Modular y Snapshot Fiscal (v9-v11):** Soporte de Régimen Simplificado (control interno) y Régimen General con alícuotas configurables (IVA 13%, IT 3%, base IT configurable). Snapshot inmutable congelado en cada venta (`movimientos`), garantizando integridad histórica.
- **Pagos Mixtos Flexibles (Efectivo + QR):** Fuente de verdad normalizada en `movimientos_pagos`. Desglose exacto por método de pago con cálculo y entrega de cambio exclusivamente sobre la porción en efectivo.
- **Kardex Cronológico Dual y Costo Ponderado (NIC 2):** Trazabilidad completa de inventario en `movimientos_productos_directos` y `movimientos_insumos` con `stock_resultante` y `costo_promedio_resultante` en cada fila. Preservación de hasta 6 decimales en insumos métricos (g / ml) y función de auditoría matemática de integridad con 0 descuadres.
- **Combos y Paquetes Promocionales (v8):** Descomposición atómica de stock de componentes directos e insumos de recetas, con costeo dinámico en cascada, vigencia por fecha/hora y modo con límite de unidades restante o sin límite.
- **Personalización y Modificadores de Receta (v7):** Grupos de complementos con selección única o múltiple, obligatoriedad, recargos de precio y reemplazo inteligente de insumos (ej. Leche entera -> Almendras / Deslactosada), con auditoría congelada en `detalle_movimientos_modificadores`.
- **Reportes Contables y Exportación Multiformato:** Generación en servidor con `exceljs` de libro Excel `.xlsx` con 10 hojas contables (`Movimientos`, `Arqueos`, `Detalle Ventas CMV`, `Rentabilidad por Producto`, `Compras y Mermas`, `Inventario Kardex`, `Kardex Productos`, `Kardex Insumos`, `Historial Anulaciones` y `Resumen Contable`), exportación PDF con liquidación de impuestos y gráficos interactivos (`recharts`).

---

## Estructura del Proyecto

```text
├── app/
│   ├── api/
│   │   ├── auth/route.js            # Autenticación, login y logout
│   │   ├── caja/route.js            # API de turnos, sincronización y lectura en tiempo real
│   │   ├── configuracion/route.js   # API de configuración general del negocio
│   │   └── reportes/route.js        # API de reportes, estadísticas y exportación (XLSX 10 hojas, CSV)
│   ├── admin/
│   │   ├── layout.js                # Layout administrativo con AdminProvider
│   │   ├── _context/AdminContext.js # Estado compartido administrativo
│   │   ├── resumen/page.js          # Subruta: Panel de métricas y gráficos
│   │   ├── catalogo/page.js         # Subruta: Productos, recetas, combos y lotes
│   │   ├── insumos/page.js          # Subruta: Insumos de producción y compras
│   │   ├── arqueos/page.js          # Subruta: Turnos y arqueos ciegos
│   │   ├── usuarios/page.js         # Subruta: Cajeros y terminales físicas
│   │   ├── inteligencia/page.js     # Subruta: Inteligencia de negocio y alertas
│   │   ├── configuracion/page.js    # Subruta: Configuración fiscal, SMTP y parámetros
│   │   ├── exportacion/page.js      # Subruta: Reportes Excel y PDF
│   │   ├── GraficosFinancieros.js   # Métricas visuales interactivas con Recharts
│   │   ├── exportarPDF.js           # Generación de reportes PDF de balance fiscal
│   │   └── _components/             # Componentes modulares administrativos
│   ├── caja/
│   │   ├── layout.js                # Layout de caja con CajaProvider
│   │   ├── _context/CajaContext.js  # Estado reactivo del terminal POS
│   │   ├── pos/page.js              # Subruta: Terminal táctil de cobro y carrito
│   │   └── movimientos/page.js      # Subruta: Historial del turno e ingresos/egresos
│   ├── layout.js                    # Layout raíz de Next.js (protección notranslate)
│   └── page.js                      # Portal principal del sistema
├── database/
│   ├── database.js                  # Conexión SQLite (WAL, busy_timeout, foreign_keys, DATABASE_PATH)
│   ├── schema.js                    # Esquema Drizzle ORM (20 tablas tipadas y relaciones)
│   ├── drizzle.js                   # Cliente Drizzle singleton sobre better-sqlite3
│   └── migraciones.js               # Esquema versionado transaccional (PRAGMA user_version)
├── server/
│   ├── actions/                     # Server Actions protegidas ('use server')
│   │   ├── admin.actions.js         # Administración de usuarios, cajas físicas y negocio
│   │   ├── catalogo.actions.js      # ABM de productos, recetas, combos y modificadores
│   │   ├── inventario.actions.js    # Compras, mermas e inventario
│   │   ├── notificaciones.actions.js# Gestión de SMTP y verificación de emails
│   │   ├── turnos.actions.js        # Apertura, cierre y reapertura de turnos
│   │   ├── ventas.actions.js        # Cobro atómico y anulación de tickets
│   │   └── _wrapper.js              # Envoltorio de validación de sesión y permisos
│   ├── domain/                      # Lógica pura de dominio (costos CPP, motor fiscal)
│   ├── repositories/                # Módulos de persistencia SQL parametrizada
│   ├── lib/                         # Infraestructura técnica
│   │   ├── mailer.js                # Despacho de notificaciones SMTP con libro Excel adjunto
│   │   ├── secretos.js              # Validación de variables de entorno y claves
│   │   └── sesion.js                # Autenticación JWT, cookies HttpOnly y rate limiting
│   └── queries.js                   # Fachada barrel
├── components/ui/                   # Componentes de interfaz Shadcn UI
├── public/
│   ├── manifest.json                # Especificación PWA para móviles y tablets
│   └── icons/                       # Iconos de la aplicación en múltiples resoluciones
├── scripts/
│   ├── backup.js                    # Respaldo atómico en caliente (VACUUM INTO) con retención
│   └── seed_cafeteria.js            # Sembrado integral con catálogo, lotes, fiscal y Kardex
├── tests/
│   ├── simulador_integral.js        # Simulador E2E integral de flujo comercial completo
│   ├── test_migracion_v8_v9.js      # Verificaciones contables y de migración v8->v9
│   └── test_ventas_v9.js            # Suite de pruebas de ventas, Kardex y concurrencia
├── docs/                            # Documentación técnica y pruebas
├── ecosystem.config.js              # Configuración de PM2 para ejecución continua
├── instrumentation.js               # Validación temprana de seguridad en arranque de Next.js
└── next.config.js                   # Configuración de empaquetado (serverExternalPackages)
```

---

## Inicio Rápido (Desarrollo)

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Crea un archivo `.env.local` en la raíz con al menos:
   ```env
   NODE_ENV=development
   PORT=3000
   DATABASE_PATH=./caja.db
   SESSION_SECRET=un_secreto_largo_de_al_menos_32_caracteres_para_desarrollo
   DEVELOPER_PASSWORD=TuPasswordDeveloperLocal
   ```

3. **Cargar datos de prueba integrales (Opcional):**
   ```bash
   npm run seed
   ```

4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en el navegador.

---

## Comandos Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo de Next.js. |
| `npm run build` | Compila la aplicación para producción (`next build --webpack`). |
| `npm run start` | Inicia la aplicación compilada en modo producción. |
| `npm run seed` | Carga el seed integral de prueba con régimen fiscal, combos, modificadores, compras con factura, pagos mixtos y auditoría de Kardex. |
| `npm run simular` | Ejecuta la simulación integral automatizada de punta a punta (turnos, ventas, recetas, arqueos y reportes). |
| `npm run backup` | Ejecuta un respaldo atómico en caliente en `backups/` con retención automática. |

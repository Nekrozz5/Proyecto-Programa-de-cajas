# Sistema POS y Control de Cajas Híbrido

Aplicación web integral de Punto de Venta (POS), control de turnos/arqueo ciego, estaciones multicaja, motor fiscal modular (IVA / IT / RCV SIAT), canales de delivery (PedidosYa / Yango), trazabilidad de lotes PEPS (FIFO), combos/promociones, modificadores de recetas, Kardex dual cronológico (NIC 2), notificaciones SMTP dinámicas con verificación de código, licenciamiento offline por criptografía asimétrica (Ed25519), instalador nativo para Windows y reportes contables en Excel (10 hojas) y PDF, construida con **Next.js (App Router)** y **SQLite3**.

---

## Documentación

| Documento | Descripción |
| :--- | :--- |
| [GUIA_DESARROLLO.md](GUIA_DESARROLLO.md) | **Guía Rápida: Frontend vs Backend.** Mapa visual del proyecto, qué carpetas tocar según lo que quieras programar y reglas clave para colaboradores. |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diseño técnico, modelo de seguridad, base de datos relacional, migraciones (v1 a v16), motor fiscal, Kardex dual, lotes PEPS, delivery, SMTP dinámico, licenciamiento Ed25519 y reportes. |
| [docs/PRUEBAS.md](docs/PRUEBAS.md) | Batería de 23 escenarios de verificación funcional, concurrencia, stock, lotes, arqueo, combos, modificadores, régimen fiscal, pagos mixtos, delivery, SMTP, licencias e instalador. |
| [docs/GUIA_LANZAMIENTO_INSTALABLE.md](docs/GUIA_LANZAMIENTO_INSTALABLE.md) | Guía técnica para compilación con Inno Setup, generación de instalador (`Setup-POS-Cajas-v1.0.exe`), modo kiosco de escritorio y despliegue PWA en dispositivos móviles. |
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
- **Licenciamiento Criptográfico Offline (Ed25519):** Motor de validación de claves de producto firmado asimétricamente (`POS-ACT-...`) que vincula el software al negocio de forma offline sin depender de servidores externos de activación.
- **Instalador de Escritorio Windows Autónomo (Plug & Play) y PWA:** Empaquetador nativo con Inno Setup (`installer/pos-cajas.iss`) que incluye motor Node.js portable embebido e instalación silenciosa automática de librerías Microsoft Visual C++, sin requerir preinstalaciones en computadoras vírgenes. Acceso directo silencioso en segundo plano, ejecución en modo ventana/kiosco para terminales de cobro y compatibilidad PWA para teléfonos y tablets.
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
│   │   ├── auth/route.js            # Autenticación, login, logout e instalación
│   │   ├── caja/route.js            # API de turnos, sincronización y lectura en tiempo real
│   │   └── reportes/route.js        # API de reportes, estadísticas y exportación (XLSX 10 hojas, CSV)
│   ├── admin/
│   │   ├── layout.js                # Layout administrativo con AdminProvider
│   │   ├── _context/AdminContext.js # Estado compartido administrativo
│   │   ├── resumen/page.js          # Subruta: Panel de métricas y gráficos
│   │   ├── catalogo/page.js         # Subruta: Productos, recetas, combos y lotes
│   │   ├── insumos/page.js          # Subruta: Insumos de producción y compras
│   │   ├── arqueos/page.js          # Subruta: Turnos y arqueos ciegos
│   │   ├── usuarios/page.js         # Subruta: Cajeros y terminales físicas
│   │   ├── configuracion/page.js    # Subruta: Configuración fiscal, SMTP y parámetros
│   │   ├── exportacion/page.js      # Subruta: Reportes Excel y PDF
│   │   ├── GraficosFinancieros.js   # Métricas visuales interactivas con Recharts
│   │   ├── exportarPDF.js           # Generación de reportes PDF de balance fiscal
│   │   └── _components/             # Componentes modulares administrativos
│   │       ├── TabConfiguracionCorreos.js # Panel de gestión SMTP y destinatarios
│   │       └── ModalVerificarEmail.js    # Modal para verificación de código temporal
│   ├── caja/
│   │   ├── layout.js                # Layout de caja con CajaProvider
│   │   ├── _context/CajaContext.js  # Estado reactivo del terminal POS
│   │   ├── pos/page.js              # Subruta: Terminal táctil de cobro y carrito
│   │   └── movimientos/page.js      # Subruta: Historial del turno e ingresos/egresos
│   ├── layout.js                    # Layout raíz de Next.js (protección notranslate)
│   └── page.js                      # Pantalla de inicio de sesión
├── database/
│   ├── database.js                  # Conexión SQLite (WAL, busy_timeout, foreign_keys, DATABASE_PATH)
│   ├── schema.js                    # Esquema Drizzle ORM (20 tablas tipadas y relaciones)
│   ├── drizzle.js                   # Cliente Drizzle singleton sobre better-sqlite3
│   └── migraciones.js               # Esquema versionado transaccional (PRAGMA user_version v1-v16)
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
│   │   ├── licencia.js              # Motor criptográfico de validación de licencias Ed25519
│   │   ├── mailer.js                # Despacho de notificaciones SMTP con libro Excel adjunto
│   │   ├── secretos.js              # Validación de variables de entorno y claves
│   │   └── sesion.js                # Autenticación JWT, cookies HttpOnly y rate limiting
│   └── queries.js                   # Fachada barrel retrocompatible
├── components/ui/                   # Componentes de interfaz Shadcn UI (password-input, etc.)
├── installer/
│   └── pos-cajas.iss                # Script Inno Setup para compilar instalador de Windows
├── public/
│   ├── manifest.json                # Especificación PWA para móviles y tablets
│   └── icons/                       # Iconos de la aplicación en múltiples resoluciones
├── scripts/
│   ├── backup.js                    # Respaldo atómico en caliente (VACUUM INTO) con retención
│   ├── update.js                    # Actualización segura (backup + git pull + npm ci + build)
│   ├── seed_cafeteria.js            # Sembrado integral con catálogo, lotes, fiscal y Kardex
│   ├── generar-clave.js             # Generador CLI de claves maestras de activación
│   ├── preparar-dist.js             # Recolección y empaquetado para distribución en dist/
│   ├── inicializar-entorno.js       # Autogeneración de secretos criptográficos únicos (.env.production)
│   ├── iniciar-pos.bat              # Script de inicio del servidor en Windows
│   ├── detener-pos.bat              # Script de detención quirúrgica del servidor y ventanas del POS
│   ├── iniciar-servidor.vbs         # Arranque de Next.js en segundo plano sin consola
│   └── lanzar-silencioso.vbs        # Lanzador de escritorio en segundo plano sin ventana negra CMD
├── tests/
│   ├── simulador_integral.js        # Simulador E2E integral de flujo comercial completo
│   ├── test_migracion_v8_v9.js      # Verificaciones contables y de migración v8->v9
│   └── test_ventas_v9.js            # Suite de pruebas de ventas, Kardex y concurrencia
├── docs/                            # Documentación técnica, pruebas y guía de instalación
├── ecosystem.config.js              # Configuración de PM2 para ejecución continua
├── instrumentation.js               # Validación temprana de seguridad en arranque de Next.js
└── next.config.js                   # Configuración de empaquetado (serverExternalPackages)
```

---

## Inicio Rápido (Desarrollo Local)

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
   *Carga el catálogo completo de cafetería gourmet, recetas, insumos métricos, combos, grupos de modificadores, ventas con factura, pagos mixtos, compras con RCV SIAT y verifica la integridad del Kardex.*

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
| `npm run licencia` | Utilidad de línea de comandos para generar o verificar claves criptográficas de activación Ed25519. |
| `npm run backup` | Ejecuta un respaldo atómico en caliente en `backups/` con retención automática. |
| `npm run update` | Actualiza el sistema de forma segura: crea backup de `caja.db`, descarga cambios (`git pull`), instala versiones exactas (`npm ci`), compila y reinicia PM2 si está activo. |
| `npm run dist:prepare` | Valida binarios nativos y empaqueta los archivos necesarios en `dist/` para el instalador de Windows. |
| `npm run app:start` | Inicia el servidor POS local en segundo plano (Windows). |
| `npm run app:stop` | Detiene el proceso del servidor POS y libera el puerto 3000 (Windows). |

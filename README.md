# Sistema POS y Control de Cajas Híbrido

Aplicación web integral de Punto de Venta (POS), control de turnos/arqueo ciego, estaciones multicaja, motor fiscal modular (IVA / IT), pagos mixtos, Kardex dual cronológico (NIC 2), combos/promociones, modificadores de recetas, reportes contables en Excel (10 hojas) y PDF, construida con **Next.js (App Router)** y **SQLite3**.

---

## Documentación

| Documento | Descripción |
| :--- | :--- |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diseño técnico, modelo de seguridad, base de datos, migraciones (v1-v11), régimen fiscal, Kardex dual, combos, multicaja y reportes. |
| [docs/PRUEBAS.md](docs/PRUEBAS.md) | Batería de 16 escenarios de verificación funcional, concurrencia, stock, arqueo, modificadores, combos, régimen fiscal, pagos mixtos y Kardex. |
| [GEMINI.md](GEMINI.md) | Reglas de negocio, directrices técnicas obligatorias y estado actual del proyecto (fuente de verdad para desarrollo y agentes). |

---

## Características Principales

- **Control de Turnos y Arqueo Ciego:** Apertura de caja, cobro reactivo con cálculo de cambio, conciliación separada de efectivo vs. QR, egresos documentados e inyección de sencillo (`ingreso_efectivo`). Cierre ciego con detección de descuadres (sobrante/faltante) y trazabilidad inmutable de reaperturas auditadas.
- **Multicaja y Estaciones Físicas:** Gestión de terminales físicas de cobro (`cajas_fisicas`) operando turnos independientes en paralelo, con protección de última caja activa y baja lógica protegida.
- **Régimen Tributario Modular y Snapshot Fiscal (v9-v11):** Soporte de Régimen Simplificado (control interno) y Régimen General con alícuotas configurables (IVA 13%, IT 3%, base IT configurable). Snapshot inmutable congelado en cada venta (`movimientos`), garantizando integridad histórica ante futuras reformas tributarias.
- **Pagos Mixtos Flexibles (Efectivo + QR):** Fuente de verdad normalizada en `movimientos_pagos`. Desglose exacto por método de pago con cálculo y entrega de cambio exclusivamente sobre la porción en efectivo.
- **Kardex Cronológico Dual y Costo Ponderado (NIC 2):** Trazabilidad completa de inventario en `movimientos_productos_directos` y `movimientos_insumos` con `stock_resultante` y `costo_promedio_resultante` en cada fila. Preservación de hasta 6 decimales en insumos métricos (g / ml) y función de auditoría matemática de integridad con 0 descuadres.
- **Combos y Paquetes Promocionales (v8):** Descomposición atómica de stock de componentes directos e insumos de recetas, con costeo dinámico en cascada, vigencia por fecha/hora y modo con límite de unidades restante o sin límite.
- **Personalización y Modificadores de Receta (v7):** Grupos de complementos con selección única o múltiple, obligatoriedad, recargos de precio y reemplazo inteligente de insumos (ej. Leche entera -> Almendras / Deslactosada), con auditoría congelada en `detalle_movimientos_modificadores`.
- **Reportes Contables y Exportación Multiformato:** Generación en servidor con `exceljs` de libro Excel `.xlsx` con 10 hojas contables (`Movimientos`, `Arqueos`, `Detalle Ventas CMV`, `Rentabilidad por Producto`, `Compras y Mermas`, `Inventario Kardex`, `Kardex Productos`, `Kardex Insumos`, `Historial Anulaciones` y `Resumen Contable`), exportación PDF con liquidación de impuestos y gráficos interactivos (`recharts`).
- **Notificaciones Automáticas por Correo:** Envío asíncrono vía SMTP (`nodemailer`) del resumen ejecutivo de arqueo al cerrar cada turno, con el libro oficial en Excel adjunto generado en caliente.
- **Seguridad Pre-Despliegue y Control de Sesiones:** Autenticación JWT en cookies `HttpOnly`, `INSTANCE_BOOT_ID` para purga de sesiones zombis al reiniciar, rate limiting dual (por IP con `TRUST_PROXY` y por cuenta), token maestro de instalación (`SETUP_TOKEN`) y validación perezosa de secretos (`instrumentation.js`).

---

## Estructura del Proyecto

```text
├── app/
│   ├── api/
│   │   ├── caja/route.js            # API principal de turnos, ventas, modificadores, combos, kardex y fiscal
│   │   └── reportes/route.js        # API de reportes, estadísticas y exportación (JSON, CSV, XLSX 10 hojas)
│   ├── admin/
│   │   ├── page.js                  # Panel de administración estructurado con pestañas y paginación
│   │   ├── GraficosFinancieros.js   # Métricas visuales interactivas con Recharts
│   │   └── exportarPDF.js           # Generación de reportes PDF de balance fiscal y auditoría con jsPDF
│   ├── caja/page.js                 # Interfaz POS de cajero (ventas táctiles, buscador, combos, modificadores)
│   ├── layout.js                    # Layout raíz de Next.js (protección notranslate contra Google Translate)
│   └── page.js                      # Pantalla de inicio de sesión
├── database/
│   ├── database.js                  # Conexión SQLite (WAL, busy_timeout, foreign_keys, DATABASE_PATH)
│   └── migraciones.js               # Esquema versionado transaccional (PRAGMA user_version v1-v11)
├── server/
│   ├── queries.js                   # Lógica de negocio, transacciones, kardex dual, combos y reportes Excel
│   ├── sesion.js                    # Gestión de sesiones JWT HttpOnly (jose) y TTL por rol
│   ├── mailer.js                    # Servicio SMTP (nodemailer) con plantillas y adjuntos en background
│   └── secretos.js                  # Validación de variables de entorno y secretos en producción
├── scripts/
│   ├── backup.js                    # Respaldo atómico en caliente (VACUUM INTO) con retención automática
│   ├── update.js                    # Actualización segura (backup previo + git pull + npm ci + build)
│   └── seed_cafeteria.js            # Sembrado integral v11 (Régimen General, Combos, Modificadores, Kardex)
├── docs/                            # Documentación técnica y batería de pruebas
├── .env.production.example          # Plantilla de variables de entorno para producción
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
   *Carga el catálogo completo de cafetería gourmet, recetas, insumos métricos, combos, grupos de modificadores, ventas con factura, pagos mixtos y verifica la integridad del Kardex.*

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
| `npm run seed` | Carga el seed integral de prueba (v11) con régimen fiscal, combos, modificadores, compras con factura, pagos mixtos y auditoría de Kardex. |
| `npm run backup` | Ejecuta un respaldo atómico en caliente en `backups/` con retención automática. |
| `npm run update` | Actualiza el sistema de forma segura: crea backup de `caja.db`, descarga cambios (`git pull`), instala versiones exactas (`npm ci`), compila y reinicia PM2 si está activo. |

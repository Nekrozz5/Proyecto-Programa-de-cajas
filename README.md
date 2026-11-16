# Sistema POS y Control de Cajas Híbrido

Aplicación web de Punto de Venta (POS), control de turnos/arqueo ciego, estaciones multicaja, modificadores y complementos de recetas, notificaciones automáticas por correo e inventario híbrido (productos libres, directos y por receta/escandallo), construida con **Next.js (App Router)** y **SQLite3**.

---

## Documentación

| Documento | Descripción |
| :--- | :--- |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diseño técnico, roles, seguridad de sesiones, base de datos, migraciones (v1-v7), multicaja, modificadores, inventario y correo. |
| [docs/PRUEBAS.md](docs/PRUEBAS.md) | Batería de 12 escenarios de verificación funcional, concurrencia, stock, arqueo, modificadores, multicaja, reportes y correo. |
| [GEMINI.md](GEMINI.md) | Reglas de negocio, reglas técnicas y estado actual del proyecto (fuente de verdad para desarrollo y agentes). |

---

## Características Principales

- **Control de Turnos y Arqueo Ciego:** Apertura de caja, cobro en efectivo con cálculo de cambio reactivo, pagos por QR conciliados independientemente, egresos documentados e inyección de sencillo (`ingreso_efectivo`). Cierre ciego con detección de descuadres (sobrante/faltante) y trazabilidad de reaperturas auditadas.
- **Multicaja y Estaciones Físicas:** Gestión de múltiples terminales físicas de cobro (`cajas_fisicas`) operando turnos independientes en simultáneo, con protección de última caja activa y baja lógica sin turnos en curso.
- **Inventario Híbrido y Costeo Ponderado (NIC 2):** Soporte de productos libres, unitarios directos y recetas (escandallo multi-insumo). Costo Promedio Ponderado en compras de insumos con actualización en cascada.
- **Personalización y Modificadores de Receta (v7):** Grupos de complementos con selección única o múltiple, obligatoriedad, recargos de precio y reemplazo inteligente de insumos (ej. Leche entera -> Leche de almendras o deslactosada), con descuento atómico de stock y congelamiento de costos en auditoría de ventas.
- **Navegación Ágil en Mostrador (POS):** Filtrado multi-categoría simultáneo o individual con contadores reactivos, reinicio automático post-venta, modales táctiles de personalización rápida e inputs reactivos con debounce.
- **Notificaciones Automáticas por Correo Electrónico:** Envío transparente y asíncrono vía SMTP (`nodemailer`) del resumen ejecutivo de arqueo al cerrar cada turno, con el libro oficial en Excel (`.xlsx`) generado en caliente adjunto.
- **Reportes Financieros y Exportación Multiformato:** Descarga de reportes en Excel (`exceljs`) con hojas diferenciadas (*Movimientos* y *Arqueos*), exportación en PDF (`jspdf` + `jspdf-autotable`) y exportación en CSV, además de gráficos interactivos (`recharts`).
- **Seguridad Pre-Despliegue y Control de Sesiones:** Autenticación JWT en cookies `HttpOnly`, `INSTANCE_BOOT_ID` para purga de sesiones zombis al reiniciar, rate limiting dual (por IP con `TRUST_PROXY` y por cuenta), token maestro de instalación (`SETUP_TOKEN`) y validación perezosa de secretos (`instrumentation.js`).

---

## Estructura del Proyecto

```text
├── app/
│   ├── api/
│   │   ├── caja/route.js            # API principal de turnos, ventas, modificadores, inventario y usuarios
│   │   └── reportes/route.js        # API de reportes, estadísticas y exportación (JSON, CSV, XLSX)
│   ├── admin/
│   │   ├── page.js                  # Panel de administración, catálogo, modificadores, compras y reportes
│   │   ├── GraficosFinancieros.js   # Métricas visuales interactivas con Recharts
│   │   └── exportarPDF.js           # Generación de reportes PDF de caja auditada con jsPDF
│   ├── caja/page.js                 # Interfaz POS de cajero (ventas táctiles, modificadores, arqueo ciego)
│   ├── layout.js                    # Layout raíz de Next.js (protección notranslate)
│   └── page.js                      # Pantalla de inicio de sesión
├── database/
│   ├── database.js                  # Conexión SQLite (WAL, busy_timeout, foreign_keys, DATABASE_PATH)
│   └── migraciones.js               # Esquema versionado transaccional (PRAGMA user_version v1-v7)
├── server/
│   ├── queries.js                   # Lógica de negocio, modificadores, transacciones y reportes Excel
│   ├── sesion.js                    # Gestión de sesiones JWT HttpOnly (jose) y TTL por rol
│   ├── mailer.js                    # Servicio SMTP (nodemailer) con plantillas y adjuntos en background
│   └── secretos.js                  # Validación de variables de entorno y secretos en producción
├── scripts/
│   ├── backup.js                    # Respaldo atómico en caliente (VACUUM INTO) con retención automática
│   ├── update.js                    # Actualización segura (backup previo + git pull + npm ci + build)
│   └── seed_cafeteria.js            # Sembrado completo con catálogo, recetas y modificadores v7
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

3. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   La base de datos (`caja.db`) y sus migraciones se inicializan automáticamente al arrancar. Abre [http://localhost:3000](http://localhost:3000).

---

## Comandos Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo de Next.js. |
| `npm run build` | Compila la aplicación para producción (`next build --webpack`). |
| `npm run start` | Inicia la aplicación compilada en modo producción. |
| `npm run backup` | Ejecuta un respaldo atómico en caliente en `backups/` con retención automática. |
| `npm run update` | Actualiza el sistema de forma segura: crea backup de `caja.db`, descarga cambios (`git pull`), instala versiones exactas (`npm ci`), compila y reinicia PM2 si está activo. |
| `npm run seed` | Carga datos de prueba completos de cafetería con productos, recetas, turnos y modificadores v7. |

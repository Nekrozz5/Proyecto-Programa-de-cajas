# Sistema POS y Control de Cajas Híbrido

Aplicación web de Punto de Venta (POS), control de turnos/arqueo ciego, estaciones multicaja, notificaciones automáticas por correo e inventario híbrido (productos libres, directos y por receta/escandallo), construida con **Next.js (App Router)** y **SQLite3**.

---

## Documentación

| Documento | Descripción |
| :--- | :--- |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diseño técnico, roles, seguridad de sesiones, base de datos, migraciones, multicaja, inventario, reportes y correo. |
| [docs/DEPLOY_AWS.md](docs/DEPLOY_AWS.md) | Guía paso a paso para despliegue en AWS Lightsail / EC2, Nginx, SSL, PM2, Docker, SMTP y respaldos en S3. |
| [docs/PRUEBAS.md](docs/PRUEBAS.md) | Batería de 10 escenarios de verificación funcional, concurrencia, stock, arqueo, multicaja, reportes y correo. |
| [GEMINI.md](GEMINI.md) | Reglas de negocio, reglas técnicas y estado actual del proyecto (fuente de verdad para desarrollo y agentes). |

---

## Características Principales

- **Control de Turnos y Arqueo Ciego:** Apertura de caja, cobro en efectivo con cálculo de cambio reactivo, pagos por QR conciliados independientemente, egresos documentados e inyección de sencillo (`ingreso_efectivo`). Cierre ciego con detección de descuadres (sobrante/faltante) y trazabilidad de reaperturas auditadas.
- **Multicaja y Estaciones Físicas:** Gestión de múltiples terminales físicas de cobro (`cajas_fisicas`) operando turnos independientes en simultáneo, con protección de última caja activa y baja lógica sin turnos en curso.
- **Inventario Híbrido y Costeo Ponderado (NIC 2):** Soporte de productos libres, unitarios directos y recetas (escandallo multi-insumo). Costo Promedio Ponderado en compras de insumos con actualización en cascada.
- **Notificaciones Automáticas por Correo Electrónico:** Envío transparente y asíncrono vía SMTP (`nodemailer`) del resumen ejecutivo de arqueo al cerrar cada turno, con el libro oficial en Excel (`.xlsx`) generado en caliente adjunto.
- **Reportes Financieros y Exportación Multiformato:** Descarga de reportes en Excel (`exceljs`) con hojas diferenciadas (*Movimientos* y *Arqueos*), exportación en PDF (`jspdf` + `jspdf-autotable`) y exportación en CSV, además de gráficos interactivos (`recharts`).
- **Seguridad Pre-Despliegue y Control de Sesiones:** Autenticación JWT en cookies `HttpOnly`, `INSTANCE_BOOT_ID` para purga de sesiones zombis al reiniciar, rate limiting dual (por IP con `TRUST_PROXY` y por cuenta), token maestro de instalación (`SETUP_TOKEN`) y validación perezosa de secretos (`instrumentation.js`).

---

## Estructura del Proyecto

```text
├── app/
│   ├── api/
│   │   ├── caja/route.js            # API principal de turnos, ventas, egresos, inventario y usuarios
│   │   └── reportes/route.js        # API de reportes, estadísticas y exportación (JSON, CSV, XLSX)
│   ├── admin/
│   │   ├── page.js                  # Panel de administración, catálogo, compras, auditoría y reportes
│   │   ├── GraficosFinancieros.js   # Métricas visuales interactivas con Recharts
│   │   └── exportarPDF.js           # Generación de reportes PDF de caja auditada con jsPDF
│   ├── caja/page.js                 # Interfaz POS de cajero (ventas, cambio, arqueo ciego)
│   ├── layout.js                    # Layout raíz de Next.js
│   └── page.js                      # Pantalla de inicio de sesión
├── database/
│   ├── database.js                  # Conexión SQLite (WAL, busy_timeout, foreign_keys, DATABASE_PATH)
│   └── migraciones.js               # Esquema versionado transaccional (PRAGMA user_version v1-v6)
├── server/
│   ├── queries.js                   # Lógica de negocio, transacciones atómicas y reportes Excel
│   ├── sesion.js                    # Gestión de sesiones JWT HttpOnly (jose) y TTL por rol
│   ├── mailer.js                    # Servicio SMTP (nodemailer) con plantillas y adjuntos en background
│   └── secretos.js                  # Validación de variables de entorno y secretos en producción
├── scripts/
│   ├── backup.js                    # Respaldo atómico en caliente (VACUUM INTO) + retención + S3
│   └── seed_cafeteria.js            # Datos de prueba para catálogo de cafetería
├── docs/                            # Documentación técnica, despliegue y pruebas
├── .env.production.example          # Plantilla de variables de entorno para producción
├── Dockerfile                       # Imagen Docker multi-stage optimizada
├── docker-compose.yml               # Orquestación con volúmenes persistentes (data/ y backups/)
├── ecosystem.config.js              # Configuración de PM2 para Linux
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
| `npm run backup` | Ejecuta un respaldo en caliente en `backups/` y sincroniza con S3 si está configurado. |
| `npm run seed` | Carga datos de prueba de catálogo y recetas de cafetería. |

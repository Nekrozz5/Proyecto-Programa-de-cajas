# Sistema POS y Control de Cajas Híbrido

Aplicación web de Punto de Venta (POS), control de turnos/arqueo ciego e inventario híbrido (productos libres, directos y por receta/escandallo), construida con **Next.js (App Router)** y **SQLite3**.

---

## Documentación

| Documento | Descripción |
| :--- | :--- |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diseño técnico, roles, seguridad de sesiones, base de datos, migraciones e inventario. |
| [docs/DEPLOY_AWS.md](docs/DEPLOY_AWS.md) | Guía paso a paso para despliegue en AWS Lightsail / EC2, Nginx, SSL, PM2, Docker y respaldos en S3. |
| [docs/PRUEBAS.md](docs/PRUEBAS.md) | Batería de 7 escenarios de verificación funcional, stock, arqueo y anulaciones. |
| [GEMINI.md](GEMINI.md) | Reglas de negocio, reglas técnicas y estado actual del proyecto (fuente de verdad para desarrollo). |

---

## Estructura del Proyecto

```text
├── app/
│   ├── api/
│   │   ├── caja/route.js        # API principal de turnos, ventas, egresos, inventario y usuarios
│   │   └── reportes/route.js    # API de reportes y estadísticas financieras
│   ├── admin/page.js            # Panel de administración, catálogo, compras y reportes
│   ├── caja/page.js             # Interfaz POS de cajero (ventas, cambio, arqueo ciego)
│   ├── layout.js                # Layout raíz de Next.js
│   └── page.js                  # Pantalla de inicio de sesión
├── database/
│   ├── database.js              # Conexión SQLite (WAL, busy_timeout, DATABASE_PATH)
│   └── migraciones.js           # Esquema versionado transaccional (PRAGMA user_version)
├── server/
│   ├── queries.js               # Lógica de negocio y consultas SQL parametrizadas
│   └── sesion.js                # Gestión de sesiones JWT HttpOnly (jose) y TTL por rol
├── scripts/
│   └── backup.js                # Respaldo atómico en caliente (VACUUM INTO) + retención + S3
├── docs/                        # Documentación técnica, despliegue y pruebas
├── .env.production.example      # Plantilla de variables de entorno para producción
├── Dockerfile                   # Imagen Docker multi-stage
├── docker-compose.yml           # Orquestación con volúmenes persistentes (data/ y backups/)
├── ecosystem.config.js          # Configuración de PM2 para Linux
└── next.config.js               # Configuración de Next.js (serverExternalPackages)
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
   DEVELOPER_PASSWORD=TuPasswordDeveloperLocal
   SESSION_SECRET=un_secreto_largo_para_desarrollo_local
   ```

3. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   La base de datos (`caja.db`) y sus migraciones se inicializan automáticamente al arrancar.

---

## Comandos Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo de Next.js. |
| `npm run build` | Compila la aplicación para producción (`next build --webpack`). |
| `npm run start` | Inicia la aplicación compilada en modo producción. |
| `npm run backup` | Ejecuta un respaldo en caliente en `backups/` y sincroniza con S3 si `S3_BUCKET` está configurado. |

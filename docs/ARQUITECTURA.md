# Arquitectura Técnica del Sistema

Este documento describe la arquitectura global del sistema POS, su modelo de seguridad, la estructura de base de datos relacional con SQLite3, el flujo multicaja, las notificaciones automáticas y las reglas financieras e inventariales implementadas.

---

## 1. Stack Tecnológico

- **Frontend / Fullstack:** Next.js 16 (App Router) con React 19.
- **Base de Datos:** SQLite3 local (`sqlite3@^6.0.1`) con SQL nativo parametrizado (`?`) sin ORMs.
- **Autenticación y Criptografía:** JWT firmado con `jose` (`^6.2.17`) en cookies `HttpOnly` (`pos_session`) y hash de contraseñas con `bcryptjs` (`^3.0.3`) (10 rondas de salt).
- **Reportes y Visualización:**
  - `exceljs` (`^4.4.0`): Generación en servidor de libros Excel `.xlsx` multi-hoja (*Movimientos* y *Arqueos de Caja*).
  - `jspdf` (`^4.2.1`) y `jspdf-autotable` (`^5.0.9`): Generación en cliente de reportes PDF de balance y auditoría de turno.
  - `recharts` (`^3.10.1`): Gráficos interactivos de métricas financieras en `/admin` (flujo horario, balance de 7 días, top productos, métodos de pago).
- **Servicio de Notificaciones:** `nodemailer` (`^10.5.0`): Envíos SMTP en segundo plano con plantilla HTML ejecutiva y adjuntos en caliente.
- **Despliegue, Actualización y Respaldos:** PM2 (`ecosystem.config.js`), actualización automatizada (`scripts/update.js`) y respaldo en caliente con `VACUUM INTO` (`scripts/backup.js`).
- **Blindaje Multi-Dispositivo:** Protección contra traducción automática del DOM (`notranslate` en `app/layout.js`) y encabezados `Cache-Control: no-store` en `/api/caja` para evitar datos obsoletos entre máquinas o tras actualizaciones.

---

## 2. Seguridad y Control de Sesiones (`server/sesion.js` y `server/secretos.js`)

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
- **Validación Temprana de Secretos (`instrumentation.js`):** El hook `register()` de Next.js ejecuta `validarEntornoArranqueProduccion()` al iniciar el servidor de producción. Si algún secreto obligatorio está ausente, usa valores por defecto o no cumple la longitud mínima requerida, aborta el arranque de inmediato con un mensaje descriptivo sin romper la fase de compilación (`next build`).
- **Cuenta `developer`:** Sincronizada automáticamente con la variable `DEVELOPER_PASSWORD` y oculta de los listados estándar de usuarios.

---

## 3. Base de Datos y Migraciones (`database/`)

- **`database/database.js`:**
  - Ruta de base de datos configurable mediante `DATABASE_PATH` (por defecto `./caja.db`).
  - Activa `PRAGMA foreign_keys = ON`.
  - Modo WAL (`PRAGMA journal_mode = WAL`) para lecturas concurrentes sin bloqueo.
  - `PRAGMA busy_timeout = 5000` para tolerar esperas de escritura sin bloqueos prematuros.
- **`database/migraciones.js`:**
  - Control de versión del esquema mediante `PRAGMA user_version` (versiones v1 a v6).
  - Migraciones atómicas e idempotentes ejecutadas automáticamente al arrancar la aplicación.
  - Historial de migraciones:
    - **v1:** Esquema inicial de cajas, usuarios, movimientos y detalle de movimientos.
    - **v2:** Módulo de insumos, compras con CPP, recetas de ensamble y configuración de negocio.
    - **v3:** Auditoría de reaperturas (`veces_reabierta`, `historial_reaperturas`).
    - **v4:** Tabla `categorias` para catálogo estructurado.
    - **v5:** Normalización multicategoría de productos y saneamiento de registros legados.
    - **v6:** Tabla `cajas_fisicas` (estaciones de cobro física/terminales) con vinculación a `cajas` (turnos).
- **Transacciones atómicas:** Toda mutación de negocio (aperturas, ventas, egresos, compras, cierres, anulaciones) corre dentro de `transaccion(async (dbTx) => { ... })` en `server/queries.js`.
- **Manejo de fechas:** Almacenadas en UTC (`CURRENT_TIMESTAMP`) y proyectadas con `'localtime'` en SQLite para filtros y visualización del usuario (`datetime(fecha_hora, 'localtime')`).

---

## 4. Reglas de Negocio Principales

### A. Estaciones Físicas de Caja y N° de Turno (`cajas_fisicas` vs `cajas`)
- **Estación Física (`cajas_fisicas`):** Representa el punto de cobro o terminal física en el local (ej. "Caja 1 - Principal", "Caja 2 - Barra").
- **Turno de Operación (`cajas`):** Representa una sesión contable con cajero asignado, fondo inicial y balance de cierre.
- **Multicaja simultánea:** El sistema permite que múltiples cajas físicas operen con turnos abiertos en simultáneo por distintos cajeros.
- **Regla de mínimo:** El negocio debe contar con al menos 1 caja física activa. No se puede desactivar la última terminal disponible.
- **Baja lógica protegida:** No se permite desactivar una caja física si tiene un turno actualmente abierto. Se utiliza baja lógica (`activa = 0`) para preservar históricos de ventas y arqueos.

### B. Arqueo Ciego e Inyecciones de Efectivo
- Solo se registran ventas y egresos en cajas con estado `'abierta'`.
- Al cerrar turno, el cajero ingresa `efectivo_real` sin ver previamente `efectivo_esperado`.
- Fórmula contable de arqueo:
  ```text
  efectivo_esperado = monto_inicial + ingresos_efectivo (ventas + inyecciones de cambio) - egresos_efectivo
  diferencia_efectivo = efectivo_real - efectivo_esperado
  ```
- **Inyecciones de sencillo (`ingreso_efectivo`):** Aumentan el efectivo físico esperado en cajón sin sumarse a las ventas de productos ni alterar los márgenes de utilidad.
- **Cobros por QR:** Se concilian aparte (`qr_esperado`) sin mezclarse con el dinero físico del cajón.
- **Reaperturas auditadas:** Reabrir una caja cerrada es una operación restringida que incrementa `veces_reabierta` y anexa un registro inmutable a `historial_reaperturas` (usuario responsable, fecha/hora y motivo documentado).

### C. Inventario Híbrido y Costo Promedio Ponderado (NIC 2)
- Modalidades de producto:
  - `'libre'`: Sin control de inventario (servicios, productos abiertos).
  - `'directo'`: Producto unitario de reventa con descuento atómico (`UPDATE ... WHERE stock >= ?`).
  - `'receta'`: Escandallo multi-insumo que descuenta insumos proporcionalmente y calcula disponibilidad dinámica en base al insumo limitante.
- Las compras de insumos actualizan el costo unitario mediante **Costo Promedio Ponderado (CPP)** y recalculan en cascada el costo de todos los productos y recetas asociados.
- `detalle_movimientos` congela `precio_unitario` y `costo_unitario` en el momento exacto de la venta para garantizar precisión histórica en reportes, métricas y reintegración por anulación.

### D. Cálculos Financieros
- `Ventas Totales = SUM(subtotal)` de ventas completadas.
- `Costo Total de Ventas = SUM(cantidad * costo_unitario)` (costos congelados por línea).
- `Ganancia Bruta = Ventas Totales - Costo Total de Ventas`.
- `Flujo Neto Operativo = Ganancia Bruta - Total Egresos`.

---

## 5. Servicio de Notificaciones por Correo (`server/mailer.js`)

- **Envío en Segundo Plano:** Al cerrarse un turno mediante `cerrarCaja` en `/api/caja`, se despacha una tarea asíncrona de notificación que no bloquea la respuesta HTTP al cajero.
- **Contenido Ejecutivo:**
  - Datos de cabecera: Nombre de la estación física, N° de Turno correlativo, cajero responsable y horario de apertura/cierre.
  - Resumen financiero: Ventas en Efectivo, Cobros QR, Inyecciones de Sencillo y Total Egresos.
  - Tarjeta de Arqueo destacada: Efectivo Esperado vs. Contado Real, con indicación visual de Estado (Cuadrado exacto, Sobrante o Faltante).
- **Adjunto Oficial Excel:** Genera en caliente con `exceljs` el libro oficial (`Reporte_Turno_XX.xlsx`) y lo anexa al correo electrónico.
- **Resiliencia:** Si las credenciales SMTP no están configuradas o el servidor de correo no responde, el cierre de caja concluye exitosamente en la base de datos y se registra una advertencia en el log del servidor.
- **Control Administrativo:**
  - El panel `/admin` muestra el estado de configuración del servicio de correo.
  - Permite enviar un correo de prueba de diagnóstico.
  - Permite reenviar bajo demanda el reporte oficial por correo de cualquier turno previamente cerrado.

---

## 6. Respaldos Atómicos (`scripts/backup.js`)

El comando `npm run backup`:
1. Ejecuta `VACUUM INTO` sobre la base de datos activa (copia atómica en caliente sin detener el POS ni interrumpir ventas).
2. Guarda el archivo en la carpeta `backups/` con marca de tiempo local.
3. Purga automáticamente copias antiguas manteniendo las últimas `MAX_BACKUPS_LOCAL` (30 por defecto).

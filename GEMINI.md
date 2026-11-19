# Contexto del Proyecto: Sistema POS y Control de Cajas Híbrido

## 1. Arquitectura y Punteros de Contexto
- **Stack Principal:** Next.js (App Router), Node.js, Tailwind CSS, Shadcn UI (`components/ui/`), SQLite3 local (`caja.db`) y Drizzle ORM (`database/schema.js`).
- **Persistencia y Concurrencia:** SQLite en modo WAL (`PRAGMA journal_mode = WAL`), claves foráneas activas (`PRAGMA foreign_keys = ON`), timeout concurrente de 5000ms (`PRAGMA busy_timeout = 5000`) y ruta configurable vía `DATABASE_PATH` en `database/database.js`.
- **Esquema Tipado y Migraciones:** 20 tablas definidas en `database/schema.js`. Toda mutación al esquema se versiona transaccionalmente en `database/migraciones.js` mediante `PRAGMA user_version` con respaldo automático previo (`VACUUM INTO`).
- **Seguridad y Sesiones (`server/lib/sesion.js`):** JWT HttpOnly (`jose`), hash bcrypt (salt 10). `INSTANCE_BOOT_ID` para invalidación inmediata de tokens administrativos al reiniciar servidor. TTL: `developer` (15 min), `propietario`/`admin` (30 min), `user` (8 h). Rate limiting dual (IP con `cf-connecting-ip`/`TRUST_PROXY` y cuenta).
- **Operación Dual (Híbrida):** Soporte simultáneo para PC local/LAN (`http://localhost:3000`) y acceso móvil remoto (`https://` vía Cloudflare Tunnel) con cookies adaptativas y blindaje cliente (`notranslate` en `app/layout.js`, `Cache-Control: no-store` en endpoints de caja).
- **Licenciamiento Criptográfico Offline:** Validación asimétrica Ed25519 en `server/lib/licencia.js` con claves firmadas `POS-ACT-...`.
- **Punteros Documentales:**
  - Arquitectura detallada y diagramas de flujo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
  - Batería de escenarios de verificación funcional: [`docs/PRUEBAS.md`](docs/PRUEBAS.md).
  - Guía de desarrollo y convenciones: [`GUIA_DESARROLLO.md`](GUIA_DESARROLLO.md).

## 2. Reglas de Negocio Inmutables
- **Roles y Permisos:**
  - `user` (Cajero): Opera turnos de caja, ventas (efectivo/QR/mixto), egresos e ingresos de cambio con motivo obligatorio.
  - `admin` (Administrador): Gestión de catálogo (unitario/receta/combo/libre), compras con CPP, bajas lógicas de usuarios (`activo = 0`), anulación de ventas con restitución de inventario y reportes financieros.
  - `propietario`: Máximo nivel de administración y auditoría del negocio. En interfaz figura como "Propietario(a)".
  - `developer` (Oculto): Perfil técnico reservado para diagnóstico, mantenimiento y migraciones de datos. Credenciales en `.env.local` (`DEVELOPER_PASSWORD`).
- **Configuración Singleton (`configuracion_negocio`):** Registro único (`id = 1`) que gobierna nombre del local, régimen fiscal y banderas funcionales: `usa_stock_directo`, `usa_vencimiento`, `usa_recetas_ensamblaje` y `habilita_apps_comida`.
- **Cajas Físicas vs. Turnos Operativos:**
  - Separación entre estación física (`cajas_fisicas`) y turno de trabajo (`cajas`).
  - Mínimo 1 caja física activa requerida. No desactivar una caja física con turno abierto. Baja lógica (`activa = 0`). Soporte de turnos multicaja simultáneos.
- **Arqueo Ciego e Inyecciones de Efectivo:**
  - Al cerrar turno, el cajero declara `efectivo_real` sin conocer el monto teórico.
  - Cálculo: `efectivo_esperado = monto_inicial + ingresos_efectivo (ventas + inyecciones cambio) - egresos_efectivo`.
  - Inyecciones de sencillo (`ingreso_efectivo`): incrementan efectivo físico esperado; no computan en ventas ni en utilidades.
  - Conciliación de QR (`qr_esperado`) desacoplada del cajón físico.
- **Reaperturas Auditadas de Caja:**
  - Acción restringida. Incrementa `veces_reabierta` y anexa registro a `historial_reaperturas` (usuario, timestamp, motivo justificado).
- **Inventario Híbrido y Costo Promedio Ponderado (NIC 2):**
  - Tipos: `libre`, `directo` (reventa), `receta` (escandallo multi-insumo) y `combo` (paquetes).
  - Compras recalculan costo unitario ponderado y propagan en cascada a recetas y combos vinculados.
  - `detalle_movimientos` congela `precio_unitario` y `costo_unitario` al momento exacto de la venta.
- **Combos y Promociones:**
  - Descomposición atómica de stock: descuenta insumos de recetas o unidades directas agrupando ingredientes compartidos.
  - Disponibilidad en POS: mínimo entre stock físico disponible y `limite_unidades_restante`.
  - Anulaciones atómicas: restituyen stock y reingresan unidades al cupo del combo.
- **Grupos de Modificadores y Sustitución de Insumos:**
  - Reemplazo de recetas (`insumo_reemplazado_id`): descuenta insumo base y añade el sustituto recalculando costo y stock atómicamente.
  - Adicionales y variantes operativas congelan costo y precio adicional en `detalle_movimientos_modificadores`.
- **Cálculo Financiero y Prorrateo de Descuentos:**
  - `Ventas Totales = SUM(monto)` de ventas completadas.
  - `CMV = SUM(cantidad * costo_unitario)` congelado.
  - `Ganancia Bruta = Ventas Totales - CMV`.
  - `Flujo Neto = Ganancia Bruta - Egresos`.
  - Prorrateo de descuentos: distribuye `descuento_total` proporcionalmente entre las líneas de venta absorbiendo el residuo en la última línea, garantizando `SUM(ingresos_netos) === Ventas Totales`.
  - Pagos mixtos (`metodo_pago = 'mixto'`): desglose exacto en `movimientos_pagos`. Vuelto calculado exclusivamente sobre el efectivo.
- **Snapshot Fiscal Inmutable:**
  - Cada venta/egreso congela alícuotas y montos de impuestos en `movimientos` (`regimen_tributario`, `iva_porcentaje`, `it_porcentaje`, `iva_monto`, `it_monto`).
  - Régimen `simplificado_control_interno`: alícuotas en 0; prohíbe emisión de factura.
  - Régimen `regimen_general`: cálculo de IVA Débito/Crédito e IT configurable sobre todas las ventas o solo facturadas.
- **Kardex Dual y Trazabilidad PEPS:**
  - Registro cronológico en `movimientos_productos_directos` y `movimientos_insumos` con `stock_resultante` y `costo_promedio_resultante`.
  - Lotes perecederos en `producto_lotes`: política de salida automática PEPS/FIFO (`ORDER BY fecha_vencimiento ASC, id ASC`) con validación atómica `WHERE stock >= ?`.
- **Delivery y Canales Externos:**
  - Registro de canal (`local`, `delivery_propio`, `pedidos_ya`, `yango`) y métodos de pago de apps desacoplados del arqueo de efectivo.
- **Alertas por Correo SMTP:**
  - Configuración dinámica en `configuracion_smtp` y destinatarios validados por PIN en `notificacion_destinatarios`. Despacho asíncrono de cierre de caja con Excel adjunto.

## 3. Restricciones Técnicas Operativas
- **Atomicidad en Escrituras:** Toda mutación de datos debe residir dentro de `transaccion(async (dbTx) => { ... })` (`server/repositories/db.js`).
- **Prevención de Stock Negativo:** Descontar existencias con cláusulas atómicas verificables (ej. `WHERE stock >= ?`).
- **Resolución de Sesión en Servidor:** Autorización resuelta exclusivamente desde el token validado en servidor (`server/lib/sesion.js`), nunca por parámetros enviados desde el cliente.
- **Políticas de Contraseñas:** Hash bcrypt (mínimo 10 rounds). Mínimo 8 caracteres para administradores/developers y 4 para cajeros. Prohibidas credenciales fijas en código.
- **Validación de Caja Abierta y Valores Monetarios:** Movimientos solo permitidos en cajas en estado `'abierta'`. Montos y cantidades monetarias estrictamente mayores a cero (`> 0`).
- **Manejo de Fechas:** Almacenamiento en UTC (`CURRENT_TIMESTAMP`). Consultas y filtros orientados al usuario siempre con `'localtime'` en SQLite (ej. `datetime(fecha_hora, 'localtime')`).
- **Mutación del Esquema:** Modificaciones exclusivas vía `database/migraciones.js` incrementando `PRAGMA user_version`. Si un rediseño local en desarrollo es incompatible, está autorizado el reinicio limpio de `caja.db`.

## 4. Flujo de Trabajo y Modos de Ejecución [ON-DEMAND-ONLY]
Para maximizar la densidad de información y el ahorro de tokens, las siguientes tareas se rigen por activación estricta bajo demanda:
- **Git y Control de Versiones [ON-DEMAND-ONLY]:**
  - La IA **nunca** ejecuta `git add` ni `git commit` de forma automática tras cambios rutinarios. Solo interviene en Git ante solicitud explícita del usuario (ej. *"haz commit"*, *"prepara el repositorio"*, *"sube a github"*).
  - Operaciones remotas autenticadas (`git push`, subida de ramas/tags) son **exclusivas del usuario humano**. La IA proporciona únicamente el comando exacto.
  - **Versionamiento Semántico (SemVer) Obligatorio en Subidas:** Cada vez que el usuario pida subir cambios a GitHub o preparar el repositorio, la IA debe evaluar e incrementar obligatoriamente la versión según SemVer (`MAJOR.MINOR.PATCH`) sincronizando de forma simultánea:
    1. `package.json` (`"version": "X.Y.Z"`)
    2. `installer/pos-cajas.iss` (`#define MyAppVersion "X.Y.Z"` y `OutputBaseFilename=Setup-POS-Cajas-vX.Y.Z`)
- **Compilación de Instaladores [ON-DEMAND-ONLY]:**
  - Actualizar números de versión en archivos fuente; **nunca** compilar el instalador (`npm run installer:build`, `ISCC.exe` o `scripts/preparar-dist.js`) automáticamente. Solo ejecutarlo ante orden expresa del usuario (ej. *"compila el instalador"*, *"genera el setup"*).
- **Diagnósticos y Suites de Pruebas [ON-DEMAND-ONLY]:**
  - La IA no ejecuta suites de estrés ni compilaciones pesadas de verificación tras cada ajuste menor. Solo se ejecutan cuando el usuario lo solicite (ej. *"ejecuta las pruebas"*, *"busca bugs"*).
- **Planificación Estructurada (`phase-planner`):**
  - Ante nuevas funcionalidades o refactorizaciones extensas, invocar `.agents/skills/phase-planner/SKILL.md` para segmentar el trabajo en fases atómicas con prompt quirúrgico, archivos acotados y criterios de aceptación verificables.

## 5. Comandos del Entorno
- **Desarrollo:** `npm run dev` (abre en `http://localhost:3000`).
- **Compilación y Producción:** `npm run build` | `npm run start` | `pm2 start ecosystem.config.js`.
- **Respaldo Atómico SQLite:** `npm run backup` (ejecuta `VACUUM INTO backups/`).
- **Actualización Segura:** `npm run update` (backup + git pull + npm ci + build).
- **Carga de Datos de Prueba:** `npm run seed` (lotes PEPS, combos, Kardex dual, régimen fiscal).
- **Simulación Integral E2E:** `npm run simular`.
- **Licenciamiento CLI (Ed25519):**
  ```bash
  npm run licencia -- emitir --negocio "Nombre" --vence "2028-12-31" --cajas 2
  npm run licencia -- verificar --clave "POS-ACT-..."
  ```
- **Empaquetado Instalador Windows:** `npm run dist:prepare`.
- **Control de Servicio Windows:** `npm run app:start` | `npm run app:stop`.

## 6. Variables Críticas de Entorno (`.env.local`)
```env
NODE_ENV=development
PORT=3000
DATABASE_PATH=./caja.db
SESSION_SECRET=<hash_hex_min_32_chars>
DEVELOPER_PASSWORD=<clave_acceso_tecnico>

# SMTP Opcional (o configurable dinámicamente en BD):
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=465
# SMTP_SECURE=true
# SMTP_USER=correo@dominio.com
# SMTP_PASS=app_password
```

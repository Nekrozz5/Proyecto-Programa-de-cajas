# Contexto del Proyecto: Sistema POS y Control de Cajas Híbrido

## 0. Protocolo de Entrada Obligatorio: Verificación de Modelo y Fases [GATEWAY-CHECK]
Ante **CUALQUIER** solicitud de investigación, análisis, planificación, nueva funcionalidad o refactorización, la IA debe ejecutar este protocolo como primer paso ineludible:
1. **Paso 1 (Lectura Mandatoria):** Leer y aplicar las pautas de [`.agents/skills/phase-planner/SKILL.md`](.agents/skills/phase-planner/SKILL.md).
2. **Paso 2 (Evaluación de Adecuación de Modelo y Esfuerzo):**
   - Identificar el modelo activo en el chat y su nivel de razonamiento (`Low`, `Medium`, `High`, `XHigh`).
   - Evaluar si el modelo actual es **idóneo**, **excesivo (quema tokens en vano)** o **insuficiente (riesgo de alucinación)** para la tarea solicitada.
3. **Paso 3 (Confirmación Previa al Desarrollo):**
   - **Si el modelo es idóneo:** Incluir obligatoriamente al inicio de la respuesta una breve confirmación:
     > 🛡️ **[Validación de Modelo]:** *Confirmado: [Nombre del Modelo] ([Nivel]) es el modelo idóneo para esta tarea de [investigación/desarrollo/planificación].*
     Y luego proceder inmediatamente con el desarrollo o desglose.
   - **Si existe desajuste de modelo (Overkill o Underpowered):** **DETENERSE INMEDIATAMENTE**. No elaborar la solución en ese turno. Explicar al usuario por qué el modelo actual no es óptimo, sugerir la alternativa ideal (ej. cambiar a *Flash/Neon* para ahorrar cuota, o delegar a subagente `research`), y **solicitar confirmación expresa al usuario** antes de comenzar.

## 1. Arquitectura y Punteros de Contexto
- **Stack Principal:** Next.js (App Router), Node.js, Tailwind CSS, Shadcn UI (`components/ui/`), SQLite3 local (`caja.db`) y Drizzle ORM (`database/schema.js`).
- **Persistencia y Concurrencia:** SQLite en modo WAL (`PRAGMA journal_mode = WAL`), claves foráneas activas (`PRAGMA foreign_keys = ON`), timeout concurrente de 5000ms (`PRAGMA busy_timeout = 5000`) y ruta configurable vía `DATABASE_PATH` en `database/database.js`.
- **Esquema Tipado y Migraciones:** 20 tablas definidas en `database/schema.js`. Toda mutación al esquema se versiona transaccionalmente en `database/migraciones.js` mediante `PRAGMA user_version` con respaldo automático previo (`VACUUM INTO`).
- **Seguridad y Sesiones (`server/lib/sesion.js`):** JWT HttpOnly (`jose`), hash bcrypt (salt 10). `INSTANCE_BOOT_ID` para invalidación inmediata de tokens administrativos al reiniciar servidor. TTL: `developer` (15 min), `propietario`/`admin` (30 min), `user` (8 h). Rate limiting dual (IP con `cf-connecting-ip`/`TRUST_PROXY` y cuenta).
- **Operación Cloud (AWS):** Despliegue en AWS con soporte para acceso desde PC y dispositivos móviles con cookies adaptativas y blindaje cliente (`notranslate` en `app/layout.js`, `Cache-Control: no-store` en endpoints de caja).
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
  - **Versionamiento Semántico (SemVer) Obligatorio en Subidas:** Cada vez que el usuario pida subir cambios a GitHub o preparar el repositorio, la IA debe evaluar e incrementar obligatoriamente la versión según SemVer (`MAJOR.MINOR.PATCH`) en `package.json` (`"version": "X.Y.Z"`).
- **Diagnósticos y Suites de Pruebas [ON-DEMAND-ONLY]:**
  - La IA no ejecuta suites de estrés ni compilaciones pesadas de verificación tras cada ajuste menor. Solo se ejecutan cuando el usuario lo solicite (ej. *"ejecuta las pruebas"*, *"busca bugs"*).
- **Planificación Estructurada y Presupuesto de Modelos (`phase-planner`):**
  - Ante nuevas funcionalidades o refactorizaciones extensas, invocar `.agents/skills/phase-planner/SKILL.md` para segmentar el trabajo en fases atómicas con prompt quirúrgico, archivos acotados y criterios de aceptación verificables.
  - **Asignación Racional de Modelo y Agente por Fase (Cero Quema Inútil de Tokens):** Cada fase planificada debe declarar obligatoriamente:
    1. **Modelo y Esfuerzo de Pensamiento (`Low` / `Medium` / `High`):** Adaptado a la complejidad de la tarea y a la disponibilidad de cuota (diaria vs. semanal). Para tareas mecánicas, estilos o scripts directos usar *Gemini 3.8 Flash (Low/Medium)* o *Gemini 4 Neon (Low)*. Reservar modelos de cuota semanal y alto razonamiento (*Gemini 4 Argon*, *Claude Opus*) estrictamente para arquitectura crítica o bugs complejos.
    2. **Agente / Entorno de Ejecución:** Indicar si se ejecuta directo en el chat o mediante subagente (ej. `research` para lectura masiva de archivos sin saturar el contexto principal; `browser` para pruebas visuales en navegador).
    3. **Detección Activa de Desajuste y Confirmación:** Si el modelo configurado en el chat es excesivo (ej. Argon/Opus High para maquetación o scripts sencillos) o insuficiente (ej. Flash Low para concurrencia o arquitectura crítica), la IA debe advertir proactivamente el desajuste, sugerir el cambio al modelo/agente idóneo y solicitar confirmación al usuario antes de proceder con la ejecución.

## 5. Comandos del Entorno
- **Desarrollo:** `npm run dev` (abre en `http://localhost:3000`).
- **Compilación y Producción:** `npm run build` | `npm run start` | `pm2 start ecosystem.config.js`.
- **Respaldo Atómico SQLite:** `npm run backup` (ejecuta `VACUUM INTO backups/`).
- **Carga de Datos de Prueba:** `npm run seed` (lotes PEPS, combos, Kardex dual, régimen fiscal).
- **Simulación Integral E2E:** `npm run simular`.

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

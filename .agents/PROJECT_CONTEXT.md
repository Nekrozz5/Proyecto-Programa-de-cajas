# Contexto del Proyecto para Codex: Sistema POS y Control de Cajas (Cloud / AWS)

## 0. Protocolo de Entrada Obligatorio: Verificación de Modelo y Fases [GATEWAY-CHECK]
Ante solicitudes de investigación, análisis, planificación o diseño, Codex debe ejecutar este protocolo como primer paso ineludible:
1. **Paso 1 (Lectura Mandatoria):** Leer y aplicar las pautas de [`skills/phase-planner/SKILL.md`](skills/phase-planner/SKILL.md).
2. **Paso 2 (Evaluación de Adecuación de Modelo y Esfuerzo):**
   - Identificar el modelo activo y su nivel de razonamiento (`low`, `medium`, `high`, `xhigh`, `max` o `ultra`) solo cuando el runtime de Codex los exponga.
   - Si el identificador exacto o el esfuerzo no están visibles, declararlo como `no expuesto`; nunca inferir nombres o niveles.
   - Evaluar si el modelo actual es **idóneo**, **excesivo (quema tokens en vano)** o **insuficiente (riesgo de alucinación)** para la tarea solicitada.
3. **Paso 3 (Confirmación Previa a la Elaboración):**
   - **Si el modelo es idóneo:** Incluir obligatoriamente al inicio de la respuesta una breve confirmación:
     > 🛡️ **[Validación de Modelo]**: *Confirmado: [modelo visible o familia Codex] ([esfuerzo visible o no expuesto]) es adecuado para esta tarea de [investigación/desarrollo/planificación].*
     Y luego proceder inmediatamente con el desarrollo o desglose.
   - **Si existe desajuste de modelo:** **DETENERSE INMEDIATAMENTE**. No elaborar la solución en ese turno. Explicar por qué el modelo actual no es óptimo, sugerir una alternativa disponible en Codex y **solicitar confirmación expresa** antes de comenzar.

Para tareas de ejecución —código, correcciones, migraciones o pruebas— no solicitar verificación de modelo ni lectura de `phase-planner`; consultar este contexto solo cuando el alcance lo requiera.

## 1. Arquitectura y Punteros de Contexto
- **Stack Principal:** Next.js (App Router), Node.js, Tailwind CSS y Shadcn UI (`components/ui/`). PostgreSQL es el único motor de persistencia y `pg` es su cliente.
- **Persistencia y Concurrencia:** `database/postgres.js` administra pools por URL. El registro central vive en la base de control. Cada negocio tiene su propia base operativa y las transacciones se vinculan al contexto del tenant.
- **Esquema y Migraciones:** `database/migraciones-control.js` configura el registro central. `database/migraciones-tenant.js` aplica cambios operativos de forma transaccional y registra cada versión en `schema_migrations`.
- **Seguridad y Sesiones (`server/lib/sesion.js`):** JWT HttpOnly (`jose`), hash bcrypt (salt 10). `INSTANCE_BOOT_ID` para invalidación inmediata de tokens administrativos al reiniciar servidor. TTL: `developer` (15 min), `propietario`/`admin` (30 min), `user` (8 h). Rate limiting dual (IP con `cf-connecting-ip`/`TRUST_PROXY` y cuenta).
- **Operación Cloud (AWS):** Despliegue en AWS con soporte para acceso desde PC y dispositivos móviles con cookies adaptativas y blindaje cliente (`notranslate` en `app/layout.js`, `Cache-Control: no-store` en endpoints de caja). Si el servidor MCP de AWS no está conectado, no intentes usar `aws___search_documentation` ni `aws___retrieve_skill`; usa la documentación oficial de AWS.
- **Punteros Documentales:**
  - Arquitectura detallada y diagramas de flujo: [`docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md).
  - Batería de escenarios de verificación funcional: [`docs/PRUEBAS.md`](../docs/PRUEBAS.md).
  - Guía de desarrollo y convenciones: [`GUIA_DESARROLLO.md`](../GUIA_DESARROLLO.md).
  - Para revisar migraciones y consultas SQL, usar `supabase-postgres-best-practices`. Las reglas de RLS y auth de Supabase NO aplican: este proyecto usa aislamiento por tenant en la aplicación.

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
  - Lotes perecederos en `producto_lotes`: política de salida automática PEPS/FIFO (`ORDER BY fecha_vencimiento ASC, id ASC`) con validación atómica `WHERE stock >= $1`.
- **Delivery y Canales Externos:**
  - Registro de canal (`local`, `delivery_propio`, `pedidos_ya`, `yango`) y métodos de pago de apps desacoplados del arqueo de efectivo.
- **Alertas por Correo SMTP:**
  - Configuración dinámica en `configuracion_smtp` y destinatarios validados por PIN en `notificacion_destinatarios`. Despacho asíncrono de cierre de caja con Excel adjunto.

## 3. Restricciones Técnicas Operativas
- **Atomicidad en Escrituras:** Toda mutación de datos debe residir dentro de `transaccion(async (dbTx) => { ... })` (`server/repositories/db.js`).
- **Prevención de Stock Negativo:** Descontar existencias con cláusulas atómicas verificables (ej. `WHERE stock >= $1`).
- **Resolución de Sesión en Servidor:** Autorización resuelta exclusivamente desde el token validado en servidor (`server/lib/sesion.js`), nunca por parámetros enviados desde el cliente.
- **Políticas de Contraseñas:** Hash bcrypt (mínimo 10 rounds). Mínimo 8 caracteres para administradores/developers y 4 para cajeros. Prohibidas credenciales fijas en código.
- **Validación de Caja Abierta y Valores Monetarios:** Movimientos solo permitidos en cajas en estado `'abierta'`. Montos y cantidades monetarias estrictamente mayores a cero (`> 0`).
- **Manejo de Fechas:** Los instantes se almacenan como `TIMESTAMPTZ`. Los períodos de reporte y la presentación al usuario usan `America/La_Paz`.
- **Mutación del Esquema:** Agregar una migración para cada cambio operativo en `database/migraciones-tenant.js`. Los cambios del registro central se aplican en `database/migraciones-control.js`.

## 4. Flujo de Trabajo y Modos de Ejecución [ON-DEMAND-ONLY]
Para maximizar la densidad de información y el ahorro de tokens, las siguientes tareas se rigen por activación estricta bajo demanda:
- **Git y Control de Versiones [ON-DEMAND-ONLY]:**
  - La IA **nunca** ejecuta `git add` ni `git commit` de forma automática tras cambios rutinarios. Solo interviene en Git ante solicitud explícita del usuario (ej. *"haz commit"*, *"prepara el repositorio"*, *"sube a github"*).
  - Operaciones remotas autenticadas (`git push`, subida de ramas/tags) son **exclusivas del usuario humano**. La IA proporciona únicamente el comando exacto.
  - **Versionamiento Semántico (SemVer) Obligatorio en Subidas:** Cada vez que el usuario pida subir cambios a GitHub o preparar el repositorio, la IA debe evaluar e incrementar obligatoriamente la versión según SemVer (`MAJOR.MINOR.PATCH`) en `package.json` (`"version": "X.Y.Z"`).
- **Diagnósticos, Compilación y Servidor [ON-DEMAND-ONLY]:**
  - La IA **nunca** ejecuta `npm run test`, `npm run test:*`, `npm run simular`, `npm run build`, `npm run dev` ni `next dev` / `next build` / `next start` por iniciativa propia (tampoco tras cambios grandes). Solo se ejecutan ante orden explícita del usuario; de lo contrario, se sugiere únicamente el comando exacto al final.
- **Planificación Estructurada y Presupuesto de Modelos (`phase-planner`):**
  - Ante nuevas funcionalidades o refactorizaciones extensas, invocar `.agents/skills/phase-planner/SKILL.md` para segmentar el trabajo en fases atómicas con prompt quirúrgico, archivos acotados y criterios de aceptación verificables.
  - **Asignación Racional de Modelo y Agente por Fase (Cero Quema Inútil de Tokens):** Cada fase planificada debe declarar obligatoriamente:
    1. **Modelo y Esfuerzo de Pensamiento:** Adaptados a la complejidad y al catálogo de modelos que Codex exponga en la sesión. Usar una variante rápida con esfuerzo `low`/`medium` para tareas mecánicas; reservar una variante de razonamiento avanzado con `high`/`xhigh` para arquitectura crítica o bugs complejos.
    2. **Modo de Ejecución:** Ejecutar directamente en el chat por defecto. Delegar solo cuando el usuario lo pida o una instrucción de mayor prioridad lo autorice; los nombres de subagentes son tareas descriptivas, no capacidades fijas como `research` o `browser`.
    3. **Detección Activa de Desajuste y Confirmación:** Si el modelo configurado es excesivo o insuficiente, advertir el desajuste, sugerir una alternativa realmente disponible y solicitar confirmación antes de proceder.

## 5. Comandos del Entorno
- **Desarrollo:** `npm run dev` y abrir el subdominio del tenant, por ejemplo `http://cafeteria.localhost:3000`.
- **Compilación y Producción:** `npm run build` | `npm run start` | `pm2 start ecosystem.config.js`.
- **Respaldo PostgreSQL:** `npm run backup -- <slug>` usa `pg_dump` para generar un archivo en `backups/`.
- **Carga de Datos de Prueba:** `npm run seed` (lotes PEPS, combos, Kardex dual, régimen fiscal).
- **Simulación Integral E2E:** `npm run simular`.
- **Pruebas completas:** `npm run test:all` con `POSTGRES_TEST_URL` y un rol con permiso `CREATEDB`.

## 6. Variables Críticas de Entorno (`.env.local`)
```env
NODE_ENV=development
PORT=3000
TENANCY_MODE=AWS_MULTI_TENANT
TENANT_HOST_SUFFIX=localhost
CONTROL_DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/control_plane
TENANT_DATABASE_URLS_JSON={"cafeteria":"postgresql://usuario:contraseña@localhost:5432/negocio_001"}
PG_SSL=false
SESSION_SECRET=<hash_hex_min_32_chars>
DEVELOPER_PASSWORD=<clave_acceso_tecnico>

# SMTP Opcional (o configurable dinámicamente en BD):
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=465
# SMTP_SECURE=true
# SMTP_USER=correo@dominio.com
# SMTP_PASS=app_password
```

## 7. Entorno WSL (Único Workspace Autorizado)
- **Workspace exclusivo:** operar únicamente sobre `/home/jairo/proyectos/programa-cajas` en WSL (Linux).
- **Prohibido operar en el checkout de Windows** (`/mnt/c/Users/monta/OneDrive/Desktop/programa-cajas` o rutas `C:\...`); si la sesión está fuera de `/home/jairo/proyectos/programa-cajas` o en Windows, detenerse y avisar al usuario sin modificar archivos.
- Docker funciona mediante Docker Desktop + integración WSL; validar con `docker info`.
- Desde WSL, usar `aws.exe` si el AWS CLI no está instalado en Linux.
- Región AWS del proyecto: `us-east-2`.
- Verificación mínima antes de operaciones cloud: `docker info` y `aws.exe sts get-caller-identity`.
- Usar `deploy/push-ecr.sh` para publicar imágenes desde WSL (no usar `deploy/*.ps1` salvo petición explícita).

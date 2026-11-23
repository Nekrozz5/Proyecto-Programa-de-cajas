# Revisión de seguridad y endurecimiento

Fecha: 2026-11-23
Rama: `codex/seguridad-endurecimiento`

## Estado resumido

- **Tarea 1 — SMTP:** resuelta en código. Las contraseñas nuevas se guardan con AES-256-GCM, la UI no reenvía la máscara y la migración 4 cifra valores legacy dentro de la transacción. Si falta `SMTP_ENCRYPTION_KEY`, guardar o enviar falla.
- **Tarea 2 — developer por tenant:** resuelta en código. Se genera una credencial aleatoria por tenant, se conserva al repetir y se rota solo con `--rotar-developer`. `DEVELOPER_PASSWORD` sigue aceptándose como valor inicial explícito y queda marcada como obsoleta.
- **Tarea 3 — límites persistentes:** resuelta en código y verificada en aislamiento PostgreSQL. Los contadores y pruebas de dispositivo viven en las tablas de la migración 4; el límite por cuenta no depende de la IP cuando `TRUST_PROXY` no es `true`.
- **Tarea 4 — sesiones admin:** resuelta en código y verificada parcialmente por la suite de aislamiento. Se usa `sesiones_admin` con `sid`, expiración y revocación; el token de cajero conserva la validación de dispositivo existente.
- **Tarea 5 — listado público:** resuelta en código: solo se listan cajeros activos con id, nombre y nombre de usuario, y `/api/caja` aplica límite persistente por IP cuando el proxy es confiable.
- **Tarea 6 — dependencias:** revisada. `npm audit --omit=dev` reporta 6 vulnerabilidades moderadas transitivas. Las únicas correcciones ofrecidas requieren `--force` y cambios mayores (`shadcn@1.0.0` y `exceljs@3.4.0`); no se aplicaron.

## Cambios principales

1. `server/lib/cifrado-smtp.js` implementa AES-256-GCM y valida una clave de 32 bytes en hex o base64.
2. `configuracion_smtp.password` se cifra al guardar; las lecturas administrativas devuelven `••••••••` y el mailer descifra solo internamente.
3. `database/migraciones-tenant.js` añade las versiones 4 y 5. La versión 4 crea `login_intentos` y `dispositivo_pruebas_usadas` y cifra contraseñas SMTP legacy; la versión 5 crea `sesiones_admin`.
4. `database/provisionar-tenant.js` genera credenciales únicas por tenant y nunca reescribe una credencial existente salvo `--rotar-developer`.
5. `server/repositories/auth.repo.js` sustituye los `Map` de autenticación por operaciones PostgreSQL con `ON CONFLICT` y pruebas de dispositivo de consumo único.
6. `server/lib/sesion.js` registra y valida sesiones administrativas compartidas entre instancias, con función de revocación.

## Variables de entorno

- `SMTP_ENCRYPTION_KEY`: obligatoria para guardar o enviar credenciales SMTP almacenadas en BD; debe ser de 32 bytes.
- `TRUST_PROXY=true`: permite usar la IP externa entregada por el balanceador para el límite por IP. Si falta o no es `true`, no se usa un contador IP global; se aplica únicamente el límite por cuenta.
- `DEVELOPER_PASSWORD`: opcional y obsoleta; si existe, se usa solo como credencial inicial explícita del aprovisionamiento.

## Despliegue

1. Respaldar cada base PostgreSQL de tenant antes de migrar.
2. Configurar `SMTP_ENCRYPTION_KEY` estable y compartida por todas las instancias antes de aplicar migraciones si existe una contraseña SMTP legacy.
3. Aplicar las migraciones en orden con `npm run migrate:tenant` o mediante `npm run provision:tenant -- <slug>`.
4. Reingresar la contraseña SMTP desde la pantalla de configuración para confirmar el cifrado; nunca copiar la máscara como contraseña.
5. Aprovisionar cada tenant y guardar la contraseña mostrada una sola vez en un gestor de contraseñas. Para una rotación posterior usar `--rotar-developer`.
6. Verificar que `SESSION_SECRET` y `SMTP_ENCRYPTION_KEY` sean iguales en todas las instancias del balanceador.

## Pruebas y resultados

- `npm run build`: pasa fuera del sandbox; el primer intento dentro del sandbox falló por `EPERM` al crear `.next`.
- `npm run test:postgres`: la ejecución completa valida migraciones, autenticación, operación, reportes, aislamiento y las pruebas SMTP; debe repetirse después de cualquier cambio adicional.
- `npm run simular`: 37/37 pasos exitosos, 0 inconsistencias y 0 excepciones críticas.
- `node --test tests/security-hardening.test.js`: 2/2 pruebas SMTP exitosas.
- `npm audit --omit=dev`: 6 vulnerabilidades moderadas transitivas; no se aplicó una actualización mayor forzada.

## Riesgos residuales y decisiones pendientes

- La revocación administrativa está disponible como función de servidor; debe conectarse a una acción o endpoint administrativo específico si el producto necesita un botón de “cerrar todas las sesiones”.
- Las recomendaciones de `npm audit` requieren cambios mayores incompatibles con el alcance; el dueño debe decidir si acepta una actualización mayor de `shadcn`/`exceljs.
- La protección por IP depende de que el balanceador sobrescriba correctamente las cabeceras confiables. No activar `TRUST_PROXY` si la ruta de red permite que clientes las inyecten.

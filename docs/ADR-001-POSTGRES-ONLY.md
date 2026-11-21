# ADR-001 · PostgreSQL como fuente canónica del esquema

**Estado** · Aceptado e implementado
**Fecha** · 21 de noviembre de 2026

## Decisión

PostgreSQL es el motor canónico del POS. El control plane mantiene el registro
de tenants y cada tenant tiene su propia base operativa. Las definiciones
ejecutables del esquema están en `database/migraciones-control.js` y
`database/migraciones-tenant.js`. No existe una capa ORM paralela: los
repositorios usan `pg` y SQL parametrizado contra el contexto PostgreSQL del
tenant.

Cada base operativa registra versiones aplicadas en `schema_migrations`.
Cada cambio de esquema se añade como una nueva versión. Las migraciones
se serializan por base y confirman el DDL y el historial en la misma
transacción. La versión inicial recoge la estructura PostgreSQL previa y
la segunda incorpora las restricciones e índices que faltaban.

Los importes, costos y alícuotas se almacenan como `NUMERIC` sin escala fija.
Los repositorios del POS los devuelven como números JavaScript para conservar los
contratos de los repositorios. Las cantidades de inventario conservan su
representación previa. Los instantes usan `TIMESTAMPTZ`. Las fechas
calendario de vencimiento conservan el formato textual `YYYY-MM-DD`.

## Aprovisionamiento

1. Configurar `CONTROL_DATABASE_URL` en el entorno y ejecutar `npm run migrate:control`.
2. Crear la base PostgreSQL operativa vacía, registrar el tenant activo en
   `control_tenants` y asociar su UUID o slug a su conexión mediante el
   resolver de tenants. El resolver actual usa `TENANT_DATABASE_URLS_JSON`.
3. Configurar `DEVELOPER_PASSWORD` en el entorno y ejecutar
   `npm run provision:tenant -- <slug>`.

El aprovisionador migra la base y asegura la configuración inicial con
`configurado = 0` y la cuenta técnica `developer`. Repetir el comando conserva
la configuración existente y actualiza la credencial únicamente cuando
corresponde. `control_tenants.schema_version` se actualiza después de confirmar
la transacción operativa. Si falla la actualización de control, repetir el
comando reconcilia ambas bases.

`npm run migrate:tenant` usa `TENANT_DATABASE_URL` para aplicar solo el esquema
operativo. `npm run provision:tenant` además sincroniza la versión del registro
central y las filas iniciales.

SQLite, Drizzle y `caja.db` ya no forman parte del runtime ni de las
dependencias del proyecto. La versión 3.0.0 realiza el corte definitivo a
PostgreSQL; cualquier dato histórico de una instalación anterior debe
importarse y conciliarse antes de poner en producción el tenant correspondiente.

## Verificación

Con `POSTGRES_TEST_URL` apuntando a PostgreSQL de pruebas y un rol con permiso
`CREATEDB`, ejecutar:

```powershell
node --test tests/postgres-migrations.test.js tests/postgres-provisioning.test.js
```

Las pruebas crean bases temporales y las eliminan al finalizar.

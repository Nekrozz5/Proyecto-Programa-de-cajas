# Arquitectura multi-negocio

## Decisión

La aplicación usa PostgreSQL como único motor de persistencia. Cada negocio
tiene una base operativa independiente y el registro central tiene su propia
base. El servidor resuelve el negocio por el subdominio, consulta el registro y
verifica la coincidencia del `tenant_id` de la sesión cuando corresponde.

`cafeteria` es el tenant piloto. La plataforma comparte el código y el esquema
operativo entre negocios y mantiene la configuración de cada negocio en su base.

```text
Cliente -> Next.js compartido -> Registro de tenants -> PostgreSQL del negocio
                                                     -> Backups por negocio en S3
```

## Niveles de aislamiento

- **Estándar:** aplicación compartida y bases de datos independientes dentro de un
  RDS compartido.
- **Premium:** aplicación compartida o dedicada y RDS dedicado.
- **Crítico:** entorno de aplicación, RDS y secretos dedicados.

La instancia RDS compartida sigue siendo un dominio común de disponibilidad. Para
reducir el radio de impacto al crecer, los tenants se distribuirán entre varios
RDS (sharding por grupos).

## Componentes obligatorios

### Registro de control

La base de control tendrá, como mínimo:

- `tenant_id` estable y no reutilizable.
- nombre y estado del negocio.
- plan contratado y nivel de aislamiento.
- identificador del shard/RDS asignado.
- nombre lógico de la base del tenant.
- referencia al secreto de conexión en AWS Secrets Manager.
- versión de esquema y último backup exitoso.
- estado del último aprovisionamiento y su error, si existiera.

### Base de cada negocio

Cada base contiene el esquema operativo del POS. La configuración del negocio
es singleton dentro de su base y las versiones aplicadas se registran en
`schema_migrations`.

### Sesión y autorización

El token de sesión deberá incluir el tenant resuelto por el servidor. Todas las
acciones, repositorios y reportes deberán adquirir la conexión a través del
contexto autenticado; no se permitirá seleccionar un tenant mediante un parámetro
del cliente.

### Reportes y analíticas

Los repositorios de reportes y analíticas usan la conexión del tenant activo.
Los reportes usan `America/La_Paz` para delimitar los días sobre instantes UTC.
La suite verifica resultados financieros y Kardex con dos bases PostgreSQL
temporales que tienen IDs de turno coincidentes y totales distintos.

## Backups y restauración

- RDS Multi-AZ y backups automáticos para continuidad de la instancia.
- `npm run backup -- <slug>` genera un archivo de formato personalizado con
  `pg_dump` y retención local por tenant. El almacenamiento en S3 queda para el
  despliegue cloud.
- Prueba periódica de restauración en una base temporal.
- Registro del resultado y versión de esquema de cada backup.

Un snapshot completo de RDS no sustituye al backup individual por tenant.

## Aprovisionamiento y corte operativo

1. Aplicar las migraciones de control y registrar el negocio.
2. Crear la base operativa y ejecutar `npm run provision:tenant -- <slug>`.
3. Conciliar los datos del primer negocio antes del corte operativo.
4. Verificar un respaldo PostgreSQL y su restauración en una base temporal.

Durante el aprovisionamiento, `control_tenants.estado` sigue este flujo:

```text
activo/error -> migrando -> activo
                    └----> error
```

`ultimo_error_provisionamiento` conserva el motivo técnico del último fallo y
permite reintentar el tenant sin registrarlo nuevamente.

La decisión de adoptar PostgreSQL queda registrada en el [ADR-001](ADR-001-POSTGRES-ONLY.md).

## Restricciones

- No se harán forks del código por tipo de negocio.
- No se ejecutará una migración destructiva sobre todos los tenants a la vez.
- Los reportes de plataforma recorrerán bases autorizadas; no se mezclarán datos
  financieros en una consulta operativa común.
- En desarrollo, las conexiones se resuelven con `TENANT_DATABASE_URLS_JSON`.
- En cloud, `database_secret_ref` se resuelve mediante el resolver de secretos
  configurado en `server/tenancy/tenant-registry.js`; si no existe, el tenant no
  puede abrirse accidentalmente con una conexión incompleta.

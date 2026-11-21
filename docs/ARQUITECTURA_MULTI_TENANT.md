# Arquitectura multi-negocio

## Decisión

La aplicación se ejecutará como una plataforma compartida, pero cada negocio tendrá
una base de datos PostgreSQL independiente. La aplicación no aceptará el nombre de
la base de datos desde el navegador: resolverá el `tenant_id` desde la sesión y un
registro central de tenants.

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

### Base de cada negocio

Cada base contendrá el esquema operativo actual del POS. La configuración de
negocio dejará de ser global para la plataforma: será singleton únicamente dentro
de la base de ese negocio.

### Sesión y autorización

El token de sesión deberá incluir el tenant resuelto por el servidor. Todas las
acciones, repositorios y reportes deberán adquirir la conexión a través del
contexto autenticado; no se permitirá seleccionar un tenant mediante un parámetro
del cliente.

## Backups y restauración

- RDS Multi-AZ y backups automáticos para continuidad de la instancia.
- `pg_dump` por tenant hacia S3 para restauración independiente.
- Prueba periódica de restauración en una base temporal.
- Registro del resultado y versión de esquema de cada backup.

Un snapshot completo de RDS no sustituye al backup individual por tenant.

## Migración desde el sistema actual

1. Introducir el registro de tenants y el contrato de resolución de conexión sin
   modificar el flujo SQLite existente.
2. Implementar el adaptador PostgreSQL y el esquema equivalente.
3. Migrar una copia de `caja.db` a un tenant piloto y comparar conteos, saldos,
   kardex, arqueos y reportes.
4. Ejecutar una ventana de corte controlada para el primer negocio.
5. Repetir el proceso por tenant, con rollback a SQLite hasta validar la operación.
6. Retirar SQLite únicamente cuando el tenant tenga backup y restauración
   PostgreSQL verificados.

## Restricciones

- No se harán forks del código por tipo de negocio.
- No se ejecutará una migración destructiva sobre todos los tenants a la vez.
- Los reportes de plataforma recorrerán bases autorizadas; no se mezclarán datos
  financieros en una consulta operativa común.
- Los cambios existentes del usuario en `app/api/reportes/route.js` y
  `package-lock.json` deben preservarse.

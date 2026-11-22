# Plan de despliegue AWS

El modelo comercial, los beneficios preliminares de cada plan y el proceso de
trabajo del equipo están documentados en
[MODELO_NEGOCIO_Y_PLANES.md](MODELO_NEGOCIO_Y_PLANES.md). La integración entre
ramas y stacks debe seguir [CONTRATO_INFRA_AWS.md](CONTRATO_INFRA_AWS.md).

> Validación de modelo: el identificador y el esfuerzo activos no están
> expuestos por el runtime de Codex; continuaré con la capacidad disponible
> para esta fase de diseño técnico.

## Decisión inicial

La primera edición será cloud y compartirá una aplicación Next.js entre varios
negocios. El entorno inicial usará un RDS PostgreSQL compartido, con una base
operativa independiente por tenant y una base de control separada. Esto mantiene
el aislamiento actual sin pagar una instancia RDS completa por negocio.

```text
Usuarios
   |
   v
ALB / dominio futuro
   |
   v
ECS Fargate (Next.js + Node.js)
   |                  |
   v                  v
RDS PostgreSQL     Secrets Manager
   |
   +--> control_plane
   +--> negocio_cafeteria
   +--> negocio_<tenant>

ECS / tarea de backup ---> S3 versionado
CloudWatch Logs ----------> observabilidad
```

## Fases

### Fase 0: controles de costo

- Crear un presupuesto mensual de AWS con alerta por correo.
- Revisar periódicamente créditos, cargos y recursos activos.
- No usar recursos de producción mientras el presupuesto no esté revisado.

**Terminado cuando:** existe una alerta de presupuesto visible y llega una
notificación de prueba al correo elegido.

### Fase 1: infraestructura reproducible

- Crear una aplicación CDK sin desplegarla todavía.
- Definir la Región `us-east-2` mediante configuración, no hardcodear otras
  Regiones.
- Separar la infraestructura persistente de la aplicación.
- Preparar VPC, grupos de seguridad y subredes para RDS y ECS.
- Mantener recursos con datos en un stack propio y con protección contra
  eliminación accidental.

**Terminado cuando:** `cdk synth --strict` genera plantillas sin crear recursos
en AWS y `cdk diff` muestra solo los recursos esperados.

### Fase 2: PostgreSQL cloud de desarrollo

- Crear una instancia RDS PostgreSQL de desarrollo, inicialmente Single-AZ.
- Crear la base `control_plane` y registrar el tenant piloto.
- Ejecutar las migraciones de control y tenant desde un proceso controlado.
- Usar SSL con el certificado CA de RDS.
- Crear backups automáticos de RDS y probar restauración.

**Terminado cuando:** `cafeteria` funciona en RDS y una restauración de prueba
abre una base independiente sin mezclar datos.

### Fase 3: secretos y backups por tenant

- Crear un secreto para la conexión de cada tenant.
- Guardar solo la referencia del secreto en `control_tenants`.
- Conectar `TENANT_SECRETS_PROVIDER=aws` en ECS.
- Guardar respaldos lógicos por tenant en S3 privado y versionado.
- Aplicar retención y cifrado sin hacer públicos los objetos.

**Terminado cuando:** la aplicación resuelve una conexión desde Secrets Manager
y puede restaurar el respaldo de `cafeteria` en una base temporal.

### Fase 4: ejecutar la aplicación

- Crear repositorio ECR y una imagen Docker reproducible.
- Ejecutar Next.js en ECS Fargate.
- Enviar logs a CloudWatch.
- Usar un ALB como punto de entrada temporal mientras no exista dominio.
- No usar PM2 dentro del contenedor; ECS gestionará el proceso y su reinicio.

**Terminado cuando:** el ALB responde, el login funciona y las pruebas E2E
ejercitan el entorno cloud de desarrollo.

### Fase 5: dominio y lanzamiento piloto

- Registrar o conectar el dominio real.
- Configurar Route 53 y certificado ACM.
- Probar `cafeteria.dominio-real` y la resolución por tenant.
- Activar backups, alertas, logs y procedimiento de restauración.
- Migrar datos del piloto solo después de una conciliación final.

**Terminado cuando:** el tenant piloto funciona con HTTPS y existe un rollback
documentado.

## Decisiones aplazadas

- RDS Multi-AZ: se evaluará después del piloto; no es necesario para el primer
  entorno de pruebas.
- RDS dedicado por negocio: será una opción del plan premium/crítico.
- IA, personalización visual avanzada y funciones de pago: después de estabilizar
  el flujo principal.
- Dominio: no se inventará ni se configurará `miapp.com`; ese nombre es solo un
  ejemplo.

## Regla de despliegue

No ejecutar `cdk deploy` hasta revisar `cdk synth --strict`, `cdk diff`, el
presupuesto y la Región seleccionada en AWS Settings. Los recursos con datos
deberán tener protección contra eliminación accidental.

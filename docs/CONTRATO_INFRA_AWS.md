# Contrato de colaboración para infraestructura AWS

Este documento define cómo trabajar en paralelo sin romper la integración entre
la red AWS, PostgreSQL y la aplicación.

## Reglas de Git

- `main` es la rama protegida de integración; no se trabaja directamente allí.
- Cada tarea usa una rama propia, por ejemplo:
  - `codex/infra-network`
  - `feat/infra-rds`
- Cada rama parte de un `main` actualizado.
- No subir `.env`, contraseñas, tokens, certificados privados ni secretos de AWS.
- Un commit debe representar un cambio comprensible y verificable.
- Antes de fusionar, actualizar la rama con el estado actual de `main` y resolver
  conflictos en la rama de trabajo.
- Solo se fusiona después de revisar el diff y ejecutar la validación indicada en
  la tarjeta de Trello.

## Orden de integración

1. Contrato y esqueleto CDK.
2. Stack de red.
3. Stack de RDS PostgreSQL.
4. Secrets Manager y permisos IAM.
5. Docker/ECR/ECS/ALB.
6. Backups S3, observabilidad y dominio.

Red y RDS pueden desarrollarse en paralelo únicamente después de acordar los
outputs que conectan ambos stacks. Si el esqueleto CDK todavía no existe, esa
tarea debe integrarse primero.

## Contrato Red AWS -> RDS

La rama de red debe documentar y exponer:

- Región seleccionada: `us-east-2`.
- VPC `programa-cajas-dev`, CIDR `10.42.0.0/16`, con dos Availability Zones.
- Subredes privadas aisladas `database`, una por Availability Zone, con máscara
  `/24`; no tienen ruta de salida a Internet y son las únicas subredes que el
  stack de RDS debe consumir.
- Security Group de la aplicación: `programa-cajas-dev-app`.
- Security Group de RDS: `programa-cajas-dev-db`.
- La única entrada al Security Group de RDS es TCP `5432` desde el Security
  Group de la aplicación; no se permite CIDR público.
- Outputs estables del stack de red:

  | Output | Uso por el stack de RDS |
  | --- | --- |
  | `VpcId` | Identificar la VPC compartida |
  | `DatabaseSubnetIds` | Seleccionar las subredes privadas aisladas |
  | `ApplicationSecurityGroupId` | Referencia del origen permitido |
  | `DatabaseSecurityGroupId` | Asociar el SG a la instancia PostgreSQL |

El `DatabaseStack` consume referencias CDK (`vpc` y
`databaseSecurityGroup`) producidas por `NetworkStack`; no recrea la VPC, las
subredes ni las reglas de seguridad.

La rama de RDS debe consumir ese contrato y no recrear la VPC ni modificar las
reglas de red sin coordinarlo. Debe documentar:

- Motor y versión de PostgreSQL.
- Clase y almacenamiento del entorno de desarrollo.
- Nombre de la base de control.
- Política para crear una base por tenant.
- Cifrado en reposo habilitado, backups automáticos durante 7 días y conexión
  de clientes mediante SSL/TLS (`sslmode=require`).
- Secretos y permisos necesarios, sin incluir valores secretos.

## Límites de archivos

Como regla inicial, cada responsable modifica solo su zona:

- Red AWS: `infra/lib/network-stack.*`, configuración de VPC y documentación de
  outputs.
- RDS PostgreSQL: `infra/lib/database-stack.*`, configuración de RDS y
  documentación de conexión.
- Aplicación: archivos de Docker/ECS y runtime.
- Contratos compartidos: se modifican mediante una tarjeta de Trello y revisión
  de ambos responsables.

Si una tarea necesita tocar la zona del otro responsable, primero se documenta
la razón en Trello y se acuerda el cambio antes de editar.

## Entrega obligatoria de cada rama

Antes de abrir una solicitud de integración, dejar en la tarjeta de Trello:

1. Objetivo cumplido.
2. Archivos creados o modificados.
3. Comandos ejecutados y resultado.
4. Outputs, nombres o interfaces que otro stack debe consumir.
5. Variables de entorno nuevas, sin valores sensibles.
6. Riesgos, decisiones pendientes y pasos para probarlo.

## Actualización obligatoria antes del PR

Cada responsable debe actualizar su rama de trabajo antes de abrir el PR:

```powershell
git fetch origin
git merge origin/main
git status
git diff --check
```

Si `git merge` informa conflictos, deben resolverse y validarse en la rama de
trabajo. Antes de solicitar la fusión, revisar `git diff origin/main...HEAD` y
ejecutar `npm run cdk:synth`; no se debe resolver un conflicto directamente en
`main`.

## Uso de asistentes de IA distintos

Cada asistente debe recibir:

- Este documento.
- La tarjeta específica de Trello.
- La lista cerrada de archivos que puede modificar.
- El criterio de terminado.

El asistente no debe cambiar arquitectura, nombres de outputs, Región o permisos
sin registrar la decisión en la tarjeta y actualizar este contrato.

## Validación mínima

Antes de fusionar infraestructura:

```powershell
cdk synth --strict
cdk diff
```

No ejecutar `cdk deploy` desde una rama de trabajo sin autorización explícita.
La primera ejecución de despliegue se hará desde `main`, después de revisar el
diff y el presupuesto AWS.

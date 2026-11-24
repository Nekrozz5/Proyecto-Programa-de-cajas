# Contrato de red AWS: VPC, subredes y Security Groups

Este documento fija la topología de red que debe existir antes de crear o
modificar RDS PostgreSQL. La arquitectura aprobada usa una VPC compartida por
ALB, ECS/Fargate y RDS; la base de datos nunca se publica directamente en
Internet.

## Parámetros aprobados

| Elemento | Decisión |
| --- | --- |
| Región | `us-east-2` |
| VPC | `programa-cajas-dev` |
| CIDR VPC | `10.42.0.0/16` |
| Availability Zones | 2 |
| Subredes públicas | Una por AZ, `/24`; reservadas para ALB y componentes públicos |
| Subredes de base de datos | Una por AZ, `/24`, `PRIVATE_ISOLATED`; solo para RDS |
| NAT gateways | 0 en el entorno inicial |

Las subredes `database` no tienen ruta hacia Internet Gateway ni NAT. Son las
únicas subredes que puede seleccionar el stack de RDS. La existencia de
subredes públicas no convierte a RDS en público: RDS usa exclusivamente el
grupo de subredes aisladas y `publiclyAccessible` debe permanecer en `false`.

## Flujo permitido

```text
Internet
   |
   | TCP 443 (y TCP 80 solo si se requiere redirección HTTPS)
   v
ALB público
   |
   | TCP 3000
   v
ECS/Fargate privado
   |
   | TCP 5432
   v
RDS PostgreSQL en subredes database aisladas
```

## Security Groups

### ALB

- Nombre previsto: `programa-cajas-dev-alb`.
- Entrada: TCP `443` desde Internet (`0.0.0.0/0` y `::/0`) cuando exista el
  certificado HTTPS.
- Entrada opcional: TCP `80` desde Internet únicamente para redirigir a HTTPS;
  no debe servir tráfico de aplicación sin TLS.
- Salida: TCP `3000` hacia `programa-cajas-dev-app` (SG de ECS actual).
- No debe tener entrada a PostgreSQL.

### ECS/Fargate

- Nombre lógico: `programa-cajas-dev-app` (se conserva el nombre del contrato
  existente y representa las tareas ECS).
- Entrada: TCP `3000` únicamente desde `programa-cajas-dev-alb`.
- No se permite entrada directa desde Internet, desde `0.0.0.0/0` ni desde
  clientes administrativos.
- Salida: TCP `5432` hacia `programa-cajas-dev-db` y únicamente los accesos
  adicionales que requiera la ejecución (por ejemplo, HTTPS a AWS mediante
  endpoints o una ruta de egreso aprobada).

### RDS PostgreSQL

- Nombre implementado: `programa-cajas-dev-db`.
- Entrada única: TCP `5432` desde `programa-cajas-dev-app`, que es el SG
  entregado actualmente al stack de RDS y que representa a la aplicación.
- No se permite ninguna regla de entrada desde `0.0.0.0/0`, `::/0`, el SG del
  ALB ni una IP pública.
- RDS debe permanecer con `publiclyAccessible: false`.

Durante la futura integración ECS, `programa-cajas-dev-app` podrá mantenerse
como el SG de tareas o sustituirse por `programa-cajas-dev-ecs`, pero el cambio
debe registrarse en el contrato Red AWS -> RDS y conservar la regla de origen
por Security Group, nunca por CIDR público.

## Outputs que consume RDS

`NetworkStack` expone estos outputs estables:

- `VpcId`
- `DatabaseSubnetIds`
- `ApplicationSecurityGroupId`
- `DatabaseSecurityGroupId`
- `EcsSecurityGroupId`
- `LoadBalancerSecurityGroupId`

`DatabaseStack` recibe referencias CDK a la VPC, las subredes aisladas y el
Security Group de base de datos. No recrea la VPC, no selecciona subredes
públicas y no modifica reglas de seguridad.

## Estado de la implementación

- Implementado en CDK: VPC `10.42.0.0/16`, dos AZ, subredes públicas y
  `database` aisladas `/24`, sin NAT.
- Implementado en CDK: RDS en `PRIVATE_ISOLATED`, cifrado en reposo, backups de
  7 días, protección contra eliminación y sin acceso público.
- Implementado en CDK: ingreso de RDS `5432` únicamente desde el SG de
  aplicación.
- Implementado en el stack de red: SG `programa-cajas-dev-alb`, SG de tareas
  ECS `programa-cajas-dev-app` y regla ALB -> ECS en `3000`. El listener HTTPS
  y el servicio ECS pertenecen a sus stacks respectivos.

## Validación previa a RDS

Antes de abrir un PR de infraestructura:

```powershell
npm run cdk:synth
cdk synth --strict
cdk diff
```

La revisión debe confirmar que `DatabaseSubnetIds` solo contiene subredes
aisladas, que RDS no es públicamente accesible y que ninguna regla de entrada
de PostgreSQL usa `0.0.0.0/0` o `::/0`.

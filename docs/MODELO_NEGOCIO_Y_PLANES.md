# Modelo de negocio y planes

## Visión del producto

Programa Cajas será una plataforma cloud para administrar cajas, ventas e
inventario de pequeños y medianos negocios, especialmente cafeterías,
restaurantes y comercios con operaciones de punto de venta.

La primera edición será web y cloud. No tendrá un instalador local como forma
principal de distribución. La idea original de un instalador conectado mediante
Cloudflare Tunnel queda aplazada; podría servir para pruebas puntuales, pero no
será la arquitectura comercial principal.

La aplicación será compartida entre varios negocios, pero cada negocio será un
tenant independiente y tendrá su propia base operativa PostgreSQL. Una base de
control central registrará los tenants, planes, estados, versiones y referencias
técnicas de conexión.

`miapp.com`, `cafeteria.miapp.com` y nombres parecidos son ejemplos ficticios.
No representan un dominio comprado ni deben configurarse como si fueran reales.

## Negocio piloto

`cafeteria` es el tenant piloto porque utiliza casi todas las capacidades del
sistema:

- Productos directos y productos con recetas.
- Insumos, sustituciones y modificadores.
- Combos y promociones.
- Compras, mermas, lotes y vencimientos.
- Kardex, costo promedio y salidas PEPS/FIFO.
- Ventas en efectivo, QR y pagos mixtos.
- Turnos, arqueos ciegos, egresos e inyecciones de efectivo.
- Anulaciones auditadas y reportes financieros.
- Configuración fiscal, branding y notificaciones por correo.

La cafetería es un caso de prueba completo; el producto no estará limitado a
cafeterías.

## Capacidades funcionales

### Usuarios y permisos

- **Propietario:** autoridad máxima del negocio y acceso completo.
- **Administrador:** gestiona catálogo, inventario, usuarios, cajas y reportes.
- **Cajero:** opera el punto de venta, turnos, ventas y cierres.
- **Developer:** perfil técnico reservado para mantenimiento y soporte.

Cada usuario está vinculado a un tenant y no puede consultar la información de
otro negocio.

### Cajas y ventas

El sistema permite registrar cajas físicas, autorizar dispositivos, abrir y
cerrar turnos, declarar arqueos ciegos, registrar ingresos y egresos, controlar
sobrantes o faltantes y auditar reaperturas.

Las ventas admiten productos libres, directos, recetas, combos, modificadores,
sustituciones, descuentos autorizados, efectivo, QR y pagos mixtos. Cada venta
debe descontar inventario de forma atómica y conservar el precio, costo e
información fiscal vigentes al momento de la operación.

### Inventario y reportes

El inventario controla insumos, productos, recetas, combos, compras, mermas,
ajustes, lotes, vencimientos, Kardex, costo promedio y PEPS/FIFO. No se debe
permitir stock negativo.

Los reportes cubren ventas, costos, ganancias, rentabilidad, compras, mermas,
inventario, Kardex, turnos, arqueos, impuestos y anulaciones. Los cierres y
reportes pueden enviarse por correo; esta función sigue siendo útil en la
versión cloud.

## Planes comerciales propuestos

Los nombres, límites y precios son preliminares. Deben validarse con clientes
antes de convertirlos en reglas comerciales definitivas.

### Demo o prueba

Para mostrar el sistema antes de contratar:

- Un negocio de demostración.
- Datos de ejemplo.
- Acceso temporal.
- Funciones y reportes limitados.
- Sin personalización avanzada.
- Sin garantía de disponibilidad.
- Soporte básico.

### Básico

Para negocios pequeños con operación sencilla:

- Un tenant con base de datos independiente.
- Usuarios y roles básicos.
- Una o pocas cajas.
- Ventas y turnos.
- Productos directos.
- Inventario básico.
- Compras y ajustes.
- Reportes básicos.
- Backups administrados.
- Soporte estándar.

Podría limitar recetas avanzadas, combos, múltiples estaciones y analíticas
comerciales.

### Estándar

Será el plan principal para operar diariamente:

- Todo lo incluido en Básico.
- Varias cajas y terminales POS.
- Recetas, insumos y modificadores.
- Sustitución de ingredientes.
- Combos y promociones.
- Lotes, vencimientos y PEPS/FIFO.
- Kardex y costo promedio.
- Pagos en efectivo, QR y mixtos.
- Arqueo ciego y anulaciones auditadas.
- Reportes financieros.
- Exportación Excel y PDF.
- Reportes por correo.
- Logo y colores básicos.
- Soporte estándar.

El tenant piloto `cafeteria` validará principalmente este plan.

### Premium

Para negocios que necesitan adaptación y soporte prioritario:

- Todo lo incluido en Estándar.
- Personalización visual avanzada.
- Fotos, branding y pantallas propias.
- Reportes personalizados.
- Funciones específicas del negocio.
- Integraciones externas.
- Límites mayores de usuarios y cajas.
- Soporte prioritario.
- Configuración y capacitación asistida.
- Backups con mayor frecuencia o retención.
- Ambientes separados de prueba cuando sea necesario.

Las personalizaciones deben resolverse mediante configuración, módulos o
extensiones controladas. No se crearán forks completos del proyecto por cliente.

### Empresarial o dedicado

Para cadenas o clientes con necesidades de aislamiento y operación avanzada:

- Infraestructura dedicada.
- RDS dedicado o shard separado.
- Aplicación dedicada o entorno aislado.
- Mayor capacidad y disponibilidad.
- Backups y restauraciones personalizados.
- Integraciones mediante API.
- Migración de datos asistida.
- Soporte especializado.
- Acuerdos de disponibilidad.
- Desarrollo de funciones específicas.

Este plan podrá tener costo de implementación y una mensualidad superior.

## Complementos futuros

Podrán ofrecerse como servicios adicionales:

- Personalización de frontend.
- Carga inicial de productos.
- Migración de datos.
- Integración con delivery.
- Reportes especiales.
- Capacitación.
- Soporte técnico adicional.
- Funciones de inteligencia artificial.

La IA se considera una fase posterior al lanzamiento estable. Podría ayudar a
registrar productos, explicar reportes, resolver dudas, sugerir compras y guiar
al usuario, pero no forma parte del objetivo inmediato.

## Infraestructura relacionada

La arquitectura prevista para cloud utiliza:

- Next.js y Node.js.
- RDS PostgreSQL.
- Una base de control y una base operativa por negocio.
- Secrets Manager.
- ECS Fargate y ECR.
- S3 para respaldos.
- CloudWatch para logs y alarmas.
- Application Load Balancer.
- Dominio real y HTTPS en una fase posterior.

La infraestructura detallada está en [PLAN_AWS.md](PLAN_AWS.md) y el contrato
de integración entre ramas está en [CONTRATO_INFRA_AWS.md](CONTRATO_INFRA_AWS.md).

## Trabajo colaborativo con Trello

Todo el avance de infraestructura y producto se organiza en el tablero:

[Programa Cajas - AWS](https://trello.com/b/VQEHoe4T/programa-cajas-aws)

Sus listas representan el flujo de trabajo:

- **Backlog:** tareas identificadas pero no iniciadas.
- **Esta semana:** tareas seleccionadas para el ciclo actual.
- **En progreso:** trabajo activo de una persona.
- **En revisión:** trabajo terminado pendiente de revisión e integración.
- **Hecho:** tarea validada y fusionada en `main`.

Cada tarjeta debe incluir objetivo, dependencias, archivos permitidos, criterio
de terminado, validaciones, resultado y riesgos.

### Reglas de ramas e integración

- No se trabaja directamente sobre `main`.
- Cada tarjeta tiene una rama propia, por ejemplo `codex/infra-network` o
  `feat/infra-rds`.
- Cada rama parte de un `main` actualizado.
- No se suben secretos, `.env`, certificados privados ni tokens.
- Cada cambio debe tener una validación verificable.
- Antes de fusionar se revisa el diff y se actualiza la rama con el `main`
  vigente.
- Red AWS y RDS pueden desarrollarse en paralelo solo después de acordar el
  contrato de outputs, subredes y Security Groups.
- La primera integración debe ser el contrato y el esqueleto CDK; después la
  red; luego RDS; y finalmente Secrets Manager, ECS y ALB.

### Uso de distintas herramientas de IA

El equipo puede usar Codex, Claude, Gemini, DeepSeek u otra herramienta. Todos
deben recibir la tarjeta de Trello, este documento, el contrato técnico, la
lista cerrada de archivos y el criterio de terminado.

Ningún asistente puede cambiar por su cuenta la Región, la arquitectura, los
outputs, permisos IAM, estructura de tenants o forma de conexión de RDS. Esas
decisiones se registran primero en Trello y en el contrato técnico.

El procedimiento completo de colaboración está en
[CONTRATO_INFRA_AWS.md](CONTRATO_INFRA_AWS.md).

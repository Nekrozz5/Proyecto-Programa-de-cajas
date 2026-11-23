# Funciones ocultas y reservadas

## Propósito

Este documento registra funciones que existen en el código, pero que actualmente
no se muestran al usuario final, están preparadas para una fase posterior o se
ocultan deliberadamente por seguridad y simplicidad operativa.

La regla es **no borrar estas funciones sin revisar primero este documento**.
Cada elemento debe evaluarse antes de un lanzamiento o una refactorización.

## Estado actual

### 1. Personalización visual del negocio

- **Estado:** Oculta temporalmente en la interfaz.
- **Ubicación principal:** `app/admin/_components/TabConfigFiscal.js`.
- **Sección:** `Identidad visual del negocio`.
- **Qué contiene:**
  - Nombre corto.
  - URL del logo.
  - Color primario.
  - Color secundario.
  - Tema visual.
- **Qué se hizo:** La sección quedó con la clase `hidden` para que no aparezca
  en pantalla.
- **Qué se conserva:** Los estados React, la validación, las acciones de
  guardado, las columnas de PostgreSQL y las variables de marca siguen
  existiendo.
- **Motivo:** La personalización completa se desarrollará después del
  lanzamiento inicial.

#### Pendientes para reactivarla

- Decidir si el logo se sube al sistema o se mantiene como URL externa.
- Incorporar almacenamiento estable, por ejemplo S3 o un servicio de medios.
- Mostrar una vista previa antes de guardar.
- Aplicar los colores de forma consistente a botones, enlaces, tarjetas,
  encabezados y POS; actualmente solo algunos elementos usan las variables de
  marca.
- Implementar realmente los temas oscuro y según dispositivo.
- Evaluar fondo de pantalla, tipografías y diseños personalizados de botones.
- Añadir validación de contraste y accesibilidad.

### 2. Pagos de apps de comida

- **Estado:** Soporte visual oculto deliberadamente.
- **Ubicación:** `app/caja/_components/ModalCobro.js`.
- **Código relevante:** El bloque de botones de `PedidosYa` y `Yango` está
  protegido por `false && habilitaAppsComida`.
- **Qué conserva:** Los métodos de pago y parte del soporte de canales siguen
  presentes en el código y en el modelo operativo.
- **Motivo:** No exponer esos métodos hasta definir correctamente la operación,
  conciliación y configuración comercial de las aplicaciones.

#### Pendientes para reactivarla

- Confirmar cómo se registran las liquidaciones de cada aplicación.
- Revisar pagos, comisiones, referencias externas y conciliación.
- Activar los botones mediante configuración, no mediante un `false` fijo.
- Probar ventas, anulaciones, reportes y cierres de caja por cada canal.

### 3. Temas visuales oscuro y según dispositivo

- **Estado:** Preparados en el selector, pero no implementados completamente.
- **Ubicación:** `app/admin/_components/TabConfigFiscal.js`.
- **Valores:** `claro`, `oscuro`, `sistema`.
- **Situación actual:** El tema claro es el único comportamiento completo. Los
  otros valores se pueden almacenar, pero no transforman toda la interfaz.
- **Recomendación:** No mostrar estas opciones al usuario hasta implementar el
  sistema de temas global.

### 4. Rol técnico `developer`

- **Estado:** Oculto de listados y selectores normales.
- **Ubicación principal:** `server/repositories/auth.repo.js`.
- **Comportamiento:** No aparece como usuario seleccionable para operaciones
  habituales, pero puede iniciar sesión y tiene permisos técnicos especiales.
- **Motivo:** Es una cuenta de diagnóstico, mantenimiento y migraciones; no debe
  confundirse con un cajero, administrador o propietario.
- **No eliminar:** El rol se usa en autenticación, sesiones, migraciones,
  configuración y soporte operativo.

## Elementos que no deben confundirse con funciones eliminadas

- Que una sección tenga `hidden` no significa que sus datos se hayan borrado.
- Que un rol no aparezca en un selector no significa que no exista.
- Que una opción esté marcada como “preparada” no significa que ya tenga un
  comportamiento completo.
- Los componentes colapsables de UI/UX no deben registrarse aquí si su
  comportamiento es deliberado y la función sigue disponible.

## Checklist antes de reactivar o eliminar

- [ ] Confirmar que la función tiene un flujo de usuario definido.
- [ ] Revisar permisos y roles involucrados.
- [ ] Revisar migraciones y compatibilidad con los tenants existentes.
- [ ] Probar con PostgreSQL desde una base limpia y una base con datos reales.
- [ ] Probar ventas, anulaciones, reportes y cierres relacionados.
- [ ] Revisar accesibilidad, contraste y vista móvil.
- [ ] Actualizar este documento con la decisión final.

## Historial

- **2026-11-23:** Se ocultó la sección de personalización visual sin eliminar su
  lógica ni sus columnas de persistencia.

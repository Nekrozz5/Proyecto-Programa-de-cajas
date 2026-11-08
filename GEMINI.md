# Contexto del Proyecto: Sistema POS y Control de Cajas Híbrido

## 1. Stack Tecnológico y Arquitectura
- **Entorno:** Node.js (CommonJS) con Next.js (App Router) y SQLite3 local (`caja.db`).
- **Estructura de Carpetas:**
  - `database/database.js`: Inicialización de SQLite y creación de tablas (`usuarios`, `productos`, `insumos`, `recetas`, `movimientos_insumos`, `cajas`, `movimientos`, `detalle_movimientos`).
  - `server/queries.js`: Lógica de negocio y consultas con promesas nativas (`async/await`) usando `runQuery`, `getQuery` y `allQuery`.
  - `app/api/caja/route.js` y `app/api/reportes/route.js`: Endpoints del backend en Next.js.
  - `app/caja/page.js` y `app/admin/page.js`: Vistas de operador y administrador.

## 2. Reglas de Negocio Obligatorias
- **Roles y Permisos:**
  - `user` (Cajero): Abre/cierra turnos, selecciona productos, cobra en efectivo (con cálculo de cambio) o QR, y registra egresos con motivo obligatorio.
  - `admin` (Administrador): Todo lo anterior + crear/borrar usuarios con baja lógica (`activo = 0`), anular ventas reintegrando stock o insumos automáticamente, y acceso a estadísticas financieras y reportes.
- **Arqueo Separado (Efectivo vs. QR):**
  - El efectivo físico esperado se calcula estrictamente como: `fondo_inicial + ingresos_efectivo - egresos_efectivo`. Al cerrar caja, se compara con el `efectivo_real` contado físicamente para hallar la diferencia.
  - Los pagos por QR se contabilizan por separado sin mezclarse con el dinero físico del cajón.
- **Inventario Híbrido y Costo Promedio Ponderado (NIC 2):**
  - Soporta productos de tipo `'libre'`, `'directo'` (reventa en ferretería/micromercado) y `'receta'` (escandallo de insumos para cafetería/restaurante).
  - Las compras de insumos actualizan el costo unitario mediante Costo Promedio Ponderado y recalculan en cascada el costo de los productos asociados.
  - `detalle_movimientos` congela el `precio_unitario` y `costo_unitario` al momento de la venta.

## 3. Reglas para el Asistente en Antigravity
- Responde siempre paso a paso y en español claro.
- No utilices ORMs externos; mantén las consultas SQL nativas y parametrizadas en `server/queries.js`.
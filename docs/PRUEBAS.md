# Checklist de Pruebas Funcionales y de Concurrencia

Lista de verificación manual para validar arranque, seguridad, control de caja, stock atómico, arqueo ciego, recetas, modificadores, combos, régimen fiscal, pagos mixtos, Kardex dual cronológico, anulaciones, multicaja, reportes, notificaciones y actualizaciones seguras.

---

## 1. Arranque y Migraciones
- [ ] Cierra y vuelve a correr `npm run dev`. No debe haber errores rojos en la terminal.
- [ ] Reinícialo una segunda vez: las migraciones no deben volver a ejecutarse ni arrojar errores (`PRAGMA user_version` controlado hasta v11).

## 2. Seguridad y Sesión
- [ ] Inicia sesión con una clave correcta y luego con una incorrecta. Después de 5 fallos seguidos debe bloquear temporalmente por rate limiting.
- [ ] La cuenta `developer` no debe aparecer en la lista desplegable de usuarios, pero sí poder entrar escribiéndola manualmente.
- [ ] Como cajero (`user`), intenta acceder a `/admin` escribiendo la URL directamente: debe redirigir o denegar el acceso.
- [ ] Con las herramientas del navegador (`F12 → Network`), reenvía una petición manipulando `usuarioId` o `adminId` en el cuerpo. El servidor debe validar exclusivamente la cookie HttpOnly de sesión, impidiendo la suplantación de identidad.
- [ ] Cambiar la propia contraseña debe exigir obligatoriamente la clave actual.
- [ ] Intentar registrar una contraseña de menos de 8 caracteres para un usuario administrador debe ser rechazado.

## 3. Caja y Validaciones
- [ ] Abre una caja en una estación física e intenta abrirla nuevamente en la misma estación: debe rechazarlo.
- [ ] Egreso sin motivo, con monto `0` o negativo: debe ser rechazado.
- [ ] Venta con cantidad `0` o negativa: debe ser rechazada.
- [ ] Cierra la caja y luego intenta vender o registrar un egreso en ella: debe rechazarlo.
- [ ] Con la caja cerrada, entra como cajero y abre un nuevo turno: debe permitirlo y asignar un número de turno correlativo.

## 4. Stock y Concurrencia
- [ ] Crea un producto directo con stock `3`.
- [ ] Vende `4`: debe ser rechazado por falta de stock.
- [ ] Vende el mismo producto en dos líneas del carrito (`2 + 2 = 4`): la validación atómica total debe rechazarlo.
- [ ] Venta de dos productos donde el segundo no tiene stock suficiente: la transacción debe hacer rollback completo y no descontar el primero.
- [ ] Abre la pantalla de venta en dos pestañas del navegador e intenta vender la última unidad disponible en ambas casi al mismo tiempo: solo una debe completarse (descuento atómico con `WHERE stock >= ?`).

## 5. Efectivo, Cambio y Arqueo Ciego
- [ ] Venta de `25 Bs` recibiendo `50 Bs`: el cálculo reactivo debe indicar un cambio de `25 Bs`.
- [ ] Registrar un `ingreso_efectivo` (inyección de cambio/sencillo de `50 Bs`): debe incrementar el efectivo esperado en el cajón físico, sin sumar a las ventas ni a las ganancias operativas.
- [ ] Con fondo inicial de `100 Bs`, una venta en efectivo de `30 Bs`, otra por QR de `20 Bs`, un egreso de `10 Bs` y una inyección de cambio de `50 Bs`:
  - `Efectivo esperado = 100 + 30 + 50 − 10 = 170`
  - `QR esperado = 20`
- [ ] Al cerrar caja, el cajero realiza el conteo a ciegas (no ve el cálculo del sistema). Si ingresa `168`, el arqueo debe registrar una diferencia de `−2` (faltante).

## 6. Insumos, Recetas y Costo Promedio Ponderado
- [ ] Crea un insumo en kilogramos y asigna una receta en gramos a un producto; realiza una venta y comprueba el descuento exacto de la masa del insumo.
- [ ] Costo Promedio Ponderado (NIC 2): registra una compra de `10 kg` a `10 Bs/kg` y luego otra compra de `10 kg` a `20 Bs/kg`. El costo unitario del insumo debe quedar en `15 Bs/kg` y el costo calculado de las recetas vinculadas debe actualizarse en cascada.
- [ ] Intenta vender una cantidad que exceda la disponibilidad del insumo limitante: la venta debe ser rechazada sin alterar el inventario.
- [ ] Intenta asignar una receta a un producto directo que posee stock: el sistema debe impedirlo con un mensaje claro.

## 7. Anulación de Ventas (Prueba Crítica)
- [ ] Vende un producto con receta y toma nota del stock del insumo antes y después.
- [ ] Modifica la receta o compra el insumo a un precio distinto.
- [ ] Anula la venta documentando un motivo obligatorio: el stock debe reincorporarse exactamente en la proporción congelada al momento de la venta.
- [ ] Intentar anular sin motivo documentado o intentar anular un ticket previamente anulado debe ser bloqueado.
- [ ] Comprueba que los movimientos del ticket anulado no se computen en arqueos, totales de venta, ganancias ni gráficos.

## 8. Multicaja y Estaciones Físicas (`cajas_fisicas`)
- [ ] En `/admin`, crea una nueva estación de cobro (ej. "Caja 2 - Barra").
- [ ] Inicia sesión con dos cajeros en navegadores o perfiles distintos y abre un turno simultáneamente en la "Caja 1" y en la "Caja 2": ambas deben operar de forma independiente y en paralelo.
- [ ] En `/admin`, intenta desactivar una caja física que tiene un turno abierto en curso: el sistema debe impedirlo y mostrar una advertencia.
- [ ] Intenta desactivar la única caja física activa del establecimiento: el sistema debe bloquear la operación para garantizar que siempre exista al menos una estación disponible.

## 9. Reportes y Exportación Multiformato
- [ ] En `/admin`, ingresa a la sección de reportes y descarga el reporte en formato **Excel (`.xlsx`)**: verifica que contenga las 10 hojas contables completas con costos congelados, prorrateo de descuentos y Kardex detallado.
- [ ] En la auditoría de un turno específico, haz clic en **"Exportar PDF"**: verifica que el documento se genere correctamente con el resumen financiero, liquidación de impuestos (Débito IVA, IT, Crédito Fiscal) y tabla de movimientos.
- [ ] Descarga el reporte en formato **CSV** y confirma que se abra con la estructura de columnas esperada.
- [ ] Valida que los gráficos interactivos de Recharts en `/admin` (7 días, flujo por hora, top productos y métodos de pago) reflejen los datos reales de ventas sin incluir anulaciones.

## 10. Notificaciones Automáticas por Correo Electrónico
- [ ] En el panel `/admin`, verifica que el indicador de estado del servicio de correo refleje adecuadamente si SMTP está configurado o inactivo.
- [ ] Con SMTP configurado en `.env.local` / `.env`, haz clic en **"Enviar correo de prueba"**: verifica la llegada del correo de diagnóstico al destinatario configurado.
- [ ] Cierra un turno como cajero: confirma que la respuesta en pantalla sea inmediata (no se quede congelada esperando al servidor de correo) y que en la casilla del destinatario se reciba el correo con la plantilla ejecutiva y el archivo `Reporte_Turno_XX.xlsx` adjunto.
- [ ] En `/admin`, selecciona un turno cerrado en el historial y presiona **"Reenviar reporte por correo"**: comprueba que el correo se envíe de nuevo con el archivo Excel correspondiente.

## 11. Blindaje Multi-Dispositivo, Operación Dual y Actualizaciones
- [ ] **Operación Dual (HTTP local + HTTPS remoto):**
  - Inicia sesión localmente en `http://localhost:3000` (o red LAN): la cookie de sesión debe establecerse y funcionar fluidamente sin requerir SSL.
  - Conéctate en simultáneo por HTTPS (vía Cloudflare Tunnel): la cookie de sesión debe adoptar `secure: true` adaptativamente por protocolo y permitir operar en paralelo.
  - Comprueba que las respuestas de `/api/caja` incluyan encabezados `Cache-Control: no-store` para impedir que navegadores de distintas máquinas almacenen estados de caja desactualizados.
- [ ] **Blindaje contra traducción automática:**
  - En Google Chrome, activa la traducción automática de páginas: comprueba que las directivas `notranslate` en `app/layout.js` eviten rupturas en el reconciliador del DOM de React en las pantallas de cobro y administración.
- [ ] **Actualización segura automatizada (`npm run update`):**
  - Ejecuta `npm run update`: comprueba que el script realice un respaldo preventivo de `caja.db` en `backups/`, sincronice el código con `git pull --ff-only`, instale dependencias con `npm ci` y recompile con `npm run build` de forma limpia.

## 12. Grupos de Modificadores, Reemplazos y Complementos de Recetas (v7)
- [ ] **Configuración en Administrador (`/admin`):**
  - Crea un grupo de selección única obligatorio (ej. "Tipo de Leche") con una opción por defecto (Leche Entera) y opciones de reemplazo con recargo (ej. Leche de Almendras `+1.50 Bs`, reemplazando el insumo base).
  - Crea un grupo de selección múltiple opcional (ej. "Extras y Siropes") con opciones de adición de insumos (ej. Extra Shot Café `+3.00 Bs`, Sirope Vainilla `+2.00 Bs`) y opciones operativas (ej. "Sin Azúcar", "Tostado").
  - Asigna los grupos al producto con receta (ej. "Cappuccino Barista").
- [ ] **Venta y Selección Interactiva en Caja (`/caja`):**
  - Haz clic en el producto configurado: se debe desplegar el modal interactivo de personalización.
  - Verifica que no permita confirmar si no se ha completado la selección de grupos obligatorios.
  - Selecciona un reemplazo (Leche de Almendras) y un extra (Extra Shot): comprueba que el precio total de la línea en el carrito aumente reactivamente con los recargos correspondientes.
  - Completa el cobro y anota el stock de los insumos antes y después: verifica que el insumo base reemplazado **no** se descuente, que el insumo sustituto sí se descuente en la proporción exacta y que el insumo extra también se descuente.
- [ ] **Anulación y Rollback con Modificadores:**
  - Anula el ticket de la venta anterior: verifica que el sistema reintegre el insumo de reemplazo y el insumo extra según lo registrado en `detalle_movimientos_modificadores`, manteniendo el stock de la leche entera intacto.
- [ ] **Filtrado Multi-Categoría y Buscador en POS:**
  - En la vista de mostrador (`/caja`), prueba activar varias categorías simultáneamente o escribir en el buscador: comprueba que el listado de productos y los contadores se actualicen reactivamente y que el filtro se reinicie automáticamente tras registrar la venta.

## 13. Combos y Promociones con Descuento Atómico de Inventario y Límites (v8)
- [ ] **Creación de Combo:** En `/admin` (pestaña Combos), crea un combo que combine un producto directo y un producto por receta (ej. "Combo Desayuno" = Cappuccino + Croissant). Verifica que el costo del combo se calcule dinámicamente como la suma de los costos de sus componentes.
- [ ] **Modo con Límite de Unidades:** Configura un combo con límite máximo activo de 5 unidades. Realiza ventas y confirma que el contador regresivo disminuya y que, al llegar a 0, el combo se bloquee automáticamente en el POS impidiendo sobreventas.
- [ ] **Vigencia Temporal:** Configura una promoción con fecha de inicio futura: verifica que no aparezca habilitada en el POS hasta que se alcance dicha fecha.
- [ ] **Descomposición Atómica y Anulación:** Vende un combo y comprueba que se descuenten tanto los componentes directos como los insumos de las recetas. Al anular el ticket, verifica que tanto el stock de los componentes como el contador de unidades restantes del combo se reintegren atómicamente.

## 14. Régimen Tributario, Facturación y Snapshot Fiscal Inmutable (v9-v10)
- [ ] **Configuración Contable:** En `/admin` (pestaña Configuración), conmuta entre Régimen Simplificado y Régimen General: comprueba que en Simplificado el sistema impida terminantemente emitir facturas fiscales.
- [ ] **Venta con Factura en Régimen General:** En `/caja`, activa la casilla "Emitir Factura", introduce NIT y Razón Social: comprueba que el movimiento se guarde con `tipo_comprobante = 'factura'`, N° Factura y CUF, y con el snapshot fiscal de IVA (13%) e IT (3%) congelado en la fila.
- [ ] **Inmutabilidad de Snapshot:** Cambia las tasas de IVA o IT en la configuración del negocio. Consulta las ventas anteriores y confirma que sus importes de IVA e IT históricos permanezcan intactos.
- [ ] **Validación de Permisos en Backend:** Intenta emitir una factura desde una caja física o con un cajero que tenga deshabilitado el permiso fiscal (`habilita_respaldo_fiscal = 0` o `puede_registrar_respaldo_fiscal = 0`): el servidor debe rechazar la transacción con un error 400 descriptivo.

## 15. Pagos Mixtos (Efectivo + QR) y Descuentos con Prorrateo de Centavos
- [ ] **Pago Mixto Exacto:** En `/caja`, selecciona método de pago Mixto en una comanda de `30 Bs`. Ingresa `10 Bs` en efectivo y `20 Bs` por QR: verifica que la transacción se complete y que `movimientos_pagos` registre ambas filas vinculadas al mismo movimiento.
- [ ] **Cambio sobre Porción en Efectivo:** En una comanda de `30 Bs` con `10 Bs` en efectivo y `20 Bs` en QR, ingresa un billete recibido de `50 Bs`: el sistema debe calcular el cambio de `40 Bs` (`50 - 10`), sin restar la porción cubierta por QR.
- [ ] **Descuento Comercial y Prorrateo de Centavos:** Aplica un descuento de `5 Bs` a un ticket con 3 productos de precios distintos. En la base de datos o en el libro Excel (hoja *Detalle Ventas (CMV)*), verifica que el descuento se haya distribuido proporcionalmente entre las líneas y que la suma de ingresos netos coincida al centavo con el total cobrado.

## 16. Kardex Cronológico Dual y Auditoría de Integridad (v11)
- [ ] **Kardex de Productos Directos:** Registra compras, ventas y una merma de un producto directo. Abre la pestaña Kardex en `/admin` y verifica que cada fila refleje el `stock_resultante` y el `costo_promedio_resultante`.
- [ ] **Kardex de Insumos Métricos:** Revisa el Kardex de un insumo medido en mililitros o gramos (ej. Café en grano o Leche). Confirma que los costos unitarios preserven hasta 6 decimales sin truncamientos a 0.
- [ ] **Compras de Insumos con Respaldo Fiscal:** Registra una compra de insumos con proveedor, NIT y N° Factura: confirma que aparezca en el Kardex y sume al Crédito Fiscal IVA de la hoja *Resumen Contable* de Excel y del PDF.
- [ ] **Auditoría Matemática Automática:** En la consola o ejecutando `npm run seed`, verifica que las funciones `verificarIntegridadKardexDirecto()` y `verificarIntegridadKardexInsumos()` reporten `integridadOk: true` con 0 descuadres.

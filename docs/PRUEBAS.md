# Checklist de Pruebas Funcionales y de Concurrencia

Lista de verificación manual para validar arranque, seguridad, control de caja, stock atómico, arqueo ciego, recetas, anulaciones, multicaja, reportes y servicio de notificaciones.

---

## 1. Arranque y Migraciones
- [ ] Cierra y vuelve a correr `npm run dev`. No debe haber errores rojos en la terminal.
- [ ] Reinícialo una segunda vez: las migraciones no deben volver a ejecutarse ni arrojar errores (`PRAGMA user_version` controlado).

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
- [ ] En `/admin`, ingresa a la sección de reportes y descarga el reporte en formato **Excel (`.xlsx`)**: verifica que contenga la hoja *Movimientos* con costos y precios unitarios congelados, y la hoja *Arqueos de Caja* con el balance de cada turno.
- [ ] En la auditoría de un turno específico, haz clic en **"Exportar PDF"**: verifica que el documento se genere correctamente con el resumen financiero, balance de caja y tabla de movimientos.
- [ ] Descarga el reporte en formato **CSV** y confirma que se abra con la estructura de columnas esperada.
- [ ] Valida que los gráficos interactivos de Recharts en `/admin` (7 días, flujo por hora, top productos y métodos de pago) reflejen los datos reales de ventas sin incluir anulaciones.

## 10. Notificaciones Automáticas por Correo Electrónico
- [ ] En el panel `/admin`, verifica que el indicador de estado del servicio de correo refleje adecuadamente si SMTP está configurado o inactivo.
- [ ] Con SMTP configurado en `.env.local` / `.env`, haz clic en **"Enviar correo de prueba"**: verifica la llegada del correo de diagnóstico al destinatario configurado.
- [ ] Cierra un turno como cajero: confirma que la respuesta en pantalla sea inmediata (no se quede congelada esperando al servidor de correo) y que en la casilla del destinatario se reciba el correo con la plantilla ejecutiva y el archivo `Reporte_Turno_XX.xlsx` adjunto.
- [ ] En `/admin`, selecciona un turno cerrado en el historial y presiona **"Reenviar reporte por correo"**: comprueba que el correo se envíe de nuevo con el archivo Excel correspondiente.

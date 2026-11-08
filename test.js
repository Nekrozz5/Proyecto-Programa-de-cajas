const {
    crearUsuario,
    crearInsumo,
    crearProducto,
    asignarIngredienteReceta,
    obtenerProductos,
    abrirCaja,
    registrarVentaCompleta,
    registrarMermaInsumo,
    obtenerEstadisticasCaja,
    obtenerPrediccionComprasInsumos
} = require('./server/queries');

async function probarInventarioHibrido() {
    try {
        console.log("=== 1. CONFIGURANDO INSUMOS Y RECETAS ===");
        const adminId = await crearUsuario('Admin Cafetería', '1234', 'admin');

        // Compramos 10 litros de leche a 8 Bs el litro (Stock de seguridad: 2 L, proveedor tarda 1 día)
        const lecheId = await crearInsumo('Leche Entera', 'litros', 10, 8.00, 2, 1);
        const cafeGranoId = await crearInsumo('Café en Grano', 'kg', 5, 80.00, 1, 2);

        // Creamos los productos del menú (el costo empieza en 0 porque la receta lo calculará sola)
        const capuchinoId = await crearProducto('Capuchino', 18.00, 0, 'Bebidas Calientes');
        const milkshakeId = await crearProducto('Milkshake', 25.00, 0, 'Bebidas Frías');
        const teVerdeId = await crearProducto('Té Matcha Especial', 22.00, 5.00, 'Bebidas Calientes'); // Producto para probar "sin rotación"

        // Receta Capuchino: 0.5 L de leche + 0.02 kg (20g) de café
        await asignarIngredienteReceta(capuchinoId, lecheId, 0.5);
        await asignarIngredienteReceta(capuchinoId, cafeGranoId, 0.02);

        // Receta Milkshake: 1.5 L de leche
        await asignarIngredienteReceta(milkshakeId, lecheId, 1.5);

        console.log("\n=== 2. CATÁLOGO CON COSTOS AUTOMÁTICOS Y LÍMITE DE PREPARACIÓN ===");
        const catalogoInicial = await obtenerProductos();
        console.table(catalogoInicial.map(p => ({
            id: p.id,
            nombre: p.nombre,
            precio: p.precio,
            costoReceta: p.costo,
            maximoPreparableHoy: p.unidades_disponibles,
            limitante: p.insumo_limitante
        })));

        console.log("\n=== 3. VENDIENDO 1 CAPUCHINO (0.5L) Y 1 MILKSHAKE (1.5L) ===");
        const cajaId = await abrirCaja(adminId, 100.00);
        const venta = await registrarVentaCompleta(
            cajaId,
            [
                { productoId: capuchinoId, cantidad: 1 },
                { productoId: milkshakeId, cantidad: 1 }
            ],
            'efectivo',
            50.00,
            'Mesa 4'
        );
        console.log("Venta registrada:", venta);

        // Registramos una pequeña merma de 0.5 L de leche derramada
        await registrarMermaInsumo(lecheId, 0.5, 'Leche derramada al espumar');

        console.log("\n=== 4. DISPONIBILIDAD ACTUALIZADA (QUEDAN 7.5 LITROS DE LECHE) ===");
        const catalogoDespues = await obtenerProductos();
        console.table(catalogoDespues.map(p => ({
            nombre: p.nombre,
            maximoPreparableAhora: p.unidades_disponibles,
            limitante: p.insumo_limitante
        })));

        console.log("\n=== 5. ESTADÍSTICAS: GANANCIA REAL Y PRODUCTOS SIN VENTA ===");
        const stats = await obtenerEstadisticasCaja(cajaId);
        console.log("Resumen Financiero:", {
            ventasTotales: stats.ventasTotales,
            costoInsumosVendidos: stats.costoTotalVentas,
            gananciaBruta: stats.gananciaBruta
        });
        console.log("Productos que NO se están vendiendo:", stats.productosSinRotacion.map(p => p.nombre));

        console.log("\n=== 6. PREDICCIÓN DE COMPRAS DE INSUMOS (PARA 7 DÍAS) ===");
        // Usamos diasAnalisis = 1 para simular el ritmo de consumo del día de prueba
        const prediccion = await obtenerPrediccionComprasInsumos(1, 7);
        console.table(prediccion);

    } catch (error) {
        console.error("Error en la prueba:", error.message);
    }
}

probarInventarioHibrido();
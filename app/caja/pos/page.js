'use client';

import { useCajaContext } from '../_context/CajaContext';
import CatalogoProductos from '../_components/CatalogoProductos';
import CarritoVenta from '../_components/CarritoVenta';
import AperturaTurno from '../_components/AperturaTurno';

export default function PosPage() {
    const {
        cajaAbierta,
        usuarioActual,
        cajasFisicas,
        handleTurnoAbierto,
        setError,
        limpiarAlertas,
        productos,
        categorias,
        carrito,
        handleSeleccionarProducto,
        cambiarCantidad,
        handleInputCantidad,
        finalizarEdicionCantidad,
        eliminarDelCarrito,
        vaciarCarrito,
        subtotalBrutoCarrito,
        descuentoAplicadoNum,
        descuentoInvalido,
        totalCarrito,
        abrirModalCobro,
        ultimoTicket
    } = useCajaContext();

    if (!cajaAbierta) {
        return (
            <AperturaTurno
                usuarioActual={usuarioActual}
                cajasFisicas={cajasFisicas}
                onTurnoAbierto={handleTurnoAbierto}
                onError={setError}
                onLimpiarAlertas={limpiarAlertas}
            />
        );
    }

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            <div className="xl:col-span-7 2xl:col-span-8">
                <CatalogoProductos
                    productos={productos}
                    categorias={categorias}
                    carrito={carrito}
                    onSeleccionarProducto={handleSeleccionarProducto}
                />
            </div>

            <div className="xl:col-span-5 2xl:col-span-4 sticky top-4">
                <CarritoVenta
                    carrito={carrito}
                    productos={productos}
                    cambiarCantidad={cambiarCantidad}
                    handleInputCantidad={handleInputCantidad}
                    finalizarEdicionCantidad={finalizarEdicionCantidad}
                    eliminarDelCarrito={eliminarDelCarrito}
                    vaciarCarrito={vaciarCarrito}
                    subtotalBrutoCarrito={subtotalBrutoCarrito}
                    descuentoAplicadoNum={descuentoAplicadoNum}
                    descuentoInvalido={descuentoInvalido}
                    totalCarrito={totalCarrito}
                    onAbrirCobro={abrirModalCobro}
                    ultimoTicket={ultimoTicket}
                />
            </div>
        </div>
    );
}

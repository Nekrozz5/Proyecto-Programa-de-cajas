'use client';

import { useEffect } from 'react';

/**
 * Hook para cierre automático de sesión por inactividad.
 * Aplica únicamente a roles privilegiados (admin, propietario, developer) por seguridad.
 *
 * @param {object|null} usuarioActual - Usuario en sesión activa.
 * @param {Function} onCierreInactividad - Callback ejecutado al dispararse el cierre por inactividad.
 * @param {number} [minutosInactividad=15] - Minutos de tolerancia antes del cierre automático.
 */
export function useInactividad(usuarioActual, onCierreInactividad, minutosInactividad = 15) {
    useEffect(() => {
        if (!usuarioActual || !['developer', 'propietario', 'admin'].includes(usuarioActual.rol)) {
            return;
        }

        const tiempoLimiteMs = minutosInactividad * 60 * 1000;
        let timerInactividad = null;

        const reiniciarTemporizador = () => {
            if (timerInactividad) clearTimeout(timerInactividad);
            timerInactividad = setTimeout(async () => {
                try {
                    await fetch('/api/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accion: 'logout' })
                    });
                } catch (_) {}

                if (typeof onCierreInactividad === 'function') {
                    const rolLabel = usuarioActual.rol === 'propietario' ? 'propietario(a)' : usuarioActual.rol === 'admin' ? 'administrador(a)' : usuarioActual.rol;
                    onCierreInactividad(
                        `Tu sesión de ${rolLabel} se ha cerrado automáticamente tras ${minutosInactividad} minutos de inactividad por seguridad.`
                    );
                }
            }, tiempoLimiteMs);
        };

        const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        eventos.forEach((ev) => window.addEventListener(ev, reiniciarTemporizador, { passive: true }));
        reiniciarTemporizador();

        return () => {
            if (timerInactividad) clearTimeout(timerInactividad);
            eventos.forEach((ev) => window.removeEventListener(ev, reiniciarTemporizador));
        };
    }, [usuarioActual, onCierreInactividad, minutosInactividad]);
}

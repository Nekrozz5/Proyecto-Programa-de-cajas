'use client';

import { useState } from 'react';
import { cardStyle, inputStyle, btnPrimario, btnSecundario, btnOscuro } from './cajaStyles';

export default function LoginCaja({
    usuarios = [],
    onLoginExitoso,
    onError,
    onLimpiarAlertas
}) {
    const [loginUsuarioId, setLoginUsuarioId] = useState(usuarios.length > 0 ? String(usuarios[0].id) : '');
    const [loginPin, setLoginPin] = useState('');
    const [modoLoginManualCaja, setModoLoginManualCaja] = useState(usuarios.length === 0);
    const [loginNombreManualCaja, setLoginNombreManualCaja] = useState('');
    const [procesando, setProcesando] = useState(false);

    async function handleLogin(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        try {
            setProcesando(true);
            const payload = modoLoginManualCaja
                ? {
                    accion: 'login',
                    nombreUsuario: loginNombreManualCaja.trim(),
                    pin: loginPin
                }
                : {
                    accion: 'login',
                    usuarioId: Number(loginUsuarioId),
                    pin: loginPin
                };

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión.');

            setLoginPin('');
            setLoginNombreManualCaja('');
            onLoginExitoso?.(data.usuario, `Sesión iniciada como ${data.usuario.nombre} (${data.usuario.rol}).`);
        } catch (err) {
            setLoginPin('');
            onError?.(err.message);
        } finally {
            setProcesando(false);
        }
    }

    return (
        <div style={{ maxWidth: '460px', margin: '3rem auto', padding: '1.5rem' }}>
            <div style={cardStyle}>
                <h2 style={{ marginTop: 0 }}>Iniciar Sesión en Caja</h2>
                <p style={{ color: '#555', fontSize: '0.9rem' }}>
                    Identifícate con tu PIN para registrar quién realiza cada venta o movimiento.
                </p>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {!modoLoginManualCaja ? (
                        <label>
                            Selecciona tu Usuario:
                            <select
                                value={loginUsuarioId}
                                onChange={(e) => setLoginUsuarioId(e.target.value)}
                                required
                                style={inputStyle}
                            >
                                {usuarios.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nombre}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : (
                        <label>
                            Nombre de Usuario:
                            <input
                                type="text"
                                placeholder="Ingresa tu nombre de usuario"
                                value={loginNombreManualCaja}
                                onChange={(e) => setLoginNombreManualCaja(e.target.value)}
                                required
                                style={inputStyle}
                            />
                            <small style={{ display: 'block', color: '#64748b', marginTop: '0.3rem' }}>
                                Administradores: escriban su nombre de usuario (no aparecen en la lista).
                            </small>
                        </label>
                    )}
                    <label>
                        PIN / Contraseña:
                        <input
                            type="password"
                            placeholder="Ingresa tu PIN o contraseña"
                            value={loginPin}
                            onChange={(e) => setLoginPin(e.target.value)}
                            required
                            style={inputStyle}
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={procesando}
                        style={{
                            ...btnPrimario,
                            opacity: procesando ? 0.6 : 1,
                            cursor: procesando ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {procesando ? 'Verificando...' : 'Ingresar a Caja'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();
                            setModoLoginManualCaja(!modoLoginManualCaja);
                            setLoginNombreManualCaja('');
                            setLoginPin('');
                        }}
                        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: '0.2rem' }}
                    >
                        {modoLoginManualCaja ? 'Seleccionar usuario de la lista' : 'Ingresar nombre de usuario manualmente'}
                    </button>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
                        <a href="/" style={{ ...btnSecundario, flex: 1, textAlign: 'center' }}>Inicio</a>
                        <a href="/admin" style={{ ...btnOscuro, flex: 1, textAlign: 'center' }}>Panel Admin</a>
                    </div>
                </form>
            </div>
        </div>
    );
}

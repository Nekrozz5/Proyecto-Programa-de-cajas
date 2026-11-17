/**
 * Estilos reutilizables para los módulos del panel administrativo.
 */

export const cardStyle = {
    background: '#fff',
    padding: '1.25rem',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
};

export const kpiCard = {
    background: '#fff',
    padding: '1rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
};

export const formCol = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem'
};

export const inputStyle = {
    width: '100%',
    padding: '0.55rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    boxSizing: 'border-box'
};

export const btnPrimario = {
    padding: '0.65rem 1rem',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

export const btnOscuro = {
    padding: '0.65rem 1rem',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

export const btnSecundario = {
    padding: '0.65rem 1rem',
    background: '#e5e7eb',
    color: '#111',
    borderRadius: '6px',
    fontWeight: 'bold',
    textDecoration: 'none'
};

export const thTd = {
    padding: '0.55rem 0.45rem'
};

export const sidebarStyle = {
    width: '265px',
    background: '#1e293b',
    color: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0
};

export function navBtnStyle(activo) {
    return {
        textAlign: 'left',
        padding: '0.75rem 1rem',
        borderRadius: '6px',
        border: 'none',
        background: activo ? '#0284c7' : 'transparent',
        color: activo ? '#fff' : '#cbd5e1',
        fontWeight: activo ? 'bold' : 'normal',
        cursor: 'pointer',
        fontSize: '0.92rem'
    };
}

export function plantillaBtnStyle(activo) {
    return {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        textAlign: 'left',
        padding: '0.85rem',
        borderRadius: '8px',
        border: activo ? '2px solid #0284c7' : '1px solid #cbd5e1',
        background: activo ? '#f0f9ff' : '#fff',
        cursor: 'pointer'
    };
}

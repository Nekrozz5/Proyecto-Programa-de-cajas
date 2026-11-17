'use client';

/**
 * Componente Modal Reutilizable para diálogos y ventanas emergentes del sistema.
 */
export default function Modal({ isOpen, onClose, title, children, maxWidth = '550px' }) {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '1rem'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: '10px',
                    width: '100%',
                    maxWidth,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1px solid #cbd5e1'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {title && (
                    <div
                        style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8fafc'
                        }}
                    >
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 'bold' }}>
                            {title}
                        </h3>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                fontSize: '1.25rem',
                                color: '#64748b',
                                cursor: 'pointer',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                lineHeight: 1
                            }}
                            title="Cerrar ventana"
                        >
                            ✕
                        </button>
                    </div>
                )}
                <div style={{ padding: '1.25rem', overflowY: 'auto' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

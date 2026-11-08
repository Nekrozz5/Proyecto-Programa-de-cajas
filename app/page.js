export default function HomePage() {
  return (
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Sistema de Control de Cajas</h1>
      <p>Selecciona tu módulo para comenzar:</p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
        <a 
          href="/caja" 
          style={{ padding: '0.75rem 1.5rem', background: '#0070f3', color: '#fff', borderRadius: '6px', textDecoration: 'none' }}
        >
          Ir a Caja (Ventas)
        </a>
        <a 
          href="/admin" 
          style={{ padding: '0.75rem 1.5rem', background: '#333', color: '#fff', borderRadius: '6px', textDecoration: 'none' }}
        >
          Panel de Administración
        </a>
      </div>
    </main>
  );
}
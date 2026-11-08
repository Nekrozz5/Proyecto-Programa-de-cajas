export const metadata = {
  title: 'Control de Cajas',
  description: 'Sistema de punto de venta y control de caja',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'sans-serif', backgroundColor: '#f4f4f9' }}>
        {children}
      </body>
    </html>
  );
}
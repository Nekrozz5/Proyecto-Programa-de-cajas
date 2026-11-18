import './globals.css';

export const metadata = {
  title: 'Control de Cajas',
  description: 'Sistema de punto de venta y control de caja',
  other: {
    google: 'notranslate',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" translate="no" className="notranslate">
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

import './globals.css';
import LimpiadorCacheCliente from '@/components/LimpiadorCacheCliente';

export const metadata = {
  title: 'Control de Cajas',
  description: 'Sistema de punto de venta y control de caja',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'POS Cajas',
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
  other: {
    google: 'notranslate',
  },
};

export const viewport = {
  themeColor: '#0f172a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" translate="no" className="notranslate">
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
        <LimpiadorCacheCliente />
        {children}
      </body>
    </html>
  );
}

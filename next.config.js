/** @type {import('next').NextConfig} */
const allowedOrigins = [
  'localhost:3000',
  '127.0.0.1:3000',
];

if (process.env.ALLOWED_ORIGINS) {
  const extra = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  allowedOrigins.push(...extra);
}

const nextConfig = {
  serverExternalPackages: ['sqlite3', 'better-sqlite3', 'bcryptjs', 'exceljs', 'nodemailer'],
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
  async headers() {
    return [
      {
        // Encabezados de seguridad para toda la aplicación
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ],
      },
      {
        // Evitar que el navegador almacene en caché las páginas HTML y paneles tras actualizaciones
        source: '/((?!_next/static|_next/image|icons|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' }
        ],
      },
    ];
  },
  ...(process.env.NEXT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
};

module.exports = nextConfig;

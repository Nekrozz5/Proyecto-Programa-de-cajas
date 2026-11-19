/** @type {import('next').NextConfig} */
const allowedOrigins = [
  'localhost:3000',
  '127.0.0.1:3000',
  '*.trycloudflare.com',
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
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ],
      },
    ];
  },
  ...(process.env.NEXT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
};

module.exports = nextConfig;

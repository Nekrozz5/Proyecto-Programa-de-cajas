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
  ...(process.env.NEXT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
};

module.exports = nextConfig;

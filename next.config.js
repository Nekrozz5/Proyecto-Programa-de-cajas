/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sqlite3', 'bcryptjs', 'exceljs'],
  ...(process.env.NEXT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
};

module.exports = nextConfig;

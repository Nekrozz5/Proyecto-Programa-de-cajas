/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sqlite3', 'bcryptjs', 'exceljs', 'nodemailer'],
  ...(process.env.NEXT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
};

module.exports = nextConfig;
